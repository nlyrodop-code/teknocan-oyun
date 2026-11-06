"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, "public");
const DATA = path.join(process.env.DATA_DIR || __dirname, "scores.json");

const LEVEL_PX = 315 * 40;     // bölüm uzunluğu (piksel), istemciyle aynı olmalı
const MIN_FINISH = 40;         // saniye: bonus eklenmeden önceki gerçek süre bundan kısa olamaz
const BAR_BONUS = 0.2;         // her sinyal çubuğunun süreden düşürdüğü saniye (istemcideki BAR_BONUS ile aynı olmalı)
const MAX_BARS = 160;          // bölümdeki en fazla çubuk sayısı (üstü geçersiz)
const MAX_SCORE = 9000;
const MAX_PLAYERS = 60;
const MAX_MSG_PER_SEC = 40;

/* ---------- statik dosyalar ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".js": "text/javascript",
  ".json": "application/json", ".mp3": "audio/mpeg", ".ogg": "audio/ogg"
};
const server = http.createServer((req, res) => {
  let u;
  try { u = decodeURIComponent(req.url.split("?")[0]); } catch { res.writeHead(400); return res.end(); }
  if (u === "/") u = "/index.html";
  const file = path.normalize(path.join(PUB, u));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("Bulunamadı"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(buf);
  });
});

/* ---------- skorlar ---------- */
let records = {};
try { records = JSON.parse(fs.readFileSync(DATA, "utf8")); } catch {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DATA, JSON.stringify(records), () => {}), 500);
}
// negatif dönerse a, b'den iyidir
function better(a, b) {
  if (a.fin !== b.fin) return a.fin ? -1 : 1;
  if (a.fin) return a.tm !== b.tm ? a.tm - b.tm : b.sc - a.sc;
  return a.pr !== b.pr ? b.pr - a.pr : b.sc - a.sc;
}
function submit(run) {
  const k = run.n.toLowerCase();
  const cur = records[k];
  if (!cur || better(run, cur) < 0) { records[k] = run; save(); }
}
const num = (v, a, b) => { v = Number(v); if (!isFinite(v)) return a; return Math.max(a, Math.min(b, v)); };
const round3 = v => Math.round(v * 1000) / 1000;

/* ---------- oyuncular ---------- */
const players = new Map();
let nextId = 0;

function clean(n) {
  n = String(n || "").normalize("NFKC").replace(/[^\p{L}\p{N} _.\-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 14);
  return n || "Misafir" + Math.floor(100 + Math.random() * 900);
}
function uniqueName(n, self) {
  let c = n, i = 2;
  const taken = x => { for (const o of players.values()) if (o !== self && o.name && o.name.toLowerCase() === x.toLowerCase()) return true; return false; };
  while (taken(c)) c = n.slice(0, 11) + " " + (i++);
  return c;
}
// devam eden koşuyu (bitirmeden bırakılmışsa) kaydet
function endRun(pl, score) {
  if (pl.name && pl.st === "play" && pl.maxX > 0) {
    submit({ n: pl.name, fin: false, tm: 0, sc: Math.round(score != null ? score : pl.sc), pr: round3(Math.min(1, pl.maxX / LEVEL_PX)) });
  }
}
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };

function entries() {
  const m = new Map();
  for (const k in records) m.set(k, Object.assign({}, records[k], { live: false }));
  for (const pl of players.values()) {
    if (!pl.name) continue;
    const k = pl.name.toLowerCase();
    const cur = m.get(k);
    if (pl.st === "play" && pl.maxX > 0) {
      const cand = { n: pl.name, fin: false, tm: 0, sc: Math.round(pl.sc), pr: round3(Math.min(1, pl.maxX / LEVEL_PX)), live: true };
      if (!cur || better(cand, cur) < 0) m.set(k, cand); else cur.live = true;
    } else if (cur) cur.live = true;
  }
  return Array.from(m.entries()).sort((a, b) => better(a[1], b[1]));
}

