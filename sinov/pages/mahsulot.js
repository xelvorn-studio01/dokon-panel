// ============================================================
//  ➕ MAHSULOT QO'SHISH - panel bo'limi (v15). Faqat admin.
//  Maydonlar: nomi, narx, shtrix kod (📷 skaner yoki qo'lda), tarozi kodi (D), dona / kg (I), boshlang'ich qoldiq (H).
//  Avval 🔎 Tekshirish (App.api("mahsulot_tekshir")): bunday nom bormi, o'xshashlari, shtrix kimda, kod bandmi.
//  Keyin ✅ Qo'shish (App.api("mahsulot_ok")) - botdagi ➕ Mahsulot qo'shish bilan bir xil yadro (productAddCore).
// ============================================================
(function () {
  var LIB = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
  var ERR = {
    admin:  "Bu bo'lim faqat admin uchun.",
    nom:    "Mahsulot nomini yozing.",
    narx:   "Narxni raqam bilan yozing (masalan 12000).",
    shtrix: "Shtrix kod noto'g'ri (faqat raqam va lotin harflari, 48 belgigacha).",
    kod:    "Tarozi kodi: faqat raqam/harf, 20 belgigacha (masalan 012).",
    qoldiq: "Qoldiq noto'g'ri. Dona tovarda butun son, kg tovarda 2.5 kabi.",
    bor:    "Bunday nomli mahsulot jadvalda bor.",
    kod_band: "Bu tarozi kodi boshqa mahsulotda band.",
    ustun:  "Jadval ustuni band.",
    band:   "Hozir band. Bir oz kutib qayta bosing.",
    tarmoq: "Internet bilan aloqa yo'q. Tekshirib, qayta urinib ko'ring.",
    server: "Botda xato chiqdi. Birozdan keyin qayta urinib ko'ring.",
    amal:   "Bot eski versiyada (v15 kerak). Hozircha botdagi ➕ Mahsulot qo'shish tugmasidan foydalaning.",
    init:   "Telegram ma'lumoti kelmadi. Panelni botdagi <b>🏪 Panelni ochish</b> tugmasidan oching.",
    eski:   "Panel ancha oldin ochilgan. Yopib, botdagi <b>🏪 Panel</b> dan qayta oching.",
    imzo:   "Telegram imzosi to'g'ri kelmadi. Botda <b>🏪 Panel</b> ni bosib, qaytadan oching."
  };

  var root = null, scanner = null, busy = false, checked = null, pendingN = "", kg = false, flash = "";
  var esc = function (s) { return App.esc(s === null || s === undefined ? "" : s); };
  function money(n) {
    var v = Math.round(Number(n) || 0);
    return (v < 0 ? "-" : "") + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function $(sel) { return root.querySelector(sel); }
  function errText(r) {
    var t = ERR[r && r.err] || ("Xato: " + esc(r && r.err || "noma'lum"));
    if (r && r.bor) t += " (" + esc(r.bor) + ")";
    if (r && r.msg) t += "<br>" + esc(r.msg);
    return t;
  }
  function nonce() {
    var s = "";
    for (var i = 0; i < 12; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 36));
    return Date.now().toString(36) + s;
  }
  // EAN-13 / EAN-8 / UPC-A nazorat raqami - noto'g'ri o'qilgan kodlarni tashlab yuboradi
  function checksumOk(s) {
    if (!/^\d+$/.test(s) || [8, 12, 13].indexOf(s.length) === -1) return true;
    var d = s.split("").map(Number), check = d.pop(), sum = 0;
    d.reverse().forEach(function (x, i) { sum += x * (i % 2 === 0 ? 3 : 1); });
    return (10 - sum % 10) % 10 === check;
  }
  // "12 000", "12.000", "12k" -> son; bo'sh yoki xato -> null
  function parsePrice(s) {
    s = String(s || "").trim().toLowerCase().replace(/\s+/g, "");
    var m = s.match(/^(\d+(?:[.,]\d+)*)(k|ming)?$/);
    if (!m) return null;
    var n = m[2] ? parseFloat(m[1].replace(",", ".")) * 1000 : Number(m[1].replace(/[.,]/g, ""));
    n = Math.round(n);
    return isFinite(n) && n >= 1 && n < 1e10 ? n : null;
  }

  function stopCam() {
    if (!scanner) return;
    var s = scanner;
    scanner = null;
    try { s.stop().then(function () { s.clear(); }).catch(function () {}); } catch (e) {}
    var v = root && $("#mh-cam");
    if (v) v.style.display = "none";
    var b = root && $("#mh-scan");
    if (b) b.textContent = "📷";
  }

  function startCam() {
    if (scanner) { stopCam(); return; }
    var box = $("#mh-cam"), st = $("#mh-cam-st");
    box.style.display = "block";
    $("#mh-scan").textContent = "✖️";
    st.textContent = "Kamera ishga tushyapti...";
    var last = "", same = 0;
    App.loadScript(LIB).then(function () {
      if (!root || box.style.display === "none") return;
      var F = Html5QrcodeSupportedFormats;
      scanner = new Html5Qrcode("mh-view", {
        formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false
      });
      return scanner.start({ facingMode: "environment" }, {
        fps: 12,
        qrbox: function (w, h) {
          var bw = Math.max(150, Math.floor(w * 0.9));
          return { width: bw, height: Math.max(80, Math.floor(Math.min(h, bw) * 0.45)) };
        }
      }, function (text) {
        text = String(text).trim().replace(/\s+/g, "");
        if (!text || !checksumOk(text)) return;
        // Raqamli kod ketma-ket 2 marta bir xil o'qilsa qabul qilinadi (xato o'qishdan himoya)
        if (/^\d+$/.test(text)) {
          if (text === last) same++; else { last = text; same = 1; }
          if (same < 2) return;
        }
        $("#mh-bc").value = text;
        changed();
        stopCam();
        App.haptic("success");
      }, function () {}).then(function () {
        st.textContent = "Shtrix kodni ramkaga to'g'rilang...";
      });
    }).catch(function () {
      st.textContent = "Kamera ochilmadi. Telegramga kameraga ruxsat bering yoki kodni qo'lda yozing.";
      st.className = "small err";
    });
  }

  // Biror maydon o'zgarsa - tekshiruv natijasi eskiradi
  function changed() {
    checked = null;
    pendingN = "";
    var c = root && $("#mh-check");
    if (c) c.innerHTML = "";
    var b = root && $("#mh-go");
    if (b) { b.textContent = "🔎 Tekshirish"; b.disabled = false; }
    var p = root && $("#mh-h-price");
    if (p) {
      var raw = $("#mh-price").value.trim(), v = parsePrice(raw);
      p.textContent = !raw ? "" : v === null ? "⚠️ raqam emas" : "= " + money(v) + " so'm" + (kg ? " / kg" : "");
      p.className = "small ks-h " + (raw && v === null ? "err" : "muted");
    }
  }

  function form() {
    return {
      name: $("#mh-name").value.replace(/\s+/g, " ").trim(),
      price: parsePrice($("#mh-price").value),
      priceRaw: $("#mh-price").value.trim(),
      bc: $("#mh-bc").value.trim().replace(/\s+/g, ""),
      code: $("#mh-code").value.trim(),
      qoldiq: $("#mh-q").value.trim().replace(",", ".")
    };
  }

  function localErr(f) {
    if (!f.name) return ERR.nom;
    if (f.price === null) return ERR.narx;
    if (f.code && !/^[0-9A-Za-z\-]{1,20}$/.test(f.code)) return ERR.kod;
    if (f.qoldiq) {
      var q = Number(f.qoldiq);
      if (!isFinite(q) || q < 0 || q > 1000000 || (!kg && Math.floor(q) !== q)) return ERR.qoldiq;
    }
    return "";
  }

  function showCheck(r) {
    var h = "", block = false;
    if (r.bor) {
      block = true;
      h += '<div class="card mh-bad">⛔ Bunday mahsulot bor: <b>' + esc(r.bor.n) + "</b>" +
        (r.bor.k ? " (kod " + esc(r.bor.k) + ")" : "") + ", narx: " + (r.bor.p === null ? "yo'q" : money(r.bor.p)) +
        '<br><span class="small muted">Narxini o\'zgartirish: panel → ✏️ Narx. Boshqa tovar bo\'lsa - nomini aniqroq yozing.</span></div>';
    }
    if (r.kodBand) {
      block = true;
      h += '<div class="card mh-bad">⛔ Tarozi kodi <b>' + esc($("#mh-code").value.trim()) + "</b> band: " + esc(r.kodBand.n) +
        '<br><span class="small muted">Boshqa kod yozing yoki bo\'sh qoldiring.</span></div>';
    }
    if (r.bcEgasi) {
      h += '<div class="card mh-warn">⚠️ Bu shtrix kod <b>' + esc(r.bcEgasi.n) + "</b> da turibdi." +
        '<br><span class="small muted">Qo\'shsangiz, o\'sha tovardan olib, yangisiga beriladi (bitta kod = bitta tovar).</span></div>';
    }
    if (r.oxshash && r.oxshash.length && !r.bor) {
      h += '<div class="card mh-warn">🤔 O\'xshash nomlar bor:' + r.oxshash.map(function (o) {
        return "<br>• <b>" + esc(o.n) + "</b>" + (o.k ? " (kod " + esc(o.k) + ")" : "") + ", " + (o.p === null ? "narx yo'q" : money(o.p));
      }).join("") + '<br><span class="small muted">Bu boshqa tovar bo\'lsa - qo\'shavering.</span></div>';
    }
    if (!h) h = '<div class="card mh-ok">✅ Hammasi joyida - bunday tovar yo\'q.</div>';
    $("#mh-check").innerHTML = h;
    var b = $("#mh-go");
    if (block) { b.textContent = "⛔ Qo'shib bo'lmaydi"; b.disabled = true; App.haptic("error"); }
    else { b.textContent = "✅ Qo'shish"; b.disabled = false; App.haptic(r.bcEgasi || (r.oxshash && r.oxshash.length) ? "warning" : "success"); }
  }

  function go() {
    if (busy) return;
    var f = form(), msg = $("#mh-msg");
    var le = localErr(f);
    if (le) { msg.innerHTML = '<span class="err">' + le + "</span>"; App.haptic("error"); return; }
    msg.innerHTML = "";
    busy = true;
    var b = $("#mh-go");
    b.disabled = true;
    if (!checked) {
      msg.innerHTML = '<span class="muted">⏳ Tekshirilyapti...</span>';
      App.api("mahsulot_tekshir", { name: f.name, bc: f.bc, code: f.code }).then(function (r) {
        if (!root) return;
        busy = false;
        msg.innerHTML = "";
        if (!r || !r.ok) { b.disabled = false; msg.innerHTML = '<span class="err">' + errText(r) + "</span>"; App.haptic("error"); return; }
        checked = r;
        showCheck(r);
      });
      return;
    }
    if (!pendingN) pendingN = nonce(); // qayta bosilsa - ikki marta qo'shilmaydi
    msg.innerHTML = '<span class="muted">⏳ Qo\'shilyapti...</span>';
    App.api("mahsulot_ok", { name: f.name, price: f.price, bc: f.bc, code: f.code, kg: kg ? 1 : 0, qoldiq: f.qoldiq, n: pendingN }).then(function (r) {
      if (!root) return;
      busy = false;
      if (!r || !r.ok) {
        b.disabled = false;
        msg.innerHTML = '<span class="err">' + errText(r) + "</span>";
        App.haptic("error");
        if (r && (r.err === "bor" || r.err === "kod_band")) { checked = null; pendingN = ""; b.textContent = "🔎 Tekshirish"; }
        return;
      }
      pendingN = "";
      flash = r.dup ? "✅ Bu mahsulot allaqachon qo'shilgan." :
        '<div class="sv-done-h">✅ Qo\'shildi: ' + esc(r.name) + "</div>" +
        '<div class="small">' + money(r.price) + " so'm" + (r.kg ? " / kg" : "") +
        (r.code ? " · kod <b>" + esc(r.code) + "</b>" : "") +
        (r.bc ? " · shtrix " + esc(r.bc) : "") +
        (r.qoldiq !== null && r.qoldiq !== undefined ? " · qoldiq " + esc(r.qoldiq) + (r.kg ? " kg" : " ta") : "") + "</div>" +
        (r.moved && r.moved.length ? '<p class="small">↪️ Shtrix kod shu tovardan olindi: ' + r.moved.map(esc).join(", ") + "</p>" : "") +
        (!r.code ? '<p class="small muted">⚠️ Tarozi kodi yozilmadi - kerak bo\'lsa jadvalda D ustuniga yozing.</p>' : "") +
        '<p class="small muted">Rasm: botga rasmni yuborib, izohiga nomini yozing.</p>';
      App.haptic("success");
      draw();
      try { window.scrollTo(0, 0); } catch (e) {}
    });
  }

  function draw() {
    stopCam();
    checked = null; pendingN = ""; busy = false; kg = false;
    var h = "<h1>➕ Mahsulot qo'shish</h1>";
    if (flash) h += '<div class="card sv-done">' + flash + "</div>";
    h += '<div class="card ks-form" id="mh-form">' +
      '<label class="ks-l">Nomi<input class="field" id="mh-name" maxlength="200" autocomplete="off" placeholder="masalan: Pepsi 1L"></label>' +
      '<div class="ks-l">Birlik</div><div class="row mh-unit">' +
      '  <button class="btn secondary grow sel" type="button" data-u="0">Dona</button>' +
      '  <button class="btn secondary grow" type="button" data-u="1">⚖️ kg</button></div>' +
      '<label class="ks-l"><span id="mh-pl">Narx (so\'m)</span><input class="field" id="mh-price" inputmode="numeric" autocomplete="off" placeholder="12000"></label>' +
      '<div class="small ks-h" id="mh-h-price"></div>' +
      '<div class="ks-l">Shtrix kod <span class="muted small">(ixtiyoriy)</span></div>' +
      '<div class="row"><input class="field grow" id="mh-bc" inputmode="numeric" autocomplete="off" placeholder="4601234567890">' +
      '<button class="btn" type="button" id="mh-scan">📷</button></div>' +
      '<div id="mh-cam" style="display:none"><div id="mh-view" class="scan-view sv-scan im-gap"></div><div class="small muted" id="mh-cam-st"></div></div>' +
      '<label class="ks-l">Tarozi kodi <span class="muted small">(ixtiyoriy, D ustun)</span><input class="field" id="mh-code" inputmode="numeric" autocomplete="off" placeholder="012"></label>' +
      '<label class="ks-l"><span id="mh-ql">Boshlang\'ich qoldiq, ta</span> <span class="muted small">(ixtiyoriy)</span><input class="field" id="mh-q" inputmode="decimal" autocomplete="off" placeholder="bo\'sh - hisoblanmaydi"></label>' +
      '<div id="mh-check" class="mh-check"></div>' +
      '<button class="btn block sv-sell im-gap" type="button" id="mh-go">🔎 Tekshirish</button>' +
      '<div class="small" id="mh-msg"></div></div>';
    root.innerHTML = h;

    ["#mh-name", "#mh-price", "#mh-bc", "#mh-code", "#mh-q"].forEach(function (s) {
      $(s).addEventListener("input", changed);
    });
    root.querySelectorAll("[data-u]").forEach(function (b) {
      b.addEventListener("click", function () {
        kg = b.getAttribute("data-u") === "1";
        root.querySelectorAll("[data-u]").forEach(function (x) { x.classList.toggle("sel", x === b); });
        $("#mh-pl").textContent = kg ? "Narx, 1 kg uchun (so'm)" : "Narx (so'm)";
        $("#mh-ql").textContent = kg ? "Boshlang'ich qoldiq, kg" : "Boshlang'ich qoldiq, ta";
        changed();
      });
    });
    $("#mh-scan").addEventListener("click", startCam);
    $("#mh-go").addEventListener("click", go);
    if (!flash) setTimeout(function () { var n = root && $("#mh-name"); if (n) n.focus(); }, 300);
  }

  App.register("mahsulot", {
    render: function (el) {
      root = el; flash = "";
      if (!App.inTelegram) { el.innerHTML = "<h1>➕ Mahsulot qo'shish</h1><div class=\"card\"><p class=\"err\">" + ERR.init + "</p></div>"; return; }
      draw();
    },
    destroy: function () { stopCam(); root = null; }
  });
})();
