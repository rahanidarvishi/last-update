"use strict";
var BOOK_HOTELS = [];
var BOOK_FLIGHTS = [];
var BOOK_LAST_BOOKINGS = [];
var BOOK_LOGO = null;
var BOOK_SETTINGS = null;
var BOOK_COST_FULLY_KNOWN = true; // false when estimateTotalCostRial() had to skip a leg for lack of an FX rate

var BOOK_TIMELINE_OPEN = null;
var BOOK_PAGE = 1;
var BOOK_PAGE_SIZE = 50;
var BOOK_TOTAL = 0;
function freshPassenger(){ return { firstNameFa:'', lastNameFa:'', firstNameEn:'', lastNameEn:'', passportNumber:'', birthDate:null, passportExpiry:null }; }
function freshServiceSel(){ return { hotelId:'', serviceId:'', from:null, to:null, qty:1, quote:null, quoteError:'' }; }
function freshBookForm(){
  return {
    agency:'', counter:'', procurementExpert:'', paxCount:1,
    includeHotel:false, hotel:{ cityId:'', hotelId:'', roomTypeId:'', checkIn:null, checkOut:null, qty:1, quote:null, quoteError:'' },
    services:[],
    flightOut:{ flightId:'', seats:1, quote:null, quoteError:'' },
    includeReturn:false, flightIn:{ flightId:'', seats:1, quote:null, quoteError:'' },
    passengers:[ freshPassenger() ],
    sellingOverride:''
  };
}
var BOOK_FORM = freshBookForm();

async function loadBooking(){
  var settings = await ensureSettings();
  var hRes = await api.get('/inventory/hotels');
  var fRes = await api.get('/inventory/flights');
  BOOK_HOTELS = hRes.hotels;
  BOOK_FLIGHTS = fRes.flights;
  BOOK_LOGO = settings.companySettings || null;
  BOOK_SETTINGS = settings;
  syncPassengerCount();
  var bRes = await api.get('/booking?page='+BOOK_PAGE+'&pageSize='+BOOK_PAGE_SIZE);
  BOOK_LAST_BOOKINGS = bRes.bookings;
  BOOK_TOTAL = bRes.total;
  renderBooking(settings);
}

function syncPassengerCount(){
  var n = Math.max(1, parseInt(BOOK_FORM.paxCount,10)||1);
  while(BOOK_FORM.passengers.length < n) BOOK_FORM.passengers.push(freshPassenger());
  while(BOOK_FORM.passengers.length > n) BOOK_FORM.passengers.pop();
  BOOK_FORM.flightOut.seats = n;
  if(BOOK_FORM.includeReturn) BOOK_FORM.flightIn.seats = n;
}

function hotelsInCity(cityId){ return BOOK_HOTELS.filter(function(h){ return h.cityId===cityId; }); }
function activeHotelObj(hotelId){ return BOOK_HOTELS.find(function(h){ return h.id===hotelId; }); }
function flightAvailability(f){
  var total = f.fareClasses.reduce(function(s,c){return s+c.capacity;},0);
  var sold = f.fareClasses.reduce(function(s,c){return s+c.seatsSold;},0);
  return total-sold;
}
function flightOptionsHtml(selected){
  var opts = '<option value="">— انتخاب پرواز —</option>';
  BOOK_FLIGHTS.forEach(function(f){
    var avail = flightAvailability(f);
    opts += '<option value="'+f.id+'" '+(selected===f.id?'selected':'')+'>'+escapeHtml(f.origin)+' ◀ '+escapeHtml(f.destination)+' — '+jStr({jy:f.departJy,jm:f.departJm,jd:f.departJd})+' ('+pDigits(avail)+' صندلی خالی)</option>';
  });
  return opts;
}

function bookPaginationHtml(){
  var totalPages = Math.max(1, Math.ceil(BOOK_TOTAL/BOOK_PAGE_SIZE));
  return '<div class="pagination-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:10px;">'+
    '<span style="font-size:12.5px;color:var(--text-muted);">'+pDigits(BOOK_TOTAL)+' رزرو — صفحه '+pDigits(BOOK_PAGE)+' از '+pDigits(totalPages)+'</span>'+
    '<div style="display:flex;gap:8px;">'+
      '<button type="button" class="btn-small btn-ghost" id="bkPrevPage" '+(BOOK_PAGE<=1?'disabled':'')+'>◀ قبلی</button>'+
      '<button type="button" class="btn-small btn-ghost" id="bkNextPage" '+(BOOK_PAGE>=totalPages?'disabled':'')+'>بعدی ▶</button>'+
    '</div>'+
  '</div>';
}

