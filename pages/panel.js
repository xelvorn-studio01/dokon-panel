// ============================================================
//  🏪 PANEL - do'kon paneli bosh sahifasi (v11, 1-qadam: asos)
//  Botdagi "🏪 Panel" -> "🏪 Panelni ochish" (inline tugma) orqali ochiladi:
//    .../dokon-panel/?bolim=panel&dokon=ID&api=URL
//  Ma'lumot App.api("men") orqali keladi - bot Telegram imzosini tekshirib, kimligingizni aniqlaydi.
//  Bo'limlar keyingi qadamlarda birin-ketin yoqiladi. v12: 📊 Excel yuklash yoqildi (pages/import.js).
// ============================================================
(function () {
  var ERR = {
    manzil: "Panel manzili to'liq emas. Botda <b>🏪 Panel</b> tugmasini bosib, qaytadan oching.",
    init:   "Telegram ma'lumoti kelmadi. Panelni botdagi <b>🏪 Panelni ochish</b> tugmasidan oching.",
    imzo:   "Telegram imzosi to'g'ri kelmadi. Botda <b>🏪 Panel</b> ni bosib, qaytadan oching.",
    eski:   "Panel ancha oldin ochilgan. Yopib, botdagi <b>🏪 Panel</b> dan qayta oching.",
    obuna:  "⛔ Obuna muddati tugagan.",
    ruxsat: "Sizga ruxsat berilmagan. ID'ingizni adminga yuboring.",
    dokon:  "Do'kon topilmadi. Botda <b>🏪 Panel</b> ni bosib, qaytadan oching.",
    tarmoq: "Internet bilan aloqa yo'q. Tekshirib, qayta urinib ko'ring.",
    server: "Botda xato chiqdi. Birozdan keyin qayta urinib ko'ring.",
    sorov:  "So'rov noto'g'ri yuborildi.",
    amal:   "Bot bu amalni bilmaydi (eski versiya bo'lishi mumkin)."
  };

  // Keyingi qadamlarda shu yerga bo'limlar qo'shiladi (on: true bo'lganda bosiladi)
  var SECTIONS = [
    { key: "import", icon: "📊", title: "Excel yuklash",  on: true },  // v12,
    { key: "qoldiq", icon: "📦", title: "Qoldiq",         on: false },
    { key: "narx",   icon: "✏️", title: "Narx",           on: false },
    { key: "hisobot", icon: "🧾", title: "Hisobot",       on: false }
  ];

  var root = null;

  function money(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function stat(lbl, val, sub, cls) {
    return '<div class="card pn-stat ' + (cls || "") + '"><div class="lbl">' + lbl + '</div><div class="val">' +
      val + "</div>" + (sub ? '<div class="sub">' + sub + "</div>" : "") + "</div>";
  }

  function showError(r) {
    var msg = ERR[r.err] || ("Xato: " + App.esc(r.err || "noma'lum"));
    if (r.err === "ruxsat" && r.id) msg += '<br>Sizning ID: <b>' + App.esc(r.id) + "</b>";
    root.innerHTML = '<h1>🏪 Do\'kon paneli</h1><div class="card"><p class="err">' + msg + "</p></div>" +
      '<div class="pn-foot"><button class="btn secondary" id="pn-retry">🔄 Qayta urinish</button></div>';
    root.querySelector("#pn-retry").addEventListener("click", load);
    App.haptic("error");
  }

  function show(r) {
    var html = '<div class="pn-head"><h1>🏪 ' + App.esc(r.d) + "</h1>" +
      '<div class="muted small">👤 ' + App.esc(r.user && r.user.name || "") + " · " + (r.admin ? "admin" : "xodim") +
      (r.kun !== null && r.kun !== undefined ? " · obuna: " + (r.kun >= 0 ? r.kun + " kun qoldi" : "tugagan") : "") +
      "</div></div>";

    if (r.admin && r.sotuv) {
      var s = r.sotuv, q = r.qoldiq || {};
      html += '<div class="pn-stats">' +
        stat("🛒 Bugungi sotuv", money(s.naqd + s.karta) + " so'm", s.chek + " ta chek", "wide") +
        stat("💵 Naqd", money(s.naqd)) +
        stat("💳 Karta", money(s.karta)) +
        stat("📦 Tovarlar", money(q.tovar || 0), "qoldig'i hisobda: " + (q.hisobda || 0)) +
        stat("⚠️ Kam qolgan", String(q.kam || 0), "chegara: " + (q.chegara !== undefined ? q.chegara : "-"), q.kam ? "pn-warn" : "") +
        "</div>";

      html += '<div class="menu">';
      SECTIONS.forEach(function (x) {
        html += '<a href="#" class="' + (x.on ? "" : "off") + '" data-sec="' + x.key + '"><span class="ico">' + x.icon +
          "</span>" + App.esc(x.title) + (x.on ? "" : '<span class="soon">tez orada</span>') + "</a>";
      });
      html += "</div>";
    } else {
      html += '<div class="card"><p>Panel hozircha admin uchun. Sotuv uchun botdagi <b>🛒 Sotuv</b> tugmasidan foydalaning.</p></div>';
    }

    html += '<div class="pn-foot"><button class="btn secondary" id="pn-reload">🔄 Yangilash</button>' +
      '<p class="muted small">Panel v' + App.esc(App.version) + " · bot v" + App.esc(r.v) + "</p></div>";
    root.innerHTML = html;
    root.querySelector("#pn-reload").addEventListener("click", load);
    // v12: yoqilgan bo'limlar ochiladi (Telegram "Orqaga" tugmasi panelga qaytaradi)
    root.querySelectorAll(".menu a[data-sec]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        if (!a.classList.contains("off")) App.open(a.getAttribute("data-sec"));
      });
    });
  }

  function load() {
    root.innerHTML = '<p class="muted">Yuklanyapti...</p>';
    if (!App.inTelegram) {
      showError({ err: "init" });
      return;
    }
    App.api("men").then(function (r) {
      if (!root) return;
      if (r && r.ok) show(r); else showError(r || {});
    });
  }

  App.register("panel", {
    render: function (el) { root = el; load(); },
    destroy: function () { root = null; }
  });
})();
