// ============================================================
//  🔍 QIDIRUV - panel bo'limi (v14). Xodim ham, admin ham.
//  Botdagi qidiruv bilan BIR XIL (App.api("qidiruv") -> botdagi search): xato yozilsa ham topadi,
//  unlisiz yozsa ham (pmdr -> pomidor). Shtrix kod raqamini yozsa ham topadi.
//  Natijada: tarozi KODI (katta), nomi, narxi, shtrix. Rasmi bo'lsa - "📷 Rasmini botga yuborish".
//  Bo'sh holatda - ⭐ ko'p so'ralganlar. Har qidiruv jurnalga yoziladi (botdagi kabi).
//  Yozish davomida emas, 🔍 yoki Enter bosilganda qidiradi (jurnal har harf bilan to'lib ketmasin).
// ============================================================
(function () {
  var ERR = {
    tarmoq: "Internet bilan aloqa yo'q. Tekshirib, qayta urinib ko'ring.",
    server: "Botda xato chiqdi. Birozdan keyin qayta urinib ko'ring.",
    amal:   "Bot eski versiyada (v14 kerak). Hozircha botning o'ziga nom yozib qidiring.",
    init:   "Telegram ma'lumoti kelmadi. Panelni botdagi <b>🏪 Panelni ochish</b> tugmasidan oching.",
    eski:   "Panel ancha oldin ochilgan. Yopib, botdagi <b>🏪 Panel</b> dan qayta oching.",
    imzo:   "Telegram imzosi to'g'ri kelmadi. Botda <b>🏪 Panel</b> ni bosib, qaytadan oching.",
    ruxsat: "Sizga ruxsat berilmagan. ID'ingizni adminga yuboring.",
    obuna:  "⛔ Obuna muddati tugagan.",
    topilmadi: "Tovar jadvalda topilmadi (balki o'zgargan). Qayta qidiring."
  };

  var root = null, busy = false, seq = 0, items = [];
  var esc = function (s) { return App.esc(s === null || s === undefined ? "" : s); };

  function money(n) {
    var v = Math.round(Number(n) || 0);
    return (v < 0 ? "-" : "") + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function $(sel) { return root.querySelector(sel); }
  function errText(r) { return ERR[r.err] || ("Xato: " + esc(r.err || "noma'lum")); }

  // Bitta tovar kartochkasi
  function card(t, i) {
    var h = '<div class="card qd-item">';
    if (t.k) h += '<div class="qd-kod">KOD: ' + esc(t.k) + "</div>";
    h += '<div class="qd-name">' + esc(t.n) + "</div>";
    h += '<div class="qd-price">' + (t.p === null || t.p === undefined ? '<span class="muted">narxi yozilmagan</span>' :
      "<b>" + money(t.p) + "</b> so'm" + (t.kg ? " / kg" : "")) + "</div>";
    var meta = [];
    if (t.alt) meta.push(esc(t.alt));
    if (t.bc) meta.push("shtrix: " + esc(t.bc));
    if (meta.length) h += '<div class="muted small qd-meta">' + meta.join(" · ") + "</div>";
    if (t.f) h += '<div class="qd-act"><button class="btn secondary small" type="button" data-f="' + i + '">📷 Rasmini botga yuborish</button>' +
      '<span class="small" id="qd-f' + i + '"></span></div>';
    return h + "</div>";
  }

  function showList(r) {
    items = r.list || [];
    var out = $("#qd-out");
    if (r.top) {
      if (!items.length) { out.innerHTML = '<p class="muted qd-note">Mahsulot nomini yozing - xato yozsangiz ham topaman.</p>'; return; }
      out.innerHTML = '<p class="muted small qd-note">⭐ Ko\'p so\'ralganlar:</p>' + items.map(card).join("");
      return;
    }
    if (!items.length) {
      out.innerHTML = '<div class="card"><p>Topilmadi: <b>' + esc(r.q) + '</b></p><p class="muted small">Boshqacha yozib ko\'ring (masalan, qisqaroq).</p></div>';
      App.haptic("error");
      return;
    }
    out.innerHTML = (items.length > 1 ? '<p class="muted small qd-note">Taxminiy natija, to\'g\'risini tanlang:</p>' : "") +
      items.map(card).join("");
    App.haptic("success");
  }

  function run(q) {
    var my = ++seq;
    busy = true;
    $("#qd-go").disabled = true;
    $("#qd-out").innerHTML = '<p class="muted">⏳ Qidirilyapti...</p>';
    App.api("qidiruv", { q: q }).then(function (r) {
      if (!root || my !== seq) return;
      busy = false;
      $("#qd-go").disabled = false;
      if (!r || !r.ok) {
        $("#qd-out").innerHTML = '<div class="card"><p class="err">' + errText(r || {}) + "</p></div>";
        App.haptic("error");
        return;
      }
      showList(r);
    });
  }

  function submit() {
    var inp = $("#qd-q");
    var q = inp.value.replace(/\s+/g, " ").trim();
    if (!q) { run(""); return; }
    try { inp.blur(); } catch (e) {} // telefonda klaviatura yopiladi - natija ko'rinadi
    run(q);
  }

  function render(el) {
    root = el;
    if (!App.inTelegram) {
      el.innerHTML = '<h1>🔍 Qidiruv</h1><div class="card"><p class="err">' + ERR.init + "</p></div>";
      return;
    }
    el.innerHTML = '<h1>🔍 Qidiruv</h1>' +
      '<form class="row qd-form" id="qd-form" autocomplete="off">' +
      '  <input class="field grow" id="qd-q" type="search" enterkeyhint="search" placeholder="Nomi yoki shtrix kod">' +
      '  <button class="btn" id="qd-go" type="submit">🔍</button>' +
      "</form>" +
      '<div id="qd-out"></div>';
    $("#qd-form").addEventListener("submit", function (e) { e.preventDefault(); if (!busy) submit(); });
    $("#qd-out").addEventListener("click", function (e) {
      var b = e.target.closest("[data-f]");
      if (!b) return;
      var i = +b.getAttribute("data-f"), t = items[i], note = $("#qd-f" + i);
      if (!t) return;
      b.disabled = true;
      note.textContent = " ⏳";
      App.api("kartochka", { n: t.n, k: t.k }).then(function (r) {
        if (!root) return;
        if (r && r.ok) { note.textContent = " ✅ Botga yuborildi"; App.haptic("success"); }
        else { b.disabled = false; note.innerHTML = ' <span class="err">' + errText(r || {}) + "</span>"; }
      });
    });
    run(""); // ⭐ ko'p so'ralganlar
    setTimeout(function () { var q = root && $("#qd-q"); if (q) q.focus(); }, 300);
  }

  App.register("qidiruv", {
    render: function (el) { render(el); },
    destroy: function () { root = null; seq++; }
  });
})();
