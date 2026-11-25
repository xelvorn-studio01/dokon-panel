// ============================================================
//  📊 STATISTIKA - panel bo'limi (v16). Faqat admin.
//  Bugun / 7 kun / 30 kun: qidiruvlar soni, topilgan %, ❌ topilmagan so'zlar (botdagi 📊 Statistika kabi),
//  xodimlar bo'yicha qidiruv, ⭐ ko'p so'ralganlar (botdagi ⭐ tugmasi hisoblagichi).
//  API: statistika.
// ============================================================
(function () {
  var ERR = {
    admin:   "Bu bo'lim faqat admin uchun.",
    tarmoq:  "Internet bilan aloqa yo'q. Tekshirib, qayta urinib ko'ring.",
    server:  "Botda xato chiqdi. Birozdan keyin qayta urinib ko'ring.",
    amal:    "Bot eski versiyada (v16 kerak). Hozircha botdagi 📊 Statistika tugmasidan foydalaning.",
    init:    "Telegram ma'lumoti kelmadi. Panelni botdagi <b>🏪 Panelni ochish</b> tugmasidan oching.",
    eski:    "Panel ancha oldin ochilgan. Yopib, botdagi <b>🏪 Panel</b> dan qayta oching.",
    imzo:    "Telegram imzosi to'g'ri kelmadi. Botda <b>🏪 Panel</b> ni bosib, qaytadan oching.",
    ruxsat:  "Sizga ruxsat berilmagan.",
    obuna:   "⛔ Obuna muddati tugagan."
  };

  var root = null, days = 7, seq = 0, showAll = false;
  var esc = function (s) { return App.esc(s === null || s === undefined ? "" : s); };
  function errText(r) { return ERR[r && r.err] || ("Xato: " + esc(r && r.err || "noma'lum")); }
  function stat(lbl, val, sub, cls) {
    return '<div class="card pn-stat ' + (cls || "") + '"><div class="lbl">' + lbl + '</div><div class="val">' + val + "</div>" +
      (sub ? '<div class="sub">' + sub + "</div>" : "") + "</div>";
  }

  function draw(r) {
    var tab = function (d, t) { return '<button class="tv-chip' + (days === d ? " sel" : "") + '" data-d="' + d + '">' + t + "</button>"; };
    var pct = r.jami ? Math.round(r.topildi * 100 / r.jami) : 0;
    var h = "<h1>📊 Statistika</h1><div class=\"hs-tabs\">" + tab(1, "Bugun") + tab(7, "7 kun") + tab(30, "30 kun") + "</div>";
    h += '<div class="pn-stats">' +
      stat("🔍 Qidiruvlar", String(r.jami), "") +
      stat("✅ Topildi", pct + "%", r.topildi + " ta") +
      stat("❌ Topilmadi", String(r.jami - r.topildi), r.topilmadiJami + " xil so'z", r.jami - r.topildi ? "pn-warn" : "") +
      "</div>";

    var nf = r.topilmadi || [], lim = showAll ? nf.length : 15;
    h += '<div class="card im-gap"><b>❌ Topilmagan so\'zlar</b>';
    if (!nf.length) h += '<p class="muted small">Topilmagan so\'z yo\'q ✅</p>';
    else {
      h += '<div class="hs-top">' + nf.slice(0, lim).map(function (x, i) {
        return '<div class="hs-row"><span class="hs-n">' + (i + 1) + ". " + esc(x.w) + '</span><span class="hs-s muted">' + (x.c > 1 ? x.c + " marta" : "") + "</span></div>";
      }).join("") + "</div>";
      if (nf.length > lim) h += '<button class="btn secondary block im-gap" id="st-all">Hammasini ko\'rsatish (' + nf.length + ")</button>";
      if (r.topilmadiJami > nf.length) h += '<p class="muted small">... yana ' + (r.topilmadiJami - nf.length) + " xil so'z</p>";
      h += '<p class="muted small">💡 Bu so\'zlarni jadvaldagi mahsulotning "Boshqa nomlar" ustuniga qo\'shsangiz, bot keyingi safar topadi.</p>';
    }
    h += "</div>";

    if (r.xodimlar && r.xodimlar.length) {
      h += '<div class="card im-gap"><b>👥 Kim qancha qidirdi</b><div class="hs-top">' + r.xodimlar.map(function (x) {
        return '<div class="hs-row"><span class="hs-n">' + esc(x.name) + (x.m ? ' <span class="muted small">topilmadi: ' + x.m + "</span>" : "") +
          '</span><b class="hs-s">' + x.n + "</b></div>";
      }).join("") + "</div></div>";
    }

    h += '<div class="card im-gap"><b>⭐ Ko\'p so\'ralganlar</b> <span class="muted small">(umumiy hisob)</span>';
    if (!r.top || !r.top.length) h += '<p class="muted small">Hozircha bo\'sh.</p>';
    else h += '<div class="hs-top">' + r.top.map(function (x, i) {
      return '<div class="hs-row"><span class="hs-n">' + (i + 1) + ". " + esc(x.n) + (x.k ? ' <span class="muted small">kod ' + esc(x.k) + "</span>" : "") +
        '</span><span class="hs-s muted">' + x.c + " marta</span></div>";
    }).join("") + "</div>";
    h += "</div>";
    h += '<div class="pn-foot"><button class="btn secondary" id="st-reload">🔄 Yangilash</button></div>';
    root.innerHTML = h;
    root.querySelectorAll("[data-d]").forEach(function (b) {
      b.addEventListener("click", function () { days = Number(b.getAttribute("data-d")); showAll = false; load(); });
    });
    var all = root.querySelector("#st-all");
    if (all) all.addEventListener("click", function () { showAll = true; draw(r); });
    root.querySelector("#st-reload").addEventListener("click", load);
  }

  function load() {
    var my = ++seq;
    root.innerHTML = '<p class="muted">Yuklanyapti...</p>';
    App.api("statistika", { d: days }).then(function (r) {
      if (!root || my !== seq) return;
      if (!r || !r.ok) {
        root.innerHTML = "<h1>📊 Statistika</h1><div class=\"card\"><p class=\"err\">" + errText(r) + "</p></div>" +
          '<div class="pn-foot"><button class="btn secondary" id="st-retry">🔄 Qayta urinish</button></div>';
        root.querySelector("#st-retry").addEventListener("click", load);
        return;
      }
      draw(r);
    });
  }

  App.register("statistika", {
    render: function (el) { root = el; days = 7; showAll = false; load(); },
    destroy: function () { root = null; seq++; }
  });
})();
