"use strict";
var J = window.Jalali;

var S = { user:null, tab:'dashboard', settings:null, msgUsers:null, directory:null };

var TABS = [
  { key:'dashboard', label:'داشبورد', sub:'نمای کلی و آمار سیستم' },
  { key:'statusBoard', label:'وضعیت / مود روز', sub:'کی پای میزشه، کی سرش شلوغه' },
  { key:'newEntry', label:'ثبت جدید', sub:'ثبت واچر و رزرو تازه' },
  { key:'pending', label:'پیش‌واریزی', sub:'واریزی‌های قبل از صدور واچر' },
  { key:'records', label:'رکوردها', sub:'همه‌ی رزروهای ثبت‌شده' },
  { key:'debt', label:'بدهی به کارگزاران', sub:'مبالغ پرداخت‌نشده به کارگزاران' },
  { key:'credit', label:'بستانکاری آژانس‌ها', sub:'مانده‌حساب آژانس‌های همکار' },
  { key:'messenger', label:'پیام‌رسان و مرخصی', sub:'گفتگوها و درخواست‌های مرخصی' },
  { key:'describer', label:'توضیح‌ساز و لینک', sub:'تولید متن آماده کپی' },
  { key:'inventory', label:'پرواز و هتل', sub:'تعریف نرخ و ظرفیت' },
  { key:'booking', label:'رزرواسیون تور', sub:'رزرو کامل تور و صدور بلیت' },
  { key:'shifts', label:'شیفت‌بندی', sub:'شیفت‌های تیم و شیفت‌های من' },
  { key:'instructions', label:'دستورالعمل‌ها', sub:'دستورالعمل‌های ثبت‌شده بخش‌ها' },
  { key:'notes', label:'یادداشت‌های من', sub:'یادداشت‌های شخصی و کارهای مهم' },
  { key:'systemChecks', label:'تست و مانیتورینگ سیستم', sub:'خودآزمایی روزانه — فقط توسعه‌دهنده' },
  { key:'monitoring', label:'مانیتورینگ', sub:'ورودها و وضعیت سرور' },
  { key:'reports', label:'گزارش عملکرد', sub:'نمودار فروش، هزینه و سود' },
  { key:'settings', label:'تنظیمات', sub:'داده‌های پایه سیستم' },
  { key:'permissions', label:'سطح دسترسی', sub:'کاربران و نقش‌ها' },
  { key:'profile', label:'پروفایل من', sub:'عکس و اطلاعات شخصی' }
];

function tabIcon(key){
  var paths = {
    dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    statusBoard:'<circle cx="12" cy="12" r="8.5"/><path d="M8.5 10.5h.01M15.5 10.5h.01M8 15c1 1.3 2.4 2 4 2s3-.7 4-2"/>',
    newEntry:'<path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M12 12v6M9 15h6"/>',
    pending:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 3.2"/>',
    records:'<path d="M5 5h14M5 10h14M5 15h9"/>',
    debt:'<path d="M12 3v13"/><path d="M7.5 11.5 12 16l4.5-4.5"/><path d="M5 20h14"/>',
    credit:'<path d="M12 21V8"/><path d="M16.5 12.5 12 8l-4.5 4.5"/><path d="M5 4h14"/>',
    messenger:'<path d="M4 5h16v11H8l-4 4z"/>',
    describer:'<path d="M4 19.5 5 15l9.5-9.5 3 3L8 18l-4 1.5z"/><path d="M13 6.5l3 3"/>',
    inventory:'<path d="M4 21V9l6-4 6 4v12"/><path d="M10 21v-6h4v6"/><path d="M14 9h6v12h-6"/>',
    booking:'<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    shifts:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    instructions:'<path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M8 12h8M8 16h5"/>',
    notes:'<path d="M4 4h13l3 3v13H4z"/><path d="M17 4v4h3"/><path d="M8 10h7M8 14h7M8 18h4"/>',
    systemChecks:'<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>',
    monitoring:'<path d="M3 12h4l2-7 4 14 2-7h6"/>',
    reports:'<path d="M5 20V10M11 20V4M17 20v-7"/><path d="M3 20h18"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/>',
    permissions:'<path d="M12 3l7 3.5v5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5v-5z"/><path d="M9.5 12l1.8 1.8L15 10"/>',
    profile:'<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5"/>'
  };
  return '<svg class="nav-ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(paths[key]||'<circle cx="12" cy="12" r="8"/>')+'</svg>';
}

