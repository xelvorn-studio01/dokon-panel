// ============================================================
//  BO'LIM: 📷 SKANER - shtrix kodni kamerada o'qib botga yuboradi
//  Botga ketadigan ma'lumot: {"a":"scan","code":"4601234567890"}
// ============================================================
(function () {
  var LIB = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
  var scanner = null;

  // EAN-13 / EAN-8 / UPC-A nazorat raqami - noto'g'ri o'qilgan kodlarni tashlab yuboradi
  function checksumOk(s) {
    if (!/^\d+$/.test(s) || [8, 12, 13].indexOf(s.length) === -1) return true;
    var d = s.split("").map(Number), check = d.pop(), sum = 0;
    d.reverse().forEach(function (x, i) { sum += x * (i % 2 === 0 ? 3 : 1); });
    return (10 - sum % 10) % 10 === check;
  }

  function stop() {
    if (!scanner) return;
    var s = scanner;
    scanner = null;
    try { s.stop().then(function () { s.clear(); }).catch(function () {}); } catch (e) {}
  }

  App.register("skaner", {
    render: function (el) {
      el.innerHTML =
        '<h1>📷 Shtrix kodni ramka ichiga to\'g\'rilang</h1>' +
        '<div id="scanView" class="scan-view"></div>' +
        '<p id="scanStatus" class="scan-status muted">Kamera ishga tushyapti...</p>' +
        '<button id="torchBtn" class="btn secondary block" type="button" style="display:none;margin-bottom:10px">🔦 Chiroq</button>' +
        '<div class="card row">' +
        '  <input id="manualCode" class="field grow" inputmode="numeric" autocomplete="off" placeholder="Yoki kodni qo\'lda yozing">' +
        '  <button id="manualSend" class="btn" type="button">Yuborish</button>' +
        '</div>' +
        '<p class="muted small">Kod o\'qilgach, oyna o\'zi yopiladi va javob botda chiqadi.</p>';

      var statusEl = el.querySelector("#scanStatus");
      function setStatus(t, cls) { statusEl.textContent = t; statusEl.className = "scan-status " + (cls || "muted"); }

      var sent = false, last = "", same = 0;

      function finish(code) {
        if (sent) return;
        code = String(code).trim().replace(/\s+/g, "");
        if (!code) return;
        sent = true;
        setStatus("✅ " + code, "ok");
        stop();
        App.haptic("success");
        if (!App.sendToBot({ a: "scan", code: code })) {
          setStatus("✅ " + code + " — lekin bu sahifa botdagi 📷 Skanerlash tugmasi orqali ochilishi kerak.", "err");
          sent = false;
        }
      }

      function onScan(text) {
        if (sent) return;
        text = String(text).trim();
        if (!checksumOk(text)) return;
        // Raqamli shtrix kod ketma-ket 2 marta bir xil o'qilsa qabul qilinadi (xato o'qishdan himoya)
        if (/^\d+$/.test(text)) {
          if (text === last) same++; else { last = text; same = 1; }
          if (same < 2) return;
        }
        finish(text);
      }

      var input = el.querySelector("#manualCode");
      el.querySelector("#manualSend").addEventListener("click", function () { finish(input.value); });
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") finish(input.value); });

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
              return { width: bw, height: Math.max(100, Math.floor(Math.min(h, bw) * 0.5)) };
            }
          },
          onScan,
          function () {}
        ).then(function () {
          setStatus("Kodni kameraga yaqinroq tuting...");
          // Chiroq (agar telefon qo'llasa)
          try {
            var caps = scanner.getRunningTrackCameraCapabilities();
            if (caps && caps.torchFeature && caps.torchFeature().isSupported()) {
              var btn = el.querySelector("#torchBtn"), on = false;
              btn.style.display = "block";
              btn.addEventListener("click", function () {
                on = !on;
                caps.torchFeature().apply(on).catch(function () {});
                btn.textContent = on ? "🔦 Chiroqni o'chirish" : "🔦 Chiroq";
              });
            }
          } catch (e) {}
        }, function () {
          setStatus("Kamera ochilmadi. Telegramga kameraga ruxsat bering yoki kodni pastda qo'lda yozing.", "err");
        });
      }).catch(function () {
        setStatus("Skaner yuklanmadi. Internetni tekshiring yoki kodni qo'lda yozing.", "err");
      });
    },

    // Boshqa bo'limga o'tganda kamerani o'chiradi
    destroy: stop
  });
})();