function renderBooking(settings){
  var f = BOOK_FORM;
  var canE = canEdit('booking');

  var cityOpts = cityIdOptions(settings.cities, f.hotel.cityId);
  var hotelsForCity = f.hotel.cityId ? hotelsInCity(f.hotel.cityId) : [];
  var hotelOpts = '<option value="">— اول شهر را انتخاب کن —</option>' + hotelsForCity.map(function(h){
    return '<option value="'+h.id+'" '+(f.hotel.hotelId===h.id?'selected':'')+'>'+escapeHtml(h.name)+'</option>';
  }).join('');
  var activeHotel = activeHotelObj(f.hotel.hotelId);
  var roomOpts = activeHotel ? listOptionsFromObjs(activeHotel.roomTypes, f.hotel.roomTypeId) : '<option value="">— اول هتل را انتخاب کن —</option>';

  var hotelQuoteHtml = '';
  if(f.hotel.quoteError) hotelQuoteHtml = '<div class="pill pill-danger" style="margin-top:8px;">'+escapeHtml(f.hotel.quoteError)+'</div>';
  else if(f.hotel.quote){
    var nightsRows = f.hotel.quote.nights.map(function(n){ return '<tr><td>'+jStr(n)+'</td><td class="amount-cell">'+pDigits(fmtNum(n.price))+' '+escapeHtml(n.currency)+'</td></tr>'; }).join('');
    var subtotalByCur = {};
    f.hotel.quote.nights.forEach(function(n){ subtotalByCur[n.currency]=(subtotalByCur[n.currency]||0)+n.price*(f.hotel.qty||1); });
    var subtotalText = Object.keys(subtotalByCur).map(function(c){ return pDigits(fmtNum(subtotalByCur[c]))+' '+c; }).join(' + ');
    hotelQuoteHtml = '<div class="table-wrap" style="margin-top:8px;"><table><thead><tr><th>شب</th><th>نرخ هر اتاق</th></tr></thead><tbody>'+nightsRows+'</tbody></table></div>'+
      '<div class="pill" style="margin-top:6px;">جمع ('+pDigits(f.hotel.qty||1)+' اتاق): '+subtotalText+'</div>';
  }

  var servicesHtml = f.services.map(function(ss, i){
    var svcHotel = activeHotelObj(ss.hotelId);
    var svcOpts = svcHotel ? listOptionsFromObjs(svcHotel.services, ss.serviceId) : '<option value="">— اول هتل بالا را انتخاب کن —</option>';
    var quoteHtml = '';
    if(ss.quoteError) quoteHtml = '<div class="pill pill-danger" style="margin-top:6px;">'+escapeHtml(ss.quoteError)+'</div>';
    else if(ss.quote){
      var subtotal = {};
      ss.quote.nights.forEach(function(n){ subtotal[n.currency]=(subtotal[n.currency]||0)+n.price*(ss.qty||1); });
      var txt = Object.keys(subtotal).map(function(c){ return pDigits(fmtNum(subtotal[c]))+' '+c; }).join(' + ');
      quoteHtml = '<div class="pill" style="margin-top:6px;">جمع ('+pDigits(ss.qty||1)+' نفر/واحد): '+txt+' — '+pDigits(ss.quote.nights.length)+' شب</div>';
    }
    return '<div class="deposit-card" data-svc="'+i+'">'+
      '<div class="grid-3">'+
        '<label>خدمت<select class="bk-svc-id" data-idx="'+i+'">'+svcOpts+'</select></label>'+
        '<label>از تاریخ'+dateBtnHtml('bk-svc-from-'+i, ss.from, 'data-idx="'+i+'"')+'</label>'+
        '<label>تا تاریخ'+dateBtnHtml('bk-svc-to-'+i, ss.to, 'data-idx="'+i+'"')+'</label>'+
      '</div>'+
      '<div class="grid-2" style="margin-top:8px;">'+
        '<label>تعداد<input type="text" inputmode="numeric" class="bk-svc-qty" data-idx="'+i+'" value="'+ss.qty+'"></label>'+
        '<div style="display:flex;align-items:end;gap:8px;"><button type="button" class="btn-small bk-svc-quote" data-idx="'+i+'">استعلام قیمت</button><button type="button" class="btn-small btn-ghost bk-svc-remove" data-idx="'+i+'">حذف</button></div>'+
      '</div>'+quoteHtml+
    '</div>';
  }).join('');

  var outQuoteHtml = flightQuoteHtml(f.flightOut);
  var inQuoteHtml = flightQuoteHtml(f.flightIn);

  var passengersHtml = f.passengers.map(function(p, i){
    return '<div class="voucher-card" data-pax="'+i+'">'+
      '<div class="voucher-card-head"><div class="voucher-idx">'+pDigits(i+1)+'</div><div style="flex:1;font-weight:700;">مسافر '+pDigits(i+1)+'</div></div>'+
      '<div class="grid-2">'+
        '<label>نام (فارسی)<input type="text" class="bk-pax-fnfa" data-idx="'+i+'" value="'+escapeHtml(p.firstNameFa)+'"></label>'+
        '<label>نام‌خانوادگی (فارسی)<input type="text" class="bk-pax-lnfa" data-idx="'+i+'" value="'+escapeHtml(p.lastNameFa)+'"></label>'+
      '</div>'+
      '<div class="grid-2" style="margin-top:8px;">'+
        '<label>Name (English)<input type="text" class="bk-pax-fnen" data-idx="'+i+'" value="'+escapeHtml(p.firstNameEn)+'"></label>'+
        '<label>Last Name (English)<input type="text" class="bk-pax-lnen" data-idx="'+i+'" value="'+escapeHtml(p.lastNameEn)+'"></label>'+
      '</div>'+
      '<label style="margin-top:8px;">شماره پاسپورت<input type="text" class="bk-pax-passport" data-idx="'+i+'" value="'+escapeHtml(p.passportNumber)+'"></label>'+
      '<div class="grid-2" style="margin-top:8px;">'+
        '<label>تاریخ تولد'+dateBtnHtml('bk-pax-birth-'+i, p.birthDate, 'data-idx="'+i+'"')+'</label>'+
        '<label>تاریخ انقضای پاسپورت'+dateBtnHtml('bk-pax-expiry-'+i, p.passportExpiry, 'data-idx="'+i+'"')+'</label>'+
      '</div>'+
    '</div>';
  }).join('');

  var totalCostRial = estimateTotalCostRial();
  var suggestedRial = estimateSuggestedSellingRial();
  var sellingRial = f.sellingOverride!=='' ? (parseFloat(f.sellingOverride)||0) : suggestedRial;
  var profitRial = sellingRial - totalCostRial;

  var pastRows = BOOK_LAST_BOOKINGS.length ? BOOK_LAST_BOOKINGS.map(function(b){
    var statusPill = b.status==='cancelled' ? '<span class="pill pill-danger">لغوشده</span>' : '<span class="pill">تایید‌شده</span>';
    var mainRow = '<tr><td>'+jStr(b)+'</td><td><b>'+escapeHtml(b.voucherNumber)+'</b></td><td>'+escapeHtml(b.agency)+'</td>'+
      '<td>'+pDigits(b.passengers.length)+'</td><td class="amount-cell">'+fmtRial(b.pricing.sellingTotalRial)+'</td>'+
      '<td class="amount-cell" style="color:'+(b.pricing.profitRial>=0?'var(--primary-dark)':'var(--danger)')+';">'+fmtRial(b.pricing.profitRial)+(b.pricing.costFullyKnown===false?' <span class="pill pill-danger" title="نرخ ارز یکی از اقلام این رزرو ثبت نشده">⚠</span>':'')+'</td>'+
      '<td>'+statusPill+'</td>'+
      '<td><div class="btn-group">'+
        '<button type="button" class="icon-btn bk-timeline-toggle" data-id="'+b.id+'" title="تاریخچه">'+(BOOK_TIMELINE_OPEN===b.id?'▲':'🕐')+'</button>'+
        '<button type="button" class="btn-small bk-print-voucher" data-id="'+b.id+'">📄 واچر</button>'+
        '<button type="button" class="btn-small bk-print-ticket" data-id="'+b.id+'">🎫 بلیت</button>'+
        (b.status!=='cancelled' && canE ? '<button type="button" class="btn-small btn-ghost bk-cancel" data-id="'+b.id+'">لغو رزرو</button>' : '')+
      '</div></td></tr>';
    var timelineRow = '';
    if(BOOK_TIMELINE_OPEN===b.id){
      var events = (b.history||[]).slice().sort(function(x,y){ return x.at.localeCompare(y.at); });
      var labels = { created:'ایجاد رزرو', selling_price_changed:'تغییر مبلغ فروش', cancelled:'لغو رزرو' };
      var icons = { created:'🟢', selling_price_changed:'✏️', cancelled:'🔴' };
      var itemsHtml = events.length ? events.map(function(ev){
        var detailTxt = '';
        if(ev.event==='created') detailTxt = 'تعداد مسافر: '+pDigits(ev.details.passengerCount)+' — مبلغ فروش اولیه: '+fmtRial(ev.details.sellingTotalRial);
        if(ev.event==='selling_price_changed') detailTxt = 'از '+fmtRial(ev.details.from)+' به '+fmtRial(ev.details.to);
        return '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px dashed var(--border);">'+
          '<div style="font-size:16px;">'+(icons[ev.event]||'•')+'</div>'+
          '<div><b>'+(labels[ev.event]||ev.event)+'</b> — <span style="color:var(--text-muted);font-size:12px;">'+escapeHtml(ev.by)+' — '+new Date(ev.at).toLocaleString('fa-IR')+'</span>'+
          (detailTxt?('<div style="font-size:12.5px;margin-top:2px;">'+detailTxt+'</div>'):'')+
          '</div></div>';
      }).join('') : '<div class="empty-state">تاریخچه‌ای ثبت نشده</div>';
      timelineRow = '<tr><td colspan="8" style="background:#FBFAF6;"><div style="font-weight:700;margin-bottom:6px;">تاریخچه رزرو '+escapeHtml(b.voucherNumber)+'</div>'+itemsHtml+'</td></tr>';
    }
    return mainRow + timelineRow;
  }).join('') : '<tr><td colspan="8" class="empty-state">هنوز رزروی ثبت نشده</td></tr>';

  qs('#tabContent').innerHTML =
    '<div class="card"><h2>اطلاعات کلی رزرو</h2><div class="grid-3">'+
      '<label>آژانس<select id="bkAgency">'+listOptions(settings.agencies, f.agency)+'</select></label>'+
      '<label>کانتر<select id="bkCounter">'+listOptions(settings.counters, f.counter)+'</select></label>'+
      '<label>کارشناس تأمین<select id="bkExpert">'+listOptions(settings.procurementExperts, f.procurementExpert)+'</select></label>'+
    '</div><label style="margin-top:12px;max-width:200px;">تعداد مسافر<input type="text" inputmode="numeric" id="bkPaxCount" value="'+f.paxCount+'"></label></div>'+

    '<div class="card"><label style="flex-direction:row;align-items:center;gap:10px;"><input type="checkbox" id="bkIncludeHotel" '+(f.includeHotel?'checked':'')+'><span style="font-weight:700;">شامل رزرو هتل باشد</span></label>'+
      (f.includeHotel ? (
        '<div class="grid-2" style="margin-top:12px;">'+
          '<label>شهر<select id="bkCity">'+cityOpts+'</select></label>'+
          '<label>هتل<select id="bkHotel">'+hotelOpts+'</select></label>'+
        '</div>'+
        '<div class="grid-2" style="margin-top:10px;">'+
          '<label>نوع اتاق<select id="bkRoomType">'+roomOpts+'</select></label>'+
          '<label>تعداد اتاق<input type="text" inputmode="numeric" id="bkRoomQty" value="'+f.hotel.qty+'"></label>'+
        '</div>'+
        '<div class="grid-2" style="margin-top:10px;">'+
          '<label>تاریخ ورود'+dateBtnHtml('bkCheckIn', f.hotel.checkIn, '')+'</label>'+
          '<label>تاریخ خروج'+dateBtnHtml('bkCheckOut', f.hotel.checkOut, '')+'</label>'+
        '</div>'+
        '<button type="button" class="btn-small" id="bkHotelQuote" style="margin-top:10px;">استعلام قیمت هتل</button>'+
        hotelQuoteHtml+
        '<div class="card-header-row" style="margin-top:16px;"><h2 style="margin:0;">خدمات هتل (صبحانه، ترانسفر و...)</h2><button type="button" class="btn-small" id="bkAddService">+ افزودن خدمت</button></div>'+
        servicesHtml
      ) : '') +
    '</div>'+

    '<div class="card"><h2>پرواز رفت</h2>'+
      '<div class="grid-2"><label>انتخاب پرواز<select id="bkFlightOut">'+flightOptionsHtml(f.flightOut.flightId)+'</select></label>'+
      '<label>تعداد صندلی موردنیاز<input type="text" inputmode="numeric" id="bkFlightOutSeats" value="'+f.flightOut.seats+'"></label></div>'+
      '<button type="button" class="btn-small" id="bkFlightOutQuote" style="margin-top:10px;">استعلام تخصیص صندلی</button>'+
      outQuoteHtml+
    '</div>'+

    '<div class="card"><label style="flex-direction:row;align-items:center;gap:10px;"><input type="checkbox" id="bkIncludeReturn" '+(f.includeReturn?'checked':'')+'><span style="font-weight:700;">شامل پرواز برگشت باشد</span></label>'+
      (f.includeReturn ? (
        '<div class="grid-2" style="margin-top:12px;"><label>انتخاب پرواز<select id="bkFlightIn">'+flightOptionsHtml(f.flightIn.flightId)+'</select></label>'+
        '<label>تعداد صندلی موردنیاز<input type="text" inputmode="numeric" id="bkFlightInSeats" value="'+f.flightIn.seats+'"></label></div>'+
        '<button type="button" class="btn-small" id="bkFlightInQuote" style="margin-top:10px;">استعلام تخصیص صندلی</button>'+
        inQuoteHtml
      ) : '')+
    '</div>'+

    '<div class="card"><h2>مشخصات مسافران</h2>'+passengersHtml+'</div>'+

    '<div class="card"><h2>خلاصه قیمت</h2>'+
      '<div class="grid-3">'+
        statCard('مجموع هزینه (خرید)', fmtRial(totalCostRial), 'cost')+
        statCard('پیشنهاد فروش', fmtRial(suggestedRial), '')+
        statCard('سود', fmtRial(profitRial), 'profit')+
      '</div>'+
      (!BOOK_COST_FULLY_KNOWN ? '<div style="color:var(--danger);font-weight:700;margin-top:8px;">⚠ نرخ ارز یکی از اقلام این رزرو (هتل/خدمت/پرواز) برای این تاریخ ثبت نشده — اعداد بالا کمتر از هزینه واقعی هستند. لطفاً نرخ ارز را از بخش تنظیمات ثبت کنید.</div>' : '')+
      '<label style="margin-top:14px;max-width:280px;">مبلغ نهایی فروش به مشتری (ریال) — قابل ویرایش<input type="text" inputmode="numeric" id="bkSellingOverride" value="'+(f.sellingOverride?fmtNum(f.sellingOverride):'')+'" placeholder="'+fmtNum(Math.round(suggestedRial))+'"></label>'+
      '<div class="card-header-row" style="margin-top:16px;"><button type="button" class="btn-primary" id="bkConfirm" '+(canE?'':'disabled')+'>ثبت رزرو و صدور واچر</button><span class="save-msg" id="bkMsg"></span></div>'+
    '</div>'+

    '<div class="card"><h2>رزروهای قبلی</h2><div class="table-wrap"><table><thead><tr><th>تاریخ</th><th>شماره واچر</th><th>آژانس</th><th>مسافر</th><th>مبلغ فروش</th><th>سود</th><th>وضعیت</th><th></th></tr></thead><tbody>'+pastRows+'</tbody></table></div>'+
    bookPaginationHtml()+
    '</div>';

  bindBooking(settings);
}

