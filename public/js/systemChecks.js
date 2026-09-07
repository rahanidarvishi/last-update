"use strict";
var SC_STATE = { checks:[], runs:[], selected:null, running:false, expandedRunId:null };

var SC_STATUS_META = {
  ok:   { icon:'✅', label:'سالم',  cls:'' },
  warn: { icon:'⚠️', label:'هشدار', cls:'pill-pending' },
  fail: { icon:'❌', label:'خطا',   cls:'pill-danger' }
};

async function loadSystemChecks(){
  var res = await api.get('/system-checks');
  SC_STATE.checks = res.checks;
  SC_STATE.runs = res.runs;
  if(SC_STATE.selected === null){
    SC_STATE.selected = {};
    res.checks.forEach(function(c){ SC_STATE.selected[c.key] = true; });
  }
  if(SC_STATE.runs.length && SC_STATE.expandedRunId === null) SC_STATE.expandedRunId = SC_STATE.runs[0].id;
  renderSystemChecks();
}

function scGroupByCategory(list){
  var groups = {}; var order = [];
  list.forEach(function(item){
    var cat = item.category;
    if(!groups[cat]){ groups[cat]=[]; order.push(cat); }
    groups[cat].push(item);
  });
  return { groups:groups, order:order };
}

function scChecklistHtml(){
  var g = scGroupByCategory(SC_STATE.checks);
  return g.order.map(function(cat){
    var items = g.groups[cat];
    var rows = items.map(function(c){
      var checked = !!SC_STATE.selected[c.key];
      return '<label style="flex-direction:row;align-items:center;gap:8px;font-size:12.5px;margin:4px 0;">'+
        '<input type="checkbox" class="sc-check-toggle" data-key="'+c.key+'" '+(checked?'checked':'')+'>'+
        '<span>'+escapeHtml(c.label)+(c.requiresSession?' <span class="pill" style="font-size:10px;">فقط اجرای زنده</span>':'')+'</span>'+
      '</label>';
    }).join('');
    return '<div style="margin-bottom:10px;">'+
      '<div style="font-weight:700;font-size:13px;margin-bottom:4px;">'+escapeHtml(cat)+'</div>'+rows+
    '</div>';
  }).join('');
}

function scSummaryPillsHtml(summary){
  return '<div class="btn-group">'+
    '<span class="pill">'+pDigits(summary.ok||0)+' سالم</span>'+
    '<span class="pill pill-pending">'+pDigits(summary.warn||0)+' هشدار</span>'+
    '<span class="pill pill-danger">'+pDigits(summary.fail||0)+' خطا</span>'+
  '</div>';
}

function scResultRowHtml(r){
  var meta = SC_STATUS_META[r.status] || SC_STATUS_META.ok;
  var detailsHtml = '';
  if(r.details){
    var detailsText = Array.isArray(r.details) ? r.details.join('، ') : String(r.details);
    detailsHtml = '<div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">'+escapeHtml(detailsText)+'</div>';
  }
  return '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">'+
    '<div>'+
      '<div><b>'+meta.icon+' '+escapeHtml(r.label)+'</b></div>'+
      '<div style="font-size:12.5px;color:var(--text-muted);">'+escapeHtml(r.message)+'</div>'+
      detailsHtml+
    '</div>'+
    '<span class="pill '+meta.cls+'">'+meta.label+'</span>'+
  '</div>';
}

function scRunDetailsHtml(run){
  var g = scGroupByCategory(run.results);
  var body = g.order.map(function(cat){
    return '<div style="margin-top:10px;"><div style="font-weight:700;font-size:12.5px;margin-bottom:4px;">'+escapeHtml(cat)+'</div>'+
      g.groups[cat].map(scResultRowHtml).join('')+
    '</div>';
  }).join('');
  return '<div style="margin-top:10px;">'+
    (run.includeHttp ? '' : '<p style="font-size:11.5px;color:var(--text-muted);">این اجرا شامل تست کارکرد صفحات (HTTP) نبوده — فقط آزمون‌های داده/امنیت/زیرساخت اجرا شده‌اند.</p>')+
    body+
  '</div>';
}

function scRunHistoryRowHtml(run){
  var isOpen = SC_STATE.expandedRunId === run.id;
  var triggerLabel = run.triggeredBy === 'daily' ? '⏰ اجرای خودکار شبانه' : '👤 اجرای دستی';
  return '<div class="voucher-card">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer;" class="sc-run-toggle" data-id="'+run.id+'">'+
      '<div>'+
        '<div><b>'+triggerLabel+'</b></div>'+
        '<div style="font-size:11.5px;color:var(--text-muted);">'+new Date(run.startedAt).toLocaleString('fa-IR')+'</div>'+
      '</div>'+
      scSummaryPillsHtml(run.summary)+
    '</div>'+
    (isOpen ? scRunDetailsHtml(run) : '')+
  '</div>';
}

