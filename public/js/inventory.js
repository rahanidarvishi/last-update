"use strict";
var INV_TOOL = 'hotels'; // 'hotels' | 'flights'
var INV_ACTIVE_HOTEL = null;
var INV_ACTIVE_FLIGHT = null;
var INV_RATE_FORM = { itemType:'room', itemId:'', jy:null, jm:null, jd:null, price:'', currency:'' };
var INV_FC_FORM = { name:'', capacity:'', price:'', currency:'' };
var INV_NEW_FLIGHT = { origin:'', destination:'', airline:'', flightNumber:'', departDate:null, departTime:'', arriveDate:null, arriveTime:'' };
var INV_FLIGHT_SEARCH = { origin:'', destination:'', fromDate:null, toDate:null, results:null, error:'' };

async function loadInventory(){
  var settings = await ensureSettings();
  if(INV_TOOL==='hotels'){
    var hRes = await api.get('/inventory/hotels');
    renderInventoryHotels(hRes.hotels, settings);
  } else {
    var fRes = await api.get('/inventory/flights');
    renderInventoryFlights(fRes.flights, settings);
  }
}

function invToolSwitcher(){
  return '<div class="card"><div class="card-header-row"><h2>بخش</h2></div><div class="btn-group">'+
    '<button type="button" class="btn-small inv-tool-switch '+(INV_TOOL==='hotels'?'':'btn-ghost')+'" data-tool="hotels">🏨 هتل‌ها</button>'+
    '<button type="button" class="btn-small inv-tool-switch '+(INV_TOOL==='flights'?'':'btn-ghost')+'" data-tool="flights">✈️ پروازها</button>'+
  '</div></div>';
}

