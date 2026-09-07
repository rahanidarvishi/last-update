"use strict";
var REC_FILTER = { agency:'', dateJy:null, dateJm:null, dateJd:null, search:'', status:'pending' };
var REC_DETAILS_OPEN = null;
var REC_DEPOSIT_PANEL = null; // {recordId, amount, jy, jm, jd, platform}
var LAST_RECORDS = [];
var REC_PAGE = 1;
var REC_PAGE_SIZE = 50;
var REC_TOTAL = 0;

function recFilterParams(){
  var params = [];
  if(REC_FILTER.agency) params.push('agency='+encodeURIComponent(REC_FILTER.agency));
  if(REC_FILTER.dateJy) params.push('date='+encodeURIComponent(J.jalaliStrOf(REC_FILTER.dateJy,REC_FILTER.dateJm,REC_FILTER.dateJd)));
  if(REC_FILTER.search) params.push('search='+encodeURIComponent(REC_FILTER.search));
  if(REC_FILTER.status && REC_FILTER.status!=='all') params.push('status='+REC_FILTER.status);
  return params;
}

async function loadRecords(){
  var settings = await ensureSettings();
  var params = recFilterParams();
  params.push('page='+REC_PAGE, 'pageSize='+REC_PAGE_SIZE);
  var res = await api.get('/records?'+params.join('&'));
  LAST_RECORDS = res.records;
  REC_TOTAL = res.total;
  // The requested page can end up empty (e.g. the last item on the last
  // page just got deleted) -- step back one page instead of showing a
  // confusing "no records" on a filter that actually has matches.
  if(!res.records.length && REC_PAGE>1){ REC_PAGE = Math.max(1, Math.ceil(res.total/REC_PAGE_SIZE)); return loadRecords(); }
  renderRecords(res.records, settings);
}

function resetRecPageAndLoad(){ REC_PAGE = 1; loadRecords(); }

function routeText(o,d){ return (o||'—')+' ◀ '+(d||'—'); }

// r.profit is null when a used purchase currency has no FX rate defined for
// the record's date — showing 0 or a wrong number there would be worse than
// just flagging it, since it directly feeds this business's profit reporting.
function profitCellHtml(profit){
  if(profit==null) return '<span class="pill pill-danger" title="نرخ ارز یکی از خریدهای این رزرو برای این تاریخ ثبت نشده — سود قابل‌محاسبه نیست">⚠️ نامشخص</span>';
  return '<span style="color:'+(profit>=0?'var(--primary-dark)':'var(--danger)')+';">'+fmtRial(profit)+'</span>';
}

