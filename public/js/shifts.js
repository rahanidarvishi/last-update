"use strict";
var SH_NEW = { userId:'', date:null, startTime:'', endTime:'', note:'' };
var SH_BULK = { mode:'weekly', userId:'', anchor:null, weekdays:[0,1,2,3,4,5,6], startTime:'', endTime:'', note:'', overwrite:false };
var SH_EDIT_ID = null; // shift currently open in inline edit mode
var SH_CACHE = { shifts:[], myStaff:[] };
var SH_WEEKDAY_LABELS = ['ش','ی','د','س','چ','پ','ج']; // 0=شنبه ... 6=جمعه

async function loadShifts(){
  await ensureDirectory();
  var res = await api.get('/shifts');
  SH_CACHE.shifts = res.shifts; SH_CACHE.myStaff = res.myStaff;
  renderShifts(res.shifts, res.myStaff);
}
// Re-render from the last fetched data (no network round-trip) — used for
// purely local UI state changes like switching هفتگی/ماهانه or picking a date.
function rerenderShifts(){ renderShifts(SH_CACHE.shifts, SH_CACHE.myStaff); }

// Same weekday convention as the calendar widget: 0=شنبه ... 6=جمعه.
function shPersianWeekday(jy, jm, jd){
  var g = J.toGregorian(jy, jm, jd);
  var jsDay = new Date(g.gy, g.gm-1, g.gd).getDay(); // 0=Sunday
  return (jsDay + 1) % 7;
}
// The Saturday..Friday week that contains the given Jalali date.
function shWeekRangeContaining(jy, jm, jd){
  var g = J.toGregorian(jy, jm, jd);
  var dt = new Date(g.gy, g.gm-1, g.gd);
  var wd = (dt.getDay() + 1) % 7;
  var start = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - wd);
  var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return {
    from: J.toJalaali(start.getFullYear(), start.getMonth()+1, start.getDate()),
    to: J.toJalaali(end.getFullYear(), end.getMonth()+1, end.getDate())
  };
}
// The full Jalali month that contains the given date.
function shMonthRangeContaining(jy, jm){
  return { from:{jy:jy,jm:jm,jd:1}, to:{jy:jy,jm:jm,jd:jalaaliMonthLength(jy,jm)} };
}

function shiftRow(s, canManage){
  if(SH_EDIT_ID === s.id) return shiftEditRowHtml(s);
  return '<div class="voucher-card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">'+
    '<div>'+
      '<div style="display:flex;align-items:center;gap:8px;">'+avatarNameHtml(s.userId, s.userName, 22)+
        '<span class="pill">'+jStr({jy:s.jy,jm:s.jm,jd:s.jd})+'</span>'+
        '<span style="font-size:12.5px;color:var(--text-muted);">'+escapeHtml(s.startTime)+' تا '+escapeHtml(s.endTime)+'</span>'+
      '</div>'+
      (s.note ? '<div style="font-size:12.5px;margin-top:4px;">'+escapeHtml(s.note)+'</div>' : '')+
      '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">ثبت‌شده توسط '+escapeHtml(s.createdByName)+'</div>'+
    '</div>'+
    (canManage ? '<div class="btn-group"><button type="button" class="icon-btn shift-edit-start" data-id="'+s.id+'" title="اصلاح">✎</button><button type="button" class="icon-btn shift-delete" data-id="'+s.id+'" title="حذف">🗑</button></div>' : '')+
  '</div>';
}

function shiftEditRowHtml(s){
  return '<div class="voucher-card" style="display:flex;flex-direction:column;gap:8px;">'+
    '<div style="display:flex;align-items:center;gap:8px;">'+avatarNameHtml(s.userId, s.userName, 22)+
      '<span class="pill">'+jStr({jy:s.jy,jm:s.jm,jd:s.jd})+'</span>'+
    '</div>'+
    '<div class="grid-4">'+
      '<label>ساعت شروع<input type="time" id="shEditStart" value="'+escapeHtml(s.startTime)+'"></label>'+
      '<label>ساعت پایان<input type="time" id="shEditEnd" value="'+escapeHtml(s.endTime)+'"></label>'+
    '</div>'+
    '<label>توضیح<input type="text" id="shEditNote" value="'+escapeHtml(s.note||'')+'"></label>'+
    '<div class="card-header-row"><button type="button" class="btn-primary btn-small shift-edit-save" data-id="'+s.id+'">ذخیره</button><button type="button" class="btn-small btn-ghost shift-edit-cancel">انصراف</button><span class="save-msg" id="shEditMsg"></span></div>'+
  '</div>';
}

