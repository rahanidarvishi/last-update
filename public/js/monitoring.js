"use strict";
var MON_LOGIN_FILTER = { status:'all', username:'' };
var MON_NOTIFY_FORM = { telegramBotToken:'', telegramChatId:'', notifyOnLogin:false };

async function loadMonitoring(){
  var overview = await api.get('/monitoring/overview');
  var ns = await api.get('/monitoring/notification-settings');
  MON_NOTIFY_FORM.telegramChatId = ns.telegramChatId || '';
  MON_NOTIFY_FORM.notifyOnLogin = !!ns.notifyOnLogin;
  MON_NOTIFY_FORM.tokenSet = ns.telegramBotTokenSet;
  var params = [];
  if(MON_LOGIN_FILTER.status!=='all') params.push('status='+MON_LOGIN_FILTER.status);
  if(MON_LOGIN_FILTER.username) params.push('username='+encodeURIComponent(MON_LOGIN_FILTER.username));
  var loginsRes = await api.get('/monitoring/logins'+(params.length?('?'+params.join('&')):''));
  renderMonitoring(overview, loginsRes);
}

function fmtUptime(sec){
  var d = Math.floor(sec/86400), h = Math.floor((sec%86400)/3600), m = Math.floor((sec%3600)/60);
  var parts = [];
  if(d) parts.push(pDigits(d)+' روز');
  if(h) parts.push(pDigits(h)+' ساعت');
  parts.push(pDigits(m)+' دقیقه');
  return parts.join(' و ');
}
function timeAgoShort(iso){
  var diffMin = Math.round((Date.now() - new Date(iso).getTime())/60000);
  if(diffMin<1) return 'همین الان';
  if(diffMin<60) return pDigits(diffMin)+' دقیقه پیش';
  return pDigits(Math.round(diffMin/60))+' ساعت پیش';
}