function canView(key){
  if(!S.user) return false;
  if(key === 'profile' || key === 'notes') return true; // self-service tabs, always available to every logged-in user
  if(S.user.isDeveloper) return true;
  if(key === 'permissions' || key === 'systemChecks') return false; // developer-only tabs — deliberately not part of MODULES either, so no role can ever be granted them
  var p = S.user.permissions && S.user.permissions[key];
  return !!(p && (p.view || p.edit));
}
function canEdit(key){
  if(!S.user) return false;
  if(S.user.isDeveloper) return true;
  var p = S.user.permissions && S.user.permissions[key];
  return !!(p && p.edit);
}

function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function fmtNum(n){ if(n==null || isNaN(n)) return ''; return Number(n).toLocaleString('en-US'); }
function fmtRial(n){ return J.toPersianDigits(fmtNum(Math.round(n||0))) + ' ریال'; }
function pDigits(n){ return J.toPersianDigits(n); }
function jStr(r){ return r && r.jy ? J.toPersianDigits(J.jalaliStrOf(r.jy,r.jm,r.jd)) : '—'; }
function flashMsg(elId, msg, isErr){
  var el = document.getElementById(elId);
  if(!el) return;
  el.textContent = msg;
  el.className = 'save-msg ' + (isErr?'err':'ok');
  setTimeout(function(){ if(el) el.textContent=''; }, 3500);
}
function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }
function initials(name){
  var parts = String(name||'').trim().split(/\s+/);
  var a = parts[0] ? parts[0][0] : '';
  var b = parts[1] ? parts[1][0] : '';
  return (a+b).toUpperCase() || 'U';
}

/* ================= Users directory (id -> {fullName,photoDataUrl,extension,position}) =================
   Loaded once and cached on S.directory; used so a user's profile photo can show up
   next to their name anywhere in the app (sidebar, status board, messenger, shifts...). */
async function ensureDirectory(force){
  if(S.directory && !force) return S.directory;
  var res = await api.get('/users/directory');
  var map = {};
  res.users.forEach(function(u){ map[u.id] = u; });
  S.directory = map;
  return S.directory;
}
function avatarHtml(photoDataUrl, name, size){
  size = size || 26;
  if(photoDataUrl){
    return '<img src="'+escapeHtml(photoDataUrl)+'" style="width:'+size+'px;height:'+size+'px;border-radius:50%;object-fit:cover;vertical-align:middle;flex:none;">';
  }
  return '<span style="display:inline-flex;width:'+size+'px;height:'+size+'px;border-radius:50%;background:var(--surface-alt);align-items:center;justify-content:center;font-size:'+Math.round(size*0.4)+'px;font-weight:700;color:var(--text-muted);vertical-align:middle;flex:none;">'+initials(name)+'</span>';
}
// Small avatar + name pair, looked up by userId from the cached directory — the common
// case used wherever a person's name is shown next to a message/status/shift.
function avatarNameHtml(userId, name, size){
  var dirUser = S.directory && userId ? S.directory[userId] : null;
  var photo = dirUser ? dirUser.photoDataUrl : '';
  var displayName = name != null ? name : (dirUser ? dirUser.fullName : '');
  return '<span style="display:inline-flex;align-items:center;gap:6px;">'+avatarHtml(photo, displayName, size)+'<span>'+escapeHtml(displayName)+'</span></span>';
}
var STAT_ICONS = {
  users:'<circle cx="9" cy="7" r="3.2"/><path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"/>',
  money:'<circle cx="11" cy="11" r="8.5"/><path d="M11 6.5v9M8.5 8.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.6c0 2.2-5 1-5 3.2 0 1 1 1.6 2.5 1.6s2.5-.5 2.5-1.5"/>',
  cost:'<path d="M11 3v13"/><path d="M5.5 11 11 16.5 16.5 11"/><path d="M3 20h16"/>',
  profit:'<path d="M11 19V6"/><path d="M16.5 10.5 11 5 5.5 10.5"/><path d="M3 20h16"/>',
  chart:'<path d="M4 18V9M10 18V4M16 18v-6"/><path d="M2 18h18"/>',
  clock:'<circle cx="11" cy="11" r="8.5"/><path d="M11 6.5v5l3.2 3.2"/>',
  warn:'<path d="M11 2 20 19H2z"/><path d="M11 8.5v4.5M11 15.5h.01"/>'
};
function statCard(label, value, cls, icon, trend){
  var ic = icon ? STAT_ICONS[icon] : STAT_ICONS.chart;
  return '<div class="stat-card '+(cls||'')+'">'+
    '<div class="stat-top"><div class="stat-icon"><svg width="19" height="19" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+ic+'</svg></div></div>'+
    '<div class="stat-label">'+label+'</div><div class="stat-value">'+value+'</div>'+
    (trend?('<div class="stat-trend'+(trend.down?' down':'')+'">'+(trend.down?'▼':'▲')+' '+trend.text+'</div>'):'')+
  '</div>';
}

