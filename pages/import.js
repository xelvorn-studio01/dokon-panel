// ============================================================
//  📊 EXCEL YUKLASH - panel bo'limi (v12, 2-qadam)
//  Panel -> 📊 Excel yuklash. Fayl turi (📋 ro'yxat / 📦 kirim) -> fayl tanlash -> ko'rib chiqish ->
//  🤔 o'xshash nomlar (bitta ro'yxatda) -> ✅ Tasdiqlash.
//  Hamma hisob botda (botdagi 📊 Excel yuklash bilan bir xil). Bu yerda faqat ekran va tanlovlar.
// ============================================================
(function () {
  var MAX_BYTES = 5 * 1024 * 1024;
  var ERR = {
    fayl:    "Faqat <b>.xlsx</b>, <b>.xls</b> yoki <b>.csv</b> fayl tanlang.",
    katta:   "Fayl juda katta (5 MB dan oshmasin). Kattasini botga yuboring.",
    ustama:  "📈 Avval ustamani belgilang: botga <b>/ustama 20</b> deb yozing, keyin qayta urinib ko'ring.",
    drive:   "⚠️ Excel o'qish uchun Drive xizmati yoqilmagan. Hozircha <b>.csv</b> fayl tanlang.",
    eskirdi: "Fayl ancha oldin yuklangan (30 daqiqa). Qaytadan tanlang.",
    oqilmadi: "Faylni o'qib bo'lmadi.",
    admin:   "Bu bo'lim faqat admin uchun.",
    tarmoq:  "Internet bilan aloqa yo'q. Tekshirib, qayta urinib ko'ring.",
    server:  "Botda xato chiqdi. Birozdan keyin qayta urinib ko'ring.",
    amal:    "Bot bu amalni bilmaydi — botda v12 kod turganini tekshiring.",
    init:    "Telegram ma'lumoti kelmadi. Panelni botdagi <b>🏪 Panelni ochish</b> tugmasidan oching.",
    eski:    "Panel ancha oldin ochilgan. Yopib, botdagi <b>🏪 Panel</b> dan qayta oching.",
    imzo:    "Telegram imzosi to'g'ri kelmadi. Botda <b>🏪 Panel</b> ni bosib, qaytadan oching."
  };
  var LABEL = { name: "Mahsulot NOMI", price: "NARX", qty: "SONI", bc: "SHTRIX KOD", ru: "RUSCHA nomi" };

  var root = null;
  var kind = "l";    // "l" - mahsulotlar ro'yxati, "k" - kirim (nakladnoy)
  var plan = null;   // botdan kelgan oxirgi reja
  var st = null;     // holat: { kind, fn, map, hdr, start, sim }
  var dec = {};      // 🤔 ekranidagi tanlovlar: { kalit: "shu" | "yangi" }
  var busy = false;

  var esc = function (s) { return App.esc(s === null || s === undefined ? "" : s); };
  function money(n) {
    var v = Math.round(Number(n) || 0);
    return (v < 0 ? "-" : "") + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function $(sel) { return root.querySelector(sel); }
  function on(sel, fn) { var el = $(sel); if (el) el.addEventListener("click", fn); }
  function wait(msg) { root.innerHTML = "<h1>📊 Excel yuklash</h1><p class=\"muted\">⏳ " + esc(msg) + "</p>"; }

  function errText(r) {
    var m = ERR[r.err] || ("Xato: " + esc(r.err || "noma'lum"));
    if (r.err === "oqilmadi" && r.msg) m += "<br><span class=\"small\">" + esc(r.msg) + "</span>";
    return m;
  }

  function showError(r, back) {
    App.haptic("error");
    root.innerHTML = "<h1>📊 Excel yuklash</h1><div class=\"card\"><p class=\"err\">" + errText(r) + "</p></div>" +
      "<div class=\"im-btns\">" + (back ? "<button class=\"btn block\" id=\"im-back\">⬅️ Orqaga</button>" : "") +
      "<button class=\"btn secondary block\" id=\"im-new\">📂 Boshqa fayl</button></div>";
    on("#im-back", function () { showPlan(); });
    on("#im-new", showStart);
  }

  // Bot javobi: xato bo'lsa ko'rsatadi, to'g'ri bo'lsa - fn(r)
  function call(action, extra, msg, fn, backOnErr) {
    if (busy) return;
    busy = true;
    wait(msg);
    App.api(action, extra).then(function (r) {
      busy = false;
      if (!root) return;
      if (r && r.ok) fn(r); else showError(r || {}, backOnErr && !!plan);
    });
  }

  // ===== 1. Boshlash: fayl turi + fayl =====
  function showStart() {
    plan = null; st = null; dec = {};
    root.innerHTML = "<h1>📊 Excel yuklash</h1>" +
      "<p class=\"muted small\">Bu qanday fayl?</p>" +
      "<div class=\"im-kind\">" +
      "<button class=\"im-k" + (kind === "l" ? " sel" : "") + "\" data-k=\"l\"><b>📋 Mahsulotlar ro'yxati</b><span>nomi + sotish narxi</span></button>" +
      "<button class=\"im-k" + (kind === "k" ? " sel" : "") + "\" data-k=\"k\"><b>📦 Kirim (nakladnoy)</b><span>kirim narxi + soni → qoldiq</span></button>" +
      "</div>" +
      "<label class=\"btn block im-pick\">📂 Fayl tanlash (.xlsx, .xls, .csv)<input type=\"file\" id=\"im-file\" accept=\".xlsx,.xls,.csv\" hidden></label>" +
      "<p class=\"muted small\">Fayl botga yuboriladi, avval nima o'zgarishini ko'rsatadi — tasdiqlamaguningizcha jadvalga hech narsa yozilmaydi.</p>";
    root.querySelectorAll("[data-k]").forEach(function (b) {
      b.addEventListener("click", function () {
        kind = b.getAttribute("data-k");
        root.querySelectorAll("[data-k]").forEach(function (x) { x.classList.toggle("sel", x === b); });
      });
    });
    $("#im-file").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) upload(f);
    });
  }

  function upload(f) {
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { showError({ err: "fayl" }); return; }
    if (f.size > MAX_BYTES) { showError({ err: "katta" }); return; }
    wait("Fayl o'qilyapti...");
    var rd = new FileReader();
    rd.onload = function () {
      var s = String(rd.result || ""), i = s.indexOf(",");
      call("imp_yukla", { fn: f.name, kind: kind, b64: i >= 0 ? s.slice(i + 1) : "" },
        "Bot faylni o'qiyapti (Excel bo'lsa 10–20 soniya)...", gotPlan);
    };
    rd.onerror = function () { showError({ err: "oqilmadi", msg: "telefon faylni o'qiy olmadi" }); };
    rd.readAsDataURL(f);
  }

  function gotPlan(r) {
    plan = r;
    st = r.st;
    st.sim = st.sim || {};
    showPlan();
  }

  function replan(msg) {
    call("imp_reja", { st: st }, msg || "Qayta hisoblanyapti...", gotPlan, true);
  }

  // ===== 2. Ko'rib chiqish =====
  function colSelect(f) {
    var cur = st.map[f] === undefined ? -1 : st.map[f];
    var h = "<select class=\"field im-sel\" data-f=\"" + f + "\">";
    if (f !== "name" && f !== "price" || cur < 0)
      h += "<option value=\"-1\"" + (cur < 0 ? " selected" : "") + ">" + (f === "name" || f === "price" ? "— tanlang —" : "➖ yo'q") + "</option>";
    plan.cols.forEach(function (c) {
      var t = c.l + ": " + (c.h || "") + (c.s !== "" && c.s !== c.h ? " / " + c.s : "");
      h += "<option value=\"" + c.c + "\"" + (cur === c.c ? " selected" : "") + ">" + esc(t) + "</option>";
    });
    return h + "</select>";
  }

  function line(x) {
    var extra = st.kind === "k" ? " <span class=\"muted\">(kirim " + money(x.inPrice) + (x.qty !== null ? ", " + x.qty + " ta" : "") + ")</span>" : "";
    if (x.t === "sim") return "🤔 " + esc(x.name) + " — " + money(x.price) + extra;
    if (x.t === "new") return "🆕 " + esc(x.name) + " — " + money(x.price) + extra;
    var p = x.t === "same" || (x.t === "via" && x.old === x.price) ? money(x.price) : (x.old === null ? "yo'q" : money(x.old)) + " → " + money(x.price);
    if (x.t === "via") return "🔗 " + esc(x.name) + " → " + esc(x.ex) + ": " + p + extra;
    return (x.t === "chg" ? "✏️ " : "➖ ") + esc(x.ex) + ": " + p + extra;
  }

  function showPlan() {
    var r = plan, c = r.c, nPend = r.nPend;
    var miss = st.map.name === undefined || st.map.name < 0 || st.map.price === undefined || st.map.price < 0;
    var h = "<h1>" + (st.kind === "k" ? "📦 Kirim" : "📋 Mahsulotlar ro'yxati") + "</h1>" +
      "<p class=\"muted small\">📄 " + esc(st.fn) + " · " + r.rows + " qator" +
      (st.kind === "k" ? " · 📈 ustama " + r.ust + "%" : "") + "</p>";

    if (!r.live) {
      h += "<div class=\"card im-gap\"><p class=\"err\">⚠️ " + (miss ? "Ustunlarni aniq topa olmadim — pastda o'zingiz tanlang."
        : "Mos qator topilmadi (nomi va narxi bor qator yo'q). Ustunlarni tekshiring.") + "</p></div>";
    } else {
      h += "<div class=\"pn-stats\">" +
        stat("🆕 Yangi", c.new - nPend) + stat("✏️ Narxi o'zgaradi", c.chg) +
        stat("➖ O'zgarishsiz", c.same) + stat("🤔 O'xshash", nPend, nPend ? "pn-warn" : "") + "</div>";
      var notes = [];
      if (r.via) notes.push("🔗 Nomi farqli, lekin moslandi: " + r.via);
      if (r.bc) notes.push("📷 Shtrix kod yoziladi: " + r.bc);
      if (r.skipped) notes.push("⏭ O'tkazib yuborildi: " + r.skipped + " qator (nomi yoki narxi yo'q)");
      if (r.dup) notes.push("🔁 Takrorlangan: " + r.dup + " (oxirgisi olinadi)");
      if (r.kirim) notes.push("📝 Kirim varag'iga yoziladi: " + r.kirim + " qator");
      if (notes.length) h += "<p class=\"small im-notes\">" + notes.join("<br>") + "</p>";
      if (nPend) h += "<button class=\"btn block im-gap\" id=\"im-sim\">🤔 O'xshash nomlarni ko'rib chiqish (" + nPend + ")</button>";
    }

    h += "<details class=\"card im-gap\"" + (miss || !r.live ? " open" : "") + "><summary><b>Ustunlar</b> <span class=\"muted small\">(o'zgartirish mumkin)</span></summary>";
    r.need.forEach(function (f) {
      h += "<div class=\"im-col\"><span>" + LABEL[f] + "</span>" + colSelect(f) + "</div>";
    });
    h += "</details>";

    if (r.first && r.first.length) {
      h += "<div class=\"card im-gap\"><b>Birinchi " + r.first.length + " tasi:</b><div class=\"im-list small\">" +
        r.first.map(function (x) { return "<div>" + line(x) + "</div>"; }).join("") + "</div></div>";
    }

    h += "<div class=\"im-btns\">";
    if (r.live) h += "<button class=\"btn block\" id=\"im-ok\">" + (nPend ? "✅ Tasdiqlash (🤔 lar yangi bo'ladi)" : "✅ Tasdiqlash") + "</button>";
    h += "<button class=\"btn secondary block\" id=\"im-new\">❌ Bekor qilish</button></div>";
    root.innerHTML = h;

    root.querySelectorAll(".im-sel").forEach(function (s) {
      s.addEventListener("change", function () {
        var v = Number(s.value);
        st.map[s.getAttribute("data-f")] = v;
        // sarlavha qatori o'zi tashlab yuboriladi (unda narx raqam emas), shuning uchun boshlanish o'zgarmaydi
        replan("Ustunlar bo'yicha qayta hisoblanyapti...");
      });
    });
    on("#im-sim", function () { dec = {}; showSim(); });
    on("#im-ok", confirmApply);
    on("#im-new", showStart);
  }

  function stat(lbl, val, cls) {
    return "<div class=\"card pn-stat " + (cls || "") + "\"><div class=\"lbl\">" + lbl + "</div><div class=\"val\">" + money(val) + "</div></div>";
  }

  // ===== 3. 🤔 O'xshash nomlar - hammasi bitta ro'yxatda =====
  function showSim() {
    var list = plan.pending;
    var h = "<h1>🤔 O'xshash nomlar</h1><p class=\"muted small\">Fayldagi nom jadvaldagi tovarga o'xshaydi. Bitta tovarmi?<br>" +
      "✅ Shu tovar — narxi shu tovarga yoziladi va eslab qolinadi. 🆕 Yangi — alohida tovar bo'lib qo'shiladi.</p>";
    if (plan.nPend > list.length) h += "<p class=\"small\">Ro'yxatda birinchi " + list.length + " tasi (jami " + plan.nPend + "). Qolganini keyingi oynada ko'rasiz.</p>";
    list.forEach(function (x, i) {
      var d = dec[x.k];
      h += "<div class=\"card im-sim\" data-i=\"" + i + "\">" +
        "<div>📄 Faylda: <b>" + esc(x.name) + "</b> — " + (st.kind === "k" ? "kirim " + money(x.inPrice) + " → " + money(x.price) : money(x.price)) + "</div>" +
        "<div>📋 Jadvalda: <b>" + esc(x.sname) + "</b> — " + (x.sprice === null ? "narx yo'q" : money(x.sprice)) + "</div>" +
        (x.sbc ? "<div class=\"muted small\">📷 " + esc(x.sbc) + "</div>" : "") +
        "<div class=\"row im-yn\"><button class=\"btn secondary grow" + (d === "shu" ? " sel" : "") + "\" data-d=\"shu\">✅ Shu tovar</button>" +
        "<button class=\"btn secondary grow" + (d === "yangi" ? " sel" : "") + "\" data-d=\"yangi\">🆕 Yangi</button></div></div>";
    });
    h += "<div class=\"im-bar card\"><div class=\"small\" id=\"im-cnt\"></div><div class=\"row\">" +
      "<button class=\"btn secondary grow\" id=\"im-allnew\">🆕 Qolganlari yangi</button>" +
      "<button class=\"btn grow\" id=\"im-save\">💾 Saqlash</button></div>" +
      "<button class=\"btn secondary block im-gap\" id=\"im-back\">⬅️ Orqaga (saqlamasdan)</button></div>";
    root.innerHTML = h;
    count();

    root.querySelectorAll(".im-sim").forEach(function (card) {
      var x = list[Number(card.getAttribute("data-i"))];
      card.querySelectorAll("[data-d]").forEach(function (b) {
        b.addEventListener("click", function () {
          var v = b.getAttribute("data-d");
          dec[x.k] = dec[x.k] === v ? undefined : v;
          if (dec[x.k] === undefined) delete dec[x.k];
          card.querySelectorAll("[data-d]").forEach(function (y) { y.classList.toggle("sel", dec[x.k] === y.getAttribute("data-d")); });
          count();
          try { App.tg.HapticFeedback.selectionChanged(); } catch (e) {}
        });
      });
    });
    on("#im-allnew", function () {
      list.forEach(function (x) { if (!dec[x.k]) dec[x.k] = "yangi"; });
      save();
    });
    on("#im-save", save);
    on("#im-back", function () { dec = {}; showPlan(); });
  }

  function count() {
    var n = Object.keys(dec).length, el = $("#im-cnt");
    if (el) el.textContent = "Tanlangan: " + n + " / " + plan.pending.length +
      (n < plan.pending.length ? " — tanlanmaganlari keyin yana so'raladi" : "");
  }

  function save() {
    var any = false;
    plan.pending.forEach(function (x) {
      if (dec[x.k] === "shu") { st.sim[x.k] = x.sk; any = true; }
      else if (dec[x.k] === "yangi") { st.sim[x.k] = "-"; any = true; }
    });
    dec = {};
    if (!any) { showPlan(); return; }
    replan("Saqlanyapti...");
  }

  // ===== 4. Tasdiqlash =====
  function confirmApply() {
    var c = plan.c, msg = "Jadvalga yozilsinmi?\n🆕 " + (c.new) + " · ✏️ " + c.chg + (plan.nPend ? "\n(🤔 " + plan.nPend + " tasi yangi bo'ladi)" : "");
    var go = function (yes) { if (yes) apply(); };
    if (App.tg && App.tg.showConfirm && App.inTelegram) App.tg.showConfirm(msg, go); else go(window.confirm(msg));
  }

  function apply() {
    call("imp_ok", { st: st }, "Jadvalga yozilyapti...", function (r) {
      App.haptic(r.done ? "success" : "warning");
      var html = String(r.text || "").replace(/\n/g, "<br>");
      root.innerHTML = "<h1>📊 Excel yuklash</h1><div class=\"card im-res\">" + html + "</div>" +
        "<div class=\"im-btns\">" + (r.done ? "" : "<button class=\"btn block\" id=\"im-back\">⬅️ Orqaga</button>") +
        "<button class=\"btn" + (r.done ? "" : " secondary") + " block\" id=\"im-new\">📂 Yana fayl yuklash</button>" +
        "<button class=\"btn secondary block\" id=\"im-home\">🏪 Panelga qaytish</button></div>";
      if (r.done) plan = null;
      on("#im-back", showPlan);
      on("#im-new", showStart);
      on("#im-home", function () { App.open("panel"); });
    }, true);
  }

  App.register("import", {
    render: function (el) { root = el; busy = false; showStart(); },
    destroy: function () { root = null; }
  });
})();
