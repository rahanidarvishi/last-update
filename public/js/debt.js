"use strict";
var DEBT_FILTER = { agent:'', search:'', status:'unpaid' };
var DEBT_SELECTED = {};
var LAST_DEBT_LINES = [];

async function loadDebt(){
  var params = [];
  if(DEBT_FILTER.agent) params.push('agent='+encodeURIComponent(DEBT_FILTER.agent));
  if(DEBT_FILTER.search) params.push('search='+encodeURIComponent(DEBT_FILTER.search));
  if(DEBT_FILTER.status!=='all') params.push('status='+DEBT_FILTER.status);
  var res = await api.get('/debt'+(params.length?('?'+params.join('&')):''));
  LAST_DEBT_LINES = res.lines;
  renderDebt(res);
}

function renderDebt(res){
  var canE = canEdit('debt');
  var agents = Object.keys(res.unpaidTotalsByAgent);
  var grandTotals = {};
  agents.forEach(function(a){ Object.keys(res.unpaidTotalsByAgent[a]).forEach(function(c){ grandTotals[c]=(grandTotals[c]||0)+res.unpaidTotalsByAgent[a][c]; }); });
  var grandHtml = Object.keys(grandTotals).length ? Object.keys(grandTotals).map(function(c){ return '<span class="pill" style="margin-left:6px;">'+pDigits(fmtNum(grandTotals[c]))+' '+escapeHtml(c)+'</span>'; }).join('') : '<span style="color:var(--text-muted);">بدهی پرداخت‌نشده‌ای وجود ندارد</span>';

  var agentChips = agents.length ? agents.map(function(a){
    var active = DEBT_FILTER.agent===a;
    var totalsHtml = Object.keys(res.unpaidTotalsByAgent[a]).map(function(c){ return '<span class="pill" style="margin-left:6px;">'+pDigits(fmtNum(res.unpaidTotalsByAgent[a][c]))+' '+escapeHtml(c)+'</span>'; }).join('');
    return '<button type="button" class="debt-agent-chip" data-agent="'+escapeHtml(a)+'" style="display:flex;justify-content:space-between;width:100%;border:1px solid '+(active?'var(--primary)':'var(--border)')+';background:'+(active?'var(--primary-tint)':'var(--surface-alt)')+';border-radius:9px;padding:10px 12px;margin-bottom:8px;cursor:pointer;font-family:var(--font);"><b>'+escapeHtml(a)+'</b><span>'+totalsHtml+'</span></button>';
  }).join('') : '<div class="empty-state">هزینه‌ای برای کارگزاران ثبت نشده</div>';

  var selectedCount = Object.keys(DEBT_SELECTED).filter(function(k){return DEBT_SELECTED[k];}).length;

  var rows = res.lines.length ? res.lines.map(function(l){
    var cb = !l.debtSettled && canE ? '<input type="checkbox" class="debt-cb" data-vid="'+l.voucherId+'" '+(DEBT_SELECTED[l.voucherId]?'checked':'')+'>' : '';
    var statusCell = l.debtSettled ?
      ('<span class="pill">✓ پرداخت‌شده</span>'+(l.debtSettledAt?('<div style="font-size:11px;color:var(--text-muted);">'+escapeHtml(l.debtSettledAt)+'</div>'):'')+(canE?'<button type="button" class="btn-small debt-revert" data-vid="'+l.voucherId+'" style="margin-top:4px;">بازگردانی</button>':'')) :
      '<span class="pill pill-pending">در انتظار</span>';
    return '<tr><td>'+cb+'</td><td>'+jStr(l)+'</td><td>'+escapeHtml(l.agent)+'</td><td>'+escapeHtml(l.agency)+'</td><td>'+escapeHtml(l.counter)+'</td>'+
      '<td>'+escapeHtml(l.voucherNumber)+'</td><td>'+escapeHtml(l.hotel||'—')+'</td><td class="amount-cell">'+pDigits(fmtNum(l.purchaseAmount))+'</td>'+
      '<td class="amount-cell">'+pDigits(fmtNum(l.serviceAmount))+'</td><td class="amount-cell">'+pDigits(fmtNum(l.amount))+'</td><td><span class="pill">'+escapeHtml(l.currency)+'</span></td>'+
      '<td class="amount-cell">'+(l.rialAmount!=null?fmtRial(l.rialAmount):'<span style="color:var(--text-muted);font-size:11px;">نرخ ثبت نشده</span>')+'</td><td>'+statusCell+'</td></tr>';
  }).join('') : '<tr><td colspan="13" class="empty-state">موردی یافت نشد</td></tr>';

  var bulkBar = (selectedCount>0 && canE) ? (
    '<div class="deposit-card" style="border-color:var(--primary);">'+
      '<div style="font-weight:700;margin-bottom:6px;">علامت‌گذاری '+pDigits(selectedCount)+' واچر به‌عنوان پرداخت‌شده</div>'+
      '<div class="btn-group"><button type="button" class="btn-primary" id="debtMarkPaid">✓ ثبت پرداخت</button><button type="button" class="btn-small btn-ghost" id="debtClearSel">لغو انتخاب</button></div>'+
    '</div>'
  ) : '';

  qs('#tabContent').innerHTML =
    '<div class="card"><h2>مجموع بدهی پرداخت‌نشده</h2><div>'+grandHtml+'</div></div>'+
    '<div class="card"><h2>بدهی هر کارگزار</h2>'+agentChips+'</div>'+
    '<div class="card">'+
      '<div class="status-tabs">'+
        ['unpaid','paid','all'].map(function(s){
          var labels={unpaid:'در انتظار',paid:'پرداخت‌شده',all:'همه'};
          return '<button type="button" class="status-tab '+(DEBT_FILTER.status===s?'active':'')+'" data-s="'+s+'">'+labels[s]+'</button>';
        }).join('')+
      '</div>'+
      '<div class="filters"><input type="text" id="debtSearch" placeholder="جستجو" value="'+escapeHtml(DEBT_FILTER.search)+'"><button type="button" class="btn-small btn-ghost" id="debtClearFilter">پاک کردن فیلتر</button>'+
        '<div class="export-row" style="display:flex;gap:8px;margin-inline-start:auto;">'+
          '<button type="button" class="btn-small" id="debtExportExcel">📊 خروجی اکسل</button>'+
          '<button type="button" class="btn-small" id="debtExportPdf">🖨 خروجی PDF</button>'+
        '</div>'+
      '</div>'+
      bulkBar+
      '<div class="table-wrap"><table><thead><tr><th></th><th>تاریخ</th><th>کارگزار</th><th>آژانس</th><th>کانتر</th><th>واچر</th><th>هتل</th><th>هزینه هتل</th><th>هزینه خدمات</th><th>مجموع</th><th>ارز</th><th>معادل ریالی</th><th>وضعیت</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '</div>';

  bindDebt();
}

