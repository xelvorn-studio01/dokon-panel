# Do'kon paneli (Telegram Mini App)

"Tarozi kod bot" uchun Telegram ichida ochiladigan ilova. GitHub Pages'da bepul turadi.

## Tuzilma

```
index.html            - kirish sahifasi (hamma bo'lim shu orqali ochiladi)
assets/css/app.css    - umumiy dizayn (Telegram ranglari)
assets/js/app.js      - karkas: Telegram ulanishi, bo'limlar ro'yxati, almashtirish, botga yuborish
pages/skaner.js       - 📷 Skaner bo'limi
pages/savat.js        - 🛒 Sotuv (savat): uzluksiz skaner, Naqd/Karta, Sotildi
```

## Bo'limni ochish

- `https://LOGIN.github.io/dokon-panel/?bolim=skaner` - darhol skaner (botdagi tugma shu manzilni ochadi)
- `https://LOGIN.github.io/dokon-panel/` - bosh sahifa (barcha bo'limlar)

## Yangi bo'lim qo'shish

1. `pages/nom.js` faylini yarating:
   ```js
   App.register("nom", {
     render: function (el, params) { el.innerHTML = "<h1>Nom</h1>"; },
     destroy: function () {}
   });
   ```
2. `assets/js/app.js` dagi `PAGES` ro'yxatiga bir qator qo'shing.
3. Fayllar o'zgarganda `app.js` dagi `VERSION` ni va `index.html` dagi `?v=` ni oshiring.

## Botga ma'lumot

`App.sendToBot({ a: "amal", ... })` - JSON botga `web_app_data` bo'lib boradi va oyna yopiladi.
Bot `a` (amal) bo'yicha ajratadi. Hozir: `scan`, `sotuv`.

## 🛒 Sotuv

Botdagi tugma `?bolim=savat&dokon=ID&k=KALIT&api=WEBAPP_URL` ni ochadi.
Narxlar `API?a=narx&dokon=ID&k=KALIT` dan olinadi (bot `doGet`). Savat telefonda saqlanadi (yopilsa ham yo'qolmaydi).
Botga: `{"a":"sotuv","t":"naqd|karta","n":"kod","s":jami,"i":[["shtrix",soni]]}` - narxni bot jadvaldan qayta oladi.