const wss = new WebSocketServer({ server, maxPayload: 1024 });
wss.on("connection", ws => {
  if (players.size >= MAX_PLAYERS) { ws.close(); return; }
  const pl = { id: ++nextId, name: null, x: 0, y: 0, f: 1, a: 0, c: 0, sc: 0, st: "idle", startAt: 0, maxX: 0, cnt: 0 };
  players.set(ws, pl);
  send(ws, { t: "hello", id: pl.id });

  ws.on("message", raw => {
    if (++pl.cnt > MAX_MSG_PER_SEC) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== "object") return;
    switch (m.t) {
      case "join": {
        endRun(pl);
        pl.name = uniqueName(clean(m.name), pl);
        pl.st = "idle"; pl.maxX = 0; pl.sc = 0;
        send(ws, { t: "welcome", id: pl.id, name: pl.name });
        break;
      }
      case "start": {
        if (!pl.name) return;
        endRun(pl);
        pl.st = "play"; pl.maxX = 0; pl.sc = 0;
        pl.startAt = Date.now() - num(m.el, 0, 3600) * 1000;
        break;
      }
      case "s": {
        if (!pl.name || (pl.st !== "play" && pl.st !== "win")) return;
        pl.x = num(m.x, 0, LEVEL_PX); pl.y = num(m.y, -300, 800);
        pl.f = Number(m.f) < 0 ? -1 : 1; pl.c = Math.round(num(m.c, 0, 2)); pl.a = num(m.a, 0, 1e6); pl.sc = num(m.sc, 0, MAX_SCORE);
        if (pl.st === "play" && pl.x > pl.maxX) pl.maxX = pl.x;
        break;
      }
      case "finish": {
        if (!pl.name || pl.st !== "play") return;
        const tm = num(m.time, 0, 36000), sc = Math.round(num(m.score, 0, MAX_SCORE));
        const bars = Math.round(num(m.bars, 0, MAX_BARS));
        const raw = tm + bars * BAR_BONUS;          // bonus eklenmeden önceki gerçek süre
        const elapsed = (Date.now() - pl.startAt) / 1000;
        if (raw < MIN_FINISH || raw > elapsed + 3 || pl.maxX < LEVEL_PX * 0.9) return;
        pl.st = "win"; pl.sc = sc;
        submit({ n: pl.name, fin: true, tm: Math.round(tm * 100) / 100, sc, pr: 1 });
        break;
      }
      case "over": {
        if (!pl.name || pl.st !== "play") return;
        endRun(pl, num(m.score, 0, MAX_SCORE));
        pl.st = "over";
        break;
      }
    }
  });
  ws.on("close", () => { endRun(pl); players.delete(ws); });
  ws.on("error", () => {});
});

/* ---------- yayınlar ---------- */
setInterval(() => { for (const pl of players.values()) pl.cnt = 0; }, 1000);

// konumlar: saniyede 10 kez
setInterval(() => {
  if (!players.size) return;
  const l = [];
  for (const pl of players.values()) {
    if (pl.name && (pl.st === "play" || pl.st === "win")) l.push([pl.id, pl.name, Math.round(pl.x), Math.round(pl.y), pl.f, pl.a, pl.st === "win" ? 1 : 0, pl.c]);
  }
  const msg = JSON.stringify({ t: "p", l });
  for (const ws of players.keys()) if (ws.readyState === 1) ws.send(msg);
}, 100);

// sıralama: saniyede 1 kez
setInterval(() => {
  if (!players.size) return;
  const all = entries();
  const top = all.slice(0, 10).map(e => e[1]);
  let on = 0;
  for (const pl of players.values()) if (pl.name) on++;
  for (const [ws, pl] of players) {
    const idx = pl.name ? all.findIndex(e => e[0] === pl.name.toLowerCase()) : -1;
    send(ws, { t: "board", top, rank: idx >= 0 ? idx + 1 : null, total: all.length, on });
  }
}, 1000);

server.listen(PORT, () => console.log("Teknocan sunucusu hazır: http://localhost:" + PORT));
