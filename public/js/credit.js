"use strict";
var CREDIT_FILTER = { agency:'', search:'' };

async function loadCredit(){
  var params = [];
  if(CREDIT_FILTER.agency) params.push('agency='+encodeURIComponent(CREDIT_FILTER.agency));
  if(CREDIT_FILTER.search) params.push('search='+encodeURIComponent(CREDIT_FILTER.search));
  var res = await api.get('/credit'+(params.length?('?'+params.join('&')):''));
  renderCredit(res);
}

function renderCredit(res){
  var agencies = Object.keys(res.totalsByAgency);
  var grandTotal = agencies.reduce(function(s,a){ return s+res.totalsByAgency[a]; }, 0);
  var agencyChips = agencies.length ? agencies.map(function(a){
    var active = CREDIT_FILTER.agency===a;
    return '<button type="button" class="credit-chip" data-agency="'+escapeHtml(a)+'" style="display:flex;justify-content:space-between;width:100%;border:1px solid '+(active?'var(--primary)':'var(--border)')+';background:'+(active?'var(--primary-tint)':'var(--surface-alt)')+';border-radius:9px;padding:10px 12px;margin-bottom:8px;cursor:pointer;font-family:var(--font);"><b>'+escapeHtml(a)+'</b><span class="pill">'+fmtRial(res.totalsByAgency[a])+'</span></button>';
  }).join('') : '<div class="empty-state">بستانکاری‌ای ثبت نشده</div>';

  var rows = res.lines.length ? res.lines.map(function(l){
    return '<tr><td>'+jStr(l)+'</td><td>'+escapeHtml(l.agency)+'</td><td>'+escapeHtml(l.counter)+'</td><td>'+escapeHtml(l.voucherNumbers)+'</td>'+
      '<td class="amount-cell">'+fmtRial(l.totalAmount)+'</td><td class="amount-cell">'+fmtRial(l.depSum)+'</td><td class="amount-cell">'+fmtRial(l.outstanding)+'</td></tr>';
  }).join('') : '<tr><td colspan="7" class="empty-state">موردی یافت نشد</td></tr>';

  qs('#tabContent').innerHTML =
    '<div class="card"><h2>مجموع بستانکاری از آژانس‌ها</h2><span class="pill">'+fmtRial(grandTotal)+'</span></div>'+
    '<div class="card"><h2>بستانکاری هر آژانس</h2>'+agencyChips+'</div>'+
    '<div class="card">'+
      '<div class="filters"><input type="text" id="creditSearch" placeholder="جستجو" value="'+escapeHtml(CREDIT_FILTER.search)+'"><button type="button" class="btn-small btn-ghost" id="creditClear">پاک کردن فیلتر</button></div>'+
      '<div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>آژانس</th><th>کانتر</th><th>واچرها</th><th>مبلغ فروش</th><th>واریزی</th><th>باقیمانده</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '</div>';

  qsa('.credit-chip').forEach(function(btn){ btn.addEventListener('click', function(){
    var a = this.getAttribute('data-agency'); CREDIT_FILTER.agency = (CREDIT_FILTER.agency===a)?'':a; loadCredit();
  }); });
  var g = document.getElementById('creditSearch');
  if(g) g.addEventListener('change', function(){ CREDIT_FILTER.search=this.value; loadCredit(); });
  var c = document.getElementById('creditClear');
  if(c) c.addEventListener('click', function(){ CREDIT_FILTER={agency:'',search:''}; loadCredit(); });
}