function renderMonitoring(overview, loginsRes){
  var canE = canEdit('monitoring');
  var s = overview.server, c = overview.counts;

  var onlineHtml = overview.onlineUsers.length ? overview.onlineUsers.map(function(u){
    return '<div class="chip"><span>🟢 '+escapeHtml(u.fullName)+'</span><span style="color:var(--text-muted);font-size:11px;">'+timeAgoShort(u.lastActiveAt)+'</span></div>';
  }).join('') : '<div class="empty-state">در حال حاضر کسی فعال نیست</div>';

  var loginRows = loginsRes.logins.length ? loginsRes.logins.map(function(l){
    var statusPill = l.success ? '<span class="pill">✓ موفق</span>' : '<span class="pill pill-danger">✕ ناموفق'+(l.failReason?(' — '+escapeHtml(l.failReason)):'')+'</span>';
    return '<tr><td>'+new Date(l.at).toLocaleString('fa-IR')+'</td><td><b>'+escapeHtml(l.username||'—')+'</b></td>'+
      '<td style="direction:ltr;text-align:left;">'+escapeHtml(l.ip||'—')+'</td>'+
      '<td style="font-size:11px;color:var(--text-muted);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escapeHtml(l.userAgent||'—')+'</td>'+
      '<td>'+statusPill+'</td></tr>';
  }).join('') : '<tr><td colspan="5" class="empty-state">موردی یافت نشد</td></tr>';

  qs('#tabContent').innerHTML =
    '<div class="grid-4">'+
      statCard('کاربران آنلاین (۵ دقیقه اخیر)', pDigits(overview.onlineUsers.length), '', 'users')+
      statCard('ورودهای موفق امروز', pDigits(c.loginsToday), '', 'profit')+
      statCard('تلاش‌های ناموفق امروز', pDigits(c.failedLoginsToday), c.failedLoginsToday>0?'cost':'', 'warn')+
      statCard('مدت روشن بودن سرور', fmtUptime(s.uptimeSeconds), '', 'clock')+
    '</div>'+

    '<div class="card"><h2>کاربران آنلاین اکنون</h2>'+onlineHtml+'</div>'+

    '<div class="card"><h2>وضعیت سرور</h2><div class="grid-3">'+
      statCard('نسخه Node.js', s.nodeVersion, '')+
      statCard('سیستم‌عامل', s.platform, '')+
      statCard('حافظه برنامه (RSS)', pDigits(s.memory.rssMb)+' MB از '+pDigits(s.memory.totalMb)+' MB کل', '')+
    '</div></div>'+

    '<div class="card"><h2>اعلان ورود (تلگرام)</h2>'+
      '<p style="font-size:12.5px;color:var(--text-muted);">اگر می‌خواهید هر بار کسی وارد سیستم شد، یک پیام تلگرام دریافت کنید، یک ربات تلگرام بسازید (از BotFather) و توکن و شناسه چت خودتان را اینجا وارد کنید.</p>'+
      (canE ? '<div class="grid-3">'+
        '<label>توکن ربات تلگرام'+(MON_NOTIFY_FORM.tokenSet?' (ثبت شده — برای تغییر دوباره وارد کنید)':'')+'<input type="text" id="monBotToken" placeholder="'+(MON_NOTIFY_FORM.tokenSet?'●●●●●●●●●●':'123456:ABC-DEF...')+'"></label>'+
        '<label>شناسه چت (Chat ID)<input type="text" id="monChatId" value="'+escapeHtml(MON_NOTIFY_FORM.telegramChatId)+'"></label>'+
        '<label style="flex-direction:row;align-items:center;gap:8px;justify-content:flex-start;padding-top:22px;"><input type="checkbox" id="monNotifyToggle" '+(MON_NOTIFY_FORM.notifyOnLogin?'checked':'')+'> <span>فعال باشد</span></label>'+
      '</div><button type="button" class="btn-small" id="monSaveNotify" style="margin-top:10px;">ذخیره</button><span class="save-msg" id="monNotifyMsg"></span>' : '<div class="pill">'+(MON_NOTIFY_FORM.notifyOnLogin?'فعال':'غیرفعال')+'</div>')+
    '</div>'+

    '<div class="card"><h2>تاریخچه ورود کاربران</h2>'+
      '<div class="status-tabs">'+
        ['all','success','failed'].map(function(st){
          var labels={all:'همه',success:'موفق',failed:'ناموفق'};
          return '<button type="button" class="status-tab '+(MON_LOGIN_FILTER.status===st?'active':'')+'" data-st="'+st+'">'+labels[st]+'</button>';
        }).join('')+
      '</div>'+
      '<div class="filters"><input type="text" id="monUsernameFilter" placeholder="فیلتر بر اساس نام کاربری" value="'+escapeHtml(MON_LOGIN_FILTER.username)+'"></div>'+
      '<div class="table-wrap"><table><thead><tr><th>زمان</th><th>نام کاربری</th><th>IP</th><th>مرورگر</th><th>وضعیت</th></tr></thead><tbody>'+loginRows+'</tbody></table></div>'+
      '<div style="font-size:11px;color:var(--text-muted);margin-top:8px;">نمایش '+pDigits(loginsRes.logins.length)+' از '+pDigits(loginsRes.total)+' رکورد</div>'+
    '</div>';

  bindMonitoring();
}

function bindMonitoring(){
  var g = function(id){ return document.getElementById(id); };
  qsa('.status-tab[data-st]').forEach(function(btn){ btn.addEventListener('click', function(){ MON_LOGIN_FILTER.status=this.getAttribute('data-st'); loadMonitoring(); }); });
  if(g('monUsernameFilter')) g('monUsernameFilter').addEventListener('change', function(){ MON_LOGIN_FILTER.username=this.value; loadMonitoring(); });
  if(g('monSaveNotify')) g('monSaveNotify').addEventListener('click', async function(){
    var body = { telegramChatId: g('monChatId').value, notifyOnLogin: g('monNotifyToggle').checked };
    var tokenVal = g('monBotToken').value.trim();
    if(tokenVal) body.telegramBotToken = tokenVal;
    try{
      await api.post('/monitoring/notification-settings', body);
      flashMsg('monNotifyMsg','ذخیره شد ✓', false);
      loadMonitoring();
    }catch(e){ flashMsg('monNotifyMsg', e.message, true); }
  });
}
