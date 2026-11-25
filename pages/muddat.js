// ============================================================
//  ⏰ MUDDATLAR - panel bo'limi (v16). Xodim ham, admin ham.
//  Botdagi "Muddat" varag'i bilan BIR XIL: ro'yxat (eng yaqini birinchi), ➕ qo'shish, ✔ olib tashlash.
//  Har kuni 08:00 dagi bot eslatmasi avvalgidek ishlaydi (3 kun qolganlar).
//  API: muddat, muddat_qidir, muddat_ok, muddat_x.
//  v16.1: tovar ro'yxatdan bosilmasa ham - nomi to'liq mos kelsa yoki bitta topilsa, o'zi tanlanadi.
// ============================================================
(function () {
  var ERR = {
    nom:    "Tovarni tanlang.",
    topilmadi: "Bu tovar jadvalda topilmadi. Qaytadan qidiring.",
    sana:   "Sanani to'g'ri yozing: kun.oy (masalan 25.12) yoki kun.oy.yil.",
    soni:   "Sonini raqam bilan yozing (yoki bo'sh qoldiring).",
    yoq:    "Bu yozuv allaqachon olib tashlangan.",
    band:   "Hozir band. Bir oz kutib qayta bosing.",
    tarmoq: "Internet bilan aloqa yo'q. Tekshirib, qayta urinib ko'ring.",
    server: "Botda xato chiqdi. Birozdan keyin qayta urinib ko'ring.",
    amal:   "Bot eski versiyada (v16 kerak). Hozircha botdagi ⏰ Muddatlar tugmasidan foydalaning.",
    init:   "Telegram ma'lumoti kelmadi. Panelni botdagi <b>🏪 Panelni ochish</b> tugmasidan oching.",
    eski:   "Panel ancha oldin ochilgan. Yopib, botdagi <b>🏪 Panel</b> dan qayta oching.",
    imzo:   "Telegram imzosi to'g'ri kelmadi. Botda <b>🏪 Panel</b> ni bosib, qaytadan oching.",
    ruxsat: "Sizga ruxsat berilmagan. ID'ingizni adminga yuboring.",
    obuna:  "⛔ Obuna muddati tugagan."
  };

  var root = null, list = null, flt = "7", q = "", busy = false, flash = "";
  var pick = null, hits = [], pendingN = "", seq = 0, timer = null, mode = "list";
  var esc = function (s) { return App.esc(s === null || s === undefined ? "" : s); };
  function $(sel) { return root.querySelector(sel); }
  function errText(r) { return ERR[r && r.err] || ("Xato: " + esc(r && r.err || "noma'lum")); }
  function nonce() {
    var s = "";
    for (var i = 0; i < 12; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 36));
    return Date.now().toString(36) + s;
  }
  function norm(s) { return String(s || "").toLowerCase().replace(/['’`ʻ]/g, ""); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dmy(d) { return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear(); }
  function plusDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return dmy(d); }
  function plusMonths(n) { var d = new Date(); d.setMonth(d.getMonth() + n); return dmy(d); }

  function state(x) {
    if (x.left < 0) return '<b class="tv-red">❌ o\'tgan (' + (-x.left) + " kun)</b>";
    if (x.left === 0) return '<b class="tv-red">⚠️ BUGUN</b>';
    if (x.left <= 3) return '<b class="tv-warn">' + x.left + " kun</b>";
    return x.left + " kun";
  }

  function counts() {
    var c = { otgan: 0, k3: 0, k7: 0, all: list.length };
    list.forEach(function (x) { if (x.left < 0) c.otgan++; if (x.left <= 3) c.k3++; if (x.left <= 7) c.k7++; });
    return c;
  }

  function filtered() {
    var k = norm(q).trim();
    return list.filter(function (x) {
      if (flt === "otgan" && x.left >= 0) return false;
      if (flt === "3" && x.left > 3) return false;
      if (flt === "7" && x.left > 7) return false;
      return !k || norm(x.n).indexOf(k) !== -1 || String(x.k).indexOf(k) === 0;
    });
  }

  function chip(key, label) {
    return '<button class="tv-chip' + (flt === key ? " sel" : "") + '" data-f="' + key + '">' + label + "</button>";
  }

  // ----- Ro'yxat -----
  function drawList() {
    mode = "list";
    var c = counts();
    var h = "<h1>⏰ Muddatlar</h1>";
    if (flash) { h += '<div class="card tv-flash">' + flash + "</div>"; flash = ""; }
    h += '<button class="btn block sv-sell" id="md-add">➕ Muddat qo\'shish</button>';
    h += '<div class="tv-chips im-gap">' + chip("7", "7 kun (" + c.k7 + ")") + chip("3", "3 kun (" + c.k3 + ")") +
      chip("otgan", "O'tgan (" + c.otgan + ")") + chip("", "Hammasi (" + c.all + ")") + "</div>";
    h += '<input class="field tv-search" id="md-q" type="search" placeholder="🔍 Nomi yoki kodi" value="' + esc(q) + '">';
    h += '<div id="md-box"></div>';
    h += '<div class="pn-foot"><button class="btn secondary" id="md-reload">🔄 Yangilash</button></div>';
    root.innerHTML = h;
    $("#md-add").addEventListener("click", function () { drawAdd(); });
    $("#md-reload").addEventListener("click", load);
    root.querySelectorAll("[data-f]").forEach(function (b) {
      b.addEventListener("click", function () { flt = b.getAttribute("data-f"); drawList(); });
    });
    $("#md-q").addEventListener("input", function () { q = this.value; drawBox(); });
    drawBox();
  }

  function drawBox() {
    var box = $("#md-box"), res = filtered();
    if (!res.length) {
      box.innerHTML = '<p class="muted tv-empty">' + (q ? "Topilmadi." : flt === "" ? "Hali muddat yozilmagan." : "✅ Bu oraliqda muddati tugaydigan tovar yo'q.") + "</p>";
      return;
    }
    var h = "";
    res.slice(0, 200).forEach(function (x) {
      h += '<div class="card ks-item"><div class="ks-row"><b>' + esc(x.n) + '</b><span class="ks-sum">' + state(x) + "</span></div>" +
        '<div class="muted small">📅 ' + esc(x.sana) + (x.k ? " · kod " + esc(x.k) : "") + (x.soni ? " · " + esc(x.soni) + " ta" : "") +
        (x.kim ? " · 👤 " + esc(x.kim) : "") + "</div>" +
        '<div class="ks-x"><button class="btn secondary small" data-x="' + esc(x.id) + '">✔ Sotildi / olib tashlandi</button>' +
        '<span class="small" id="md-x-' + esc(x.id) + '"></span></div></div>';
    });
    if (res.length > 200) h += '<p class="muted small tv-empty">... yana ' + (res.length - 200) + " ta. Qidiruvda aniqroq yozing.</p>";
    box.innerHTML = h;
    box.querySelectorAll("[data-x]").forEach(function (b) {
      b.addEventListener("click", function () { remove(b.getAttribute("data-x"), b); });
    });
  }

  function remove(id, btn) {
    if (busy) return;
    var item = list.filter(function (x) { return x.id === id; })[0];
    var msg = $("#md-x-" + id);
    if (btn.getAttribute("data-sure") !== "1") {
      btn.setAttribute("data-sure", "1");
      btn.textContent = "✔ Ha, olib tashlansin";
      if (msg) msg.innerHTML = ' <span class="muted">yana bir bosing</span>';
      return;
    }
    busy = true; btn.disabled = true;
    if (msg) msg.innerHTML = ' <span class="muted">...</span>';
    App.api("muddat_x", { id: id }).then(function (r) {
      busy = false;
      if (!root) return;
      if (r && r.m) list = r.m.list;
      if (r && r.ok) { flash = "✔ Olib tashlandi: <b>" + esc(r.n || (item && item.n)) + "</b>"; App.haptic("success"); drawList(); return; }
      if (r && r.err === "yoq") { flash = ERR.yoq; drawList(); return; }
      btn.disabled = false;
      if (msg) msg.innerHTML = ' <span class="err">' + errText(r) + "</span>";
      App.haptic("error");
    });
  }

  // ----- ➕ Qo'shish -----
  function drawAdd() {
    mode = "add";
    pick = null; hits = []; pendingN = "";
    var h = "<h1>➕ Muddat qo'shish</h1>" +
      '<div class="card ks-form">' +
      '<label class="ks-l">📦 Tovar<input class="field" id="md-t" type="search" autocomplete="off" placeholder="Nomi, kodi yoki shtrix"></label>' +
      '<div id="md-hits" class="im-gap"></div>' +
      '<label class="ks-l">📅 Muddati (kun.oy)<input class="field" id="md-d" inputmode="decimal" autocomplete="off" placeholder="masalan 25.12"></label>' +
      '<div class="tv-chips im-gap sv-quick">' +
      '<button class="tv-chip" data-d="' + plusDays(3) + '">+3 kun</button>' +
      '<button class="tv-chip" data-d="' + plusDays(7) + '">+1 hafta</button>' +
      '<button class="tv-chip" data-d="' + plusMonths(1) + '">+1 oy</button>' +
      '<button class="tv-chip" data-d="' + plusMonths(3) + '">+3 oy</button>' +
      '<button class="tv-chip" data-d="' + plusMonths(6) + '">+6 oy</button></div>' +
      '<label class="ks-l">🔢 Soni <span class="muted small">(ixtiyoriy)</span><input class="field" id="md-s" inputmode="decimal" autocomplete="off" placeholder="masalan 12"></label>' +
      '<button class="btn block sv-sell im-gap" id="md-go">✅ Yozish</button>' +
      '<div class="small" id="md-msg"></div></div>' +
      '<div class="pn-foot"><button class="btn secondary" id="md-back">⬅️ Ro\'yxatga</button></div>';
    root.innerHTML = h;
    $("#md-back").addEventListener("click", drawList);
    $("#md-t").addEventListener("input", function () {
      pick = null; pendingN = "";
      var v = this.value;
      clearTimeout(timer);
      timer = setTimeout(function () { find(v); }, 350);
      drawHits();
    });
    root.querySelectorAll("[data-d]").forEach(function (b) {
      b.addEventListener("click", function () { $("#md-d").value = b.getAttribute("data-d"); pendingN = ""; });
    });
    $("#md-d").addEventListener("input", function () { pendingN = ""; });
    $("#md-s").addEventListener("input", function () { pendingN = ""; });
    $("#md-go").addEventListener("click", save);
    $("#md-t").focus();
  }

  function find(v) {
    v = String(v || "").trim();
    if (!v) { hits = []; drawHits(); return; }
    var my = ++seq;
    $("#md-hits").innerHTML = '<p class="muted small">Qidirilyapti...</p>';
    App.api("muddat_qidir", { q: v }).then(function (r) {
      if (!root || mode !== "add" || my !== seq) return;
      if (!r || !r.ok) { $("#md-hits").innerHTML = '<p class="err small">' + errText(r) + "</p>"; return; }
      hits = r.list || [];
      drawHits();
    });
  }

  function drawHits() {
    var box = $("#md-hits");
    if (!box) return;
    if (pick) {
      box.innerHTML = '<div class="card mh-ok">✅ <b>' + esc(pick.n) + "</b>" + (pick.k ? ' <span class="muted small">kod ' + esc(pick.k) + "</span>" : "") + "</div>";
      return;
    }
    if (!hits.length) { box.innerHTML = $("#md-t").value.trim() ? '<p class="muted small">Topilmadi - boshqacha yozib ko\'ring.</p>' : ""; return; }
    box.innerHTML = '<p class="muted small">👇 Keraklisini bosing:</p>' + hits.map(function (x, i) {
      return '<button class="tv-item" data-h="' + i + '"><span class="tv-name">' + esc(x.n) + "</span>" +
        '<span class="tv-val muted small">' + (x.k ? "kod " + esc(x.k) : "") + "</span></button>";
    }).join("");
    box.querySelectorAll("[data-h]").forEach(function (b) {
      b.addEventListener("click", function () {
        pick = hits[Number(b.getAttribute("data-h"))];
        $("#md-t").value = pick.n;
        pendingN = "";
        drawHits();
        $("#md-d").focus();
      });
    });
  }

  // v16.1: tovar ro'yxatdan bosilmagan bo'lsa - o'zi tanlaydi: nomi to'liq mos kelsa yoki bitta topilsa
  function autoPick(list, typed) {
    var k = norm(typed).trim();
    if (!k || !list.length) return null;
    var same = list.filter(function (x) { return norm(x.n).trim() === k || String(x.k) === typed.trim(); });
    if (same.length === 1) return same[0];
    return list.length === 1 ? list[0] : null;
  }

  function save() {
    if (busy) return;
    var msg = $("#md-msg");
    var d = $("#md-d").value.trim();
    if (!/^\d{1,2}[.\/-]\d{1,2}([.\/-]\d{2,4})?$/.test(d)) { msg.innerHTML = '<span class="err">' + ERR.sana + "</span>"; return; }
    if (!pick) {
      var typed = $("#md-t").value.trim();
      if (!typed) { msg.innerHTML = '<span class="err">Tovar nomini yozing.</span>'; return; }
      var take = function (list) {
        pick = autoPick(list, typed);
        if (pick) { drawHits(); save(); return; }
        hits = list; drawHits();
        msg.innerHTML = '<span class="err">' + (list.length ? "Bir nechta tovar chiqdi - keraklisini 👆 ro'yxatdan bosing." :
          "Bunday tovar topilmadi. Nomini boshqacha yozing.") + "</span>";
      };
      if (hits.length) { take(hits); return; }
      busy = true;
      msg.innerHTML = '<span class="muted">Tovar qidirilyapti...</span>';
      App.api("muddat_qidir", { q: typed }).then(function (r) {
        busy = false;
        if (!root || mode !== "add") return;
        if (!r || !r.ok) { msg.innerHTML = '<span class="err">' + errText(r) + "</span>"; return; }
        take(r.list || []);
      });
      return;
    }
    var s = $("#md-s").value.trim();
    if (!pendingN) pendingN = nonce();
    busy = true;
    $("#md-go").disabled = true;
    msg.innerHTML = '<span class="muted">Yozilyapti...</span>';
    App.api("muddat_ok", { n: pick.n, k: pick.k, sana: d, soni: s, nonce: pendingN }).then(function (r) {
      busy = false;
      if (!root) return;
      $("#md-go").disabled = false;
      if (r && r.ok) {
        if (r.m) list = r.m.list;
        flash = "✅ Yozildi: <b>" + esc(r.n || pick.n) + "</b>" + (r.sana ? ", muddat " + esc(r.sana) : "") + (s ? ", " + esc(s) + " ta" : "");
        App.haptic("success");
        flt = ""; q = "";
        drawList();
        return;
      }
      msg.innerHTML = '<span class="err">' + errText(r) + "</span>";
      App.haptic("error");
    });
  }

  function load() {
    root.innerHTML = '<p class="muted">Yuklanyapti...</p>';
    App.api("muddat").then(function (r) {
      if (!root) return;
      if (!r || !r.ok) {
        root.innerHTML = "<h1>⏰ Muddatlar</h1><div class=\"card\"><p class=\"err\">" + errText(r) + "</p></div>" +
          '<div class="pn-foot"><button class="btn secondary" id="md-retry">🔄 Qayta urinish</button></div>';
        root.querySelector("#md-retry").addEventListener("click", load);
        return;
      }
      list = r.list || [];
      drawList();
    });
  }

  App.register("muddat", {
    render: function (el) { root = el; flt = "7"; q = ""; flash = ""; load(); },
    destroy: function () { root = null; clearTimeout(timer); }
  });
})();
