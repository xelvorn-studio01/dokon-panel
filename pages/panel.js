// ============================================================
//  🏪 PANEL - do'kon paneli bosh sahifasi (v11, 1-qadam: asos)
//  Botdagi "🏪 Panel" -> "🏪 Panelni ochish" (inline tugma) orqali ochiladi:
//    .../dokon-panel/?bolim=panel&dokon=ID&api=URL
//  Ma'lumot App.api("men") orqali keladi - bot Telegram imzosini tekshirib, kimligingizni aniqlaydi.
//  Bo'limlar keyingi qadamlarda birin-ketin yoqiladi. v12: 📊 Excel yuklash yoqildi (pages/import.js).
//  v13: 📦 Qoldiq, ✏️ Narx (pages/tovar.js), 🧾 Hisobot (pages/hisobot.js) yoqildi.
//  v14: bitta panel, rolga qarab ikki ko'rinish. Xodim: 🛒 Sotuv, 🔍 Qidiruv (+ 💰 Kassa, ⏰ Muddat - tez orada).
//       Admin: hammasi. 🛒 Sotuv panel ichida API orqali ishlaydi (oyna yopilmaydi).
//  v15: 💰 Kassa (xodim + admin), ➕ Mahsulot qo'shish (admin) yoqildi.
//  v16: ⏰ Muddatlar (xodim + admin), 📊 Statistika, 👥 Xodimlar, ⚙️ Sozlamalar (admin) yoqildi.
//  v17: 🎨 Dizayn - har do'kon o'z ko'rinishida (Mijozlar varag'i I ustuni "Dizayn"):
//       A - toza (rangli kartochkalar), B - katta raqam (rangli sarlavha + katta "Yangi sotuv" tugmasi),
//       C - ilova (Diqqat ro'yxati + pastki menyu). Bot dz yubormasa - A.
//       Admin pastda "Ko'rinish: A B C" bilan boshqasini ko'rib chiqishi mumkin (faqat ekranda, saqlanmaydi).
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

  // Bo'limlar. hamma: true - xodim ham ko'radi (aks holda faqat admin).
  // on: true bo'lganda bosiladi; v - botning kamida shu versiyasi kerak (eski botda "botni yangilang").
  // tone (v17) - ikonka fonining rangi (t-yashil, t-kok, ...; app.css da)
  var SECTIONS = [
    { key: "savat",   icon: "🛒", title: "Sotuv",          on: true, v: 14, hamma: true, tone: "yashil" }, // v14
    { key: "qidiruv", icon: "🔍", title: "Qidiruv",        on: true, v: 14, hamma: true, tone: "kok" },    // v14
    { key: "kassa",   icon: "💰", title: "Kassa",          on: true, v: 15, hamma: true, tone: "sariq" },  // v15
    { key: "mahsulot", icon: "➕", title: "Mahsulot qo'shish", on: true, v: 15, tone: "yashil" },        // v15
    { key: "import",  icon: "📊", title: "Excel yuklash",  on: true, tone: "kok" },      // v12
    { key: "qoldiq",  icon: "📦", title: "Qoldiq",         on: true, tone: "binafsha" }, // v13
    { key: "narx",    icon: "✏️", title: "Narx",           on: true, tone: "sariq" },    // v13
    { key: "hisobot", icon: "🧾", title: "Hisobot",        on: true, tone: "binafsha" }, // v13
    { key: "muddat",  icon: "⏰", title: "Muddatlar",      on: true, v: 16, hamma: true, tone: "qizil" }, // v16
    { key: "statistika", icon: "📊", title: "Statistika",  on: true, v: 16, tone: "kok" },      // v16
    { key: "xodimlar", icon: "👥", title: "Xodimlar",      on: true, v: 16, tone: "binafsha" }, // v16
    { key: "sozlama", icon: "⚙️", title: "Sozlamalar",     on: true, v: 16, tone: "kulrang" }   // v16
  ];

  var root = null;
  var last = null;     // v17: oxirgi "men" javobi (ko'rinishni almashtirganda qayta so'ramaslik uchun)
  var preview = null;  // v17: admin tanlagan ko'rinish (faqat ekranda)

  function money(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  // v17: katta summalar qisqa: 1 240 000 -> "1.24 mln"
  function short(n) {
    n = Math.round(Number(n) || 0);
    if (n >= 1000000) return (Math.round(n / 10000) / 100).toString().replace(/\.?0+$/, "") + " mln";
    if (n >= 10000) return Math.round(n / 1000) + " ming";
    return money(n);
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

  // v17: ko'rinish butun ilovaga (ichki bo'limlarga ham) body klassi orqali beriladi
  function setDesign(dz) {
    App.dz = dz;
    document.body.classList.remove("dz-a", "dz-b", "dz-c");
    document.body.classList.add("dz-" + dz.toLowerCase());
  }

  // Ko'rinadigan bo'limlar: { x, on, old }
  function sectionList(r) {
    var bv = Number(r.v) || 0;
    return SECTIONS.filter(function (x) { return r.admin || x.hamma; }).map(function (x) {
      var old = x.on && x.v && bv < x.v;  // panel yangi, bot eski
      return { x: x, on: x.on && !old, old: old };
    });
  }

  function soon(it) {
    return it.on ? "" : '<span class="soon">' + (it.old ? "botni yangilang" : "tez orada") + "</span>";
  }

  function ico(it, cls) {
    return '<span class="' + (cls || "ico") + " t-" + (it.x.tone || "kulrang") + '">' + it.x.icon + "</span>";
  }

  function subtitle(r) {
    return "👤 " + App.esc(r.user && r.user.name || "") + " · " + (r.admin ? "admin" : "xodim") +
      (r.kun !== null && r.kun !== undefined ? " · obuna: " + (r.kun >= 0 ? r.kun + " kun qoldi" : "tugagan") : "");
  }

  function totals(r) {
    if (r.admin && r.sotuv) {
      var s = r.sotuv;
      return { sum: s.naqd + s.karta, chek: s.chek, naqd: s.naqd, karta: s.karta, mine: false };
    }
    var me = r.men || { sum: 0, chek: 0 };
    return { sum: me.sum, chek: me.chek, mine: true };
  }

  // ===== A - TOZA =====
  function viewA(r, items) {
    var t = totals(r), q = r.qoldiq || {};
    var html = '<div class="pn-head"><h1>🏪 ' + App.esc(r.d) + '</h1><div class="muted small">' + subtitle(r) + "</div></div>";
    html += '<div class="card a-hero"><div class="lbl">' + (t.mine ? "🛒 Bugun siz sotdingiz" : "🛒 Bugungi sotuv") + "</div>" +
      '<div class="a-big">' + money(t.sum) + ' <span class="small muted">so\'m</span></div>' +
      '<div class="small muted">' + t.chek + " ta chek" +
      (t.mine ? "" : " · 💵 " + money(t.naqd) + " · 💳 " + money(t.karta)) + "</div></div>";
    if (r.admin && r.qoldiq) {
      html += '<div class="pn-stats">' +
        stat("📦 Tovarlar", money(q.tovar || 0), "hisobda: " + (q.hisobda || 0)) +
        stat("⚠️ Kam qolgan", String(q.kam || 0), "chegara: " + (q.chegara !== undefined ? q.chegara : "-"), q.kam ? "pn-warn" : "") +
        "</div>";
    }
    html += '<div class="menu a-menu">';
    items.forEach(function (it) {
      html += '<a href="#" class="' + (it.on ? "" : "off") + '" data-sec="' + it.x.key + '">' + ico(it) +
        '<span class="a-t">' + App.esc(it.x.title) + "</span>" + soon(it) + "</a>";
    });
    return html + "</div>";
  }

  // ===== B - KATTA RAQAM =====
  function viewB(r, items) {
    var t = totals(r), q = r.qoldiq || {};
    var html = '<div class="b-top"><div class="b-shop">🏪 ' + App.esc(r.d) + " · bugun</div>" +
      '<div class="b-big">' + money(t.sum) + "</div>" +
      '<div class="b-sub">so\'m · ' + t.chek + " ta chek" + (t.mine ? " (siz)" : "") + "</div></div>";
    html += '<div class="muted small b-who">' + subtitle(r) + "</div>";
    var rows = "";
    if (!t.mine) {
      rows += '<div class="b-row"><span class="muted">💵 Naqd</span><b>' + money(t.naqd) + "</b></div>" +
        '<div class="b-row"><span class="muted">💳 Karta</span><b>' + money(t.karta) + "</b></div>";
      if (r.qoldiq) rows += '<div class="b-row" data-sec="qoldiq"><span class="muted">⚠️ Kam qolgan</span><b class="' +
        (q.kam ? "err" : "") + '">' + (q.kam || 0) + " ta</b></div>";
    }
    if (r.muddat) rows += '<div class="b-row" data-sec="muddat"><span class="muted">⏰ Muddati yaqin</span><b class="err">' +
      r.muddat + " ta</b></div>";
    if (rows) html += '<div class="card b-rows">' + rows + "</div>";

    var main = items.filter(function (it) { return it.x.key === "savat"; })[0];
    if (main) html += '<button class="btn block b-sell" data-sec="savat"' + (main.on ? "" : " disabled") +
      ">🛒 Yangi sotuv</button>";
    html += '<div class="b-grid">';
    items.forEach(function (it) {
      if (it.x.key === "savat") return;
      html += '<a href="#" class="' + (it.on ? "" : "off") + '" data-sec="' + it.x.key + '">' + ico(it, "b-ico") +
        "<span>" + App.esc(it.x.title) + "</span>" + soon(it) + "</a>";
    });
    return html + "</div>";
  }

  // ===== C - ILOVA (pastki menyu) =====
  function viewC(r, items) {
    var t = totals(r), q = r.qoldiq || {};
    var h = new Date().getHours();
    var hi = h < 11 ? "Xayrli tong" : h < 18 ? "Xayrli kun" : "Xayrli kech";
    var name = r.user && r.user.name ? ", " + App.esc(r.user.name) : "";
    var html = '<div class="c-hi">' + hi + name + '</div><h1 class="c-shop">🏪 ' + App.esc(r.d) + "</h1>";
    html += '<div class="pn-stats">' +
      stat(t.mine ? "🛒 Siz sotdingiz" : "🛒 Sotuv", short(t.sum), "so'm") +
      stat("🧾 Chek", String(t.chek), "bugun") + "</div>";

    var warn = "";
    if (r.admin && q.kam) warn += '<a href="#" class="c-row" data-sec="qoldiq"><span class="c-ri t-sariq">⚠️</span>' +
      '<span class="grow">' + q.kam + " ta tovar kam qoldi</span><span class=\"c-chev\">›</span></a>";
    if (r.muddat) warn += '<a href="#" class="c-row" data-sec="muddat"><span class="c-ri t-qizil">⏰</span>' +
      '<span class="grow">' + r.muddat + " ta muddati yaqin</span><span class=\"c-chev\">›</span></a>";
    if (r.kun !== null && r.kun !== undefined && r.kun <= 5) warn += '<div class="c-row"><span class="c-ri t-qizil">📅</span>' +
      '<span class="grow">Obuna: ' + (r.kun >= 0 ? r.kun + " kun qoldi" : "tugagan") + "</span></div>";
    if (warn) html += '<div class="c-cap">Diqqat</div><div class="card c-list">' + warn + "</div>";

    // Pastki menyuga 3 ta asosiy bo'lim, qolganlari ro'yxatda
    var navKeys = r.admin ? ["savat", "qoldiq", "hisobot"] : ["savat", "qidiruv", "kassa"];
    var rest = items.filter(function (it) { return navKeys.indexOf(it.x.key) < 0; });
    if (rest.length) {
      html += '<div class="c-cap">Bo\'limlar</div><div class="card c-list">';
      rest.forEach(function (it) {
        html += '<a href="#" class="c-row ' + (it.on ? "" : "off") + '" data-sec="' + it.x.key + '">' + ico(it, "c-ri") +
          '<span class="grow">' + App.esc(it.x.title) + soon(it) + '</span><span class="c-chev">›</span></a>';
      });
      html += "</div>";
    }
    html += '<div class="muted small c-who">' + subtitle(r) + "</div>";

    html += '<nav class="c-nav"><a href="#" class="sel" data-nav="home"><span>🏠</span>Bosh</a>';
    navKeys.forEach(function (k) {
      var it = items.filter(function (i) { return i.x.key === k; })[0];
      if (!it) return;
      html += '<a href="#" class="' + (it.on ? "" : "off") + '" data-sec="' + k + '"><span>' + it.x.icon + "</span>" +
        App.esc(it.x.title) + "</a>";
    });
    return html + "</nav>";
  }

  var VIEWS = { A: viewA, B: viewB, C: viewC };

  function show(r) {
    last = r;
    var dz = preview || (/^[ABC]$/.test(r.dz || "") ? r.dz : "A");
    setDesign(dz);
    var items = sectionList(r);
    var html = '<div class="pn pn-' + dz.toLowerCase() + '">' + VIEWS[dz](r, items);

    html += '<div class="pn-foot"><button class="btn secondary" id="pn-reload">🔄 Yangilash</button>';
    if (r.admin) {
      // v17: admin boshqa ko'rinishni sinab ko'radi (doimiy qilish - Mijozlar varag'i I ustuni)
      html += '<div class="pn-dz">Ko\'rinish: ';
      ["A", "B", "C"].forEach(function (k) {
        html += '<button class="tv-chip' + (k === dz ? " sel" : "") + '" data-dz="' + k + '">' + k + "</button>";
      });
      html += "</div>";
    }
    html += '<p class="muted small">Panel v' + App.esc(App.version) + " · bot v" + App.esc(r.v) + " · " + dz + "</p></div></div>";
    root.innerHTML = html;

    root.querySelector("#pn-reload").addEventListener("click", load);
    // v12: yoqilgan bo'limlar ochiladi (Telegram "Orqaga" tugmasi panelga qaytaradi)
    root.querySelectorAll("[data-sec]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        if (a.classList.contains("off") || a.disabled) return;
        App.open(a.getAttribute("data-sec"));
      });
    });
    root.querySelectorAll("[data-nav]").forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); window.scrollTo(0, 0); });
    });
    root.querySelectorAll("[data-dz]").forEach(function (b) {
      b.addEventListener("click", function () {
        preview = b.getAttribute("data-dz");
        App.haptic("success");
        show(last);
        window.scrollTo(0, 0);
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