/* ================= Init / Auth ================= */
async function init(){
  try{
    var me = await api.get('/auth/me');
    if(!me.user){ window.location.href='/login.html'; return; }
    S.user = me.user;
  }catch(e){ window.location.href='/login.html'; return; }
  if(!canView(S.tab)){
    var firstOk = TABS.find(function(t){return canView(t.key);});
    S.tab = firstOk ? firstOk.key : 'dashboard';
  }
  renderShell();
}

// Shared airplane glyph (Material "flight" icon path) — used for both the
// login-page logo and the sidebar brand mark, so the icon stays identical everywhere.
var PLANE_ICON_PATH = 'M21 16v-2l-8-5V3.5C13 2.67 12.33 2 11.5 2S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2.5 1.5V22l4-1 4 1v-1.5L13 19v-5.5z';
function planeIconSvg(size, color){
  return '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" xmlns="http://www.w3.org/2000/svg"><path d="'+PLANE_ICON_PATH+'" fill="'+(color||'#fff')+'"/></svg>';
}

function renderShell(){
  var app = document.getElementById('app');
  var visibleTabs = TABS.filter(function(t){ return canView(t.key); });
  var navHtml = visibleTabs.map(function(t){
    return '<button type="button" class="nav-item '+(S.tab===t.key?'active':'')+'" data-tab="'+t.key+'">'+tabIcon(t.key)+'<span>'+t.label+'</span></button>';
  }).join('');
  var currentTabInfo = visibleTabs.find(function(t){ return t.key===S.tab; }) || visibleTabs[0];

  app.innerHTML =
    '<aside class="sidebar">'+
      '<div class="sidebar-brand">'+
        '<div class="sidebar-brand-mark">'+planeIconSvg(24)+'</div>'+
        '<div class="sidebar-brand-text">سیستم اتوماسیون داخلی<div class="sub">رزرواسیون و تامین خارجی</div></div>'+
      '</div>'+
      '<nav class="sidebar-nav">'+navHtml+'</nav>'+
      '<div class="sidebar-footer">'+
        '<div class="sidebar-user" id="sidebarUserBtn" style="cursor:pointer;" title="پروفایل من">'+
          '<div class="sidebar-avatar">'+(S.user.photoDataUrl ? '<img src="'+S.user.photoDataUrl+'" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">' : initials(S.user.fullName))+'</div>'+
          '<div class="sidebar-user-text"><div class="name">'+escapeHtml(S.user.fullName)+'</div><div class="role">'+escapeHtml(S.user.roleName)+'</div></div>'+
        '</div>'+
        '<div class="sidebar-footer-actions">'+
          '<button type="button" class="btn-small" id="changePwBtn" style="flex:1;">تغییر رمز</button>'+
          '<button type="button" class="btn-small btn-ghost" id="logoutBtn" style="flex:1;">خروج</button>'+
        '</div>'+
      '</div>'+
    '</aside>'+
    '<div class="main-area">'+
      '<div class="topheader">'+
        '<div><h1>'+(currentTabInfo?currentTabInfo.label:'')+'</h1><div class="sub">'+(currentTabInfo?currentTabInfo.sub:'')+'</div></div>'+
      '</div>'+
      (S.user.mustChangePassword ? '<div class="card" style="border-color:var(--gold);background:var(--gold-tint);"><b style="color:var(--gold);">برای امنیت حساب، لطفاً رمز عبور خود را تغییر دهید.</b> <button type="button" class="btn-small" id="promptChangePw" style="margin-inline-start:10px;">تغییر رمز</button></div>' : '') +
      '<main id="tabContent"><div class="empty-state">در حال بارگذاری…</div></main>'+
    '</div>';

  qsa('.nav-item').forEach(function(btn){
    btn.addEventListener('click', function(){ switchTab(btn.getAttribute('data-tab')); });
  });
  var sidebarUserBtn = document.getElementById('sidebarUserBtn');
  if(sidebarUserBtn) sidebarUserBtn.addEventListener('click', function(){ switchTab('profile'); });
  document.getElementById('logoutBtn').addEventListener('click', async function(){
    await api.post('/auth/logout');
    window.location.href = '/login.html';
  });
  var pwBtn = document.getElementById('changePwBtn');
  if(pwBtn) pwBtn.addEventListener('click', openChangePasswordModal);
  var promptPw = document.getElementById('promptChangePw');
  if(promptPw) promptPw.addEventListener('click', openChangePasswordModal);

  loadTab(S.tab);
}