function renderRecords(records, settings){
  var canE = canEdit('records');
  var agencyOpts = '<option value="">همه آژانس‌ها</option>'+settings.agencies.map(function(a){
    return '<option value="'+escapeHtml(a)+'" '+(REC_FILTER.agency===a?'selected':'')+'>'+escapeHtml(a)+'</option>';
  }).join('');

  var rowsHtml = records.length ? records.map(function(r){
    var uniqueHotels = Array.from(new Set(r.vouchers.map(function(v){return v.hotel;}).filter(Boolean)));
    var outRoutes = Array.from(new Set(r.vouchers.filter(function(v){return v.flightOutOrigin||v.flightOutDestination;}).map(function(v){return routeText(v.flightOutOrigin,v.flightOutDestination);})));
    var statusPill = r.settled ? '<span class="pill">✓ تسویه</span>' : '<span class="pill pill-pending">مانده '+fmtRial(r.outstanding)+'</span>';
    if(r.needsCorrection) statusPill += '<div><span class="pill pill-danger">⚠ نیاز به اصلاح</span></div>';
    var main = '<tr>'+
      '<td>'+jStr(r)+'</td>'+
      '<td>'+escapeHtml(r.agency)+'</td>'+
      '<td>'+escapeHtml(r.counter)+'</td>'+
      '<td>'+escapeHtml(outRoutes.join('، ')||'—')+'</td>'+
      '<td>'+escapeHtml(uniqueHotels.join('، ')||'—')+'</td>'+
      '<td>'+escapeHtml(r.vouchers.map(function(v){return v.number;}).join('، '))+'</td>'+
      '<td class="amount-cell">'+fmtRial(r.totalAmount)+'</td>'+
      '<td class="amount-cell">'+fmtRial(r.depositSum)+'</td>'+
      '<td class="amount-cell">'+profitCellHtml(r.profit)+'</td>'+
      '<td>'+statusPill+'</td>'+
      '<td><div class="btn-group">'+
        '<button type="button" class="icon-btn rec-view" data-id="'+r.id+'" title="جزئیات">👁</button>'+
        (canE?'<button type="button" class="btn-small rec-add-dep" data-id="'+r.id+'">+ واریزی</button>':'')+
        (canE?'<button type="button" class="icon-btn rec-edit" data-id="'+r.id+'" title="ویرایش">✎</button>':'')+
        (canE && r.needsCorrection?'<button type="button" class="btn-small rec-fix" data-id="'+r.id+'">✓ اصلاح شد</button>':'')+
        (canE?'<button type="button" class="icon-btn rec-del" data-id="'+r.id+'" title="حذف">🗑</button>':'')+
      '</div></td>'+
    '</tr>';

    var detailsRow = '';
    if(REC_DETAILS_OPEN === r.id){
      var vRows = r.vouchers.map(function(v,i){
        return '<tr><td>'+pDigits(i+1)+'</td><td><b>'+escapeHtml(v.number)+'</b></td><td>'+escapeHtml(v.hotel||'—')+'</td>'+
          '<td>'+escapeHtml(v.agent||'—')+'</td><td>'+(v.purchaseAmount?pDigits(fmtNum(v.purchaseAmount))+' '+escapeHtml(v.purchaseCurrency||''):'—')+'</td>'+
          '<td>'+routeText(v.flightOutOrigin,v.flightOutDestination)+'</td><td>'+(v.flightOutPriceMillion?fmtRial(v.flightOutPriceMillion*10000000):'—')+'</td>'+
          '<td>'+routeText(v.flightInOrigin,v.flightInDestination)+'</td><td>'+(v.flightInPriceMillion?fmtRial(v.flightInPriceMillion*10000000):'—')+'</td></tr>';
      }).join('');
      var dRows = r.deposits.length ? r.deposits.map(function(d,i){
        return '<tr><td>'+pDigits(i+1)+'</td><td class="amount-cell">'+fmtRial(d.amount)+'</td><td>'+jStr(d)+'</td><td><span class="pill">'+escapeHtml(d.platform)+'</span></td></tr>';
      }).join('') : '<tr><td colspan="4" class="empty-state">واریزی ثبت نشده</td></tr>';
      detailsRow = '<tr><td colspan="11" style="background:#FBFAF6;">'+
        '<div style="font-weight:700;margin-bottom:8px;">جزئیات واچرها'+(r.procurementExpert?(' — کارشناس تأمین: '+escapeHtml(r.procurementExpert)):'')+'</div>'+
        '<div class="table-wrap"><table><thead><tr><th>#</th><th>واچر</th><th>هتل</th><th>کارگذار</th><th>خرید</th><th>پرواز رفت</th><th>قیمت رفت</th><th>پرواز برگشت</th><th>قیمت برگشت</th></tr></thead><tbody>'+vRows+'</tbody></table></div>'+
        '<div style="font-weight:700;margin:12px 0 8px;">واریزی‌ها — سود این رزرو: '+profitCellHtml(r.profit)+'</div>'+
        '<div class="table-wrap"><table><thead><tr><th>#</th><th>مبلغ</th><th>تاریخ</th><th>پلتفرم</th></tr></thead><tbody>'+dRows+'</tbody></table></div>'+
      '</td></tr>';
    }

    var panelRow = '';
    if(REC_DEPOSIT_PANEL && REC_DEPOSIT_PANEL.recordId === r.id){
      var p = REC_DEPOSIT_PANEL;
      panelRow = '<tr><td colspan="11" style="background:var(--surface-alt);">'+
        '<div class="grid-4">'+
          '<label>مبلغ (ریال)<input type="text" inputmode="numeric" id="panelDepAmount" value="'+(p.amount?fmtNum(p.amount):'')+'"></label>'+
          '<label>تاریخ'+dateBtnHtml('panelDepDateBtn', p, '')+'</label>'+
          '<label>پلتفرم<select id="panelDepPlatform"><option value="">انتخاب کنید</option><option value="سپهر" '+(p.platform==='سپهر'?'selected':'')+'>سپهر</option><option value="سپهران" '+(p.platform==='سپهران'?'selected':'')+'>سپهران</option></select></label>'+
          '<div style="display:flex;align-items:end;gap:8px;"><button type="button" class="btn-primary" id="panelDepSubmit">ثبت</button><button type="button" class="btn-small btn-ghost" id="panelDepCancel">انصراف</button></div>'+
        '</div></td></tr>';
    }
    return main + detailsRow + panelRow;
  }).join('') : '<tr><td colspan="11" class="empty-state">رکوردی یافت نشد</td></tr>';

  qs('#tabContent').innerHTML =
    '<div class="card">'+
      '<div class="filters">'+
        '<input type="text" id="recSearch" placeholder="جستجو (واچر/آژانس/کانتر)" value="'+escapeHtml(REC_FILTER.search)+'" style="min-width:220px;">'+
        '<label>آژانس<select id="recAgencyFilter">'+agencyOpts+'</select></label>'+
        '<label style="min-width:170px;">تاریخ ثبت'+dateBtnHtml('recDateFilterBtn', {jy:REC_FILTER.dateJy,jm:REC_FILTER.dateJm,jd:REC_FILTER.dateJd}, '')+'</label>'+
        '<button type="button" class="btn-small" id="recTodayBtn">امروز</button>'+
        '<button type="button" class="btn-small btn-ghost" id="recClearFilter">پاک کردن فیلتر</button>'+
        '<div class="export-row" style="display:flex;gap:8px;margin-inline-start:auto;">'+
          '<button type="button" class="btn-small" id="recExportExcel">📊 خروجی اکسل</button>'+
          '<button type="button" class="btn-small" id="recExportPdf">🖨 خروجی PDF</button>'+
        '</div>'+
      '</div>'+
      '<div class="status-tabs">'+
        ['pending','settled','needsCorrection','all'].map(function(s){
          var labels={pending:'در حال پرداخت',settled:'تسویه شده',needsCorrection:'نیاز به اصلاح',all:'همه'};
          return '<button type="button" class="status-tab '+(REC_FILTER.status===s?'active':'')+'" data-s="'+s+'">'+labels[s]+'</button>';
        }).join('')+
      '</div>'+
      '<div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>آژانس</th><th>کانتر</th><th>مسیر رفت</th><th>هتل</th><th>واچرها</th><th>مبلغ فروش</th><th>واریزی</th><th>سود</th><th>وضعیت</th><th></th></tr></thead><tbody>'+rowsHtml+'</tbody></table></div>'+
      paginationHtml()+
    '</div>';

  bindRecords();
}

