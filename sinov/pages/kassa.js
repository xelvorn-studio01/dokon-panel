// ============================================================
//  💰 KASSA - panel bo'limi (v15). Xodim ham, admin ham.
//  Botdagi 💰 Kassa bilan BIR XIL (App.api("kassa_ok") -> botdagi kassaCore): "Kassa" varag'iga yoziladi,
//  hisobot botga ham keladi (❌ tugmasi bilan), xodim yozsa - adminga ham.
//  "🛒 Bugungi sotuvni qo'yish" - bugungi 🛒 sotuvdagi naqd va kartani maydonlarga yozadi
//  (xodimga - o'zi sotgani, adminga - hammasi).
//  Pastda bugungi yozuvlar: xodim o'zinikini, admin hammasini; ❌ bekor qilish.
//  Admin uchun: bu hafta (kunlar bo'yicha) va bu oy jami.
// ============================================================
(function () {
  var ERR = {
    son:    "Summalarni faqat raqam bilan yozing (masalan 1200000).",
    nol:    "Kamida bitta summa yozing.",
    yoq:    "Bu yozuv allaqachon o'chirilgan.",
    begona: "Faqat o'zingiz yozgan hisobotni bekor qila olasiz.",
    band:   "Hozir band. Bir oz kutib qayta bosing.",
    tarmoq: "Internet bilan aloqa yo'q. Tekshirib, qayta urinib ko'ring.",
    server: "Botda xato chiqdi. Birozdan keyin qayta urinib ko'ring.",
    amal:   "Bot eski versiyada (v15 kerak). Hozircha botdagi 💰 Kassa tugmasidan foydalaning.",
    init:   "Telegram ma'lumoti kelmadi. Panelni botdagi <b>🏪 Panelni ochish</b> tugmasidan oching.",
    eski:   "Panel ancha oldin ochilgan. Yopib, botdagi <b>🏪 Panel</b> dan qayta oching.",
    imzo:   "Telegram imzosi to'g'ri kelmadi. Botda <b>🏪 Panel</b> ni bosib, qaytadan oching.",
    ruxsat: "Sizga ruxsat berilmagan. ID'ingizni adminga yuboring.",
    obuna:  "⛔ Obuna muddati tugagan."
  };

  var root = null, data = null, busy = false, seq = 0, pendingN = "", flash = "";
  var esc = function (s) { return App.esc(s === null || s === undefined ? "" : s); };

  function money(n) {
    var v = Math.round(Number(n) || 0);
    return (v < 0 ? "-" : "") + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function $(sel) { return root.querySelector(sel); }
  function errText(r) { return ERR[r && r.err] || ("Xato: " + esc(r && r.err || "noma'lum")); }
  function nonce() {
    var s = "";
    for (var i = 0; i < 12; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 36));
    return Date.now().toString(36) + s;
  }
  function stat(lbl, val, sub, cls) {
    return '<div class="card pn-stat ' + (cls || "") + '"><div class="lbl">' + lbl + '</div><div class="val">' + val + "</div>" +
      (sub ? '<div class="sub">' + sub + "</div>" : "") + "</div>";
  }

  // "1 200 000", "1.200.000", "1200k", "1,2mln" -> son. Bo'sh -> 0. Xato -> null (botdagi parseMoney kabi)
  function parseMoney(s) {
    s = String(s || "").trim().toLowerCase().replace(/\s+/g, "");
    if (!s) return 0;
    var m = s.match(/^(\d+(?:[.,]\d+)*)(k|ming|m|mln)?$/);
    if (!m) return null;
    var n;
    if (m[2]) {
      var parts = m[1].split(/[.,]/);
      n = parts.length === 2 ? parseFloat(parts[0] + "." + parts[1]) : Number(m[1].replace(/[.,]/g, ""));
      n *= (m[2] === "k" || m[2] === "ming") ? 1000 : 1000000;
    } else {
      n = Number(m[1].replace(/[.,]/g, ""));
    }
    n = Math.round(n);
    return isFinite(n) && n >= 0 && n < 1e12 ? n : null;
  }

  // Maydon ostida "= 1 200 000" - nima yozilayotgani ko'rinib tursin
  function hint(id) {
    var v = parseMoney($("#ks-" + id).value), h = $("#ks-h-" + id);
    h.textContent = v === null ? "⚠️ raqam emas" : v ? "= " + money(v) + " so'm" : "";
    h.className = "small ks-h " + (v === null ? "err" : "muted");
  }
  function totals() {
    var n = parseMoney($("#ks-naqd").value), k = parseMoney($("#ks-karta").value), x = parseMoney($("#ks-xarajat").value);
    var t = $("#ks-total");
    if (n === null || k === null || x === null) { t.innerHTML = '<span class="err">Summani tekshiring</span>'; return null; }
    t.innerHTML = "💰 Jami savdo: <b>" + money(n + k) + "</b> so'm" + (x ? '<br><span class="muted small">✅ Xarajatdan keyin: ' + money(n + k - x) + "</span>" : "");
    return { naqd: n, karta: k, xarajat: x };
  }

  function entry(e) {
    var can = data.admin || e.men;
    return '<div class="card ks-item"><div class="ks-row"><b>' + esc(e.vaqt) + "</b>" +
      (data.admin ? ' <span class="muted small">' + esc(e.name) + "</span>" : "") +
      '<b class="ks-sum">' + money(e.jami) + "</b></div>" +
      '<div class="muted small">💵 ' + money(e.naqd) + " · 💳 " + money(e.karta) + " · 🧾 " + money(e.xarajat) +
      (e.izoh ? " · 📝 " + esc(e.izoh) : "") + "</div>" +
      (can ? '<div class="ks-x"><button class="btn secondary small" type="button" data-x="' + esc(e.id) + '">❌ Bekor qilish</button>' +
        '<span class="small" id="ks-x-' + esc(e.id) + '"></span></div>' : "") + "</div>";
  }

  function adminBlock() {
    if (!data.admin || !data.hafta) return "";
    var w = data.hafta, m = data.oy;
    var h = '<div class="card im-gap"><b>🗓 Bu hafta</b> <span class="muted small">(' + esc(w.title) + ")</span>" +
      '<div class="hs-top">';
    (w.kunlar || []).forEach(function (d) {
      h += '<div class="hs-row"><span class="hs-n">' + esc(d.d) + "</span>" +
        (d.bor ? "<b class=\"hs-s\">" + money(d.jami) + "</b>" : '<span class="muted small hs-s">— topshirilmagan</span>') + "</div>";
    });
    h += "</div>" +
      '<div class="ks-tot small">💵 ' + money(w.naqd) + " · 💳 " + money(w.karta) + " · 🧾 " + money(w.xarajat) +
      "<br>💰 Jami savdo: <b>" + money(w.jami) + "</b> · ✅ " + money(w.jami - w.xarajat) + "</div></div>";
    h += '<div class="card im-gap"><b>🗓 Bu oy</b> <span class="muted small">(' + esc(m.title) + ")</span>" +
      '<div class="ks-tot small">💵 ' + money(m.naqd) + " · 💳 " + money(m.karta) + " · 🧾 " + money(m.xarajat) +
      "<br>💰 Jami savdo: <b>" + money(m.jami) + "</b> · ✅ " + money(m.jami - m.xarajat) +
      '<br><span class="muted">📋 ' + m.soni + " ta hisobot, " + m.kun + " kun</span></div></div>";
    return h;
  }

  function draw(keep) {
    var old = keep ? { n: $("#ks-naqd").value, k: $("#ks-karta").value, x: $("#ks-xarajat").value, i: $("#ks-izoh").value } : null;
    var sv = data.sotuv || { naqd: 0, karta: 0, chek: 0 };
    var h = "<h1>💰 Kassa hisoboti</h1>";
    if (flash) h += '<div class="card sv-done">' + flash + "</div>";
    h += '<div class="card ks-form">' +
      '<label class="ks-l">💵 Naqd<input class="field" id="ks-naqd" inputmode="numeric" autocomplete="off" placeholder="0"></label>' +
      '<div class="small ks-h" id="ks-h-naqd"></div>' +
      '<label class="ks-l">💳 Karta<input class="field" id="ks-karta" inputmode="numeric" autocomplete="off" placeholder="0"></label>' +
      '<div class="small ks-h" id="ks-h-karta"></div>' +
      '<label class="ks-l">🧾 Xarajat<input class="field" id="ks-xarajat" inputmode="numeric" autocomplete="off" placeholder="0"></label>' +
      '<div class="small ks-h" id="ks-h-xarajat"></div>' +
      '<label class="ks-l">📝 Izoh <span class="muted small">(ixtiyoriy)</span><input class="field" id="ks-izoh" maxlength="200" autocomplete="off" placeholder="masalan: svet uchun"></label>' +
      (sv.chek ? '<button class="btn secondary block im-gap" type="button" id="ks-fill">🛒 Bugungi sotuvni qo\'yish' +
        '<span class="muted small ks-fill-s">' + (data.admin ? "hammasi" : "siz") + ": " + sv.chek + " ta chek · 💵 " + money(sv.naqd) + " · 💳 " + money(sv.karta) + "</span></button>" : "") +
      '<div class="ks-total im-gap" id="ks-total"></div>' +
      '<button class="btn block sv-sell im-gap" type="button" id="ks-go">✅ Topshirish</button>' +
      '<div class="small" id="ks-msg"></div>' +
      "</div>";

    var list = data.bugun || [];
    h += '<h1 class="ks-sub">📋 Bugun ' + (data.admin ? "topshirilgan" : "siz topshirgan") + "</h1>";
    if (!list.length) h += '<p class="muted small">Hali hisobot yo\'q.</p>';
    else {
      if (list.length > 1) h += '<p class="muted small">Jami ' + list.length + " ta: <b>" + money(data.bsum.jami) + "</b>, xarajat " + money(data.bsum.xarajat) + "</p>";
      h += list.map(entry).join("");
    }
    h += adminBlock();
    h += '<div class="pn-foot"><button class="btn secondary" id="ks-reload">🔄 Yangilash</button></div>';
    root.innerHTML = h;

    if (old) { $("#ks-naqd").value = old.n; $("#ks-karta").value = old.k; $("#ks-xarajat").value = old.x; $("#ks-izoh").value = old.i; }
    ["naqd", "karta", "xarajat"].forEach(function (id) {
      $("#ks-" + id).addEventListener("input", function () { pendingN = ""; hint(id); totals(); });
      hint(id);
    });
    $("#ks-izoh").addEventListener("input", function () { pendingN = ""; });
    totals();
    var fill = $("#ks-fill");
    if (fill) fill.addEventListener("click", function () {
      $("#ks-naqd").value = sv.naqd ? String(sv.naqd) : "";
      $("#ks-karta").value = sv.karta ? String(sv.karta) : "";
      pendingN = "";
      hint("naqd"); hint("karta"); totals();
      App.haptic("success");
    });
    $("#ks-go").addEventListener("click", submit);
    $("#ks-reload").addEventListener("click", function () { flash = ""; load(); });
    root.querySelectorAll("[data-x]").forEach(function (b) {
      b.addEventListener("click", function () { cancel(b); });
    });
  }

  function submit() {
    if (busy) return;
    var msg = $("#ks-msg");
    var k = totals();
    if (!k) { msg.innerHTML = '<span class="err">Summalarni tekshiring.</span>'; App.haptic("error"); return; }
    if (k.naqd + k.karta + k.xarajat === 0) { msg.innerHTML = '<span class="err">' + ERR.nol + "</span>"; App.haptic("error"); return; }
    busy = true;
    if (!pendingN) pendingN = nonce(); // tarmoq uzilib, qayta bosilsa - ikki marta yozilmaydi
    var btn = $("#ks-go");
    btn.disabled = true;
    msg.innerHTML = '<span class="muted">⏳ Yuborilyapti...</span>';
    App.api("kassa_ok", { naqd: k.naqd, karta: k.karta, xarajat: k.xarajat, izoh: $("#ks-izoh").value.trim(), n: pendingN }).then(function (r) {
      if (!root) return;
      busy = false;
      if (!r || !r.ok) {
        btn.disabled = false;
        msg.innerHTML = '<span class="err">' + errText(r) + "</span>";
        App.haptic("error");
        return;
      }
      pendingN = "";
      flash = r.dup ? "✅ Bu hisobot allaqachon yozilgan." :
        '<div class="sv-done-h">✅ Qabul qilindi</div><div class="muted small">' + esc(r.sana) + " " + esc(r.vaqt) +
        " · 💰 Jami savdo: <b>" + money(r.jami) + "</b> so'm</div><p class=\"small muted\">Hisobot botga ham yuborildi (❌ tugmasi bilan).</p>";
      if (r.k && r.k.ok) data = r.k;
      draw(false);
      App.haptic("success");
      try { window.scrollTo(0, 0); } catch (e) {}
    });
  }

  function cancel(b) {
    var id = b.getAttribute("data-x"), note = $("#ks-x-" + id);
    if (b.getAttribute("data-ok") !== "1") {
      // birinchi bosish - tasdiq so'raladi
      b.setAttribute("data-ok", "1");
      b.textContent = "❌ Ha, bekor qilinsin";
      note.innerHTML = ' <span class="muted">yana bir marta bosing</span>';
      return;
    }
    b.disabled = true;
    note.textContent = " ⏳";
    App.api("kassa_x", { id: id }).then(function (r) {
      if (!root) return;
      if (!r || !r.ok) { b.disabled = false; note.innerHTML = ' <span class="err">' + errText(r) + "</span>"; App.haptic("error"); return; }
      flash = "❌ Bekor qilindi: " + esc(r.what) + '<p class="small muted">To\'g\'risini qayta yozing.</p>';
      if (r.k && r.k.ok) data = r.k;
      draw(true);
      App.haptic("success");
      try { window.scrollTo(0, 0); } catch (e) {}
    });
  }

  function load() {
    var my = ++seq;
    root.innerHTML = '<h1>💰 Kassa hisoboti</h1><p class="muted">Yuklanyapti...</p>';
    App.api("kassa").then(function (r) {
      if (!root || my !== seq) return;
      if (!r || !r.ok) {
        root.innerHTML = '<h1>💰 Kassa hisoboti</h1><div class="card"><p class="err">' + errText(r) + "</p></div>" +
          '<div class="im-btns"><button class="btn block" id="ks-retry">🔄 Qayta urinish</button></div>';
        root.querySelector("#ks-retry").addEventListener("click", load);
        App.haptic("error");
        return;
      }
      data = r;
      draw(false);
    });
  }

  App.register("kassa", {
    render: function (el) {
      root = el; flash = ""; pendingN = ""; busy = false;
      if (!App.inTelegram) { el.innerHTML = '<h1>💰 Kassa hisoboti</h1><div class="card"><p class="err">' + ERR.init + "</p></div>"; return; }
      load();
    },
    destroy: function () { root = null; seq++; }
  });
})();