function shBulkWeekdayCheckboxes(){
  return '<div style="display:flex;gap:10px;flex-wrap:wrap;">'+
    SH_WEEKDAY_LABELS.map(function(lb, i){
      var checked = SH_BULK.weekdays.indexOf(i) !== -1;
      return '<label style="cursor:pointer;display:flex;align-items:center;gap:4px;font-size:13px;">'+
        '<input type="checkbox" class="sh-wd" data-wd="'+i+'" '+(checked?'checked':'')+'>'+lb+
      '</label>';
    }).join('')+
  '</div>';
}

function shBulkFormHtml(myStaff){
  var staffOpts = '<option value="">— انتخاب نیرو —</option>'+myStaff.map(function(u){ return '<option value="'+u.id+'" '+(SH_BULK.userId===u.id?'selected':'')+'>'+escapeHtml(u.fullName)+'</option>'; }).join('');
  var isWeekly = SH_BULK.mode === 'weekly';
  var anchorLabel = isWeekly ? 'یک روز از هفتهٔ موردنظر' : 'یک روز از ماه موردنظر';
  var rangeLabel = '';
  if(SH_BULK.anchor){
    var range = isWeekly ? shWeekRangeContaining(SH_BULK.anchor.jy, SH_BULK.anchor.jm, SH_BULK.anchor.jd)
                          : shMonthRangeContaining(SH_BULK.anchor.jy, SH_BULK.anchor.jm);
    rangeLabel = 'بازهٔ اعمال: از '+jStr(range.from)+' تا '+jStr(range.to);
  }
  return '<div class="card">'+
    '<h2>چیدن شیفت هفتگی / ماهانه</h2>'+
    '<div class="btn-group" style="margin-bottom:12px;">'+
      '<button type="button" class="btn-small '+(isWeekly?'btn-primary':'btn-ghost')+'" id="shModeWeekly">هفتگی</button>'+
      '<button type="button" class="btn-small '+(!isWeekly?'btn-primary':'btn-ghost')+'" id="shModeMonthly">ماهانه</button>'+
    '</div>'+
    '<div class="grid-4">'+
      '<label>نیرو<select id="shBulkUser">'+staffOpts+'</select></label>'+
      '<label>'+anchorLabel+dateBtnHtml('shBulkAnchor', SH_BULK.anchor, '')+'</label>'+
      '<label>ساعت شروع<input type="time" id="shBulkStart" value="'+escapeHtml(SH_BULK.startTime)+'"></label>'+
      '<label>ساعت پایان<input type="time" id="shBulkEnd" value="'+escapeHtml(SH_BULK.endTime)+'"></label>'+
    '</div>'+
    (rangeLabel ? '<div style="font-size:12.5px;color:var(--text-muted);margin-top:8px;">'+rangeLabel+'</div>' : '')+
    '<div style="margin-top:10px;">'+
      '<div style="font-size:12.5px;color:var(--text-muted);margin-bottom:6px;">در چه روزهایی از هفته اعمال شود</div>'+
      shBulkWeekdayCheckboxes()+
    '</div>'+
    '<label style="margin-top:10px;">توضیح (اختیاری)<input type="text" id="shBulkNote" value="'+escapeHtml(SH_BULK.note)+'"></label>'+
    '<label style="margin-top:10px;display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;">'+
      '<input type="checkbox" id="shBulkOverwrite" '+(SH_BULK.overwrite?'checked':'')+'> روزهایی که از قبل شیفت دارند هم بازنویسی شوند'+
    '</label>'+
    '<div class="card-header-row" style="margin-top:10px;">'+
      '<button type="button" class="btn-primary" id="shBulkSubmit">'+(isWeekly?'چیدن شیفت هفتگی':'چیدن شیفت ماهانه')+'</button>'+
      '<span class="save-msg" id="shBulkMsg"></span>'+
    '</div>'+
    '<div style="font-size:11.5px;color:var(--text-muted);margin-top:8px;">بعد از چیدن گروهی، برای اصلاح یا حذف یک روز خاص کافی است روی «✎» یا «🗑» همان روز در فهرست پایین بزنید.</div>'+
  '</div>';
}

