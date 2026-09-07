'use strict';
/* =========================================================================
   اجرای شبانه‌ی خودکار «تست خودکار سیستم». هیچ کاربر لاگین‌شده‌ای در این
   لحظه وجود ندارد، پس فقط آزمون‌های داده/SQL/امنیت اجرا می‌شوند (بدون تست
   کارکرد صفحات که به نشست واقعی نیاز دارد — آن‌ها فقط با «اجرای الان» از
   داخل پنل اجرا می‌شوند). اگر چیزی غیر از «سالم» بود، همان روش تلگرامی که
   routes/auth.js برای اعلان ورود استفاده می‌کند را برای اعلان به توسعه‌دهنده
   به کار می‌بریم.
   ========================================================================= */
var dbMod = require('../db');
var uid = require('./id').uid;
var systemChecks = require('./systemChecks');

var CHECK_EVERY_MS = 30 * 60 * 1000; // هر ۳۰ دقیقه چک کن که آیا روز عوض شده
var MAX_HISTORY = 30;

function todayKey() {
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function notifyTelegramIfProblems(data, run) {
  var ns = data.notificationSettings;
  if (!ns || !ns.telegramBotToken || !ns.telegramChatId) return;
  var problems = run.results.filter(function (r) { return r.status !== 'ok'; });
  if (!problems.length) return; // فقط وقتی مشکلی هست مزاحم می‌شویم، نه هر شب که همه‌چیز سالم است
  var lines = problems.slice(0, 15).map(function (r) {
    return (r.status === 'fail' ? '❌' : '⚠️') + ' ' + r.label + ': ' + r.message;
  });
  var text = '🔧 تست خودکار شبانه‌ی سیستم درویشی — ' + problems.length + ' مورد نیاز به بررسی دارد:\n' +
    lines.join('\n') + (problems.length > 15 ? '\n… و ' + (problems.length - 15) + ' مورد دیگر' : '') +
    '\n\nجزئیات کامل در تب «تست و مانیتورینگ سیستم».';
  var url = 'https://api.telegram.org/bot' + ns.telegramBotToken + '/sendMessage';
  fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: ns.telegramChatId, text: text })
  }).catch(function (e) { console.error('اعلان تلگرام تست خودکار شبانه ناموفق بود:', e.message); });
}

function runAndStore(triggeredBy) {
  return systemChecks.runAll({ includeHttp: false }).then(function (run) {
    var data = dbMod.db();
    run.id = uid('chk');
    run.triggeredBy = triggeredBy;
    data.systemCheckRuns.unshift(run);
    if (data.systemCheckRuns.length > MAX_HISTORY) data.systemCheckRuns.length = MAX_HISTORY;
    dbMod.saveSync();
    if (triggeredBy === 'daily') notifyTelegramIfProblems(data, run);
    return run;
  });
}

function startDailyScheduler() {
  function tick() {
    var data = dbMod.db();
    var key = todayKey();
    if (data.meta.lastDailyCheckKey === key) return;
    data.meta.lastDailyCheckKey = key;
    dbMod.saveSync();
    runAndStore('daily').catch(function (e) { console.error('اجرای تست خودکار شبانه با خطا مواجه شد:', e.message); });
  }
  // کمی بعد از بالا آمدن سرور اجرا کن (نه فوری، تا مهاجرت‌ها/بوت کامل تثبیت شود)، بعد هر ۳۰ دقیقه بررسی کن.
  setTimeout(tick, 60 * 1000);
  setInterval(tick, CHECK_EVERY_MS);
}

module.exports = { startDailyScheduler: startDailyScheduler, runAndStore: runAndStore };