function listOptionsFromObjs(list, selectedId){
  var opts = '<option value="">— انتخاب کنید —</option>';
  list.forEach(function(x){ opts += '<option value="'+x.id+'" '+(selectedId===x.id?'selected':'')+'>'+escapeHtml(x.name)+'</option>'; });
  return opts;
}

function flightQuoteHtml(leg){
  if(leg.quoteError) return '<div class="pill pill-danger" style="margin-top:8px;">'+escapeHtml(leg.quoteError)+'</div>';
  if(!leg.quote) return '';
  var rows = leg.quote.map(function(a){ return '<tr><td>'+escapeHtml(a.name)+'</td><td>'+pDigits(a.seats)+'</td><td class="amount-cell">'+pDigits(fmtNum(a.priceEach))+' '+escapeHtml(a.currency)+'</td><td class="amount-cell">'+(a.costEach!=null?pDigits(fmtNum(a.costEach))+' '+escapeHtml(a.costCurrency):'—')+'</td></tr>'; }).join('');
  return '<div class="table-wrap" style="margin-top:8px;"><table><thead><tr><th>کلاس نرخی</th><th>تعداد</th><th>نرخ فروش هر صندلی</th><th>نرخ نت هر صندلی</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}

// Client-side mirror of the server's utils/calc.js getExchangeRate — uses the
// same currencyRates log already loaded via settings, so the price summary
// updates live as the person builds the booking, before they ever submit.
function clientExchangeRate(currency, jy, jm, jd){
  if(!currency || !BOOK_SETTINGS) return null;
  var target = jy*10000+jm*100+jd;
  var best = null;
  (BOOK_SETTINGS.currencyRates||[]).forEach(function(cr){
    if(cr.currency!==currency) return;
    var k = cr.jy*10000+cr.jm*100+cr.jd;
    if(k>target) return;
    if(!best || k>(best.jy*10000+best.jm*100+best.jd)) best=cr;
  });
  return best ? best.rate : null;
}

function estimateTotalCostRial(){
  var f = BOOK_FORM;
  var total = 0;
  BOOK_COST_FULLY_KNOWN = true;
  if(f.hotel.quote){
    var qty = parseInt(f.hotel.qty,10)||1;
    f.hotel.quote.nights.forEach(function(n){
      var rate = clientExchangeRate(n.currency, n.jy, n.jm, n.jd);
      if(rate!=null) total += n.price*qty*rate; else BOOK_COST_FULLY_KNOWN = false;
    });
  }
  f.services.forEach(function(ss){
    if(!ss.quote) return;
    var qty = parseInt(ss.qty,10)||1;
    ss.quote.nights.forEach(function(n){
      var rate = clientExchangeRate(n.currency, n.jy, n.jm, n.jd);
      if(rate!=null) total += n.price*qty*rate; else BOOK_COST_FULLY_KNOWN = false;
    });
  });
  [{leg:f.flightOut, active:true}, {leg:f.flightIn, active:f.includeReturn}].forEach(function(x){
    if(!x.active || !x.leg.quote) return;
    var flt = BOOK_FLIGHTS.find(function(fl){ return fl.id===x.leg.flightId; });
    if(!flt) return;
    x.leg.quote.forEach(function(a){
      if(a.costEach==null) return;
      var rate = clientExchangeRate(a.costCurrency, flt.departJy, flt.departJm, flt.departJd);
      if(rate!=null) total += a.costEach*a.seats*rate; else BOOK_COST_FULLY_KNOWN = false;
    });
  });
  return total;
}

function estimateSuggestedSellingRial(){
  var f = BOOK_FORM;
  var total = 0;
  // Hotel/services have no separate sell price yet — same convention as the
  // server: suggested selling uses cost for these, only flights use the
  // selling (price) field. The agent can always override the final total.
  if(f.hotel.quote){
    var qty = parseInt(f.hotel.qty,10)||1;
    f.hotel.quote.nights.forEach(function(n){
      var rate = clientExchangeRate(n.currency, n.jy, n.jm, n.jd);
      if(rate!=null) total += n.price*qty*rate;
    });
  }
  f.services.forEach(function(ss){
    if(!ss.quote) return;
    var qty = parseInt(ss.qty,10)||1;
    ss.quote.nights.forEach(function(n){
      var rate = clientExchangeRate(n.currency, n.jy, n.jm, n.jd);
      if(rate!=null) total += n.price*qty*rate;
    });
  });
  [{leg:f.flightOut, active:true}, {leg:f.flightIn, active:f.includeReturn}].forEach(function(x){
    if(!x.active || !x.leg.quote) return;
    var flt = BOOK_FLIGHTS.find(function(fl){ return fl.id===x.leg.flightId; });
    if(!flt) return;
    x.leg.quote.forEach(function(a){
      var rate = clientExchangeRate(a.currency, flt.departJy, flt.departJm, flt.departJd);
      if(rate!=null) total += a.priceEach*a.seats*rate;
    });
  });
  return total;
}

function bindBooking(settings){
  var f = BOOK_FORM;
  var g = function(id){ return document.getElementById(id); };

  if(g('bkAgency')) g('bkAgency').addEventListener('change', function(){ f.agency=this.value; });
  if(g('bkCounter')) g('bkCounter').addEventListener('change', function(){ f.counter=this.value; });
  if(g('bkExpert')) g('bkExpert').addEventListener('change', function(){ f.procurementExpert=this.value; });
  if(g('bkPaxCount')) g('bkPaxCount').addEventListener('input', function(){
    var v=this.value.replace(/[^0-9]/g,''); this.value=v; f.paxCount=v; syncPassengerCount(); renderBooking(settings);
  });

  if(g('bkIncludeHotel')) g('bkIncludeHotel').addEventListener('change', function(){ f.includeHotel=this.checked; renderBooking(settings); });
  if(g('bkCity')) g('bkCity').addEventListener('change', function(){ f.hotel.cityId=this.value; f.hotel.hotelId=''; f.hotel.roomTypeId=''; renderBooking(settings); });
  if(g('bkHotel')) g('bkHotel').addEventListener('change', function(){ f.hotel.hotelId=this.value; f.hotel.roomTypeId=''; f.hotel.quote=null; renderBooking(settings); });
  if(g('bkRoomType')) g('bkRoomType').addEventListener('change', function(){ f.hotel.roomTypeId=this.value; f.hotel.quote=null; });
  if(g('bkRoomQty')) g('bkRoomQty').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,''); this.value=v; f.hotel.qty=v; });
  var ciBtn = g('bkCheckIn');
  if(ciBtn) ciBtn.addEventListener('click', function(){ openCalendar(this, f.hotel.checkIn, function(picked){ f.hotel.checkIn=picked; f.hotel.quote=null; renderBooking(settings); }); });
  var coBtn = g('bkCheckOut');
  if(coBtn) coBtn.addEventListener('click', function(){ openCalendar(this, f.hotel.checkOut, function(picked){ f.hotel.checkOut=picked; f.hotel.quote=null; renderBooking(settings); }); });
  if(g('bkHotelQuote')) g('bkHotelQuote').addEventListener('click', async function(){
    if(!f.hotel.hotelId || !f.hotel.roomTypeId || !f.hotel.checkIn || !f.hotel.checkOut){ f.hotel.quoteError='هتل، نوع اتاق و تاریخ ورود/خروج را کامل کنید'; f.hotel.quote=null; renderBooking(settings); return; }
    try{
      var q = await api.get('/booking/hotel-quote?hotelId='+f.hotel.hotelId+'&roomTypeId='+f.hotel.roomTypeId+
        '&inJy='+f.hotel.checkIn.jy+'&inJm='+f.hotel.checkIn.jm+'&inJd='+f.hotel.checkIn.jd+
        '&outJy='+f.hotel.checkOut.jy+'&outJm='+f.hotel.checkOut.jm+'&outJd='+f.hotel.checkOut.jd);
      f.hotel.quote = q; f.hotel.quoteError='';
    }catch(e){ f.hotel.quoteError = e.message; f.hotel.quote=null; }
    renderBooking(settings);
  });

  if(g('bkAddService')) g('bkAddService').addEventListener('click', function(){
    var s = freshServiceSel(); s.hotelId = f.hotel.hotelId;
    f.services.push(s); renderBooking(settings);
  });
  qsa('.bk-svc-id').forEach(function(sel){ sel.addEventListener('change', function(){ f.services[+this.dataset.idx].serviceId=this.value; f.services[+this.dataset.idx].quote=null; }); });
  qsa('.bk-svc-qty').forEach(function(inp){ inp.addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,''); this.value=v; f.services[+this.dataset.idx].qty=v; }); });
  qsa('.bk-svc-remove').forEach(function(btn){ btn.addEventListener('click', function(){ f.services.splice(+this.dataset.idx,1); renderBooking(settings); }); });
  f.services.forEach(function(ss, i){
    var fromBtn = document.getElementById('bk-svc-from-'+i);
    if(fromBtn) fromBtn.addEventListener('click', function(){ openCalendar(this, ss.from, function(picked){ ss.from=picked; ss.quote=null; renderBooking(settings); }); });
    var toBtn = document.getElementById('bk-svc-to-'+i);
    if(toBtn) toBtn.addEventListener('click', function(){ openCalendar(this, ss.to, function(picked){ ss.to=picked; ss.quote=null; renderBooking(settings); }); });
  });
  qsa('.bk-svc-quote').forEach(function(btn){ btn.addEventListener('click', async function(){
    var idx = +this.dataset.idx; var ss = f.services[idx];
    if(!ss.hotelId || !ss.serviceId || !ss.from || !ss.to){ ss.quoteError='خدمت و بازه تاریخ را کامل کنید'; ss.quote=null; renderBooking(settings); return; }
    try{
      var q = await api.get('/booking/service-quote?hotelId='+ss.hotelId+'&serviceId='+ss.serviceId+
        '&fromJy='+ss.from.jy+'&fromJm='+ss.from.jm+'&fromJd='+ss.from.jd+'&toJy='+ss.to.jy+'&toJm='+ss.to.jm+'&toJd='+ss.to.jd);
      ss.quote = q; ss.quoteError='';
    }catch(e){ ss.quoteError = e.message; ss.quote=null; }
    renderBooking(settings);
  }); });

  if(g('bkFlightOut')) g('bkFlightOut').addEventListener('change', function(){ f.flightOut.flightId=this.value; f.flightOut.quote=null; });
  if(g('bkFlightOutSeats')) g('bkFlightOutSeats').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,''); this.value=v; f.flightOut.seats=v; });
  if(g('bkFlightOutQuote')) g('bkFlightOutQuote').addEventListener('click', function(){ quoteFlightLeg(f.flightOut, settings); });

  if(g('bkIncludeReturn')) g('bkIncludeReturn').addEventListener('change', function(){ f.includeReturn=this.checked; if(f.includeReturn) f.flightIn.seats=f.flightOut.seats; renderBooking(settings); });
  if(g('bkFlightIn')) g('bkFlightIn').addEventListener('change', function(){ f.flightIn.flightId=this.value; f.flightIn.quote=null; });
  if(g('bkFlightInSeats')) g('bkFlightInSeats').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,''); this.value=v; f.flightIn.seats=v; });
  if(g('bkFlightInQuote')) g('bkFlightInQuote').addEventListener('click', function(){ quoteFlightLeg(f.flightIn, settings); });

  qsa('.bk-pax-fnfa').forEach(function(inp){ inp.addEventListener('input', function(){ f.passengers[+this.dataset.idx].firstNameFa=this.value; }); });
  qsa('.bk-pax-lnfa').forEach(function(inp){ inp.addEventListener('input', function(){ f.passengers[+this.dataset.idx].lastNameFa=this.value; }); });
  qsa('.bk-pax-fnen').forEach(function(inp){ inp.addEventListener('input', function(){ f.passengers[+this.dataset.idx].firstNameEn=this.value; }); });
  qsa('.bk-pax-lnen').forEach(function(inp){ inp.addEventListener('input', function(){ f.passengers[+this.dataset.idx].lastNameEn=this.value; }); });
  qsa('.bk-pax-passport').forEach(function(inp){ inp.addEventListener('input', function(){ f.passengers[+this.dataset.idx].passportNumber=this.value; }); });
  f.passengers.forEach(function(p, i){
    var bBtn = document.getElementById('bk-pax-birth-'+i);
    if(bBtn) bBtn.addEventListener('click', function(){ openCalendar(this, p.birthDate, function(picked){ p.birthDate=picked; renderBooking(settings); }); });
    var eBtn = document.getElementById('bk-pax-expiry-'+i);
    if(eBtn) eBtn.addEventListener('click', function(){ openCalendar(this, p.passportExpiry, function(picked){ p.passportExpiry=picked; renderBooking(settings); }); });
  });

  if(g('bkSellingOverride')) g('bkSellingOverride').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,''); this.value=v?fmtNum(v):''; f.sellingOverride=v; });

  if(g('bkConfirm')) g('bkConfirm').addEventListener('click', submitBooking);

  qsa('.bk-timeline-toggle').forEach(function(btn){ btn.addEventListener('click', function(){
    var id = this.getAttribute('data-id');
    BOOK_TIMELINE_OPEN = (BOOK_TIMELINE_OPEN===id) ? null : id;
    renderBooking(settings);
  }); });
  if(g('bkPrevPage')) g('bkPrevPage').addEventListener('click', function(){ if(BOOK_PAGE>1){ BOOK_PAGE--; loadBooking(); } });
  if(g('bkNextPage')) g('bkNextPage').addEventListener('click', function(){ BOOK_PAGE++; loadBooking(); });
  qsa('.bk-cancel').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این رزرو لغو شود؟ صندلی‌های پروازش آزاد می‌شود.')) return;
    await api.post('/booking/'+this.getAttribute('data-id')+'/cancel');
    loadBooking();
  }); });
  qsa('.bk-print-voucher').forEach(function(btn){ btn.addEventListener('click', async function(){
    var res = await api.get('/booking/'+this.getAttribute('data-id'));
    downloadVoucherPdf(res.booking, BOOK_LOGO);
  }); });
  qsa('.bk-print-ticket').forEach(function(btn){ btn.addEventListener('click', async function(){
    var res = await api.get('/booking/'+this.getAttribute('data-id'));
    downloadTicketPdf(res.booking, BOOK_LOGO);
  }); });
}