/* ================= Hotels ================= */
function renderInventoryHotels(hotels, settings){
  var canE = canEdit('inventory');
  var listHtml = hotels.length ? hotels.map(function(h){
    var active = INV_ACTIVE_HOTEL===h.id;
    return '<button type="button" class="inv-hotel-chip" data-id="'+h.id+'" style="display:flex;justify-content:space-between;width:100%;text-align:right;border:1px solid '+(active?'var(--primary)':'var(--border)')+';background:'+(active?'var(--primary-tint)':'var(--surface-alt)')+';border-radius:9px;padding:10px 12px;margin-bottom:8px;cursor:pointer;font-family:var(--font);">'+
      '<b>'+escapeHtml(h.name)+'</b><span style="color:var(--text-muted);font-size:12px;">'+escapeHtml(h.cityName)+' — '+pDigits(h.roomTypes.length)+' نوع اتاق، '+pDigits(h.services.length)+' خدمت</span>'+
    '</button>';
  }).join('') : '<div class="empty-state">هنوز هتلی تعریف نشده</div>';

  var detailHtml = '';
  var activeHotel = hotels.find(function(h){ return h.id===INV_ACTIVE_HOTEL; });
  if(activeHotel){
    var roomChips = activeHotel.roomTypes.length ? activeHotel.roomTypes.map(function(r){
      return '<div class="chip"><span>'+escapeHtml(r.name)+'</span>'+(canE?'<button type="button" class="icon-btn inv-del-room" data-rid="'+r.id+'">✕</button>':'')+'</div>';
    }).join('') : '<div class="empty-state">نوع اتاقی تعریف نشده</div>';
    var serviceChips = activeHotel.services.length ? activeHotel.services.map(function(s){
      return '<div class="chip"><span>'+escapeHtml(s.name)+'</span>'+(canE?'<button type="button" class="icon-btn inv-del-service" data-sid="'+s.id+'">✕</button>':'')+'</div>';
    }).join('') : '<div class="empty-state">خدمتی تعریف نشده</div>';

    var itemOptions = '<option value="">— انتخاب کنید —</option>';
    if(INV_RATE_FORM.itemType==='room'){
      activeHotel.roomTypes.forEach(function(r){ itemOptions += '<option value="'+r.id+'" '+(INV_RATE_FORM.itemId===r.id?'selected':'')+'>'+escapeHtml(r.name)+'</option>'; });
    } else {
      activeHotel.services.forEach(function(s){ itemOptions += '<option value="'+s.id+'" '+(INV_RATE_FORM.itemId===s.id?'selected':'')+'>'+escapeHtml(s.name)+'</option>'; });
    }

    var nameOf = function(itemType, itemId){
      var pool = itemType==='room' ? activeHotel.roomTypes : activeHotel.services;
      var found = pool.find(function(x){ return x.id===itemId; });
      return found ? found.name : '(حذف‌شده)';
    };
    var ratesSorted = activeHotel.rates.slice().sort(function(a,b){
      return (b.jy*10000+b.jm*100+b.jd) - (a.jy*10000+a.jm*100+a.jd);
    });
    var rateRows = ratesSorted.length ? ratesSorted.map(function(r){
      return '<tr><td>'+jStr(r)+'</td><td><span class="pill '+(r.itemType==='room'?'':'pill-pending')+'">'+(r.itemType==='room'?'🛏 اتاق':'🧾 خدمت')+'</span></td>'+
        '<td>'+escapeHtml(nameOf(r.itemType,r.itemId))+'</td><td class="amount-cell">'+pDigits(fmtNum(r.price))+' '+escapeHtml(r.currency)+'</td>'+
        '<td>'+(canE?'<button type="button" class="icon-btn inv-del-rate" data-rateid="'+r.id+'">🗑</button>':'')+'</td></tr>';
    }).join('') : '<tr><td colspan="5" class="empty-state">نرخی ثبت نشده</td></tr>';

    detailHtml = '<div class="card">'+
      '<div class="card-header-row"><h2>مدیریت هتل: '+escapeHtml(activeHotel.name)+'</h2>'+(canE?'<button type="button" class="btn-small btn-ghost inv-del-hotel" data-id="'+activeHotel.id+'">حذف هتل</button>':'')+'</div>'+
      '<div class="grid-2">'+
        '<div><div style="font-weight:700;margin-bottom:8px;">انواع اتاق</div>'+
          (canE?'<div class="add-row"><input type="text" id="invNewRoomType" placeholder="مثلاً Double"><button type="button" class="btn-small" id="invAddRoomType">افزودن</button></div>':'')+
          '<div class="chip-list">'+roomChips+'</div></div>'+
        '<div><div style="font-weight:700;margin-bottom:8px;">خدمات</div>'+
          (canE?'<div class="add-row"><input type="text" id="invNewService" placeholder="مثلاً صبحانه یا ترانسفر"><button type="button" class="btn-small" id="invAddService">افزودن</button></div>':'')+
          '<div class="chip-list">'+serviceChips+'</div></div>'+
      '</div>'+
    '</div>'+
    '<div class="card"><h2>تقویم نرخ شبانه</h2>'+
      '<p style="font-size:12px;color:var(--text-muted);">برای هر اتاق یا خدمت، نرخ هر شب را جداگانه ثبت کن — دقیقاً مثل تقویم نرخ سیستم‌های رزرو هتل.</p>'+
      (canE ? '<div class="grid-4">'+
        '<label>نوع<select id="invRateItemType"><option value="room" '+(INV_RATE_FORM.itemType==='room'?'selected':'')+'>اتاق</option><option value="service" '+(INV_RATE_FORM.itemType==='service'?'selected':'')+'>خدمت</option></select></label>'+
        '<label>مورد<select id="invRateItemId">'+itemOptions+'</select></label>'+
        '<label>تاریخ (شب موردنظر)'+dateBtnHtml('invRateDateBtn', INV_RATE_FORM, '')+'</label>'+
        '<label>نرخ<input type="text" inputmode="numeric" id="invRatePrice" value="'+(INV_RATE_FORM.price?fmtNum(INV_RATE_FORM.price):'')+'"></label>'+
      '</div>'+
      '<div class="grid-2" style="margin-top:10px;">'+
        '<label>ارز<select id="invRateCurrency">'+listOptions(settings.currencies, INV_RATE_FORM.currency)+'</select></label>'+
        '<div style="display:flex;align-items:end;"><button type="button" class="btn-primary" id="invRateSave">ثبت نرخ این شب</button></div>'+
      '</div>' : '')+
      '<span class="save-msg" id="invRateMsg" style="margin-top:6px;"></span>'+
      '<div class="table-wrap" style="margin-top:12px;"><table><thead><tr><th>تاریخ</th><th>نوع</th><th>مورد</th><th>نرخ</th><th></th></tr></thead><tbody>'+rateRows+'</tbody></table></div>'+
    '</div>';
  }

  qs('#tabContent').innerHTML = invToolSwitcher()+
    '<div class="card"><div class="card-header-row"><h2>هتل‌ها</h2></div>'+
      (canE ? '<div class="grid-3" style="margin-bottom:12px;">'+
        '<label>شهر<select id="invNewHotelCity">'+cityIdOptions(settings.cities, '')+'</select></label>'+
        '<label>نام هتل<input type="text" id="invNewHotelName" placeholder="مثلاً هتل اطلس"></label>'+
        '<div style="display:flex;align-items:end;"><button type="button" class="btn-primary" id="invAddHotel">افزودن هتل</button></div>'+
      '</div>' : '')+
      (canE ? '<span class="save-msg" id="invAddHotelMsg"></span>' : '')+
      listHtml+
    '</div>'+
    detailHtml;

  bindInventoryHotels(settings);
}