function bindDebt(){
  qsa('.debt-agent-chip').forEach(function(btn){ btn.addEventListener('click', function(){
    var a = this.getAttribute('data-agent'); DEBT_FILTER.agent = (DEBT_FILTER.agent===a)?'':a; loadDebt();
  }); });
  var g = function(id){ return document.getElementById(id); };
  if(g('debtSearch')) g('debtSearch').addEventListener('change', function(){ DEBT_FILTER.search=this.value; loadDebt(); });
  if(g('debtClearFilter')) g('debtClearFilter').addEventListener('click', function(){ DEBT_FILTER={agent:'',search:'',status:DEBT_FILTER.status}; loadDebt(); });
  qsa('.status-tab[data-s]').forEach(function(btn){ btn.addEventListener('click', function(){ DEBT_FILTER.status=this.getAttribute('data-s'); DEBT_SELECTED={}; loadDebt(); }); });
  qsa('.debt-cb').forEach(function(cb){ cb.addEventListener('change', function(){
    if(this.checked) DEBT_SELECTED[this.dataset.vid]=true; else delete DEBT_SELECTED[this.dataset.vid];
    loadDebt();
  }); });
  if(g('debtMarkPaid')) g('debtMarkPaid').addEventListener('click', async function(){
    var ids = Object.keys(DEBT_SELECTED).filter(function(k){return DEBT_SELECTED[k];});
    await api.post('/debt/settle', { voucherIds: ids });
    DEBT_SELECTED = {};
    loadDebt();
  });
  if(g('debtClearSel')) g('debtClearSel').addEventListener('click', function(){ DEBT_SELECTED={}; loadDebt(); });
  qsa('.debt-revert').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این بدهی به «پرداخت‌نشده» برگردد؟')) return;
    await api.post('/debt/revert', { voucherId:this.getAttribute('data-vid') });
    loadDebt();
  }); });

  var exEl = document.getElementById('debtExportExcel');
  if(exEl) exEl.addEventListener('click', doExportDebtExcel);
  var pdfEl = document.getElementById('debtExportPdf');
  if(pdfEl) pdfEl.addEventListener('click', doExportDebtPdf);
}