async function quoteFlightLeg(leg, settings){
  if(!leg.flightId || !leg.seats){ leg.quoteError='پرواز و تعداد صندلی را انتخاب کنید'; leg.quote=null; renderBooking(settings); return; }
  try{
    var q = await api.get('/booking/flight-quote?flightId='+leg.flightId+'&seats='+leg.seats);
    leg.quote = q.allocations; leg.quoteError='';
  }catch(e){ leg.quoteError = e.message; leg.quote=null; }
  renderBooking(settings);
}

async function submitBooking(){
  var f = BOOK_FORM;
  if(!f.agency || !f.counter){ flashMsg('bkMsg','آژانس و کانتر را انتخاب کنید', true); return; }
  for(var i=0;i<f.passengers.length;i++){
    var p = f.passengers[i];
    if(!p.lastNameFa || !p.passportNumber){ flashMsg('bkMsg','مسافر '+pDigits(i+1)+': نام‌خانوادگی و شماره پاسپورت الزامی است', true); return; }
  }
  var body = {
    agency: f.agency, counter: f.counter, procurementExpert: f.procurementExpert,
    passengers: f.passengers,
    sellingTotalOverrideRial: f.sellingOverride!=='' ? parseFloat(f.sellingOverride) : null
  };
  if(f.includeHotel && f.hotel.hotelId && f.hotel.roomTypeId && f.hotel.checkIn && f.hotel.checkOut){
    body.hotelSelection = { hotelId:f.hotel.hotelId, roomTypeId:f.hotel.roomTypeId, checkIn:f.hotel.checkIn, checkOut:f.hotel.checkOut, qty: parseInt(f.hotel.qty,10)||1 };
  }
  if(f.services.length){
    body.serviceSelections = f.services.filter(function(s){return s.hotelId&&s.serviceId&&s.from&&s.to;}).map(function(s){
      return { hotelId:s.hotelId, serviceId:s.serviceId, from:s.from, to:s.to, qty: parseInt(s.qty,10)||1 };
    });
  }
  if(f.flightOut.flightId){ body.flightOut = { flightId: f.flightOut.flightId, seats: parseInt(f.flightOut.seats,10)||f.passengers.length }; }
  if(f.includeReturn && f.flightIn.flightId){ body.flightIn = { flightId: f.flightIn.flightId, seats: parseInt(f.flightIn.seats,10)||f.passengers.length }; }

  try{
    var res = await api.post('/booking', body);
    flashMsg('bkMsg','رزرو با شماره واچر '+res.booking.voucherNumber+' ثبت شد ✓', false);
    BOOK_FORM = freshBookForm();
    BOOK_PAGE = 1; // the new booking is the most recent -> show it on page 1
    loadBooking();
  }catch(e){ flashMsg('bkMsg', e.message, true); }
}
