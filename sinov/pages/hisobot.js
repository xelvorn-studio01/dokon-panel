// ============================================================
//  🧾 HISOBOT - panel bo'limi (v13, 4-qadam)
//  Panel -> 🧾 Hisobot. Bugun / Kecha / Bu hafta / Bu oy.
//  Hisob botda (App.api("hisobot")) - botdagi 🧾 Sotuv hisoboti bilan bir xil raqamlar.
// ============================================================
(function () {
  var TOP_FIRST = 20; // avval nechta tovar ko'rsatiladi
  var PERIODS = [["t", "Bugun"], ["y", "Kecha"], ["w", "Bu hafta"], ["m", "Bu oy"]];
  var ERR = {
    admin:  "Bu bo'lim faqat admin uchun.",
    tarmoq: "Internet bilan aloqa yo'q. Tekshirib, qayta urinib ko'ring.",
    server: "Botda xato chiqdi. Birozdan keyin qayta urinib ko'ring.",
    amal:   "Bot bu amalni bilmaydi — botda v13 kod turganini tekshiring.",
    init:   "Telegram ma'lumoti kelmadi. Panelni botdagi <b>🏪 Panelni ochish</b> tugmasidan oching.",
    eski:   "Panel ancha oldin ochilgan. Yopib, botdagi <b>🏪 Panel</b> dan qayta oching.",
    imzo:   "Telegram imzosi to'g'ri kelmadi. Botda <b>🏪 Panel</b> ni bosib, qaytadan oching."
  };

  var root = null, per = "t", seq = 0, all = false;
  var esc = function (s) { return App.esc(s === null || s === undefined ? "" : s); };
  function money(n) {
    var v = Math.round(Number(n) || 0);
    return (v < 0 ? "-" : "") + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function fmtQty(n) {
    n = Math.round((Number(n) || 0) * 1000) / 1000;
    var a = Math.abs(n), i = Math.floor(a), fr = Math.round((a - i) * 1000) / 1000;
    return (n < 0 ? "-" : "") + String(i).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (fr ? String(fr).slice(1) : "");
  }
  function stat(lbl, val, sub, cls) {
    return "<div class=\"card pn-stat " + (cls || "") + "\"><div class=\"lbl\">" + lbl + "</div><div class=\"val\">" + val + "</div>" +
      (sub ? "<div class=\"sub\">" + sub + "</div>" : "") + "</div>";
  }

  function frame(body) {
    var h = "<h1>🧾 Hisobot</h1><div class=\"hs-tabs\">";
    PERIODS.forEach(function (p) {
      h += "<button class=\"tv-chip" + (per === p[0] ? " sel" : "") + "\" data-p=\"" + p[0] + "\">" + p[1] + "</button>";
    });
    root.innerHTML = h + "</div><div id=\"hs-body\">" + body + "</div>";
    root.querySelectorAll("[data-p]").forEach(function (b) {
      b.addEventListener("click", function () { per = b.getAttribute("data-p"); all = false; load(); });
    });
  }

  function load() {
    frame("<p class=\"muted\">⏳ Hisoblanyapti...</p>");
    var my = ++seq;
    App.api("hisobot", { p: per }).then(function (r) {
      if (!root || my !== seq) return; // boshqa davr tanlangan bo'lsa - eski javob tashlanadi
      if (!r || !r.ok) {
        App.haptic("error");
        frame("<div class=\"card\"><p class=\"err\">" + (ERR[r && r.err] || "Xato: " + esc(r && r.err || "noma'lum")) + "</p></div>" +
          "<div class=\"im-btns\"><button class=\"btn block\" id=\"hs-retry\">🔄 Qayta urinish</button></div>");
        root.querySelector("#hs-retry").addEventListener("click", load);
        return;
      }
      show(r);
    });
  }

  function show(r) {
    var h = "<p class=\"muted small\">🗓 " + esc(r.title) + "</p>";
    if (!r.bor) {
      frame(h + "<div class=\"card\"><p>Bu davrda 🛒 sotuv yo'q.</p></div>" + foot());
      bindFoot();
      return;
    }
    h += "<div class=\"pn-stats\">" +
      stat("🟰 Jami savdo", money(r.total) + " so'm", r.cheks + " ta chek", "wide") +
      stat("💵 Naqd", money(r.naqd)) +
      stat("💳 Karta", money(r.karta)) +
      (r.profit !== null && r.profit !== undefined
        ? stat("💹 Taxminiy foyda", money(r.profit) + " so'm", "ustama " + r.ustama + "%", "wide" + (r.profit < 0 ? " pn-warn" : ""))
        : stat("💹 Foyda", "—", "sotilgan tovarlarning kirim narxi yo'q", "wide")) +
      "</div>";

    var notes = [];
    if (r.unk && r.profit !== null) notes.push("ℹ️ " + r.unk + " xil tovarning kirim narxi noma'lum (savdoning " + r.unkPct + "%) — foydaga qo'shilmadi.");
    if (r.profit === null || r.unk) notes.push("💡 Kirim narxi 📊 Excel yuklash → 📦 Kirim orqali yoziladi.");
    if (r.loss && r.loss.length) notes.push("⚠️ Kirim narxidan arzon sotilgan: " + r.loss.map(esc).join(", "));
    if (notes.length) h += "<div class=\"card small hs-notes\">" + notes.join("<br>") + "</div>";

    var top = r.top || [], n = all ? top.length : Math.min(TOP_FIRST, top.length);
    h += "<div class=\"card im-gap\"><b>🏆 Eng ko'p sotilgan</b> <span class=\"muted small\">(" + r.xil + " xil tovar)</span><div class=\"hs-top\">";
    top.slice(0, n).forEach(function (g, i) {
      h += "<div class=\"hs-row\"><span class=\"hs-n\">" + (i + 1) + ". " + esc(g.n) +
        "<span class=\"muted small\">" + fmtQty(g.q) + " " + esc(g.u) + (g.f === null ? " · kirim narxi ?" : " · foyda " + money(g.f)) + "</span></span>" +
        "<b class=\"hs-s\">" + money(g.s) + "</b></div>";
    });
    h += "</div>";
    if (n < top.length) h += "<button class=\"btn secondary block im-gap\" id=\"hs-all\">Hammasini ko'rsatish (" + top.length + ")</button>";
    if (r.xil > top.length) h += "<p class=\"muted small\">To'liq ro'yxat: botdagi 📥 Excel hisobot.</p>";
    h += "</div>";
    frame(h + foot());
    var b = root.querySelector("#hs-all");
    if (b) b.addEventListener("click", function () { all = true; show(r); });
    bindFoot();
  }

  function foot() { return "<div class=\"pn-foot\"><button class=\"btn secondary\" id=\"hs-reload\">🔄 Yangilash</button></div>"; }
  function bindFoot() { var b = root.querySelector("#hs-reload"); if (b) b.addEventListener("click", load); }

  App.register("hisobot", {
    render: function (el) { root = el; per = "t"; all = false; load(); },
    destroy: function () { root = null; seq++; }
  });
})();
