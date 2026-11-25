// ============================================================
//  📦 QOLDIQ va ✏️ NARX - panel bo'limlari (v13, 3-qadam)
//  Panel -> 📦 Qoldiq yoki ✏️ Narx. Ikkalasi bitta ro'yxatdan foydalanadi (App.api("tovarlar")).
//  Tovar bosiladi -> qoldiq: aniq son / ➕ qo'shish / ➖ ayirish;  narx: yangi narx.
//  Yozish botda (qoldiq_ok / narx_ok) - botdagi /qoldiq va ✏️ Narx o'zgartirish bilan bir xil.
// ============================================================
(function () {
  var SHOW_MAX = 80; // ro'yxatda bir yo'la nechta tovar chiziladi
  var ERR = {
    admin:   "Bu bo'lim faqat admin uchun.",
    son:     "Son noto'g'ri. Qaytadan yozing.",
    band:    "Bot hozir band. Bir soniyadan keyin qayta bosing.",
    topilmadi: "Tovar jadvalda topilmadi (balki nomi o'zgargan). 🔄 Yangilab, qayta urinib ko'ring.",
    tarmoq:  "Internet bilan aloqa yo'q. Tekshirib, qayta urinib ko'ring.",
    server:  "Botda xato chiqdi. Birozdan keyin qayta urinib ko'ring.",
    amal:    "Bot bu amalni bilmaydi — botda v13 kod turganini tekshiring.",
    init:    "Telegram ma'lumoti kelmadi. Panelni botdagi <b>🏪 Panelni ochish</b> tugmasidan oching.",
    eski:    "Panel ancha oldin ochilgan. Yopib, botdagi <b>🏪 Panel</b> dan qayta oching.",
    imzo:    "Telegram imzosi to'g'ri kelmadi. Botda <b>🏪 Panel</b> ni bosib, qaytadan oching."
  };

  var root = null, mode = "qoldiq", busy = false;
  var q = "", flt = null, flash = ""; // flt: null - hali tanlanmagan (o'zi tanlanadi)
  var esc = function (s) { return App.esc(s === null || s === undefined ? "" : s); };

  function money(n) {
    var v = Math.round(Number(n) || 0);
    return (v < 0 ? "-" : "") + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function fmtQty(n) {
    n = Math.round((Number(n) || 0) * 1000) / 1000;
    var neg = n < 0, a = Math.abs(n), i = Math.floor(a), fr = Math.round((a - i) * 1000) / 1000;
    return (neg ? "-" : "") + String(i).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (fr ? String(fr).slice(1) : "");
  }
  function norm(s) { return String(s || "").toLowerCase().replace(/[ʻʼ'’‘`]/g, "").replace(/\s+/g, " ").trim(); }
  function $(sel) { return root.querySelector(sel); }
  function on(sel, fn) { var el = $(sel); if (el) el.addEventListener("click", fn); }
  function title() { return mode === "narx" ? "✏️ Narx" : "📦 Qoldiq"; }
  function unit(t) { return t.kg ? "kg" : "ta"; }

  // Ro'yxat ikkala bo'limga umumiy (qoldiqdan narxga o'tganda qayta yuklanmaydi)
  function data() { return App._tovar || null; }

  function errText(r) {
    if (r.err === "ustun" && r.msg) return esc(r.msg);
    return ERR[r.err] || ("Xato: " + esc(r.err || "noma'lum"));
  }

  function showError(r) {
    App.haptic("error");
    root.innerHTML = "<h1>" + title() + "</h1><div class=\"card\"><p class=\"err\">" + errText(r) + "</p></div>" +
      "<div class=\"im-btns\"><button class=\"btn block\" id=\"tv-retry\">🔄 Qayta urinish</button></div>";
    on("#tv-retry", function () { load(true); });
  }

  function load(force) {
    if (!force && data() && Date.now() - data().at < 60000) { showList(); return; } // 1 daqiqagacha qayta yuklanmaydi
    root.innerHTML = "<h1>" + title() + "</h1><p class=\"muted\">⏳ Tovarlar yuklanyapti...</p>";
    App.api("tovarlar").then(function (r) {
      if (!root) return;
      if (!r || !r.ok) { showError(r || {}); return; }
      App._tovar = {
        at: Date.now(), chegara: Number(r.chegara) || 0, qcol: r.qcol !== false, qerr: r.qerr || "", jami: r.jami || 0,
        list: (r.list || []).map(function (x) {
          return { row: x[0], name: x[1], code: x[2], price: x[3], q: x[4], kg: !!x[5], bc: x[6] || "",
                   key: norm(x[1] + " " + x[2] + " " + (x[6] || "")) };
        })
      };
      showList();
    });
  }

  // ===== Ro'yxat =====
  function counts(d) {
    var c = { his: 0, kam: 0, tug: 0, nonarx: 0 };
    d.list.forEach(function (t) {
      if (t.price === null || t.price === undefined) c.nonarx++;
      if (t.q === null || t.q === undefined) return;
      c.his++;
      if (t.q <= 0) c.tug++;
      if (t.q <= d.chegara) c.kam++;
    });
    return c;
  }

  function filtered(d) {
    var words = norm(q).split(" ").filter(Boolean);
    var res = d.list.filter(function (t) {
      if (mode === "qoldiq") {
        var has = t.q !== null && t.q !== undefined;
        if (flt === "kam" && !(has && t.q <= d.chegara)) return false;
        if (flt === "yoq" && has) return false;
      } else if (flt === "nonarx" && t.price !== null && t.price !== undefined) return false;
      if (!words.length) return true;
      var k = t.key, ks = k.replace(/ /g, "");
      return words.every(function (w) { return k.indexOf(w) !== -1 || ks.indexOf(w) !== -1; });
    });
    if (mode === "qoldiq" && flt === "kam") res.sort(function (a, b) { return a.q - b.q; });
    else if (words.length) {
      var w0 = words[0];
      res.sort(function (a, b) { return (norm(a.name).indexOf(w0) === 0 ? 0 : 1) - (norm(b.name).indexOf(w0) === 0 ? 0 : 1); });
    }
    return res;
  }

  function chip(key, label) {
    return "<button class=\"tv-chip" + (flt === key ? " sel" : "") + "\" data-f=\"" + key + "\">" + label + "</button>";
  }

  function valHtml(t, d) {
    if (mode === "narx") {
      return t.price === null || t.price === undefined ? "<span class=\"muted\">narx yo'q</span>"
        : "<b>" + money(t.price) + "</b>" + (t.kg ? "<span class=\"muted small\"> /kg</span>" : "");
    }
    if (t.q === null || t.q === undefined) return "<span class=\"muted small\">hisobsiz</span>";
    var cls = t.q <= 0 ? "tv-red" : t.q <= d.chegara ? "tv-warn" : "";
    return "<b class=\"" + cls + "\">" + (t.q <= 0 ? "🔴 " : t.q <= d.chegara ? "⚠️ " : "") + fmtQty(t.q) + "</b> <span class=\"muted small\">" + unit(t) + "</span>";
  }

  function showList() {
    var d = data();
    var c = counts(d);
    if (flt === null) flt = mode === "qoldiq" && c.kam ? "kam" : "";
    var h = "<h1>" + title() + "</h1>";
    if (flash) { h += "<div class=\"card tv-flash\">" + flash + "</div>"; flash = ""; }
    if (mode === "qoldiq") {
      if (!d.qcol) h += "<div class=\"card im-gap\"><p class=\"err\">" + esc(d.qerr) + "</p></div>";
      h += "<p class=\"muted small tv-sum\">Tovarlar: " + money(d.jami) + " · hisobda: " + c.his + " · ⚠️ kam: " + c.kam +
        " · 🔴 tugagan: " + c.tug + " · chegara: " + fmtQty(d.chegara) + "</p>";
      h += "<div class=\"tv-chips\">" + chip("kam", "⚠️ Kam qolgan (" + c.kam + ")") + chip("", "Hammasi") + chip("yoq", "Hisobsiz") + "</div>";
    } else {
      h += "<p class=\"muted small tv-sum\">Tovarlar: " + money(d.jami) + (c.nonarx ? " · narxsiz: " + c.nonarx : "") + "</p>";
      h += "<div class=\"tv-chips\">" + chip("", "Hammasi") + (c.nonarx ? chip("nonarx", "Narxsiz (" + c.nonarx + ")") : "") + "</div>";
    }
    h += "<input class=\"field tv-search\" id=\"tv-q\" type=\"search\" placeholder=\"🔍 Nomi, kodi yoki shtrix\" value=\"" + esc(q) + "\">";
    h += "<div id=\"tv-list\"></div>";
    h += "<div class=\"pn-foot\"><button class=\"btn secondary\" id=\"tv-reload\">🔄 Yangilash</button>" +
      (d.list.length < d.jami ? "<p class=\"muted small\">Panelda birinchi " + money(d.list.length) + " ta tovar.</p>" : "") + "</div>";
    root.innerHTML = h;
    drawList();
    root.querySelectorAll("[data-f]").forEach(function (b) {
      b.addEventListener("click", function () { flt = b.getAttribute("data-f"); showList(); });
    });
    $("#tv-q").addEventListener("input", function (e) { q = e.target.value; drawList(); });
    on("#tv-reload", function () { load(true); });
  }

  function drawList() {
    var d = data(), box = $("#tv-list");
    if (!box) return;
    var res = filtered(d);
    if (!res.length) {
      box.innerHTML = "<p class=\"muted tv-empty\">" + (q ? "Topilmadi." : flt === "kam" ? "✅ Kam qolgan tovar yo'q." : "Ro'yxat bo'sh.") + "</p>";
      return;
    }
    var h = "<div class=\"tv-list\">";
    res.slice(0, SHOW_MAX).forEach(function (t, i) {
      var sub = [t.code ? "kod " + t.code : "", t.bc ? "📷 " + t.bc : ""].filter(Boolean).join(" · ");
      h += "<button class=\"tv-item\" data-i=\"" + i + "\"><span class=\"tv-name\">" + esc(t.name) +
        (sub ? "<span class=\"muted small\">" + esc(sub) + "</span>" : "") + "</span><span class=\"tv-val\">" + valHtml(t, d) + "</span></button>";
    });
    h += "</div>";
    if (res.length > SHOW_MAX) h += "<p class=\"muted small tv-empty\">... yana " + (res.length - SHOW_MAX) + " ta. Qidiruvda aniqroq yozing.</p>";
    box.innerHTML = h;
    box.querySelectorAll(".tv-item").forEach(function (b) {
      b.addEventListener("click", function () { showEdit(res[Number(b.getAttribute("data-i"))]); });
    });
  }

  // ===== Tahrirlash =====
  function head(t) {
    var sub = [t.code ? "kod " + t.code : "", t.bc ? "📷 " + t.bc : "", t.kg ? "⚖️ kg" : ""].filter(Boolean).join(" · ");
    return "<div class=\"card\"><div class=\"tv-ename\">" + esc(t.name) + "</div>" + (sub ? "<div class=\"muted small\">" + esc(sub) + "</div>" : "");
  }

  function showEdit(t) {
    var d = data(), h = "<h1>" + title() + "</h1>" + head(t);
    if (mode === "qoldiq") {
      h += "<p>Hozirgi qoldiq: " + valHtml(t, d) + "</p></div>" +
        "<input class=\"field im-gap\" id=\"tv-n\" type=\"text\" inputmode=\"decimal\" autocomplete=\"off\" placeholder=\"Soni" + (t.kg ? " (kg, masalan 2.5)" : "") + "\">" +
        "<div class=\"tv-ops\"><button class=\"btn\" data-op=\"set\">✅ Aniq son</button>" +
        "<button class=\"btn secondary\" data-op=\"add\">➕ Qo'shish</button>" +
        "<button class=\"btn secondary\" data-op=\"sub\">➖ Ayirish</button></div>" +
        "<p class=\"muted small\">✅ Aniq son — sanab chiqqaningizda. ➕ — tovar keldi. ➖ — yaroqsiz, yo'qolgan.</p>";
    } else {
      h += "<p>Hozirgi narx: " + valHtml(t, d) + "</p></div>" +
        "<input class=\"field im-gap\" id=\"tv-n\" type=\"text\" inputmode=\"numeric\" autocomplete=\"off\" placeholder=\"Yangi narx" + (t.kg ? " (1 kg uchun)" : "") + ", masalan 15000\">" +
        "<p class=\"muted small\" id=\"tv-prev\"></p>" +
        "<button class=\"btn block\" data-op=\"narx\">✅ Saqlash</button>";
    }
    h += "<p class=\"err small\" id=\"tv-err\"></p><button class=\"btn secondary block\" id=\"tv-back\">⬅️ Ro'yxatga</button>";
    root.innerHTML = h;
    var inp = $("#tv-n");
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
    if (mode === "narx") inp.addEventListener("input", function () {
      var p = parsePrice(inp.value);
      $("#tv-prev").textContent = p ? money(p) + " so'm" : "";
    });
    on("#tv-back", showList);
    root.querySelectorAll("[data-op]").forEach(function (b) {
      b.addEventListener("click", function () { save(t, b.getAttribute("data-op"), inp.value); });
    });
  }

  function parseQty(s, kg) {
    s = String(s).replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    var n = Number(s);
    if (!kg && Math.floor(n) !== n) return null;
    return n > 1000000 ? null : n;
  }

  // "15000", "15 000", "15.000" -> 15000
  function parsePrice(s) {
    s = String(s).replace(/[\s']/g, "");
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
    if (!/^\d+$/.test(s)) return null;
    var n = Number(s);
    return n >= 1 && n < 1e10 ? n : null;
  }

  function save(t, op, raw) {
    if (busy) return;
    var errEl = $("#tv-err"), extra = { row: t.row, name: t.name, code: t.code }, action;
    if (op === "narx") {
      var p = parsePrice(raw);
      if (p === null) { errEl.textContent = "Narxni raqam bilan yozing, masalan 15000"; App.haptic("error"); return; }
      extra.price = p; action = "narx_ok";
    } else {
      var n = parseQty(raw, t.kg);
      if (n === null) { errEl.textContent = t.kg ? "Sonni yozing, masalan 2.5" : "Butun son yozing, masalan 24"; App.haptic("error"); return; }
      if (op !== "set" && n === 0) { errEl.textContent = "0 dan katta son yozing."; App.haptic("error"); return; }
      extra.op = op; extra.n = n; action = "qoldiq_ok";
    }
    busy = true;
    root.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
    errEl.className = "muted small"; errEl.textContent = "⏳ Saqlanyapti...";
    App.api(action, extra).then(function (r) {
      busy = false;
      if (!root) return;
      if (!r || !r.ok) {
        root.querySelectorAll("button").forEach(function (b) { b.disabled = false; });
        errEl.className = "err small"; errEl.innerHTML = errText(r || {}); App.haptic("error");
        return;
      }
      t.row = r.row;
      if (action === "narx_ok") {
        t.price = r.price;
        flash = "✅ <b>" + esc(r.name) + "</b>: " + (r.old === null ? "narx yo'q" : money(r.old)) + " → <b>" + money(r.price) + "</b> so'm";
      } else {
        t.q = r.after;
        if (r.chegara !== undefined) data().chegara = Number(r.chegara) || 0;
        flash = "✅ <b>" + esc(r.name) + "</b>: " + (r.before === null ? "yo'q" : fmtQty(r.before)) + " → <b>" + fmtQty(r.after) + " " + unit(t) + "</b>" +
          (r.after <= 0 ? " 🔴 tugagan" : r.after <= data().chegara ? " ⚠️ kam" : "");
      }
      App.haptic("success");
      showList();
    });
  }

  function page(m) {
    return {
      render: function (el) { root = el; mode = m; q = ""; flt = null; flash = ""; busy = false; load(false); },
      destroy: function () { root = null; }
    };
  }
  App.register("qoldiq", page("qoldiq"));
  App.register("narx", page("narx"));
})();
