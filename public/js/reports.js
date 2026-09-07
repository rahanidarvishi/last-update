"use strict";
var REPORT_FILTER = { dimension:'procurementExpert', period:'month', from:'', to:'', dimensionValue:'' };
var REPORT_CHART_1 = null, REPORT_CHART_2 = null;

var DIMENSION_LABELS = { procurementExpert:'کارشناس تأمین', counter:'کانتر', agency:'آژانس', createdBy:'کاربر ثبت‌کننده' };
var PERIOD_LABELS = { day:'روزانه', week:'هفتگی', month:'ماهانه', year:'سالانه' };

async function loadReports(){
  var f = REPORT_FILTER;
  var params = ['dimension='+f.dimension, 'period='+f.period];
  if(f.from) params.push('from='+encodeURIComponent(f.from));
  if(f.to) params.push('to='+encodeURIComponent(f.to));
  if(f.dimensionValue) params.push('dimensionValue='+encodeURIComponent(f.dimensionValue));
  var res = await api.get('/reports/performance?'+params.join('&'));
  renderReports(res);
}

function renderReports(res){
  var f = REPORT_FILTER;
  var dimOpts = Object.keys(DIMENSION_LABELS).map(function(k){ return '<option value="'+k+'" '+(f.dimension===k?'selected':'')+'>'+DIMENSION_LABELS[k]+'</option>'; }).join('');
  var periodOpts = Object.keys(PERIOD_LABELS).map(function(k){ return '<option value="'+k+'" '+(f.period===k?'selected':'')+'>'+PERIOD_LABELS[k]+'</option>'; }).join('');
  var valueOpts = '<option value="">همه ('+DIMENSION_LABELS[f.dimension]+')</option>' + res.availableDimensionValues.map(function(v){
    return '<option value="'+escapeHtml(v)+'" '+(f.dimensionValue===v?'selected':'')+'>'+escapeHtml(v)+'</option>';
  }).join('');

  var s = res.summary;
  var byDimRows = res.byDimension.map(function(row){
    var costCell = row.unknownCostCount>0 ?
      '<td class="amount-cell" title="'+row.unknownCostCount+' رکورد به‌دلیل نبود نرخ ارز در این جمع نیامده">'+fmtRial(row.totalCost)+' ⚠️</td>' :
      '<td class="amount-cell">'+fmtRial(row.totalCost)+'</td>';
    var profitCell = row.unknownCostCount>0 ?
      '<td class="amount-cell" style="color:'+(row.totalProfit>=0?'var(--primary-dark)':'var(--danger)')+';" title="'+row.unknownCostCount+' رکورد به‌دلیل نبود نرخ ارز در این جمع نیامده">'+fmtRial(row.totalProfit)+' ⚠️</td>' :
      '<td class="amount-cell" style="color:'+(row.totalProfit>=0?'var(--primary-dark)':'var(--danger)')+';">'+fmtRial(row.totalProfit)+'</td>';
    return '<tr><td>'+escapeHtml(row.key)+'</td><td>'+pDigits(row.recordCount)+'</td><td>'+pDigits(row.voucherCount)+'</td>'+
      '<td class="amount-cell">'+fmtRial(row.totalSales)+'</td>'+costCell+profitCell+'</tr>';
  }).join('') || '<tr><td colspan="6" class="empty-state">داده‌ای یافت نشد</td></tr>';

  var unknownCostWarning = s.unknownCostCount>0 ?
    '<div class="pill pill-danger" style="margin-bottom:10px;">⚠️ هزینه و سود '+pDigits(s.unknownCostCount)+' رکورد به‌دلیل نبود نرخ ارز ثبت‌شده برای تاریخ آن‌ها قابل‌محاسبه نیست و در جمع‌های زیر لحاظ نشده — از تنظیمات، نرخ ارز آن روزها را کامل کنید.</div>' : '';

  qs('#tabContent').innerHTML =
    '<div class="card"><h2>فیلترهای گزارش</h2>'+
      '<div class="grid-4">'+
        '<label>بر اساس<select id="repDimension">'+dimOpts+'</select></label>'+
        '<label>'+DIMENSION_LABELS[f.dimension]+' خاص (اختیاری)<select id="repDimValue">'+valueOpts+'</select></label>'+
        '<label>بازه زمانی نمودار<select id="repPeriod">'+periodOpts+'</select></label>'+
        '<label>از تاریخ (مثل 1405/01/01)<input type="text" id="repFrom" value="'+escapeHtml(f.from)+'" placeholder="اختیاری"></label>'+
      '</div>'+
      '<div class="grid-4" style="margin-top:10px;">'+
        '<label>تا تاریخ<input type="text" id="repTo" value="'+escapeHtml(f.to)+'" placeholder="اختیاری"></label>'+
        '<div style="display:flex;align-items:end;"><button type="button" class="btn-primary" id="repApply">اعمال فیلتر</button></div>'+
      '</div>'+
    '</div>'+
    unknownCostWarning+
    '<div class="grid-4">'+
      statCard('تعداد رکورد', pDigits(s.recordCount), '', 'users') +
      statCard('مجموع فروش', fmtRial(s.totalSales), '', 'money') +
      statCard('مجموع هزینه'+(s.unknownCostCount>0?' ⚠️':''), fmtRial(s.totalCost), 'cost', 'cost') +
      statCard('سود'+(s.unknownCostCount>0?' ⚠️':''), fmtRial(s.totalProfit), 'profit', 'profit') +
    '</div>'+
    '<div class="card"><h2>مقایسه '+DIMENSION_LABELS[f.dimension]+'ها (فروش / هزینه / سود)</h2><canvas id="repChartDim" height="110"></canvas></div>'+
    '<div class="card"><h2>روند در طول زمان'+(f.dimensionValue?(' — '+escapeHtml(f.dimensionValue)):'')+' ('+PERIOD_LABELS[f.period]+')</h2><canvas id="repChartTime" height="110"></canvas></div>'+
    '<div class="card"><h2>جدول تفصیلی بر اساس '+DIMENSION_LABELS[f.dimension]+'</h2>'+
      '<div class="table-wrap"><table><thead><tr><th>'+DIMENSION_LABELS[f.dimension]+'</th><th>تعداد رکورد</th><th>تعداد واچر</th><th>فروش</th><th>هزینه</th><th>سود</th></tr></thead><tbody>'+byDimRows+'</tbody></table></div>'+
    '</div>';

  bindReports();
  drawReportCharts(res);
}