function paginationHtml(){
  var totalPages = Math.max(1, Math.ceil(REC_TOTAL/REC_PAGE_SIZE));
  return '<div class="pagination-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:10px;">'+
    '<span style="font-size:12.5px;color:var(--text-muted);">'+pDigits(REC_TOTAL)+' رکورد — صفحه '+pDigits(REC_PAGE)+' از '+pDigits(totalPages)+'</span>'+
    '<div style="display:flex;gap:8px;">'+
      '<button type="button" class="btn-small btn-ghost" id="recPrevPage" '+(REC_PAGE<=1?'disabled':'')+'>◀ قبلی</button>'+
      '<button type="button" class="btn-small btn-ghost" id="recNextPage" '+(REC_PAGE>=totalPages?'disabled':'')+'>بعدی ▶</button>'+
    '</div>'+
  '</div>';
}

function bindRecords(){
  var g = function(id){ return document.getElementById(id); };
  if(g('recSearch')) g('recSearch').addEventListener('input', function(){ REC_FILTER.search=this.value; });
  if(g('recSearch')) g('recSearch').addEventListener('change', resetRecPageAndLoad);
  if(g('recAgencyFilter')) g('recAgencyFilter').addEventListener('change', function(){ REC_FILTER.agency=this.value; resetRecPageAndLoad(); });
  var dateBtn = g('recDateFilterBtn');
  if(dateBtn) dateBtn.addEventListener('click', function(){
    openCalendar(this, REC_FILTER.dateJy?{jy:REC_FILTER.dateJy,jm:REC_FILTER.dateJm,jd:REC_FILTER.dateJd}:null, function(picked){
      REC_FILTER.dateJy=picked.jy; REC_FILTER.dateJm=picked.jm; REC_FILTER.dateJd=picked.jd;
      resetRecPageAndLoad();
    });
  });
  if(g('recTodayBtn')) g('recTodayBtn').addEventListener('click', function(){
    var t = J.todayJalali(); REC_FILTER.dateJy=t.jy; REC_FILTER.dateJm=t.jm; REC_FILTER.dateJd=t.jd; resetRecPageAndLoad();
  });
  if(g('recClearFilter')) g('recClearFilter').addEventListener('click', function(){ REC_FILTER={agency:'',dateJy:null,dateJm:null,dateJd:null,search:'',status:REC_FILTER.status}; resetRecPageAndLoad(); });
  qsa('.status-tab[data-s]').forEach(function(btn){ btn.addEventListener('click', function(){ REC_FILTER.status=this.getAttribute('data-s'); resetRecPageAndLoad(); }); });

  if(g('recPrevPage')) g('recPrevPage').addEventListener('click', function(){ if(REC_PAGE>1){ REC_PAGE--; loadRecords(); } });
  if(g('recNextPage')) g('recNextPage').addEventListener('click', function(){ REC_PAGE++; loadRecords(); });

  if(g('recExportExcel')) g('recExportExcel').addEventListener('click', doExportRecordsExcel);
  if(g('recExportPdf')) g('recExportPdf').addEventListener('click', doExportRecordsPdf);

  qsa('.rec-view').forEach(function(btn){ btn.addEventListener('click', function(){
    var id = this.getAttribute('data-id');
    REC_DETAILS_OPEN = (REC_DETAILS_OPEN===id) ? null : id;
    renderRecords(LAST_RECORDS, S.settings);
  }); });
  qsa('.rec-add-dep').forEach(function(btn){ btn.addEventListener('click', function(){
    var id = this.getAttribute('data-id');
    REC_DEPOSIT_PANEL = (REC_DEPOSIT_PANEL && REC_DEPOSIT_PANEL.recordId===id) ? null : { recordId:id, amount:'', jy:null, jm:null, jd:null, platform:'' };
    renderRecords(LAST_RECORDS, S.settings);
  }); });
  qsa('.rec-edit').forEach(function(btn){ btn.addEventListener('click', async function(){
    var id = this.getAttribute('data-id');
    var res = await api.get('/records/'+id);
    if(res.record) editRecordInNewEntry(res.record);
  }); });
  qsa('.rec-fix').forEach(function(btn){ btn.addEventListener('click', async function(){
    await api.patch('/records/'+this.getAttribute('data-id'), { needsCorrection:false });
    loadRecords();
  }); });
  qsa('.rec-del').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این رکورد حذف شود؟')) return;
    await api.del('/records/'+this.getAttribute('data-id'));
    loadRecords();
  }); });

  var depDateBtn = document.getElementById('panelDepDateBtn');
  if(depDateBtn) depDateBtn.addEventListener('click', function(){
    var p = REC_DEPOSIT_PANEL;
    openCalendar(this, p.jy?{jy:p.jy,jm:p.jm,jd:p.jd}:null, function(picked){
      p.jy=picked.jy; p.jm=picked.jm; p.jd=picked.jd;
      renderRecords(LAST_RECORDS, S.settings);
    });
  });
  var pSubmit = document.getElementById('panelDepSubmit');
  if(pSubmit) pSubmit.addEventListener('click', async function(){
    var amount = document.getElementById('panelDepAmount').value.replace(/[^0-9]/g,'');
    var p = REC_DEPOSIT_PANEL;
    if(!amount || !p.jy || !document.getElementById('panelDepPlatform').value){ alert('مبلغ، تاریخ و پلتفرم را کامل کنید'); return; }
    var platform = document.getElementById('panelDepPlatform').value;
    await api.post('/records/'+p.recordId+'/deposits', { amount:parseFloat(amount), jy:p.jy, jm:p.jm, jd:p.jd, platform:platform });
    REC_DEPOSIT_PANEL = null;
    loadRecords();
  });
  var pCancel = document.getElementById('panelDepCancel');
  if(pCancel) pCancel.addEventListener('click', function(){ REC_DEPOSIT_PANEL=null; renderRecords(LAST_RECORDS, S.settings); });
  var amtEl = document.getElementById('panelDepAmount');
  if(amtEl) amtEl.addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,''); this.value=v?fmtNum(v):''; });
}

