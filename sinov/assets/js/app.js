// ============================================================
//  DO'KON PANELI - umumiy karkas (Telegram Mini App)
//  Bo'limlar pages/ papkasida, har biri alohida fayl.
//  Qaysi bo'lim ochilishi URL'dagi ?bolim=... dan olinadi:
//    .../dokon-panel/?bolim=skaner  -> darhol skaner
//    .../dokon-panel/               -> bosh sahifa (bo'limlar ro'yxati)
//  Eslatma: #... (hash) ishlatilmaydi - Telegram unga o'z ma'lumotini yozadi.
// ============================================================
(function () {
  var VERSION = "2-s9b"; // fayllar o'zgarganda oshiring (eski kesh ishlatilmasligi uchun)

  // ===== BO'LIMLAR RO'YXATI =====
  // Yangi bo'lim qo'shish: pages/nom.js yarating va shu yerga bir qator yozing.
  var PAGES = {
    skaner: { title: "Skaner", icon: "📷", file: "pages/skaner.js" },
    savat:  { title: "Sotuv",  icon: "🛒", file: "pages/savat.js" }  // faqat botdagi 🛒 Sotuv tugmasi orqali ishlaydi
    // kassa:   { title: "Kassa",     icon: "💰", file: "pages/kassa.js" },
    // muddat:  { title: "Muddatlar", icon: "⏰", file: "pages/muddat.js" },
    // qidiruv: { title: "Qidiruv",   icon: "🔎", file: "pages/qidiruv.js" },
    // hisobot: { title: "Hisobot",   icon: "📈", file: "pages/hisobot.js" }
  };

  var tg = window.Telegram ? window.Telegram.WebApp : null;
  var root = document.getElementById("app");
  var loaded = {};   // yuklangan skriptlar
  var current = null; // { name, page }
  var startPage = null;

  var App = window.App = {
    version: VERSION,
    tg: tg,
    // Telegram ichida ochilganmi (oddiy brauzerda platform = "unknown")
    inTelegram: !!(tg && tg.platform && tg.platform !== "unknown"),
    pages: {},

    // Bo'lim fayli o'zini shu bilan ro'yxatdan o'tkazadi:
    // App.register("nom", { render: function (el, params) {...}, destroy: function () {...} })
    register: function (name, page) { App.pages[name] = page; },

    // Tashqi kutubxona yoki bo'lim faylini bir marta yuklaydi
    loadScript: function (src) {
      if (loaded[src]) return loaded[src];
      loaded[src] = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = function () { delete loaded[src]; reject(new Error("yuklanmadi: " + src)); };
        document.head.appendChild(s);
      });
      return loaded[src];
    },

    haptic: function (type) {
      try { tg.HapticFeedback.notificationOccurred(type || "success"); } catch (e) {}
    },

    // Botga ma'lumot yuboradi va oynani yopadi.
    // Format: {"a": "amal", ...}  masalan {"a":"scan","code":"4601234567890"}
    // DIQQAT: faqat botdagi pastki menyu tugmasi (KeyboardButton) orqali ochilganda ishlaydi.
    sendToBot: function (obj) {
      if (!App.inTelegram) return false;
      tg.sendData(JSON.stringify(obj));
      return true;
    },

    esc: function (s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    },

    // Bo'limni ochadi
    open: function (name, params) {
      if (current && current.page.destroy) { try { current.page.destroy(); } catch (e) {} }
      current = null;
      if (!name || !PAGES[name]) { renderHome(); return; }
      root.innerHTML = '<p class="muted">Yuklanyapti...</p>';
      App.loadScript(PAGES[name].file + "?v=" + VERSION).then(function () {
        var page = App.pages[name];
        if (!page) throw new Error("bo'lim topilmadi: " + name);
        current = { name: name, page: page };
        root.innerHTML = "";
        page.render(root, params || {});
        updateBack();
      }).catch(function (e) {
        root.innerHTML = '<p class="err">Bo\'limni ochib bo\'lmadi: ' + App.esc(e.message) +
          '</p><p class="muted">Internetni tekshirib, qayta oching.</p>';
      });
    }
  };

  // Bosh sahifa - barcha bo'limlar tugmalari
  function renderHome() {
    var html = '<h1>🏪 Do\'kon paneli</h1><div class="menu">';
    Object.keys(PAGES).forEach(function (k) {
      html += '<a href="#" data-page="' + k + '"><span class="ico">' + PAGES[k].icon + "</span>" + App.esc(PAGES[k].title) + "</a>";
    });
    root.innerHTML = html + "</div>";
    root.querySelectorAll("[data-page]").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); App.open(a.getAttribute("data-page")); });
    });
    updateBack();
  }

  // Telegram'ning "Orqaga" tugmasi: bosh sahifadan ochilgan bo'limda ko'rinadi
  function updateBack() {
    if (!tg || !tg.BackButton) return;
    if (current && startPage !== current.name) tg.BackButton.show(); else tg.BackButton.hide();
  }

  if (tg) {
    tg.ready();
    tg.expand();
    if (tg.BackButton) tg.BackButton.onClick(function () { App.open(null); });
  }

  var params = new URLSearchParams(location.search);
  startPage = params.get("bolim");
  App.open(startPage, params);
})();