function bindReports(){
  var g = function(id){ return document.getElementById(id); };
  if(g('repDimension')) g('repDimension').addEventListener('change', function(){ REPORT_FILTER.dimension=this.value; REPORT_FILTER.dimensionValue=''; loadReports(); });
  if(g('repDimValue')) g('repDimValue').addEventListener('change', function(){ REPORT_FILTER.dimensionValue=this.value; loadReports(); });
  if(g('repPeriod')) g('repPeriod').addEventListener('change', function(){ REPORT_FILTER.period=this.value; loadReports(); });
  if(g('repFrom')) g('repFrom').addEventListener('change', function(){ REPORT_FILTER.from=this.value; });
  if(g('repTo')) g('repTo').addEventListener('change', function(){ REPORT_FILTER.to=this.value; });
  if(g('repApply')) g('repApply').addEventListener('click', loadReports);
}

function drawReportCharts(res){
  if(REPORT_CHART_1){ REPORT_CHART_1.destroy(); REPORT_CHART_1=null; }
  if(REPORT_CHART_2){ REPORT_CHART_2.destroy(); REPORT_CHART_2=null; }
  var ctx1 = document.getElementById('repChartDim');
  var ctx2 = document.getElementById('repChartTime');
  if(!window.Chart || !ctx1 || !ctx2) return;

  var dimLabels = res.byDimension.map(function(r){ return r.key; });
  REPORT_CHART_1 = new Chart(ctx1, {
    type:'bar',
    data:{ labels: dimLabels, datasets:[
      { label:'فروش', data: res.byDimension.map(function(r){return r.totalSales;}), backgroundColor:'#1E6F5C' },
      { label:'هزینه', data: res.byDimension.map(function(r){return r.totalCost;}), backgroundColor:'#A6402B' },
      { label:'سود', data: res.byDimension.map(function(r){return r.totalProfit;}), backgroundColor:'#C6A24D' }
    ]},
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });

  var periodLabels = res.byPeriod.map(function(r){ return r.periodLabel; });
  REPORT_CHART_2 = new Chart(ctx2, {
    type:'line',
    data:{ labels: periodLabels, datasets:[
      { label:'فروش', data: res.byPeriod.map(function(r){return r.totalSales;}), borderColor:'#1E6F5C', backgroundColor:'rgba(30,111,92,.15)', tension:.25, fill:true },
      { label:'سود', data: res.byPeriod.map(function(r){return r.totalProfit;}), borderColor:'#C6A24D', backgroundColor:'rgba(198,162,77,.15)', tension:.25, fill:true }
    ]},
    options:{ responsive:true, scales:{ y:{ beginAtZero:true } } }
  });
}