function bindInventoryHotels(settings){
  qsa('.inv-tool-switch').forEach(function(btn){ btn.addEventListener('click', function(){ INV_TOOL=this.getAttribute('data-tool'); loadInventory(); }); });
  var g = function(id){ return document.getElementById(id); };

  if(g('invAddHotel')) g('invAddHotel').addEventListener('click', async function(){
    var cityId = document.getElementById('invNewHotelCity').value;
    var name = document.getElementById('invNewHotelName').value.trim();
    if(!cityId || !name){ flashMsg('invAddHotelMsg','شهر و نام هتل را وارد کنید', true); return; }
    try{
      var res = await api.post('/inventory/hotels', { cityId:cityId, name:name });
      INV_ACTIVE_HOTEL = res.hotel.id;
      loadInventory();
    }catch(e){ flashMsg('invAddHotelMsg', e.message, true); }
  });

  qsa('.inv-hotel-chip').forEach(function(btn){ btn.addEventListener('click', function(){
    var id = this.getAttribute('data-id');
    INV_ACTIVE_HOTEL = (INV_ACTIVE_HOTEL===id) ? null : id;
    loadInventory();
  }); });
  qsa('.inv-del-hotel').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این هتل و همه‌ی اتاق/خدمات/نرخ‌هایش حذف شود؟')) return;
    await api.del('/inventory/hotels/'+this.getAttribute('data-id'));
    INV_ACTIVE_HOTEL = null;
    loadInventory();
  }); });

  if(g('invAddRoomType')) g('invAddRoomType').addEventListener('click', async function(){
    var val = document.getElementById('invNewRoomType').value.trim();
    if(!val) return;
    await api.post('/inventory/hotels/'+INV_ACTIVE_HOTEL+'/room-types', { name:val });
    loadInventory();
  });
  qsa('.inv-del-room').forEach(function(btn){ btn.addEventListener('click', async function(){
    await api.del('/inventory/hotels/'+INV_ACTIVE_HOTEL+'/room-types/'+this.getAttribute('data-rid'));
    loadInventory();
  }); });
  if(g('invAddService')) g('invAddService').addEventListener('click', async function(){
    var val = document.getElementById('invNewService').value.trim();
    if(!val) return;
    await api.post('/inventory/hotels/'+INV_ACTIVE_HOTEL+'/services', { name:val });
    loadInventory();
  });
  qsa('.inv-del-service').forEach(function(btn){ btn.addEventListener('click', async function(){
    await api.del('/inventory/hotels/'+INV_ACTIVE_HOTEL+'/services/'+this.getAttribute('data-sid'));
    loadInventory();
  }); });

  if(g('invRateItemType')) g('invRateItemType').addEventListener('change', function(){ INV_RATE_FORM.itemType=this.value; INV_RATE_FORM.itemId=''; loadInventory(); });
  if(g('invRateItemId')) g('invRateItemId').addEventListener('change', function(){ INV_RATE_FORM.itemId=this.value; });
  if(g('invRateCurrency')) g('invRateCurrency').addEventListener('change', function(){ INV_RATE_FORM.currency=this.value; });
  if(g('invRatePrice')) g('invRatePrice').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,''); this.value=v?fmtNum(v):''; INV_RATE_FORM.price=v; });
  var rateDateBtn = g('invRateDateBtn');
  if(rateDateBtn) rateDateBtn.addEventListener('click', function(){
    openCalendar(this, INV_RATE_FORM.jy?{jy:INV_RATE_FORM.jy,jm:INV_RATE_FORM.jm,jd:INV_RATE_FORM.jd}:null, function(picked){
      INV_RATE_FORM.jy=picked.jy; INV_RATE_FORM.jm=picked.jm; INV_RATE_FORM.jd=picked.jd;
      loadInventory();
    });
  });
  if(g('invRateSave')) g('invRateSave').addEventListener('click', async function(){
    if(!INV_RATE_FORM.itemId || !INV_RATE_FORM.jy || !INV_RATE_FORM.price || !INV_RATE_FORM.currency){
      flashMsg('invRateMsg','مورد، تاریخ، نرخ و ارز را کامل کنید', true); return;
    }
    try{
      await api.post('/inventory/hotels/'+INV_ACTIVE_HOTEL+'/rates', {
        itemType: INV_RATE_FORM.itemType, itemId: INV_RATE_FORM.itemId,
        jy:INV_RATE_FORM.jy, jm:INV_RATE_FORM.jm, jd:INV_RATE_FORM.jd,
        price: parseFloat(INV_RATE_FORM.price), currency: INV_RATE_FORM.currency
      });
      INV_RATE_FORM.price = '';
      flashMsg('invRateMsg','ثبت شد ✓', false);
      loadInventory();
    }catch(e){ flashMsg('invRateMsg', e.message, true); }
  });
  qsa('.inv-del-rate').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این نرخ حذف شود؟')) return;
    await api.del('/inventory/hotels/'+INV_ACTIVE_HOTEL+'/rates/'+this.getAttribute('data-rateid'));
    loadInventory();
  }); });
}

