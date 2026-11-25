// ============================================================
//  ⚙️ SOZLAMALAR - panel bo'limi (v16). Faqat admin.
//  📈 Ustama (= botdagi /ustama), ⚠️ Kam qoldi chegarasi (= /chegara), 🔗 Moslik ro'yxati + ❌ (= /moslik).
//  API: sozlama, sozlama_ok, moslik_x.
// ============================================================
(function () {
  var ERR = {
    ustama:  "Ustamani foiz bilan yozing: 0 dan 1000 gacha (masalan 20).",
    chegara: "Chegarani 0 yoki musbat son bilan yozing (masalan 5).",
    yoq:     "Bu moslik allaqachon o'chirilgan.",
    admin:   "Bu bo'lim faqat admin uchun.",
    band:    "Hozir band. Bir oz kutib qayta bosing.",
    tarmoq:  "Internet bilan aloqa yo'q. Tekshirib, qayta urinib ko'ring.",
    server:  "Botda xato chiqdi. Birozdan keyin qayta urinib ko'ring.",
    amal:    "Bot eski versiyada (v16 kerak). Hozircha botdagi /ustama, /chegara, /moslik buyruqlaridan foydalaning.",
    init:    "Telegram ma'lumoti kelmadi. Panelni botdagi <b>🏪 Panelni ochish</b> tugmasidan oching.",
    eski:    "Panel ancha oldin ochilgan. Yopib, botdagi <b>🏪 Panel</b> dan qayta oching.",
    imzo:    "Telegram imzosi to'g'ri kelmadi. Botda <b>🏪 Panel</b> ni bosib, qaytadan oching.",
    ruxsat:  "Sizga ruxsat berilmagan.",
    obuna:   "⛔ Obuna muddati tugagan."
  };

  var root = null, data = null, busy = false, flash = "", mq = "";
  var esc = function (s) { return App.esc(s === null || s === undefined ? "" : s); };
  function $(sel) { return root.querySelector(sel); }
  function errText(r) { return ERR[r && r.err] || ("Xato: " + esc(r && r.err || "noma'lum")); }
  function money(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function norm(s) { return String(s || "").toLowerCase().replace(/['’`ʻ]/g, ""); }
  // Botdagi sellPrice bilan bir xil: kirim x (1 + ustama%), 100 so'mga yuqoriga
  function sell(inP, u) { return Math.ceil(Math.round(inP * (100 + u)) / 10000) * 100; }

  function ustHint() {
    var v = String($("#sz-u").value).trim().replace(",", "."), h = $("#sz-uh");
    if (v === "") { h.innerHTML = '<span class="muted">Bo\'sh = belgilanmagan (📦 Kirim faylida sotish narxi hisoblanmaydi)</span>'; return; }
    if (!/^\d+(\.\d+)?$/.test(v) || Number(v) > 1000) { h.innerHTML = '<span class="err">⚠️ 0 dan 1000 gacha son</span>'; return; }
    h.innerHTML = '<span class="muted">Masalan: kirim 10 000 → sotish <b>' + money(sell(10000, Number(v))) + "</b> so'm</span>";
  }

  function draw() {
    var u = data.ustama, c = data.chegara;
    var h = "<h1>⚙️ Sozlamalar</h1>";
    if (flash) { h += '<div class="card tv-flash">' + flash + "</div>"; flash = ""; }
    h += '<div class="card ks-form"><b>📈 Ustama (kirim uchun)</b>' +
      '<p class="muted small">📦 Kirim (nakladnoy) yuklanganda sotish narxi = kirim narxi + ustama, 100 so\'mga yaxlitlanadi.</p>' +
      '<label class="ks-l">Foiz (%)<input class="field" id="sz-u" inputmode="decimal" autocomplete="off" placeholder="masalan 20" value="' +
      (u === null || u === undefined ? "" : esc(u)) + '"></label><div class="small ks-h" id="sz-uh"></div>' +
      '<button class="btn block im-gap" id="sz-us">✅ Saqlash</button><div class="small" id="sz-um"></div></div>';
    h += '<div class="card ks-form im-gap"><b>⚠️ Kam qoldi chegarasi</b>' +
      '<p class="muted small">Qoldiq shu songa tushsa yoki kamaysa - ⚠️ xabar keladi va 📦 Qoldiq\'da "kam qolgan" bo\'ladi. Standart: ' + esc(data.chegaraStd) + ".</p>" +
      '<label class="ks-l">Son<input class="field" id="sz-c" inputmode="decimal" autocomplete="off" value="' + esc(c) + '"></label>' +
      '<button class="btn block im-gap" id="sz-cs">✅ Saqlash</button><div class="small" id="sz-cm"></div></div>';
    h += '<div class="card im-gap"><b>🔗 Eslab qolingan nomlar</b> <span class="muted small">(' + data.moslikJami + " ta)</span>" +
      '<p class="muted small">Excel importda 🤔 o\'xshash nomga ✅ bosilganlar: fayldagi nom → jadvaldagi tovar. Noto\'g\'ri bo\'lsa ❌ bosing - keyingi importda bot yana so\'raydi.</p>';
    if (data.moslik.length > 8) h += '<input class="field tv-search" id="sz-mq" type="search" placeholder="🔍 Qidirish" value="' + esc(mq) + '">';
    h += '<div id="sz-mbox"></div></div>';
    h += '<div class="pn-foot"><button class="btn secondary" id="sz-reload">🔄 Yangilash</button></div>';
    root.innerHTML = h;
    $("#sz-u").addEventListener("input", ustHint);
    ustHint();
    $("#sz-us").addEventListener("click", function () { save({ ustama: $("#sz-u").value.trim() }, $("#sz-um"), $("#sz-us")); });
    $("#sz-cs").addEventListener("click", function () { save({ chegara: $("#sz-c").value.trim() }, $("#sz-cm"), $("#sz-cs")); });
    $("#sz-reload").addEventListener("click", load);
    var mqEl = $("#sz-mq");
    if (mqEl) mqEl.addEventListener("input", function () { mq = this.value; drawMoslik(); });
    drawMoslik();
  }

  function drawMoslik() {
    var box = $("#sz-mbox"), k = norm(mq).trim();
    var res = data.moslik.filter(function (x) { return !k || norm(x.from).indexOf(k) !== -1 || norm(x.to).indexOf(k) !== -1; });
    if (!data.moslik.length) { box.innerHTML = '<p class="muted small">Hozircha yo\'q.</p>'; return; }
    if (!res.length) { box.innerHTML = '<p class="muted small">Topilmadi.</p>'; return; }
    box.innerHTML = '<div class="hs-top">' + res.map(function (x) {
      return '<div class="hs-row"><span class="hs-n">' + esc(x.from) + ' <span class="muted">→</span> <b>' + esc(x.to) + "</b></span>" +
        '<span class="hs-s"><button class="btn secondary small" data-r="' + x.row + '" data-k="' + esc(x.key) + '">❌</button></span></div>';
    }).join("") + "</div>" + (data.moslikJami > data.moslik.length ? '<p class="muted small">... oxirgi ' + data.moslik.length + " tasi ko'rsatildi. Hammasi: botda /moslik</p>" : "");
    box.querySelectorAll("[data-r]").forEach(function (b) {
      b.addEventListener("click", function () { removeMoslik(b); });
    });
  }

  function save(body, msg, btn) {
    if (busy) return;
    busy = true; btn.disabled = true;
    msg.innerHTML = '<span class="muted">Saqlanyapti...</span>';
    App.api("sozlama_ok", body).then(function (r) {
      busy = false;
      if (!root) return;
      btn.disabled = false;
      if (r && r.ok) {
        data = r;
        if (body.ustama !== undefined) flash = r.ustama === null ? "✅ Ustama o'chirildi (belgilanmagan)" :
          "✅ Ustama: <b>" + esc(r.ustama) + "%</b>" + (r.misol ? " · kirim 10 000 → sotish " + esc(r.misol) + " so'm" : "");
        else flash = "✅ Chegara: <b>" + esc(r.chegara) + "</b>";
        App.haptic("success");
        draw();
        return;
      }
      msg.innerHTML = '<span class="err">' + errText(r) + "</span>";
      App.haptic("error");
    });
  }

  function removeMoslik(btn) {
    if (busy) return;
    if (btn.getAttribute("data-sure") !== "1") {
      btn.setAttribute("data-sure", "1");
      btn.textContent = "❌ Ha";
      return;
    }
    busy = true; btn.disabled = true;
    App.api("moslik_x", { row: Number(btn.getAttribute("data-r")), key: btn.getAttribute("data-k") }).then(function (r) {
      busy = false;
      if (!root) return;
      if (r && r.moslik) data = r;
      if (r && r.ok) { flash = "🗑 O'chirildi: " + esc(r.ochdi); App.haptic("success"); draw(); return; }
      if (r && r.err === "yoq") { flash = ERR.yoq; draw(); return; }
      btn.disabled = false;
      btn.textContent = "⚠️";
      App.haptic("error");
    });
  }

  function load() {
    root.innerHTML = '<p class="muted">Yuklanyapti...</p>';
    App.api("sozlama").then(function (r) {
      if (!root) return;
      if (!r || !r.ok) {
        root.innerHTML = "<h1>⚙️ Sozlamalar</h1><div class=\"card\"><p class=\"err\">" + errText(r) + "</p></div>" +
          '<div class="pn-foot"><button class="btn secondary" id="sz-retry">🔄 Qayta urinish</button></div>';
        root.querySelector("#sz-retry").addEventListener("click", load);
        return;
      }
      data = r;
      draw();
    });
  }

  App.register("sozlama", {
    render: function (el) { root = el; flash = ""; mq = ""; load(); },
    destroy: function () { root = null; }
  });
})();
