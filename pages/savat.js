// ============================================================
//  BO'LIM: 🛒 SOTUV (SAVAT) - telefon-kassa
//  Kamera to'xtamasdan skanerlaydi, har bir tovar savatga tushadi.
//  Jami -> Naqd / Karta -> ✅ Sotildi -> botga ketadi:
//    {"a":"sotuv","t":"naqd","n":"takrorlanmas_kod","s":jami,"i":[["shtrix",soni],...]}
//  Narxlar botdan olinadi: API?a=narx&dokon=ID&k=KALIT (manzillar botdagi tugmada keladi).
//  Bot narxni jadvaldan qayta tekshiradi - bu yerdagi narx faqat ko'rsatish uchun.
// ============================================================
(function () {
  var LIB = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
  var SAME_CODE_MS = 1500;   // bir xil kod qayta qo'shilishidan oldin kutish (ms)
  var MAX_BYTES = 4000;      // Telegram sendData limiti 4096 bayt
  var scanner = null;

  // ----- yordamchilar -----
  function checksumOk(s) {
    if (!/^\d+$/.test(s) || [8, 12, 13].indexOf(s.length) === -1) return true;
    var d = s.split("").map(Number), check = d.pop(), sum = 0;
    d.reverse().forEach(function (x, i) { sum += x * (i % 2 === 0 ? 3 : 1); });
    return (10 - sum % 10) % 10 === check;
  }
  // Bot bilan bir xil: raqamli kodda boshidagi nollar hisobga olinmaydi
  function bcKey(s) {
    s = String(s || "").trim();
    return /^\d+$/.test(s) ? (s.replace(/^0+/, "") || "0") : s.toLowerCase();
  }
  function money(n) {
    var v = Math.round(Number(n) || 0);
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
    return null;
  }
  function nonce() {
    var s = "";
    for (var i = 0; i < 12; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 36));
    return Date.now().toString(36) + s;
  }
  function stop() {
    if (!scanner) return;
    var s = scanner;
    scanner = null;
    try { s.stop().then(function () { s.clear(); }).catch(function () {}); } catch (e) {}
  }

  App.register("savat", {
    render: function (el, params) {
      var dokon = String(params.get ? params.get("dokon") || "" : "").toLowerCase();
      var key = params.get ? params.get("k") || "" : "";
      var api = params.get ? params.get("api") || "" : "";
      var K_CART = "savat_" + dokon, K_LAST = "savat_oxirgi_" + dokon, K_PRICES = "savat_narx_" + dokon;

      if (!dokon || !key || !/^https:\/\/script\.google\.com\/.+\/exec$/.test(api)) {
        el.innerHTML = '<h1>🛒 Sotuv</h1><p class="err">Bu sahifa botdagi <b>🛒 Sotuv</b> tugmasi orqali ochilishi kerak.</p>' +
          '<p class="muted">Tugma ko\'rinmasa, botda /start bosing.</p>';
        return;
      }

      el.innerHTML =
        '<div class="sv-head"><h1 id="svTitle">🛒 Sotuv</h1><span id="svInfo" class="muted small"></span></div>' +
        '<div id="scanView" class="scan-view sv-scan"></div>' +
        '<p id="scanStatus" class="scan-status muted">Narxlar yuklanyapti...</p>' +
        '<div class="card row" style="margin-bottom:10px">' +
        '  <input id="manualCode" class="field grow" inputmode="numeric" autocomplete="off" placeholder="Shtrix kodni qo\'lda yozing">' +
        '  <button id="manualAdd" class="btn" type="button">➕</button>' +
        '</div>' +
        '<button id="restoreBtn" class="btn secondary block" type="button" style="display:none;margin-bottom:10px">↩️ Oxirgi savatni tiklash</button>' +
        '<div id="cartList"></div>' +
        '<div class="sv-total card">' +
        '  <div class="sv-sum"><span>Jami:</span> <b id="svTotal">0</b> so\'m <span id="svCount" class="muted small"></span></div>' +
        '  <div class="row sv-pay">' +
        '    <button class="btn secondary grow" type="button" data-pay="naqd">💵 Naqd</button>' +
        '    <button class="btn secondary grow" type="button" data-pay="karta">💳 Karta</button>' +
        '  </div>' +
        '  <button id="sellBtn" class="btn block sv-sell" type="button" disabled>✅ Sotildi</button>' +
        '  <button id="clearBtn" class="btn secondary block small" type="button" style="margin-top:8px">🗑 Savatni tozalash</button>' +
        '</div>';

      var statusEl = el.querySelector("#scanStatus");
      var listEl = el.querySelector("#cartList");
      var totalEl = el.querySelector("#svTotal");
      var sellBtn = el.querySelector("#sellBtn");
      var restoreBtn = el.querySelector("#restoreBtn");
      var infoEl = el.querySelector("#svInfo");
      function setStatus(t, cls) { statusEl.textContent = t; statusEl.className = "scan-status " + (cls || "muted"); }

      var prices = {};          // bcKey -> { name, price }
      var loadedOk = false;
      var cart = store(K_CART) || [];   // [{ bc, name, price, qty }]
      var pay = "";
      var sending = false;

      // ----- narxlar -----
      function applyPrices(data) {
        prices = {};
        (data.items || []).forEach(function (it) {
          (it[0] || []).forEach(function (bc) { prices[bcKey(bc)] = { name: it[1], price: Number(it[2]) || 0 }; });
        });
        if (data.d) el.querySelector("#svTitle").textContent = "🛒 " + data.d;
        infoEl.textContent = (data.items || []).length + " ta tovar";
        // Savatdagi narxlarni yangilaymiz (jadvalda o'zgargan bo'lsa)
        cart.forEach(function (c) { var p = prices[bcKey(c.bc)]; if (p) { c.price = p.price; c.name = p.name; } });
        draw();
      }

      function loadPrices() {
        var cached = store(K_PRICES);
        if (cached && cached.items) { applyPrices(cached); loadedOk = true; setStatus("Skanerlang. (Narxlar yangilanyapti...)"); }
        var url = api + "?a=narx&dokon=" + encodeURIComponent(dokon) + "&k=" + encodeURIComponent(key);
        fetch(url).then(function (r) { return r.json(); }).then(function (data) {
          if (!data || !data.ok) {
            var e = data && data.err;
            if (e === "kalit") setStatus("Tugma eskirgan. Botda /start bosib, 🛒 Sotuv'ni qayta oching.", "err");
            else if (e === "obuna") setStatus("Obuna muddati tugagan. Do'kon egasiga murojaat qiling.", "err");
            else setStatus("Narxlarni olib bo'lmadi (" + (e || "xato") + "). Qayta oching.", "err");
            if (e === "kalit" || e === "obuna") { loadedOk = false; store(K_PRICES, null); prices = {}; draw(); }
            return;
          }
          store(K_PRICES, data);
          applyPrices(data);
          loadedOk = true;
          setStatus("Skanerlang - tovar savatga o'zi tushadi.");
        }).catch(function () {
          if (loadedOk) setStatus("Internet sekin - oxirgi saqlangan narxlar ishlatilyapti.", "err");
          else setStatus("Narxlar yuklanmadi. Internetni tekshirib, qayta oching.", "err");
        });
      }

      // ----- savat -----
      function save() { store(K_CART, cart.length ? cart : null); }

      function total() {
        var s = 0;
        cart.forEach(function (c) { s += c.price * c.qty; });
        return s;
      }

      function draw() {
        if (!cart.length) {
          listEl.innerHTML = '<p class="muted sv-empty">Savat bo\'sh. Tovarni skanerlang.</p>';
        } else {
          var html = "";
          cart.forEach(function (c, i) {
            html += '<div class="sv-item card">' +
              '<div class="sv-name">' + App.esc(c.name) + '</div>' +
              '<div class="sv-line">' +
              '<span class="muted small">' + money(c.price) + ' × </span>' +
              '<button class="btn secondary sv-q" type="button" data-m="' + i + '">−</button>' +
              '<input class="field sv-qty" inputmode="numeric" data-q="' + i + '" value="' + c.qty + '">' +
              '<button class="btn secondary sv-q" type="button" data-p="' + i + '">+</button>' +
              '<b class="sv-isum">' + money(c.price * c.qty) + '</b>' +
              '<button class="btn secondary sv-q" type="button" data-x="' + i + '">✕</button>' +
              '</div></div>';
          });
          listEl.innerHTML = html;
        }
        var n = 0;
        cart.forEach(function (c) { n += c.qty; });
        totalEl.textContent = money(total());
        el.querySelector("#svCount").textContent = n ? n + " dona" : "";
        el.querySelectorAll("[data-pay]").forEach(function (b) {
          b.className = "btn grow " + (b.getAttribute("data-pay") === pay ? "" : "secondary");
        });
        sellBtn.disabled = !cart.length || !pay || sending;
        sellBtn.textContent = !cart.length ? "✅ Sotildi" : !pay ? "To'lov turini tanlang" : "✅ Sotildi - " + money(total()) + " so'm";
        var last = store(K_LAST);
        restoreBtn.style.display = !cart.length && last && last.length ? "block" : "none";
      }

      function addCode(code) {
        code = String(code || "").trim().replace(/\s+/g, "");
        if (!code) return false;
        var p = prices[bcKey(code)];
        if (!p) {
          App.haptic("error");
          setStatus(loadedOk ? "❌ Topilmadi: " + code + " (bazada yo'q yoki narxi yo'q)" : "Narxlar hali yuklanmadi...", "err");
          return false;
        }
        var found = null;
        cart.forEach(function (c) { if (bcKey(c.bc) === bcKey(code)) found = c; });
        if (found) { found.qty += 1; found.price = p.price; found.name = p.name; }
        else { found = { bc: code, name: p.name, price: p.price, qty: 1 }; cart.unshift(found); }
        save();
        draw();
        App.haptic("success");
        setStatus("✅ " + p.name + " — " + money(p.price) + " so'm" + (found.qty > 1 ? " (× " + found.qty + ")" : ""), "ok");
        return true;
      }

      listEl.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        var i;
        if (b.hasAttribute("data-p")) { i = +b.getAttribute("data-p"); cart[i].qty = Math.min(9999, cart[i].qty + 1); }
        else if (b.hasAttribute("data-m")) { i = +b.getAttribute("data-m"); if (cart[i].qty > 1) cart[i].qty--; else cart.splice(i, 1); }
        else if (b.hasAttribute("data-x")) { i = +b.getAttribute("data-x"); cart.splice(i, 1); }
        else return;
        save();
        draw();
      });
      listEl.addEventListener("change", function (e) {
        if (!e.target.hasAttribute("data-q")) return;
        var i = +e.target.getAttribute("data-q");
        var q = Math.floor(Number(String(e.target.value).replace(/\D/g, "")));
        if (q >= 1 && q <= 9999) cart[i].qty = q; else if (q === 0) cart.splice(i, 1);
        save();
        draw();
      });

      el.querySelectorAll("[data-pay]").forEach(function (b) {
        b.addEventListener("click", function () { pay = b.getAttribute("data-pay"); draw(); });
      });

      el.querySelector("#clearBtn").addEventListener("click", function () {
        if (!cart.length) return;
        store(K_LAST, cart);
        cart = [];
        pay = "";
        save();
        draw();
        setStatus("Savat tozalandi. Kerak bo'lsa ↩️ tiklash mumkin.");
      });

      restoreBtn.addEventListener("click", function () {
        var last = store(K_LAST);
        if (last && last.length) { cart = last; save(); draw(); setStatus("↩️ Oxirgi savat tiklandi."); }
      });

      sellBtn.addEventListener("click", function () {
        if (!cart.length || !pay || sending) return;
        var payload = {
          a: "sotuv", t: pay, n: nonce(), s: total(),
          i: cart.map(function (c) { return [c.bc, c.qty]; })
        };
        var json = JSON.stringify(payload);
        if (new Blob([json]).size > MAX_BYTES) {
          setStatus("⚠️ Savat juda katta (" + cart.length + " xil). Ikkita chekka bo'lib soting.", "err");
          return;
        }
        if (!App.inTelegram) {
          setStatus("Bu sahifa botdagi 🛒 Sotuv tugmasi orqali ochilishi kerak.", "err");
          return;
        }
        sending = true;
        draw();
        stop();
        // Zaxira: bot yozolmasa, savatni qayta tiklash mumkin bo'lsin
        store(K_LAST, cart);
        store(K_CART, null);
        App.haptic("success");
        App.sendToBot(payload);
      });

      var input = el.querySelector("#manualCode");
      function manual() { if (addCode(input.value)) input.value = ""; }
      el.querySelector("#manualAdd").addEventListener("click", manual);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") manual(); });

      // ----- uzluksiz skaner -----
      var last = "", same = 0, lastAdded = "", lastAddedAt = 0;
      function onScan(text) {
        if (sending) return;
        text = String(text).trim();
        if (!checksumOk(text)) return;
        // Raqamli kod ketma-ket 2 marta bir xil o'qilsa qabul qilinadi (xato o'qishdan himoya)
        if (/^\d+$/.test(text)) {
          if (text === last) same++; else { last = text; same = 1; }
          if (same < 2) return;
        }
        // Kamera tovarda turgan paytda bitta tovar qayta-qayta qo'shilmasin
        var now = Date.now();
        if (text === lastAdded && now - lastAddedAt < SAME_CODE_MS) { lastAddedAt = now; return; }
        lastAdded = text;
        lastAddedAt = now;
        same = 0;
        addCode(text);
      }

      draw();
      loadPrices();

      App.loadScript(LIB).then(function () {
        var F = Html5QrcodeSupportedFormats;
        scanner = new Html5Qrcode("scanView", {
          formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.QR_CODE],
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          verbose: false
        });
        return scanner.start(
          { facingMode: "environment" },
          {
            fps: 12,
            qrbox: function (w, h) {
              var bw = Math.max(150, Math.floor(w * 0.9));
              return { width: bw, height: Math.max(80, Math.floor(Math.min(h, bw) * 0.45)) };
            }
          },
          onScan,
          function () {}
        );
      }).catch(function () {
        setStatus("Kamera ochilmadi. Telegramga kameraga ruxsat bering yoki kodni qo'lda yozing.", "err");
      });
    },

    destroy: stop
  });
})();