function renderShifts(shifts, myStaff){
  var canE = canEdit('shifts');
  var sorted = shifts.slice().sort(function(a,b){ return (a.jy*10000+a.jm*100+a.jd) - (b.jy*10000+b.jm*100+b.jd); });
  var mine = sorted.filter(function(s){ return s.userId===S.user.id; });
  var teamIds = {}; myStaff.forEach(function(u){ teamIds[u.id]=true; });
  var team = sorted.filter(function(s){ return teamIds[s.userId]; });

  var formHtml = '';
  if(canE && myStaff.length){
    var staffOpts = '<option value="">— انتخاب نیرو —</option>'+myStaff.map(function(u){ return '<option value="'+u.id+'" '+(SH_NEW.userId===u.id?'selected':'')+'>'+escapeHtml(u.fullName)+'</option>'; }).join('');
    formHtml = '<div class="card"><h2>ثبت شیفت تکی</h2>'+
      '<div class="grid-4">'+
        '<label>نیرو<select id="shNewUser">'+staffOpts+'</select></label>'+
        '<label>تاریخ'+dateBtnHtml('shNewDate', SH_NEW.date, '')+'</label>'+
        '<label>ساعت شروع<input type="time" id="shNewStart" value="'+escapeHtml(SH_NEW.startTime)+'"></label>'+
        '<label>ساعت پایان<input type="time" id="shNewEnd" value="'+escapeHtml(SH_NEW.endTime)+'"></label>'+
      '</div>'+
      '<label style="margin-top:10px;">توضیح (اختیاری)<input type="text" id="shNewNote" value="'+escapeHtml(SH_NEW.note)+'"></label>'+
      '<div class="card-header-row" style="margin-top:10px;"><button type="button" class="btn-primary" id="shNewSubmit">ثبت شیفت</button><span class="save-msg" id="shNewMsg"></span></div>'+
    '</div>'+shBulkFormHtml(myStaff);
  } else if(canE && !myStaff.length){
    formHtml = '<div class="card"><p style="font-size:12.5px;color:var(--text-muted);">شما فعلاً نیرویی زیرمجموعه خودتان ندارید — برای اینکه بتوانید برای کسی شیفت تعریف کنید، باید از بخش «سطح دسترسی» آن فرد را زیرمجموعهٔ خودتان کنید.</p></div>';
  }

  var teamHtml = myStaff.length ?
    '<div class="card"><h2>شیفت‌های تیم من</h2>'+(team.length ? team.map(function(s){ return shiftRow(s, canE); }).join('') : '<div class="empty-state">هنوز شیفتی ثبت نشده</div>')+'</div>' : '';

  qs('#tabContent').innerHTML = formHtml+
    '<div class="card"><h2>شیفت‌های من</h2>'+(mine.length ? mine.map(function(s){ return shiftRow(s, false); }).join('') : '<div class="empty-state">شیفتی برای شما ثبت نشده</div>')+'</div>'+
    teamHtml;

  bindShifts();
}