/* ================= Flights ================= */
function flightSearchResultChip(f, searchOrigin){
  var active = INV_ACTIVE_FLIGHT===f.id;
  var dirLabel = f.direction==='outbound' ? '✈️ رفت' : '↩️ برگشت';
  var dirPill = '<span class="pill '+(f.direction==='outbound'?'':'pill-pending')+'" style="margin-inline-end:8px;">'+dirLabel+'</span>';
  return '<button type="button" class="inv-search-result-chip" data-id="'+f.id+'" style="display:flex;justify-content:space-between;width:100%;text-align:right;border:1px solid '+(active?'var(--primary)':'var(--border)')+';background:'+(active?'var(--primary-tint)':'var(--surface-alt)')+';border-radius:9px;padding:10px 12px;margin-bottom:8px;cursor:pointer;font-family:var(--font);">'+
    '<b>'+dirPill+escapeHtml(f.origin)+' ◀ '+escapeHtml(f.destination)+'</b>'+
    '<span style="color:var(--text-muted);font-size:12px;">'+jStr({jy:f.departJy,jm:f.departJm,jd:f.departJd})+(f.departTime?(' — '+escapeHtml(f.departTime)):'')+(f.airline?(' — '+escapeHtml(f.airline)):'')+'</span>'+
  '</button>';
}

