// ============================================================
//  👥 XODIMLAR - panel bo'limi (v16). Faqat admin.
//  Ro'yxat: admin + "Ruxsat" varag'i (bugungi sotuv, 7 kunda qidiruv).
//  ➕ Qo'shish / ✏️ ism (= botdagi /ruxsat ID Ism), 🗑 chiqarish (= /chiqar ID).
//  Xodim hisobi: Bugun / 7 / 30 kun - qidiruv %, topa olmagan so'zlari, sotuv kunlar bo'yicha.
//  API: xodimlar, xodim, xodim_ok, xodim_x.
// ============================================================
(function () {
  var ERR = {
    id:      "Telegram ID faqat raqamlardan iborat (masalan 123456789).",
    adminid: "Bu admin ID'si - admin ro'yxatga qo'shilmaydi, u har doim kira oladi.",
    yoq:     "Bu xodim ro'yxatda yo'q (allaqachon chiqarilgan).",
    admin:   "Bu bo'lim faqat admin uchun.",
    band:    "Hozir band. Bir oz kutib qayta bosing.",
    tarmoq:  "Internet bilan aloqa yo'q. Tekshirib, qayta urinib ko'ring.",
    server:  "Botda xato chiqdi. Birozdan keyin qayta urinib ko'ring.",
    amal:    "Bot eski versiyada (v16 kerak). Hozircha botdagi 👥 Xodimlar tugmasidan foydalaning.",
    init:    "Telegram ma'lumoti kelmadi. Panelni botdagi <b>🏪 Panelni ochish</b> tugmasidan oching.",
    eski:    "Panel ancha oldin ochilgan. Yopib, botdagi <b>🏪 Panel</b> dan qayta oching.",
    imzo:    "Telegram imzosi to'g'ri kelmadi. Botda <b>🏪 Panel</b> ni bosib, qaytadan oching.",
    ruxsat:  "Sizga ruxsat berilmagan.",
    obuna:   "⛔ Obuna muddati tugagan."
  };

  var root = null, list = null, busy = false, flash = "", edit = null, seq = 0;
  var esc = function (s) { return App.esc(s === null || s === undefined ? "" : s); };
  function $(sel) { return root.querySelector(sel); }
  function errText(r) { return ERR[r && r.err] || ("Xato: " + esc(r && r.err || "noma'lum")); }
  function money(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

  // ----- Ro'yxat -----
  function drawList() {
    var h = "<h1>👥 Xodimlar</h1>";
    if (flash) { h += '<div class="card tv-flash">' + flash + "</div>"; flash = ""; }
    list.forEach(function (x) {
      h += '<div class="card ks-item"><div class="ks-row"><b>' + (x.admin ? "👑 " : "👤 ") + esc(x.name || "ismsiz") + "</b>" +
        '<span class="ks-sum muted small">ID ' + esc(x.id) + "</span></div>" +
        '<div class="muted small">🛒 bugun: ' + x.chek + " chek, " + money(x.sum) + " so'm · 🔍 7 kunda: " + x.q7 + " ta</div>" +
        '<div class="ks-x"><button class="btn secondary small" data-v="' + esc(x.id) + '">📋 Hisobi</button> ' +
        (x.admin ? "" : '<button class="btn secondary small" data-e="' + esc(x.id) + '">✏️ Ism</button> ' +
          '<button class="btn secondary small" data-x="' + esc(x.id) + '">🗑 Chiqarish</button>') +
        '<span class="small" id="xd-m-' + esc(x.id) + '"></span></div></div>';
    });
    if (list.length < 2) h += '<p class="muted small">Hozircha xodim qo\'shilmagan.</p>';
    h += '<div class="card ks-form im-gap"><b>➕ Xodim qo\'shish</b>' +
      '<p class="muted small">Xodim botga /start yozsin - bot unga ID\'sini ko\'rsatadi ("ruxsat yo\'q" xabarida). O\'sha raqamni shu yerga yozing.</p>' +
      '<label class="ks-l">🆔 Telegram ID<input class="field" id="xd-id" inputmode="numeric" autocomplete="off" placeholder="123456789"></label>' +
      '<label class="ks-l">👤 Ismi<input class="field" id="xd-name" maxlength="60" autocomplete="off" placeholder="masalan Dilnoza"></label>' +
      '<button class="btn block sv-sell im-gap" id="xd-add">✅ Qo\'shish</button><div class="small" id="xd-msg"></div></div>';
    h += '<div class="pn-foot"><button class="btn secondary" id="xd-reload">🔄 Yangilash</button></div>';
    root.innerHTML = h;
    $("#xd-reload").addEventListener("click", load);
    $("#xd-add").addEventListener("click", function () { save($("#xd-id").value.trim(), $("#xd-name").value.trim(), $("#xd-msg"), $("#xd-add")); });
    root.querySelectorAll("[data-v]").forEach(function (b) {
      b.addEventListener("click", function () { detail(b.getAttribute("data-v"), 7); });
    });
    root.querySelectorAll("[data-e]").forEach(function (b) {
      b.addEventListener("click", function () { drawEdit(b.getAttribute("data-e")); });
    });
    root.querySelectorAll("[data-x]").forEach(function (b) {
      b.addEventListener("click", function () { remove(b.getAttribute("data-x"), b); });
    });
  }

  function find(id) { return list.filter(function (x) { return x.id === id; })[0] || null; }

  function drawEdit(id) {
    edit = find(id);
    if (!edit) { drawList(); return; }
    root.innerHTML = "<h1>✏️ Ismni o'zgartirish</h1><div class=\"card ks-form\">" +
      '<div class="muted small">ID ' + esc(edit.id) + "</div>" +
      '<label class="ks-l">👤 Ismi<input class="field" id="xd-en" maxlength="60" autocomplete="off" value="' + esc(edit.name) + '"></label>' +
      '<button class="btn block sv-sell im-gap" id="xd-es">✅ Saqlash</button><div class="small" id="xd-em"></div></div>' +
      '<div class="pn-foot"><button class="btn secondary" id="xd-back">⬅️ Ro\'yxatga</button></div>';
    $("#xd-back").addEventListener("click", drawList);
    $("#xd-es").addEventListener("click", function () { save(edit.id, $("#xd-en").value.trim(), $("#xd-em"), $("#xd-es")); });
    $("#xd-en").focus();
  }

  function save(id, name, msg, btn) {
    if (busy) return;
    if (!/^\d{3,15}$/.test(id)) { msg.innerHTML = '<span class="err">' + ERR.id + "</span>"; return; }
    busy = true; btn.disabled = true;
    msg.innerHTML = '<span class="muted">Saqlanyapti...</span>';
    App.api("xodim_ok", { id: id, name: name }).then(function (r) {
      busy = false;
      if (!root) return;
      btn.disabled = false;
      if (r && r.ok) {
        if (r.x) list = r.x.list;
        flash = (r.yangi ? "✅ Qo'shildi: " : "✅ Saqlandi: ") + "<b>" + esc(name || id) + "</b>" +
          (r.yangi ? "<br><span class=\"muted small\">Endi u botda /start bossin - menyu chiqadi.</span>" : "");
        App.haptic("success");
        drawList();
        return;
      }
      msg.innerHTML = '<span class="err">' + errText(r) + "</span>";
      App.haptic("error");
    });
  }

  function remove(id, btn) {
    if (busy) return;
    var x = find(id), msg = $("#xd-m-" + id);
    if (btn.getAttribute("data-sure") !== "1") {
      btn.setAttribute("data-sure", "1");
      btn.textContent = "🗑 Ha, chiqarilsin";
      if (msg) msg.innerHTML = ' <span class="muted">botdan foydalana olmaydi</span>';
      return;
    }
    busy = true; btn.disabled = true;
    App.api("xodim_x", { id: id }).then(function (r) {
      busy = false;
      if (!root) return;
      if (r && r.x) list = r.x.list;
      if (r && r.ok) { flash = "🗑 Chiqarildi: <b>" + esc(x && x.name || id) + "</b>"; App.haptic("success"); drawList(); return; }
      if (r && r.err === "yoq") { flash = ERR.yoq; drawList(); return; }
      btn.disabled = false;
      if (msg) msg.innerHTML = ' <span class="err">' + errText(r) + "</span>";
      App.haptic("error");
    });
  }

  // ----- Xodim hisobi -----
  function detail(id, d) {
    var my = ++seq;
    root.innerHTML = '<p class="muted">Yuklanyapti...</p>';
    App.api("xodim", { id: id, d: d }).then(function (r) {
      if (!root || my !== seq) return;
      if (!r || !r.ok) {
        root.innerHTML = '<div class="card"><p class="err">' + errText(r) + "</p></div>" +
          '<div class="pn-foot"><button class="btn secondary" id="xd-back">⬅️ Ro\'yxatga</button></div>';
        $("#xd-back").addEventListener("click", drawList);
        return;
      }
      drawDetail(r);
    });
  }

  function drawDetail(r) {
    var tab = function (d, t) { return '<button class="tv-chip' + (r.d === d ? " sel" : "") + '" data-d="' + d + '">' + t + "</button>"; };
    var q = r.qidiruv, pct = q.jami ? Math.round(q.topildi * 100 / q.jami) : 0, s = r.sotuv;
    var h = '<h1>👤 ' + esc(r.name) + '</h1><div class="muted small">ID ' + esc(r.id) + "</div>" +
      '<div class="hs-tabs im-gap">' + tab(1, "Bugun") + tab(7, "7 kun") + tab(30, "30 kun") + "</div>";
    h += '<div class="pn-stats">' +
      '<div class="card pn-stat"><div class="lbl">🛒 Sotuv</div><div class="val">' + money(s.sum) + '</div><div class="sub">' + s.chek + " ta chek</div></div>" +
      '<div class="card pn-stat"><div class="lbl">🔍 Qidiruv</div><div class="val">' + q.jami + '</div><div class="sub">topildi ' + pct + "%</div></div></div>";
    if (s.kunlar.length) {
      h += '<div class="card im-gap"><b>🛒 Kunlar bo\'yicha</b><div class="hs-top">' + s.kunlar.map(function (x) {
        return '<div class="hs-row"><span class="hs-n">' + esc(x.d) + ' <span class="muted small">' + x.chek + " chek</span></span><b class=\"hs-s\">" + money(x.sum) + "</b></div>";
      }).join("") + "</div></div>";
    }
    if (r.topilmadi.length) {
      h += '<div class="card im-gap"><b>❌ Topa olmagan so\'zlari</b><div class="hs-top">' + r.topilmadi.map(function (x) {
        return '<div class="hs-row"><span class="hs-n">' + esc(x.w) + '</span><span class="hs-s muted">' + (x.c > 1 ? "×" + x.c : "") + "</span></div>";
      }).join("") + "</div></div>";
    }
    if (r.oxirgi.length) {
      h += '<div class="card im-gap"><b>🕘 Oxirgi qidiruvlari</b><div class="hs-top">' + r.oxirgi.map(function (x) {
        return '<div class="hs-row"><span class="hs-n">' + (x.ok ? "✅ " : "❌ ") + esc(x.w) + '</span><span class="hs-s muted small">' + esc(x.t) + "</span></div>";
      }).join("") + "</div></div>";
    }
    if (!q.jami && !s.chek) h += '<p class="muted">Bu davrda qidiruv ham, sotuv ham yo\'q.</p>';
    h += '<div class="pn-foot"><button class="btn secondary" id="xd-back">⬅️ Xodimlar ro\'yxati</button></div>';
    root.innerHTML = h;
    $("#xd-back").addEventListener("click", drawList);
    root.querySelectorAll("[data-d]").forEach(function (b) {
      b.addEventListener("click", function () { detail(r.id, Number(b.getAttribute("data-d"))); });
    });
  }

  function load() {
    root.innerHTML = '<p class="muted">Yuklanyapti...</p>';
    App.api("xodimlar").then(function (r) {
      if (!root) return;
      if (!r || !r.ok) {
        root.innerHTML = "<h1>👥 Xodimlar</h1><div class=\"card\"><p class=\"err\">" + errText(r) + "</p></div>" +
          '<div class="pn-foot"><button class="btn secondary" id="xd-retry">🔄 Qayta urinish</button></div>';
        root.querySelector("#xd-retry").addEventListener("click", load);
        return;
      }
      list = r.list || [];
      drawList();
    });
  }

  App.register("xodimlar", {
    render: function (el) { root = el; flash = ""; load(); },
    destroy: function () { root = null; seq++; }
  });
})();
