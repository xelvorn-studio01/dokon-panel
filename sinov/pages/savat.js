// ============================================================
//  BO'LIM: 🛒 SOTUV (SAVAT) - telefon-kassa
//  Kamera to'xtamasdan skanerlaydi, har bir tovar savatga tushadi.
//  Jami -> Naqd / Karta -> ✅ Sotildi -> botga ketadi:
//    {"a":"sotuv","t":"naqd","n":"takrorlanmas_kod","s":jami,"i":[["shtrix",soni],["",soni,"Nomi"],...]}
//  Narxlar botdan olinadi: API?a=narx&dokon=ID&k=KALIT (manzillar botdagi tugmada keladi).
//  Bot narxni jadvaldan qayta tekshiradi - bu yerdagi narx faqat ko'rsatish uchun.
//  v9 (bot javobida v >= 9 bo'lsa): 🔍 nom bo'yicha qidirish (shtrixsiz tovar ham) va kasr soni (0.75 kg).
//  kg tovar (bot "kg" belgisini yuboradi - jadvalning I ustuni): "so'm/kg", soni 0.75 yoki 750g, +/- 0.1 kg.
//  Dona tovar - butun son. Eski bot (v8) bilan ochilsa - avvalgidek faqat shtrix va butun son.
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
  function roundQty(n) { return Math.round(n * 1000) / 1000; }
  // v9: "0.75", "0,75", "1.5kg", "750g", "750 gr", "750г" -> kg. Yaroqsiz bo'lsa NaN.
  function parseKg(t) {
    t = String(t || "").toLowerCase().replace(/\s/g, "").replace(",", ".");
    var m = t.match(/^(\d+(?:\.\d+)?)(kg|кг|g|gr|гр|г)?$/);
    if (!m) return NaN;
    var n = Number(m[1]);
    if (m[2] && /^(g|gr|гр|г)$/.test(m[2])) n = n / 1000;
    return roundQty(n);
  }
  // 0.75 -> "0.75", 2 -> "2"
  function fmtQty(n) { return String(roundQty(Number(n) || 0)); }
  // Qidiruv uchun: kichik harf, apostroflar olib tashlanadi (botdagi norm() kabi)
  function norm(s) {
    return String(s || "").toLowerCase().replace(/[\u0027\u2018\u2019\u02bb\u02bc`]/g, "").replace(/\s+/g, " ").trim();
  }
  function nameKey(s) { return norm(s).replace(/\s/g, ""); }
  // Faqat undoshlar: "pmdr" -> pomidor (unlisiz yozilsa ham topadi)
  function skel(s) { return norm(s).replace(/[aeiouyаеёиоуыэюяўі\s\d]/g, ""); }
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
        '<div class="card row" style="margin-bottom:6px">' +
        '  <input id="manualCode" class="field grow" inputmode="numeric" autocomplete="off" placeholder="Shtrix kodni qo\'lda yozing">' +
        '  <button id="manualAdd" class="btn" type="button">➕</button>' +
        '</div>' +
        '<div id="searchHits" class="sv-hits"></div>' +
        '<div style="margin-bottom:10px"></div>' +
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
      var input = el.querySelector("#manualCode");
      function setStatus(t, cls) { statusEl.textContent = t; statusEl.className = "scan-status " + (cls || "muted"); }

      var prices = {};          // bcKey -> { name, price }
      var byName = {};          // v9: nameKey -> { name, price, bc }
      var list = [];            // v9: qidiruv uchun [{ name, price, bc, n, k }]
      var v9 = false;           // bot v9 (nom bo'yicha + kasr) bo'lsa true
      var loadedOk = false;
      var cart = store(K_CART) || [];   // [{ bc, name, price, qty }]
      var pay = "";
      var sending = false;

      // ----- narxlar -----
      function applyPrices(data) {
        prices = {}; byName = {}; list = [];
        v9 = Number(data.v) >= 9;
        (data.items || []).forEach(function (it) {
          var bcs = it[0] || [], nm = String(it[1] || ""), pr = Number(it[2]) || 0;
          var kg = v9 && it[3] === "kg";
          bcs.forEach(function (bc) { prices[bcKey(bc)] = { name: nm, price: pr, kg: kg }; });
          if (!v9 || !nm) return;
          var k = nameKey(nm);
          var o = { name: nm, price: pr, kg: kg, bc: bcs.length ? String(bcs[0]) : "", n: norm(nm), s: skel(nm) };
          if (!byName[k]) byName[k] = o;
          list.push(o);
        });
        if (!v9) cart = cart.filter(function (c) { return c.bc; }); // eski bot shtrixsizni qabul qilmaydi
        input.setAttribute("inputmode", v9 ? "text" : "numeric");
        input.placeholder = v9 ? "🔍 Nomi yoki shtrix kod" : "Shtrix kodni qo'lda yozing";
        if (data.d) el.querySelector("#svTitle").textContent = "🛒 " + data.d;
        infoEl.textContent = (data.items || []).length + " ta tovar";
        // Savatdagi narxlarni yangilaymiz (jadvalda o'zgargan bo'lsa)
        cart.forEach(function (c) {
          var p = c.bc ? prices[bcKey(c.bc)] : byName[nameKey(c.name)];
          if (p) { c.price = p.price; c.name = p.name; c.kg = !!p.kg; }
        });
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
        cart.forEach(function (c) { s += Math.round(c.price * c.qty); });
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
              '<span class="muted small">' + money(c.price) + (c.kg ? "/kg" : "") + ' × </span>' +
              '<button class="btn secondary sv-q" type="button" data-m="' + i + '">−</button>' +
              '<input class="field sv-qty" inputmode="' + (c.kg ? "decimal" : "numeric") + '" data-q="' + i + '" value="' + fmtQty(c.qty) + '">' +
              (c.kg ? '<span class="small">kg</span>' : '') +
              '<button class="btn secondary sv-q" type="button" data-p="' + i + '">+</button>' +
              '<b class="sv-isum">' + money(Math.round(c.price * c.qty)) + '</b>' +
              '<button class="btn secondary sv-q" type="button" data-x="' + i + '">✕</button>' +
              '</div></div>';
          });
          listEl.innerHTML = html;
        }
        totalEl.textContent = money(total());
        el.querySelector("#svCount").textContent = cart.length ? cart.length + " xil" : "";
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
        cart.forEach(function (c) { if (c.bc && bcKey(c.bc) === bcKey(code)) found = c; });
        if (!found && v9) cart.forEach(function (c) { if (!c.bc && nameKey(c.name) === nameKey(p.name)) found = c; });
        if (found) { found.qty = roundQty(found.qty + 1); found.price = p.price; found.name = p.name; if (!found.bc) found.bc = code; }
        else { found = { bc: code, name: p.name, price: p.price, qty: 1, kg: !!p.kg }; cart.unshift(found); }
        save();
        draw();
        App.haptic("success");
        setStatus("✅ " + p.name + " — " + money(p.price) + " so'm" + (p.kg ? "/kg" : "") +
          (found.qty > 1 ? " (× " + fmtQty(found.qty) + (p.kg ? " kg" : "") + ")" : ""), "ok");
        return true;
      }

      // v9: qidiruvdan tanlangan tovar. Savatga tushadi va soni maydoni ochiladi (0.75 yozish uchun).
      function addItem(o) {
        var found = null;
        cart.forEach(function (c) {
          if (o.bc && c.bc && bcKey(c.bc) === bcKey(o.bc)) found = c;
          else if (!found && nameKey(c.name) === nameKey(o.name)) found = c;
        });
        if (found) { found.qty = roundQty(found.qty + 1); found.price = o.price; found.name = o.name; found.kg = o.kg; }
        else { found = { bc: o.bc, name: o.name, price: o.price, qty: 1, kg: o.kg }; cart.unshift(found); }
        save();
        draw();
        App.haptic("success");
        if (!o.kg) { setStatus("✅ " + o.name + " — " + money(o.price) + " so'm", "ok"); return; }
        // kg tovar: og'irligini yozish uchun maydon ochiladi
        setStatus("⚖️ " + o.name + " — " + money(o.price) + " so'm/kg. Og'irligini yozing: 0.75 yoki 750g", "ok");
        var q = listEl.querySelector('[data-q="' + cart.indexOf(found) + '"]');
        if (q) { q.focus(); try { q.select(); } catch (e) {} }
      }

      // v9: nom bo'yicha qidiruv. Tartib: nomi shu bilan boshlansa -> so'z boshi -> ichida -> hamma so'zlar -> undoshlar.
      function findByText(text) {
        var q = norm(text);
        if (q.length < 2) return [];
        var words = q.split(" "), qs = skel(q), out = [];
        list.forEach(function (o) {
          var r = -1;
          if (o.n.indexOf(q) === 0) r = 0;
          else if (o.n.indexOf(" " + q) !== -1) r = 1;
          else if (o.n.indexOf(q) !== -1) r = 2;
          else if (words.length > 1 && words.every(function (w) { return o.n.indexOf(w) !== -1; })) r = 3;
          else if (qs.length >= 3 && o.s.indexOf(qs) !== -1) r = 4;
          if (r >= 0) out.push({ o: o, r: r });
        });
        out.sort(function (a, b) { return a.r - b.r || a.o.n.length - b.o.n.length; });
        return out.slice(0, 8).map(function (x) { return x.o; });
      }

      var hitsEl = el.querySelector("#searchHits");
      var hits = [];
      function drawHits() {
        var t = input.value.trim();
        hits = v9 && /\D/.test(t.replace(/\s/g, "")) ? findByText(t) : [];
        if (!hits.length) {
          hitsEl.innerHTML = v9 && t.length >= 2 && /\D/.test(t) && loadedOk ? '<p class="muted small sv-nohit">Topilmadi: ' + App.esc(t) + '</p>' : "";
          return;
        }
        hitsEl.innerHTML = hits.map(function (o, i) {
          return '<button class="sv-hit" type="button" data-h="' + i + '"><span>' + App.esc(o.name) +
            (o.bc ? "" : ' <span class="muted small">(shtrixsiz)</span>') + '</span><b>' + money(o.price) + (o.kg ? "/kg" : "") + '</b></button>';
        }).join("");
      }
      hitsEl.addEventListener("click", function (e) {
        var b = e.target.closest("[data-h]");
        if (!b) return;
        var o = hits[+b.getAttribute("data-h")];
        if (!o) return;
        input.value = "";
        drawHits();
        addItem(o);
      });

      listEl.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        var i;
        var step;
        if (b.hasAttribute("data-p")) { i = +b.getAttribute("data-p"); step = cart[i].kg ? 0.1 : 1; cart[i].qty = Math.min(9999, roundQty(cart[i].qty + step)); }
        else if (b.hasAttribute("data-m")) {
          i = +b.getAttribute("data-m"); step = cart[i].kg ? 0.1 : 1;
          if (roundQty(cart[i].qty - step) > 0) cart[i].qty = roundQty(cart[i].qty - step); else cart.splice(i, 1);
        }
        else if (b.hasAttribute("data-x")) { i = +b.getAttribute("data-x"); cart.splice(i, 1); }
        else return;
        save();
        draw();
      });
      // v9: yozish davomida summa darrov yangilanadi (ro'yxat qayta chizilmaydi - klaviatura yopilmasin)
      listEl.addEventListener("input", function (e) {
        if (!e.target.hasAttribute("data-q")) return;
        var c = cart[+e.target.getAttribute("data-q")];
        if (!c) return;
        var q = c.kg ? parseKg(e.target.value) : Math.floor(Number(String(e.target.value).replace(/\D/g, "")));
        if (!(isFinite(q) && q > 0 && q <= 9999 && (c.kg || q >= 1))) return;
        c.qty = q;
        save();
        var sumEl = e.target.parentNode.querySelector(".sv-isum");
        if (sumEl) sumEl.textContent = money(Math.round(c.price * c.qty));
        totalEl.textContent = money(total());
        if (pay) sellBtn.textContent = "✅ Sotildi - " + money(total()) + " so'm";
      });
      listEl.addEventListener("change", function (e) {
        if (!e.target.hasAttribute("data-q")) return;
        var i = +e.target.getAttribute("data-q");
        var q;
        if (cart[i].kg) q = parseKg(e.target.value);   // kg: 0.75 / 750g
        else q = Math.floor(Number(String(e.target.value).replace(/\D/g, "")));  // dona: butun son
        if (isFinite(q) && q > 0 && q <= 9999 && (cart[i].kg || q >= 1)) cart[i].qty = q; else if (q === 0) cart.splice(i, 1);
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
          i: cart.map(function (c) { return c.bc ? [c.bc, c.qty] : ["", c.qty, c.name]; })
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

      // Raqam -> shtrix kod. Harf bo'lsa (v9) -> qidiruvdagi birinchi tovar.
      function manual() {
        var t = input.value.trim();
        if (!t) return;
        if (v9 && /\D/.test(t.replace(/\s/g, ""))) {
          if (hits.length) { input.value = ""; var o = hits[0]; drawHits(); addItem(o); }
          return;
        }
        if (addCode(t)) { input.value = ""; drawHits(); }
      }
      el.querySelector("#manualAdd").addEventListener("click", manual);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") manual(); });
      input.addEventListener("input", drawHits);

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