function bindShifts(){
  var g = function(id){ return document.getElementById(id); };

  // --- single-day form (unchanged) ---
  if(g('shNewUser')) g('shNewUser').addEventListener('change', function(){ SH_NEW.userId=this.value; });
  if(g('shNewStart')) g('shNewStart').addEventListener('change', function(){ SH_NEW.startTime=this.value; });
  if(g('shNewEnd')) g('shNewEnd').addEventListener('change', function(){ SH_NEW.endTime=this.value; });
  if(g('shNewNote')) g('shNewNote').addEventListener('input', function(){ SH_NEW.note=this.value; });
  var dateBtn = g('shNewDate');
  if(dateBtn) dateBtn.addEventListener('click', function(){
    openCalendar(this, SH_NEW.date, function(picked){ SH_NEW.date=picked; loadShifts(); });
  });
  if(g('shNewSubmit')) g('shNewSubmit').addEventListener('click', async function(){
    if(!SH_NEW.userId){ flashMsg('shNewMsg','نیرو را انتخاب کنید', true); return; }
    if(!SH_NEW.date){ flashMsg('shNewMsg','تاریخ شیفت را انتخاب کنید', true); return; }
    if(!SH_NEW.startTime || !SH_NEW.endTime){ flashMsg('shNewMsg','ساعت شروع و پایان را وارد کنید', true); return; }
    try{
      await api.post('/shifts', {
        userId: SH_NEW.userId, jy: SH_NEW.date.jy, jm: SH_NEW.date.jm, jd: SH_NEW.date.jd,
        startTime: SH_NEW.startTime, endTime: SH_NEW.endTime, note: SH_NEW.note
      });
      SH_NEW = { userId:'', date:null, startTime:'', endTime:'', note:'' };
      flashMsg('shNewMsg','شیفت ثبت شد ✓', false);
      loadShifts();
    }catch(e){ flashMsg('shNewMsg', e.message, true); }
  });

  // --- weekly/monthly bulk layout form ---
  if(g('shModeWeekly')) g('shModeWeekly').addEventListener('click', function(){
    if(SH_BULK.mode==='weekly') return;
    SH_BULK.mode='weekly'; SH_BULK.anchor=null; SH_BULK.weekdays=[0,1,2,3,4,5,6];
    rerenderShifts();
  });
  if(g('shModeMonthly')) g('shModeMonthly').addEventListener('click', function(){
    if(SH_BULK.mode==='monthly') return;
    SH_BULK.mode='monthly'; SH_BULK.anchor=null; SH_BULK.weekdays=[0,1,2,3,4,5,6];
    rerenderShifts();
  });
  if(g('shBulkUser')) g('shBulkUser').addEventListener('change', function(){ SH_BULK.userId=this.value; });
  if(g('shBulkStart')) g('shBulkStart').addEventListener('change', function(){ SH_BULK.startTime=this.value; });
  if(g('shBulkEnd')) g('shBulkEnd').addEventListener('change', function(){ SH_BULK.endTime=this.value; });
  if(g('shBulkNote')) g('shBulkNote').addEventListener('input', function(){ SH_BULK.note=this.value; });
  if(g('shBulkOverwrite')) g('shBulkOverwrite').addEventListener('change', function(){ SH_BULK.overwrite=this.checked; });
  var bulkAnchorBtn = g('shBulkAnchor');
  if(bulkAnchorBtn) bulkAnchorBtn.addEventListener('click', function(){
    openCalendar(this, SH_BULK.anchor, function(picked){ SH_BULK.anchor=picked; rerenderShifts(); });
  });
  qsa('.sh-wd').forEach(function(cb){
    cb.addEventListener('change', function(){
      var wd = parseInt(this.getAttribute('data-wd'), 10);
      var idx = SH_BULK.weekdays.indexOf(wd);
      if(this.checked){ if(idx===-1) SH_BULK.weekdays.push(wd); }
      else if(idx!==-1){ SH_BULK.weekdays.splice(idx,1); }
    });
  });
  if(g('shBulkSubmit')) g('shBulkSubmit').addEventListener('click', async function(){
    if(!SH_BULK.userId){ flashMsg('shBulkMsg','نیرو را انتخاب کنید', true); return; }
    if(!SH_BULK.anchor){ flashMsg('shBulkMsg', SH_BULK.mode==='weekly' ? 'یک روز از هفتهٔ موردنظر را انتخاب کنید' : 'یک روز از ماه موردنظر را انتخاب کنید', true); return; }
    if(!SH_BULK.startTime || !SH_BULK.endTime){ flashMsg('shBulkMsg','ساعت شروع و پایان را وارد کنید', true); return; }
    if(!SH_BULK.weekdays.length){ flashMsg('shBulkMsg','حداقل یک روز از هفته را انتخاب کنید', true); return; }
    var range = SH_BULK.mode==='weekly'
      ? shWeekRangeContaining(SH_BULK.anchor.jy, SH_BULK.anchor.jm, SH_BULK.anchor.jd)
      : shMonthRangeContaining(SH_BULK.anchor.jy, SH_BULK.anchor.jm);
    try{
      var res = await api.post('/shifts/bulk', {
        userId: SH_BULK.userId, from: range.from, to: range.to, weekdays: SH_BULK.weekdays,
        startTime: SH_BULK.startTime, endTime: SH_BULK.endTime, note: SH_BULK.note, overwrite: SH_BULK.overwrite
      });
      var n = res.created.length + res.updated.length;
      var msg = n+' شیفت ثبت شد';
      if(res.skipped) msg += ' — '+res.skipped+' روز چون قبلاً شیفت داشتند رد شد (برای بازنویسی، گزینهٔ بالا را فعال کنید)';
      flashMsg('shBulkMsg', msg, false);
      loadShifts();
    }catch(e){ flashMsg('shBulkMsg', e.message, true); }
  });

  // --- per-day correction (edit) and delete ---
  qsa('.shift-edit-start').forEach(function(btn){
    btn.addEventListener('click', function(){ SH_EDIT_ID = this.getAttribute('data-id'); rerenderShifts(); });
  });
  qsa('.shift-edit-cancel').forEach(function(btn){
    btn.addEventListener('click', function(){ SH_EDIT_ID = null; rerenderShifts(); });
  });
  qsa('.shift-edit-save').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var id = this.getAttribute('data-id');
      var startTime = g('shEditStart').value, endTime = g('shEditEnd').value, note = g('shEditNote').value;
      try{
        await api.patch('/shifts/'+id, { startTime: startTime, endTime: endTime, note: note });
        SH_EDIT_ID = null;
        loadShifts();
      }catch(e){ flashMsg('shEditMsg', e.message, true); }
    });
  });
  qsa('.shift-delete').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این شیفت حذف شود؟')) return;
    try{ await api.del('/shifts/'+this.getAttribute('data-id')); loadShifts(); }
    catch(e){ alert(e.message); }
  }); });
}