/* ================= Export: Excel (client-side, via SheetJS) ================= */
function doExportDebtExcel(){
  if(!LAST_DEBT_LINES.length){ alert('رکوردی برای خروجی وجود ندارد.'); return; }
  var rows = LAST_DEBT_LINES.map(function(l){
    return {
      'تاریخ': J.jalaliStrOf(l.jy,l.jm,l.jd), 'کارگزار': l.agent, 'آژانس': l.agency, 'کانتر': l.counter,
      'واچر': l.voucherNumber, 'هتل': l.hotel||'', 'هزینه هتل': l.purchaseAmount, 'هزینه خدمات': l.serviceAmount,
      'مجموع': l.amount, 'ارز': l.currency, 'نرخ ارز (ریال)': l.exchangeRate||'', 'معادل ریالی': l.rialAmount||'',
      'وضعیت': l.debtSettled?'پرداخت‌شده':'در انتظار پرداخت', 'تاریخ پرداخت': l.debtSettledAt||''
    };
  });
  var ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0]).map(function(){ return {wch:16}; });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'بدهی به کارگزاران');
  var t = J.todayJalali();
  XLSX.writeFile(wb, 'بدهی-کارگزاران-'+J.jalaliStrOf(t.jy,t.jm,t.jd).replace(/\//g,'-')+'.xlsx');
}

/* ================= Export: PDF (browser print-to-PDF) ================= */
function doExportDebtPdf(){
  if(!LAST_DEBT_LINES.length){ alert('رکوردی برای خروجی وجود ندارد.'); return; }
  var headers = ['تاریخ','کارگزار','آژانس','کانتر','واچر','هتل','هزینه هتل','هزینه خدمات','مجموع','ارز','معادل ریالی','وضعیت'];
  var totalByCur = {}, totalRial = 0;
  var rowsHtml = LAST_DEBT_LINES.map(function(l){
    if(!l.debtSettled){ totalByCur[l.currency]=(totalByCur[l.currency]||0)+l.amount; if(l.rialAmount!=null) totalRial+=l.rialAmount; }
    return '<tr>'+
      '<td>'+pDigits(J.jalaliStrOf(l.jy,l.jm,l.jd))+'</td>'+'<td>'+escapeHtml(l.agent)+'</td>'+'<td>'+escapeHtml(l.agency)+'</td>'+
      '<td>'+escapeHtml(l.counter)+'</td>'+'<td>'+escapeHtml(l.voucherNumber)+'</td>'+'<td>'+escapeHtml(l.hotel||'—')+'</td>'+
      '<td>'+pDigits(fmtNum(l.purchaseAmount))+'</td>'+'<td>'+pDigits(fmtNum(l.serviceAmount))+'</td>'+'<td>'+pDigits(fmtNum(l.amount))+'</td>'+
      '<td>'+escapeHtml(l.currency)+'</td>'+'<td>'+(l.rialAmount!=null?pDigits(fmtNum(l.rialAmount)):'نرخ ثبت نشده')+'</td>'+
      '<td>'+(l.debtSettled?'پرداخت‌شده':'در انتظار پرداخت')+'</td>'+
    '</tr>';
  }).join('');
  var totalsText = Object.keys(totalByCur).map(function(c){ return pDigits(fmtNum(totalByCur[c]))+' '+c; }).join(' | ') || '۰';
  if(totalRial>0) totalsText += ' — معادل ریالی: ≈ '+pDigits(fmtNum(totalRial))+' ریال';
  var totalsRow = '<tr style="font-weight:700;background:#EFEFEF;-webkit-print-color-adjust:exact;print-color-adjust:exact;">'+
    '<td colspan="12">جمع بدهی پرداخت‌نشده ('+pDigits(LAST_DEBT_LINES.length)+' ردیف) — '+totalsText+'</td></tr>';
  var t = J.todayJalali();
  document.getElementById('printArea').innerHTML =
    '<div class="print-header"><h2>گزارش بدهی به کارگزاران</h2>'+
    '<div class="print-meta">تاریخ گزارش: '+pDigits(J.jalaliStrOf(t.jy,t.jm,t.jd))+' | تعداد ردیف: '+pDigits(LAST_DEBT_LINES.length)+'</div></div>'+
    '<table><thead><tr>'+headers.map(function(h){return '<th>'+h+'</th>';}).join('')+'</tr></thead>'+
    '<tbody>'+rowsHtml+totalsRow+'</tbody></table>'+
    '<div class="print-footer">تولید شده توسط سیستم مدیریت رزرواسیون و تامین خارجی آژانس مجلل درویشی</div>';
  setTimeout(function(){ window.print(); }, 100);
}