/* ================= Export: Excel (client-side, via SheetJS — same technique as before) =================
   Exports must cover every record matching the current filters, not just
   the page on screen -- so these fetch with ?all=1 (bypasses pagination)
   instead of reusing LAST_RECORDS. */
async function fetchAllFilteredRecords(){
  var params = recFilterParams();
  params.push('all=1');
  var res = await api.get('/records?'+params.join('&'));
  return res.records;
}

async function doExportRecordsExcel(){
  var records = await fetchAllFilteredRecords();
  if(!records.length){ alert('رکوردی برای خروجی وجود ندارد.'); return; }
  var rows = records.map(function(r){
    var uniqueHotels = Array.from(new Set(r.vouchers.map(function(v){return v.hotel;}).filter(Boolean)));
    var outRoutes = Array.from(new Set(r.vouchers.filter(function(v){return v.flightOutOrigin||v.flightOutDestination;}).map(function(v){return routeText(v.flightOutOrigin,v.flightOutDestination);})));
    var inRoutes = Array.from(new Set(r.vouchers.filter(function(v){return v.flightInOrigin||v.flightInDestination;}).map(function(v){return routeText(v.flightInOrigin,v.flightInDestination);})));
    return {
      'تاریخ': J.jalaliStrOf(r.jy,r.jm,r.jd),
      'آژانس': r.agency, 'کانتر': r.counter, 'کارشناس تأمین': r.procurementExpert||'',
      'مسیر رفت': outRoutes.join('، '), 'مسیر برگشت': inRoutes.join('، '), 'هتل‌ها': uniqueHotels.join('، '),
      'واچرها': r.vouchers.map(function(v){return v.number;}).join('، '),
      'مبلغ فروش (ریال)': r.totalAmount, 'مجموع واریزی (ریال)': r.depositSum,
      'هزینه کل خرید (ریال)': r.totalCostRial==null ? 'نامشخص (نرخ ارز ثبت نشده)' : r.totalCostRial,
      'سود (ریال)': r.profit==null ? 'نامشخص (نرخ ارز ثبت نشده)' : r.profit,
      'وضعیت': r.settled?'تسویه شده':'در حال پرداخت'
    };
  });
  var ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = Object.keys(rows[0]).map(function(){ return {wch:18}; });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'رکوردها');
  var t = J.todayJalali();
  XLSX.writeFile(wb, 'گزارش-رکوردها-'+J.jalaliStrOf(t.jy,t.jm,t.jd).replace(/\//g,'-')+'.xlsx');
}

/* ================= Export: PDF (browser print-to-PDF, same technique as before) ================= */
async function doExportRecordsPdf(){
  var records = await fetchAllFilteredRecords();
  if(!records.length){ alert('رکوردی برای خروجی وجود ندارد.'); return; }
  var headers = ['تاریخ','آژانس','کانتر','مسیر رفت','مسیر برگشت','هتل‌ها','واچرها','مبلغ فروش','واریزی','سود','وضعیت'];
  var totalSale=0, totalDep=0, totalProfit=0, unknownProfitCount=0;
  var rowsHtml = records.map(function(r){
    var uniqueHotels = Array.from(new Set(r.vouchers.map(function(v){return v.hotel;}).filter(Boolean)));
    var outRoutes = Array.from(new Set(r.vouchers.filter(function(v){return v.flightOutOrigin||v.flightOutDestination;}).map(function(v){return routeText(v.flightOutOrigin,v.flightOutDestination);})));
    var inRoutes = Array.from(new Set(r.vouchers.filter(function(v){return v.flightInOrigin||v.flightInDestination;}).map(function(v){return routeText(v.flightInOrigin,v.flightInDestination);})));
    totalSale+=r.totalAmount; totalDep+=r.depositSum;
    if(r.profit==null) unknownProfitCount++; else totalProfit+=r.profit;
    return '<tr>'+
      '<td>'+pDigits(J.jalaliStrOf(r.jy,r.jm,r.jd))+'</td>'+
      '<td>'+escapeHtml(r.agency)+'</td>'+'<td>'+escapeHtml(r.counter)+'</td>'+
      '<td>'+escapeHtml(outRoutes.join('، ')||'—')+'</td>'+'<td>'+escapeHtml(inRoutes.join('، ')||'—')+'</td>'+
      '<td>'+escapeHtml(uniqueHotels.join('، ')||'—')+'</td>'+
      '<td>'+escapeHtml(r.vouchers.map(function(v){return v.number;}).join('، '))+'</td>'+
      '<td>'+pDigits(fmtNum(r.totalAmount))+'</td>'+'<td>'+pDigits(fmtNum(r.depositSum))+'</td>'+
      '<td>'+(r.profit==null?'نامشخص':pDigits(fmtNum(r.profit)))+'</td>'+'<td>'+(r.settled?'تسویه شده':'در حال پرداخت')+'</td>'+
    '</tr>';
  }).join('');
  var totalsRow = '<tr style="font-weight:700;background:#EFEFEF;-webkit-print-color-adjust:exact;print-color-adjust:exact;">'+
    '<td colspan="11">جمع ('+pDigits(records.length)+' رکورد) — فروش: '+pDigits(fmtNum(totalSale))+' | واریزی: '+pDigits(fmtNum(totalDep))+' | سود: '+pDigits(fmtNum(totalProfit))+
    (unknownProfitCount>0?(' (سود '+pDigits(unknownProfitCount)+' رکورد به‌دلیل نبود نرخ ارز در این جمع نیامده)'):'')+'</td></tr>';
  var t = J.todayJalali();
  document.getElementById('printArea').innerHTML =
    '<div class="print-header"><h2>گزارش رکوردها — سیستم مدیریت درویشی</h2>'+
    '<div class="print-meta">تاریخ گزارش: '+pDigits(J.jalaliStrOf(t.jy,t.jm,t.jd))+' | تعداد رکورد: '+pDigits(records.length)+'</div></div>'+
    '<table><thead><tr>'+headers.map(function(h){return '<th>'+h+'</th>';}).join('')+'</tr></thead>'+
    '<tbody>'+rowsHtml+totalsRow+'</tbody></table>'+
    '<div class="print-footer">تولید شده توسط سیستم مدیریت رزرواسیون و تامین خارجی آژانس مجلل درویشی</div>';
  setTimeout(function(){ window.print(); }, 100);
}