function invFlightSearchCard(settings){
  var s = INV_FLIGHT_SEARCH;
  var resultsHtml = '';
  if(s.error){
    resultsHtml = '<div class="pill pill-danger" style="margin-top:10px;">'+escapeHtml(s.error)+'</div>';
  } else if(s.results){
    resultsHtml = s.results.length ?
      ('<div style="margin-top:12px;">'+s.results.map(function(f){ return flightSearchResultChip(f, s.origin); }).join('')+'</div>') :
      '<div class="empty-state" style="margin-top:12px;">پروازی در این مسیر و بازه تاریخ یافت نشد</div>';
  }
  return '<div class="card"><h2>جستجوی پرواز (مبدا، مقصد و بازه تاریخ)</h2>'+
    '<p style="font-size:12px;color:var(--text-muted);">مبدا، مقصد و بازه تاریخ را انتخاب کن — هم پروازهای رفت (مبدا◀مقصد) و هم پروازهای برگشت (مقصد◀مبدا) همان مسیر که در این بازه تاریخ حرکت می‌کنند نشان داده می‌شود.</p>'+
    '<div class="grid-4">'+
      '<label>مبدا<select id="invSearchOrigin">'+cityOptions(settings.cities, s.origin)+'</select></label>'+
      '<label>مقصد<select id="invSearchDest">'+cityOptions(settings.cities, s.destination)+'</select></label>'+
      '<label>از تاریخ'+dateBtnHtml('invSearchFromDate', s.fromDate, '')+'</label>'+
      '<label>تا تاریخ'+dateBtnHtml('invSearchToDate', s.toDate, '')+'</label>'+
    '</div>'+
    '<div class="btn-group" style="margin-top:10px;">'+
      '<button type="button" class="btn-primary" id="invSearchGo">جستجو</button>'+
      '<button type="button" class="btn-small btn-ghost" id="invSearchClear">پاک کردن</button>'+
    '</div>'+
    resultsHtml+
  '</div>';
}