function renderSystemChecks(){
  var latest = SC_STATE.runs[0];
  var selectedCount = Object.keys(SC_STATE.selected).filter(function(k){ return SC_STATE.selected[k]; }).length;

  var latestHtml = latest ?
    '<div class="card"><div class="card-header-row"><h2>آخرین نتیجه</h2>'+scSummaryPillsHtml(latest.summary)+'</div>'+
      '<div style="font-size:11.5px;color:var(--text-muted);">'+new Date(latest.startedAt).toLocaleString('fa-IR')+' — '+(latest.triggeredBy==='daily'?'اجرای خودکار شبانه':'اجرای دستی')+'</div>'+
      scRunDetailsHtml(latest)+
    '</div>' :
    '<div class="card"><div class="empty-state">هنوز هیچ آزمونی اجرا نشده — از پایین شروع کنید</div></div>';

  qs('#tabContent').innerHTML =
    '<div class="card">'+
      '<h2>تست خودکار سیستم</h2>'+
      '<p style="font-size:12.5px;color:var(--text-muted);">هر شب یک‌بار به‌صورت خودکار آزمون‌های داده/امنیت/زیرساخت اجرا می‌شود و اگر مشکلی پیدا شود به تلگرام (در صورت تنظیم‌بودن) اطلاع می‌دهد. برای تست کارکرد واقعی صفحات (اینکه هر بخش واقعاً بالا می‌آید) باید از همین‌جا «اجرای الان» را بزنید — چون آن آزمون‌ها به نشست لاگین شما نیاز دارند.</p>'+
      '<div style="margin-top:10px;">'+scChecklistHtml()+'</div>'+
      '<div class="card-header-row" style="margin-top:6px;">'+
        '<div class="btn-group">'+
          '<button type="button" class="btn-small btn-ghost" id="scSelectAll">انتخاب همه</button>'+
          '<button type="button" class="btn-small btn-ghost" id="scSelectNone">هیچکدام</button>'+
        '</div>'+
        '<button type="button" class="btn-primary" id="scRunNow" '+(SC_STATE.running?'disabled':'')+'>'+(SC_STATE.running?'در حال اجرا…':'اجرای الان ('+pDigits(selectedCount)+' آزمون)')+'</button>'+
      '</div>'+
      '<span class="save-msg" id="scRunMsg"></span>'+
    '</div>'+
    latestHtml+
    (SC_STATE.runs.length > 1 ?
      '<div class="card"><h2>تاریخچه اجراها</h2>'+SC_STATE.runs.slice(1).map(scRunHistoryRowHtml).join('')+'</div>' : '');

  bindSystemChecks();
}

function bindSystemChecks(){
  var g = function(id){ return document.getElementById(id); };

  qsa('.sc-check-toggle').forEach(function(cb){
    cb.addEventListener('change', function(){ SC_STATE.selected[this.getAttribute('data-key')] = this.checked; renderSystemChecks(); });
  });
  if(g('scSelectAll')) g('scSelectAll').addEventListener('click', function(){
    SC_STATE.checks.forEach(function(c){ SC_STATE.selected[c.key] = true; }); renderSystemChecks();
  });
  if(g('scSelectNone')) g('scSelectNone').addEventListener('click', function(){
    SC_STATE.checks.forEach(function(c){ SC_STATE.selected[c.key] = false; }); renderSystemChecks();
  });
  if(g('scRunNow')) g('scRunNow').addEventListener('click', async function(){
    var onlyKeys = Object.keys(SC_STATE.selected).filter(function(k){ return SC_STATE.selected[k]; });
    if(!onlyKeys.length){ flashMsg('scRunMsg','حداقل یک آزمون را انتخاب کنید', true); return; }
    SC_STATE.running = true; renderSystemChecks();
    try{
      var res = await api.post('/system-checks/run', { onlyKeys: onlyKeys });
      SC_STATE.runs.unshift(res.run);
      SC_STATE.expandedRunId = res.run.id;
      SC_STATE.running = false;
      renderSystemChecks();
    }catch(e){
      SC_STATE.running = false;
      renderSystemChecks();
      flashMsg('scRunMsg', e.message, true);
    }
  });
  qsa('.sc-run-toggle').forEach(function(row){
    row.addEventListener('click', function(){
      var id = this.getAttribute('data-id');
      SC_STATE.expandedRunId = (SC_STATE.expandedRunId === id) ? null : id;
      renderSystemChecks();
    });
  });
}