function switchTab(key){
  S.tab = key;
  qsa('.nav-item').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab')===key); });
  var info = TABS.find(function(t){ return t.key===key; });
  var h1 = document.querySelector('.topheader h1');
  var sub = document.querySelector('.topheader .sub');
  if(info && h1) h1.textContent = info.label;
  if(info && sub) sub.textContent = info.sub;
  loadTab(key);
}

function loadTab(key){
  var loaders = {
    dashboard: loadDashboard, statusBoard: loadStatusBoard, newEntry: loadNewEntry, pending: loadPending,
    records: loadRecords, debt: loadDebt, credit: loadCredit,
    messenger: loadMessenger, describer: loadDescriber, inventory: loadInventory, booking: loadBooking, shifts: loadShifts, instructions: loadInstructions, notes: loadNotes, systemChecks: loadSystemChecks, monitoring: loadMonitoring, reports: loadReports, settings: loadSettings,
    permissions: loadPermissions, profile: loadProfile
  };
  var fn = loaders[key];
  if(!fn){ qs('#tabContent').innerHTML = '<div class="empty-state">این بخش یافت نشد</div>'; return; }
  qs('#tabContent').innerHTML = '<div class="empty-state">در حال بارگذاری…</div>';
  fn().catch(function(e){
    qs('#tabContent').innerHTML = '<div class="card"><p style="color:var(--danger);">خطا: '+escapeHtml(e.message)+'</p></div>';
  });
}