function renderInventoryFlights(flights, settings){
  var canE = canEdit('inventory');
  var sorted = flights.slice().sort(function(a,b){
    return (a.departJy*10000+a.departJm*100+a.departJd) - (b.departJy*10000+b.departJm*100+b.departJd);
  });
  var listHtml = sorted.length ? sorted.map(function(f){
    var active = INV_ACTIVE_FLIGHT===f.id;
    var totalSeats = f.fareClasses.reduce(function(s,c){return s+c.capacity;},0);
    var soldSeats = f.fareClasses.reduce(function(s,c){return s+c.seatsSold;},0);
    return '<button type="button" class="inv-flight-chip" data-id="'+f.id+'" style="display:flex;justify-content:space-between;width:100%;text-align:right;border:1px solid '+(active?'var(--primary)':'var(--border)')+';background:'+(active?'var(--primary-tint)':'var(--surface-alt)')+';border-radius:9px;padding:10px 12px;margin-bottom:8px;cursor:pointer;font-family:var(--font);">'+
      '<b>'+escapeHtml(f.origin)+' ◀ '+escapeHtml(f.destination)+'</b>'+
      '<span style="color:var(--text-muted);font-size:12px;">'+jStr({jy:f.departJy,jm:f.departJm,jd:f.departJd})+(f.departTime?(' — '+escapeHtml(f.departTime)):'')+' | '+pDigits(soldSeats)+'/'+pDigits(totalSeats)+' صندلی فروخته‌شده</span>'+
    '</button>';
  }).join('') : '<div class="empty-state">هنوز پروازی تعریف نشده</div>';

  var nf = INV_NEW_FLIGHT;
  var newFlightForm = canE ? (
    '<div class="card"><h2>افزودن پرواز جدید</h2>'+
      '<div class="grid-2">'+
        '<label>مبدا<select id="invFlOrigin">'+cityOptions(settings.cities, nf.origin)+'</select></label>'+
        '<label>مقصد<select id="invFlDest">'+cityOptions(settings.cities, nf.destination)+'</select></label>'+
      '</div>'+
      '<div class="grid-2" style="margin-top:10px;">'+
        '<label>ایرلاین (اختیاری)<input type="text" id="invFlAirline" value="'+escapeHtml(nf.airline)+'"></label>'+
        '<label>شماره پرواز (اختیاری)<input type="text" id="invFlNumber" value="'+escapeHtml(nf.flightNumber)+'"></label>'+
      '</div>'+
      '<div class="grid-4" style="margin-top:10px;">'+
        '<label>تاریخ حرکت'+dateBtnHtml('invFlDepartDate', nf.departDate, '')+'</label>'+
        '<label>ساعت حرکت<input type="text" id="invFlDepartTime" placeholder="مثلاً 14:30" value="'+escapeHtml(nf.departTime)+'"></label>'+
        '<label>تاریخ رسیدن'+dateBtnHtml('invFlArriveDate', nf.arriveDate, '')+'</label>'+
        '<label>ساعت رسیدن<input type="text" id="invFlArriveTime" placeholder="مثلاً 16:00" value="'+escapeHtml(nf.arriveTime)+'"></label>'+
      '</div>'+
      '<button type="button" class="btn-primary" id="invAddFlight" style="margin-top:10px;">افزودن پرواز</button>'+
      '<span class="save-msg" id="invFlMsg"></span>'+
    '</div>'
  ) : '';

  var detailHtml = '';
  var activeFlight = flights.find(function(f){ return f.id===INV_ACTIVE_FLIGHT; });
  if(activeFlight){
    var fcRows = activeFlight.fareClasses.length ? activeFlight.fareClasses.map(function(c){
      var available = c.capacity - c.seatsSold;
      return '<tr><td><b>'+escapeHtml(c.name)+'</b></td><td class="amount-cell">'+pDigits(fmtNum(c.price))+' '+escapeHtml(c.currency)+'</td>'+
        '<td>'+pDigits(c.capacity)+'</td><td>'+pDigits(c.seatsSold)+'</td>'+
        '<td><span class="pill '+(available>0?'':'pill-danger')+'">'+pDigits(available)+' صندلی خالی</span></td>'+
        '<td>'+(canE?'<button type="button" class="icon-btn inv-del-fc" data-fcid="'+c.id+'">🗑</button>':'')+'</td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty-state">کلاس نرخی تعریف نشده</td></tr>';

    var fcf = INV_FC_FORM;
    detailHtml = '<div class="card">'+
      '<div class="card-header-row"><h2>مدیریت پرواز: '+escapeHtml(activeFlight.origin)+' ◀ '+escapeHtml(activeFlight.destination)+' ('+jStr({jy:activeFlight.departJy,jm:activeFlight.departJm,jd:activeFlight.departJd})+')</h2>'+
        (canE?'<button type="button" class="btn-small btn-ghost inv-del-flight" data-id="'+activeFlight.id+'">حذف پرواز</button>':'')+
      '</div>'+
      '<div class="table-wrap"><table><thead><tr><th>کلاس نرخی</th><th>نرخ</th><th>ظرفیت</th><th>فروخته‌شده</th><th>وضعیت</th><th></th></tr></thead><tbody>'+fcRows+'</tbody></table></div>'+
      (canE ? '<div class="grid-4" style="margin-top:14px;">'+
        '<label>نام کلاس (مثلاً Economy)<input type="text" id="invFcName" value="'+escapeHtml(fcf.name)+'"></label>'+
        '<label>ظرفیت صندلی<input type="text" inputmode="numeric" id="invFcCapacity" value="'+escapeHtml(fcf.capacity)+'"></label>'+
        '<label>نرخ<input type="text" inputmode="numeric" id="invFcPrice" value="'+(fcf.price?fmtNum(fcf.price):'')+'"></label>'+
        '<label>ارز<select id="invFcCurrency">'+listOptions(settings.currencies, fcf.currency)+'</select></label>'+
      '</div><button type="button" class="btn-primary" id="invAddFc" style="margin-top:10px;">افزودن کلاس نرخی</button><span class="save-msg" id="invFcMsg"></span>' : '')+
    '</div>';
  }

  qs('#tabContent').innerHTML = invToolSwitcher()+
    invFlightSearchCard(settings)+
    '<div class="card"><h2>همه پروازها</h2>'+listHtml+'</div>'+
    newFlightForm+
    detailHtml;

  bindInventoryFlights(settings);
}

function bindInventoryFlights(settings){
  qsa('.inv-tool-switch').forEach(function(btn){ btn.addEventListener('click', function(){ INV_TOOL=this.getAttribute('data-tool'); loadInventory(); }); });
  var g = function(id){ return document.getElementById(id); };
  var nf = INV_NEW_FLIGHT;
  var sf = INV_FLIGHT_SEARCH;

  if(g('invSearchOrigin')) g('invSearchOrigin').addEventListener('change', function(){ sf.origin=this.value; });
  if(g('invSearchDest')) g('invSearchDest').addEventListener('change', function(){ sf.destination=this.value; });
  var searchFromBtn = g('invSearchFromDate');
  if(searchFromBtn) searchFromBtn.addEventListener('click', function(){
    openCalendar(this, sf.fromDate, function(picked){ sf.fromDate=picked; loadInventory(); });
  });
  var searchToBtn = g('invSearchToDate');
  if(searchToBtn) searchToBtn.addEventListener('click', function(){
    openCalendar(this, sf.toDate, function(picked){ sf.toDate=picked; loadInventory(); });
  });
  if(g('invSearchGo')) g('invSearchGo').addEventListener('click', async function(){
    if(!sf.origin || !sf.destination){ sf.error='مبدا و مقصد را انتخاب کن'; sf.results=null; loadInventory(); return; }
    try{
      var qparts = ['origin='+encodeURIComponent(sf.origin), 'destination='+encodeURIComponent(sf.destination)];
      if(sf.fromDate) qparts.push('fromJy='+sf.fromDate.jy+'&fromJm='+sf.fromDate.jm+'&fromJd='+sf.fromDate.jd);
      if(sf.toDate) qparts.push('toJy='+sf.toDate.jy+'&toJm='+sf.toDate.jm+'&toJd='+sf.toDate.jd);
      var res = await api.get('/inventory/flights/search?'+qparts.join('&'));
      sf.results = res.flights; sf.error='';
      loadInventory();
    }catch(e){ sf.error = e.message; sf.results=null; loadInventory(); }
  });
  if(g('invSearchClear')) g('invSearchClear').addEventListener('click', function(){
    INV_FLIGHT_SEARCH = { origin:'', destination:'', fromDate:null, toDate:null, results:null, error:'' };
    loadInventory();
  });
  qsa('.inv-search-result-chip').forEach(function(btn){ btn.addEventListener('click', function(){
    var id = this.getAttribute('data-id');
    INV_ACTIVE_FLIGHT = (INV_ACTIVE_FLIGHT===id) ? null : id;
    loadInventory();
  }); });

  qsa('.inv-flight-chip').forEach(function(btn){ btn.addEventListener('click', function(){
    var id = this.getAttribute('data-id');
    INV_ACTIVE_FLIGHT = (INV_ACTIVE_FLIGHT===id) ? null : id;
    loadInventory();
  }); });
  qsa('.inv-del-flight').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این پرواز و کلاس‌های نرخی‌اش حذف شود؟')) return;
    await api.del('/inventory/flights/'+this.getAttribute('data-id'));
    INV_ACTIVE_FLIGHT = null;
    loadInventory();
  }); });

  if(g('invFlOrigin')) g('invFlOrigin').addEventListener('change', function(){ nf.origin=this.value; });
  if(g('invFlDest')) g('invFlDest').addEventListener('change', function(){ nf.destination=this.value; });
  if(g('invFlAirline')) g('invFlAirline').addEventListener('input', function(){ nf.airline=this.value; });
  if(g('invFlNumber')) g('invFlNumber').addEventListener('input', function(){ nf.flightNumber=this.value; });
  if(g('invFlDepartTime')) g('invFlDepartTime').addEventListener('input', function(){ nf.departTime=this.value; });
  if(g('invFlArriveTime')) g('invFlArriveTime').addEventListener('input', function(){ nf.arriveTime=this.value; });
  var depBtn = g('invFlDepartDate');
  if(depBtn) depBtn.addEventListener('click', function(){
    openCalendar(this, nf.departDate, function(picked){ nf.departDate=picked; if(!nf.arriveDate) nf.arriveDate=picked; loadInventory(); });
  });
  var arrBtn = g('invFlArriveDate');
  if(arrBtn) arrBtn.addEventListener('click', function(){
    openCalendar(this, nf.arriveDate, function(picked){ nf.arriveDate=picked; loadInventory(); });
  });
  if(g('invAddFlight')) g('invAddFlight').addEventListener('click', async function(){
    if(!nf.origin || !nf.destination || !nf.departDate){ flashMsg('invFlMsg','مبدا، مقصد و تاریخ حرکت را کامل کنید', true); return; }
    try{
      var res = await api.post('/inventory/flights', {
        origin: nf.origin, destination: nf.destination, airline: nf.airline, flightNumber: nf.flightNumber,
        departJy: nf.departDate.jy, departJm: nf.departDate.jm, departJd: nf.departDate.jd, departTime: nf.departTime,
        arriveJy: (nf.arriveDate||nf.departDate).jy, arriveJm: (nf.arriveDate||nf.departDate).jm, arriveJd: (nf.arriveDate||nf.departDate).jd, arriveTime: nf.arriveTime
      });
      INV_NEW_FLIGHT = { origin:'', destination:'', airline:'', flightNumber:'', departDate:null, departTime:'', arriveDate:null, arriveTime:'' };
      INV_ACTIVE_FLIGHT = res.flight.id;
      flashMsg('invFlMsg','پرواز ثبت شد ✓', false);
      loadInventory();
    }catch(e){ flashMsg('invFlMsg', e.message, true); }
  });

  if(g('invFcName')) g('invFcName').addEventListener('input', function(){ INV_FC_FORM.name=this.value; });
  if(g('invFcCapacity')) g('invFcCapacity').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,''); this.value=v; INV_FC_FORM.capacity=v; });
  if(g('invFcPrice')) g('invFcPrice').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,''); this.value=v?fmtNum(v):''; INV_FC_FORM.price=v; });
  if(g('invFcCurrency')) g('invFcCurrency').addEventListener('change', function(){ INV_FC_FORM.currency=this.value; });
  if(g('invAddFc')) g('invAddFc').addEventListener('click', async function(){
    var f = INV_FC_FORM;
    if(!f.name || !f.capacity || !f.price || !f.currency){ flashMsg('invFcMsg','همه فیلدها الزامی است', true); return; }
    try{
      await api.post('/inventory/flights/'+INV_ACTIVE_FLIGHT+'/fare-classes', { name:f.name, capacity:parseInt(f.capacity,10), price:parseFloat(f.price), currency:f.currency });
      INV_FC_FORM = { name:'', capacity:'', price:'', currency:'' };
      flashMsg('invFcMsg','کلاس نرخی اضافه شد ✓', false);
      loadInventory();
    }catch(e){ flashMsg('invFcMsg', e.message, true); }
  });
  qsa('.inv-del-fc').forEach(function(btn){ btn.addEventListener('click', async function(){
    try{ await api.del('/inventory/flights/'+INV_ACTIVE_FLIGHT+'/fare-classes/'+this.getAttribute('data-fcid')); loadInventory(); }
    catch(e){ alert(e.message); }
  }); });
}
