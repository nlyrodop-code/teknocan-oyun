# Teknocan'ın Sinyal Macerası (çok oyunculu)

Herkes aynı linkten girer, kullanıcı adını yazar ve oynar. Diğer oyuncular ekranda yarı saydam (isimleriyle) görünür, sağ üstte canlı sıralama akar.

**Sıralama kuralı:** Baz istasyonuna ulaşanlar süreye göre (eşitlikte skora göre), ulaşamayanlar ilerledikleri yola göre sıralanır.

## Bilgisayarında dene

```
npm install
npm start
```

Sonra tarayıcıda `http://localhost:3000` aç. Aynı adresi birkaç sekmede açarak çok oyunculu modu kendin test edebilirsin.

## Teknocan görseli

Şeffaf arka planlı, sağa bakan, tam boy PNG dosyasını `public/teknocan.png` olarak koy. Dosya yoksa yer tutucu karakter kullanılır. Boyutu `public/index.html` içindeki `PLAYER_DRAW_HEIGHT` satırından ayarlanır. Diğer görseller (horoz, kuzu, karga, sinyal çubuğu, kule) aynı dosyanın en üstündeki `ASSETS` bölümünden bağlanır.

## İnternette yayınlama (herkes link ile girsin)

Oyun bir Node.js sunucusu olduğu için "sadece dosya yükleyen" statik barındırmalarda (GitHub Pages gibi) çalışmaz. Node.js çalıştıran bir servis gerekir. Render.com ile örnek:

1. Bu klasörü bir GitHub deposuna yükle (`node_modules` ve `scores.json` zaten `.gitignore` içinde).
2. Render'da **New > Web Service** seç, depoyu bağla.
3. Build Command: `npm install`  •  Start Command: `npm start`
4. Yayına alınca Render sana bir `https://...onrender.com` adresi verir. Oyuncularla paylaşacağın link budur. `wss://` bağlantısı otomatik kurulur, ek ayar gerekmez.

Railway, Fly.io, Glitch gibi servislerde de aynı mantık geçerlidir (`PORT` ortam değişkenini sunucu kendisi okur).

## Önemli notlar

- **Skorların kalıcılığı:** Sıralama `scores.json` dosyasına yazılır. Bazı ücretsiz barındırmalarda disk geçicidir; sunucu yeniden başlayınca sıralama sıfırlanabilir. Kalıcı olması için servisin kalıcı disk (persistent disk) özelliğini bağlayıp `DATA_DIR` ortam değişkenini o diskin yoluna ayarla.
- **Ücretsiz planlarda uyku:** Bazı ücretsiz planlar kullanılmayınca sunucuyu uyutur, ilk giren oyuncu birkaç saniye bekleyebilir.
- **Hile koruması:** Sunucu, bitiş süresini ve skoru makul sınırlarla denetler (25 saniyeden hızlı bitiş, aşırı skor ve gerçek geçen süreyle uyuşmayan süreler reddedilir). Bu basit bir korumadır, kararlı bir hileciyi engellemez; ciddi bir yarışma için oyun mantığının sunucuda çalıştırılması gerekir.
- **Kullanıcı adları:** Sadece harf, rakam, boşluk, `_`, `.`, `-` kabul edilir ve en fazla 14 karakterdir. Küfürlü isimleri engelleyen bir filtre yoktur; herkese açık yayında eklemek isteyebilirsin.
- **Ayarlar:** En fazla 60 eşzamanlı oyuncu (`server.js` içindeki `MAX_PLAYERS`).
