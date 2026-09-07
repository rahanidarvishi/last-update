"use strict";
var PEND_FORM = { amount:'', jy:null, jm:null, jd:null, platform:'', note:'' };
var PEND_STATUS = 'unbound';

async function loadPending(){
  var res = await api.get('/pending-deposits?status='+PEND_STATUS);
  renderPending(res.pendingDeposits);
}

function renderPending(list){
  var readOnly = !canEdit('pending');
  var rows = list.length ? list.map(function(p){
    return '<tr>'+
      '<td>'+jStr(p)+'</td>'+
      '<td class="amount-cell">'+fmtRial(p.amount)+'</td>'+
      '<td><span class="pill">'+escapeHtml(p.platform)+'</span></td>'+
      '<td>'+escapeHtml(p.note||'—')+'</td>'+
      '<td>'+(p.bound?'<span class="pill">متصل شده</span>':'<span class="pill pill-pending">قابل اتصال</span>')+'</td>'+
      '<td>'+(!p.bound && !readOnly ? '<button type="button" class="icon-btn pend-del" data-id="'+p.id+'">🗑</button>' : '')+'</td>'+
    '</tr>';
  }).join('') : '<tr><td colspan="6" class="empty-state">موردی یافت نشد</td></tr>';

  qs('#tabContent').innerHTML =
    '<div class="card"><h2>ثبت واریزی پیش از صدور واچر</h2>'+
      '<p style="font-size:12.5px;color:var(--text-muted);">وقتی قبل از صدور واچر، مشتری واریز کرد، همینجا ثبتش کن. بعداً هنگام ساخت رکورد می‌توانی این واریزی را به رکورد وصل کنی.</p>'+
      '<div class="grid-4">'+
        '<label>مبلغ (ریال)<input type="text" inputmode="numeric" id="pendAmount" value="'+(PEND_FORM.amount?fmtNum(PEND_FORM.amount):'')+'"></label>'+
        '<label>تاریخ'+dateBtnHtml('pendDateBtn', PEND_FORM, '')+'</label>'+
        '<label>پلتفرم<select id="pendPlatform"><option value="">انتخاب کنید</option><option value="سپهر" '+(PEND_FORM.platform==='سپهر'?'selected':'')+'>سپهر</option><option value="سپهران" '+(PEND_FORM.platform==='سپهران'?'selected':'')+'>سپهران</option><option value="فیش واریزی ملت" '+(PEND_FORM.platform==='فیش واریزی ملت'?'selected':'')+'>فیش واریزی ملت</option><option value="فیش واریزی پاسارگاد" '+(PEND_FORM.platform==='فیش واریزی پاسارگاد'?'selected':'')+'>فیش واریزی پاسارگاد</option></select></label>'+
        '<label>توضیحات (اختیاری)<input type="text" id="pendNote" value="'+escapeHtml(PEND_FORM.note)+'"></label>'+
      '</div>'+
      '<button type="button" class="btn-primary" id="pendSave" style="margin-top:10px;" '+(readOnly?'disabled':'')+'>ثبت</button>'+
      '<span class="save-msg" id="pendMsg"></span>'+
    '</div>'+
    '<div class="card"><div class="status-tabs">'+
      '<button type="button" class="status-tab '+(PEND_STATUS==='unbound'?'active':'')+'" data-s="unbound">قابل اتصال</button>'+
      '<button type="button" class="status-tab '+(PEND_STATUS==='bound'?'active':'')+'" data-s="bound">متصل شده</button>'+
      '<button type="button" class="status-tab '+(PEND_STATUS==='all'?'active':'')+'" data-s="all">همه</button>'+
    '</div>'+
    '<div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>مبلغ</th><th>پلتفرم</th><th>توضیحات</th><th>وضعیت</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '</div>';

  bindPending();
}

function bindPending(){
  var g = function(id){ return document.getElementById(id); };
  var amtEl = g('pendAmount');
  if(amtEl) amtEl.addEventListener('input', function(){
    var v=this.value.replace(/[^0-9]/g,''); this.value=v?fmtNum(v):''; PEND_FORM.amount=v;
  });
  var dateBtn = g('pendDateBtn');
  if(dateBtn) dateBtn.addEventListener('click', function(){
    openCalendar(this, PEND_FORM.jy?{jy:PEND_FORM.jy,jm:PEND_FORM.jm,jd:PEND_FORM.jd}:null, function(picked){
      PEND_FORM.jy=picked.jy; PEND_FORM.jm=picked.jm; PEND_FORM.jd=picked.jd;
      loadPending();
    });
  });
  if(g('pendPlatform')) g('pendPlatform').addEventListener('change', function(){ PEND_FORM.platform=this.value; });
  if(g('pendNote')) g('pendNote').addEventListener('input', function(){ PEND_FORM.note=this.value; });
  if(g('pendSave')) g('pendSave').addEventListener('click', async function(){
    if(!PEND_FORM.amount || !PEND_FORM.jy || !PEND_FORM.platform){ flashMsg('pendMsg','مبلغ، تاریخ و پلتفرم را کامل کنید', true); return; }
    try{
      await api.post('/pending-deposits', { amount:parseFloat(PEND_FORM.amount), jy:PEND_FORM.jy, jm:PEND_FORM.jm, jd:PEND_FORM.jd, platform:PEND_FORM.platform, note:PEND_FORM.note });
      PEND_FORM = { amount:'', jy:null, jm:null, jd:null, platform:'', note:'' };
      flashMsg('pendMsg','ثبت شد ✓', false);
      loadPending();
    }catch(e){ flashMsg('pendMsg', e.message, true); }
  });
  qsa('.status-tab[data-s]').forEach(function(btn){
    btn.addEventListener('click', function(){ PEND_STATUS = this.getAttribute('data-s'); loadPending(); });
  });
  qsa('.pend-del').forEach(function(btn){
    btn.addEventListener('click', async function(){
      if(!confirm('این پیش‌واریزی حذف شود؟')) return;
      try{
        await api.del('/pending-deposits/'+this.getAttribute('data-id'));
        loadPending();
      }catch(e){ alert(e.message); loadPending(); }
    });
  });
}