/* ================= Change password modal ================= */
function openChangePasswordModal(){
  var overlayHtml =
    '<div id="pwOverlay" style="position:fixed;inset:0;background:rgba(15,26,46,.35);z-index:998;"></div>'+
    '<div id="pwPanel" style="position:fixed;z-index:999;top:50%;left:50%;transform:translate(-50%,-50%);width:360px;max-width:92vw;" class="card">'+
      '<h2>تغییر رمز عبور</h2>'+
      '<label>رمز فعلی<input type="password" id="pwCurrent"></label>'+
      '<label style="margin-top:10px;">رمز جدید (حداقل ۱۲ کاراکتر، شامل حرف بزرگ/کوچک/عدد یا کاراکتر خاص)<input type="password" id="pwNew"></label>'+
      '<div class="save-row" style="display:flex;gap:10px;margin-top:14px;align-items:center;">'+
        '<button type="button" class="btn-primary" id="pwSubmit">ثبت</button>'+
        '<button type="button" class="btn-small btn-ghost" id="pwCancel">انصراف</button>'+
        '<span class="save-msg" id="pwMsg"></span>'+
      '</div>'+
    '</div>';
  var div = document.createElement('div');
  div.innerHTML = overlayHtml;
  document.body.appendChild(div);
  function close(){ document.body.removeChild(div); }
  document.getElementById('pwOverlay').addEventListener('click', close);
  document.getElementById('pwCancel').addEventListener('click', close);
  document.getElementById('pwSubmit').addEventListener('click', async function(){
    try{
      await api.post('/auth/change-password', {
        currentPassword: document.getElementById('pwCurrent').value,
        newPassword: document.getElementById('pwNew').value
      });
      S.user.mustChangePassword = false;
      close();
      renderShell();
    }catch(e){ flashMsg('pwMsg', e.message, true); }
  });
}

/* ================= Dashboard ================= */
async function loadDashboard(){
  var res = await api.get('/reports/performance?period=month');
  var s = res.summary;
  qs('#tabContent').innerHTML =
    '<div class="grid-4">'+
      statCard('تعداد رکوردها', pDigits(s.recordCount), '', 'users') +
      statCard('مجموع فروش', fmtRial(s.totalSales), '', 'money') +
      statCard('مجموع هزینه خرید', fmtRial(s.totalCost), 'cost', 'cost') +
      statCard('سود کل', fmtRial(s.totalProfit), 'profit', 'profit') +
    '</div>'+
    '<div class="card"><h2>خوش آمدید، '+escapeHtml(S.user.fullName)+'</h2>'+
      '<p style="font-size:13px;color:var(--text-muted);">از تب‌های بالا برای مدیریت واچرها، واریزی‌ها، بدهی، پیام‌رسان و گزارش عملکرد استفاده کنید. سطح دسترسی شما توسط مدیر سیستم تعیین شده است.</p>'+
    '</div>';
}

/* ================= Shared settings cache (used across tabs for dropdowns) ================= */
async function ensureSettings(force){
  if(S.settings && !force) return S.settings;
  S.settings = await api.get('/settings');
  return S.settings;
}
function cityOptions(cities, selected){
  var opts = '<option value="">— انتخاب کنید —</option>';
  cities.forEach(function(c){ opts += '<option value="'+escapeHtml(c.name)+'" '+(selected===c.name?'selected':'')+'>'+escapeHtml(c.name)+'</option>'; });
  return opts;
}
// Same as cityOptions but the option value is the city's real ID rather than its name —
// needed wherever the selection is later sent to an endpoint that expects a cityId
// (e.g. adding a hotel, or picking a hotel's city in the tour booking form).
function cityIdOptions(cities, selectedId){
  var opts = '<option value="">— انتخاب کنید —</option>';
  cities.forEach(function(c){ opts += '<option value="'+c.id+'" '+(selectedId===c.id?'selected':'')+'>'+escapeHtml(c.name)+'</option>'; });
  return opts;
}
function listOptions(list, selected, placeholder){
  if(!list.length) return '<option value="">— '+(placeholder||'موردی ثبت نشده')+' —</option>';
  var opts = '<option value="">— انتخاب کنید —</option>';
  list.forEach(function(v){ opts += '<option value="'+escapeHtml(v)+'" '+(selected===v?'selected':'')+'>'+escapeHtml(v)+'</option>'; });
  return opts;
}

document.addEventListener('DOMContentLoaded', init);
