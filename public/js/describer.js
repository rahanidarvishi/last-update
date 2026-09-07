"use strict";
var DESC_ACTIVE_TOOL = 'describer'; // 'describer' | 'linkRequest'
var ROOM_TYPES = ['Single','Double','Triple','Quad'];

function freshDescriberHotel(){
  return { city:'', name:'', agent:'', roomTypes:[], roomRate:'', roomRateCurrency:'', serviceRate:'',
    nights:'', checkIn:null, checkOut:null };
}
function freshDescriberForm(){
  return {
    calType:'jalali', // 'jalali' | 'gregorian' — affects only how dates are written in the OUTPUT text
    flightOutOrigin:'', flightOutDestination:'', flightOutDate:null, flightOutAirlinePrice:'',
    flightInOrigin:'', flightInDestination:'', flightInDate:null, flightInAirlinePrice:'',
    hotels:[ freshDescriberHotel() ], otherInfo:'', output:''
  };
}
function freshLinkRequestLeg(){ return { origin:'', destination:'', hotelName:'', departDate:null, returnDate:null }; }
function freshLinkRequestForm(){
  return { calType:'jalali', requestingAgency:'', percentage:'', amountRial:'', tourType:'simple',
    legs:[ freshLinkRequestLeg() ], output:'' };
}

var DESC_FORM = freshDescriberForm();
var LINK_FORM = freshLinkRequestForm();

async function loadDescriber(){
  var settings = await ensureSettings();
  renderDescriber(settings);
}

function dateLabelFor(calType, dateObj){
  if(!dateObj || !dateObj.jy) return '—';
  if(calType==='gregorian'){
    var g = J.toGregorian(dateObj.jy, dateObj.jm, dateObj.jd);
    return g.gy+'/'+(g.gm<10?'0'+g.gm:g.gm)+'/'+(g.gd<10?'0'+g.gd:g.gd);
  }
  return J.jalaliStrOf(dateObj.jy, dateObj.jm, dateObj.jd);
}

function toolSwitcherHtml(){
  return '<div class="card"><div class="card-header-row"><h2>ابزار</h2></div><div class="btn-group">'+
    '<button type="button" class="btn-small desc-tool-switch '+(DESC_ACTIVE_TOOL==='describer'?'':'btn-ghost')+'" data-tool="describer">توضیح‌ساز</button>'+
    '<button type="button" class="btn-small desc-tool-switch '+(DESC_ACTIVE_TOOL==='linkRequest'?'':'btn-ghost')+'" data-tool="linkRequest">درخواست لینک</button>'+
  '</div></div>';
}

function renderDescriber(settings){
  if(DESC_ACTIVE_TOOL==='linkRequest'){ renderLinkRequest(settings); return; }
  var df = DESC_FORM;
  var canE = canEdit('describer');

  var hotelsHtml = df.hotels.map(function(h,i){
    var roomChips = ROOM_TYPES.map(function(rt){
      var checked = h.roomTypes.indexOf(rt)!==-1;
      return '<label style="display:inline-flex;align-items:center;gap:5px;font-weight:600;font-size:12.5px;margin-inline-end:12px;color:var(--text);flex-direction:row;">'+
        '<input type="checkbox" class="desc-room-type" data-idx="'+i+'" data-room="'+rt+'" '+(checked?'checked':'')+'> '+rt+'</label>';
    }).join('');
    return '<div class="voucher-card" data-h="'+i+'">'+
      '<div class="voucher-card-head"><div class="voucher-idx">'+pDigits(i+1)+'</div><div style="flex:1;font-weight:700;">هتل '+pDigits(i+1)+'</div>'+
        (df.hotels.length>1?'<button type="button" class="icon-btn desc-remove-hotel" data-idx="'+i+'">✕</button>':'')+'</div>'+
      '<div class="grid-2">'+
        '<label>شهر<select class="desc-hotel-city" data-idx="'+i+'">'+cityOptions(settings.cities, h.city)+'</select></label>'+
        '<label>هتل<select class="desc-hotel-name" data-idx="'+i+'">'+hotelOptsForCity(settings, h.city, h.name)+'</select></label>'+
      '</div>'+
      '<label>کارگذار تأمین<select class="desc-hotel-agent" data-idx="'+i+'">'+agentOptsForCity(settings, h.city, h.agent)+'</select></label>'+
      '<div class="grid-2">'+
        '<label>تاریخ ورود'+dateBtnHtml('desc-hotel-checkin', h.checkIn, 'data-idx="'+i+'"')+'</label>'+
        '<label>تاریخ خروج'+dateBtnHtml('desc-hotel-checkout', h.checkOut, 'data-idx="'+i+'"')+'</label>'+
      '</div>'+
      '<label>تعداد شب<input type="text" inputmode="numeric" class="desc-hotel-nights" data-idx="'+i+'" value="'+escapeHtml(h.nights)+'"></label>'+
      '<div><div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:600;">نوع اتاق</div>'+roomChips+'</div>'+
      '<div class="grid-2">'+
        '<label>نرخ اتاق<input type="text" inputmode="decimal" class="desc-room-rate" data-idx="'+i+'" value="'+escapeHtml(h.roomRate)+'"></label>'+
        '<label>ارز<select class="desc-room-currency" data-idx="'+i+'">'+listOptions(settings.currencies, h.roomRateCurrency)+'</select></label>'+
      '</div>'+
      '<label>نرخ خدمات'+(h.roomRateCurrency?(' ('+escapeHtml(h.roomRateCurrency)+')'):'')+'<input type="text" inputmode="decimal" class="desc-service-rate" data-idx="'+i+'" value="'+escapeHtml(h.serviceRate)+'"></label>'+
    '</div>';
  }).join('');

  qs('#tabContent').innerHTML = toolSwitcherHtml()+
    '<div class="card"><div class="card-header-row"><h2>نوع تقویم متن خروجی</h2></div><div class="btn-group">'+
      '<button type="button" class="btn-small desc-caltype '+(df.calType==='jalali'?'':'btn-ghost')+'" data-cal="jalali">شمسی</button>'+
      '<button type="button" class="btn-small desc-caltype '+(df.calType==='gregorian'?'':'btn-ghost')+'" data-cal="gregorian">میلادی</button>'+
    '</div></div>'+
    '<div class="card"><h2>پرواز رفت</h2><div class="grid-2">'+
      '<label>مبدا<select id="descOutOrigin">'+cityOptions(settings.cities, df.flightOutOrigin)+'</select></label>'+
      '<label>مقصد<select id="descOutDest">'+cityOptions(settings.cities, df.flightOutDestination)+'</select></label>'+
    '</div><div class="grid-2" style="margin-top:10px;">'+
      '<label>تاریخ رفت'+dateBtnHtml('descOutDateBtn', df.flightOutDate, '')+'</label>'+
      '<label>قیمت خرید از ایرلاین<input type="text" inputmode="decimal" id="descOutPrice" value="'+escapeHtml(df.flightOutAirlinePrice)+'"></label>'+
    '</div></div>'+
    '<div class="card"><h2>پرواز برگشت</h2><div class="grid-2">'+
      '<label>مبدا<select id="descInOrigin">'+cityOptions(settings.cities, df.flightInOrigin)+'</select></label>'+
      '<label>مقصد<select id="descInDest">'+cityOptions(settings.cities, df.flightInDestination)+'</select></label>'+
    '</div><div class="grid-2" style="margin-top:10px;">'+
      '<label>تاریخ برگشت'+dateBtnHtml('descInDateBtn', df.flightInDate, '')+'</label>'+
      '<label>قیمت خرید از ایرلاین<input type="text" inputmode="decimal" id="descInPrice" value="'+escapeHtml(df.flightInAirlinePrice)+'"></label>'+
    '</div></div>'+
    '<div class="card"><div class="card-header-row"><h2>هتل‌های موردنظر</h2><button type="button" class="btn-small" id="descAddHotel">+ افزودن هتل</button></div>'+hotelsHtml+'</div>'+
    '<div class="card"><h2>سایر اطلاعات</h2><textarea id="descOtherInfo" rows="3" placeholder="هر توضیح یا نکته اضافی…">'+escapeHtml(df.otherInfo)+'</textarea></div>'+
    (canE ? '<div class="card-header-row" style="margin-bottom:20px;"><button type="button" class="btn-primary" id="descGenerate">تولید متن</button></div>' : '')+
    (df.output ? (
      '<div class="card"><div class="card-header-row"><h2>متن آماده کپی</h2><button type="button" class="btn-small" id="descCopy">📋 کپی</button></div>'+
      '<textarea readonly id="descOutputArea" rows="16" style="white-space:pre-wrap;">'+escapeHtml(df.output)+'</textarea></div>'
    ) : '');

  bindDescriber(settings);
}

function hotelOptsForCity(settings, cityName, selected){
  var city = settings.cities.find(function(c){return c.name===cityName;});
  if(!city || !city.hotels.length) return '<option value="">— ابتدا شهر را انتخاب کن —</option>';
  return listOptions(city.hotels, selected);
}
function agentOptsForCity(settings, cityName, selected){
  var city = settings.cities.find(function(c){return c.name===cityName;});
  if(!city || !city.agents.length) return '<option value="">— ابتدا شهر را انتخاب کن —</option>';
  return listOptions(city.agents, selected);
}

function bindDescriber(settings){
  var g = function(id){ return document.getElementById(id); };
  var df = DESC_FORM;

  qsa('.desc-tool-switch').forEach(function(btn){ btn.addEventListener('click', function(){ DESC_ACTIVE_TOOL=this.getAttribute('data-tool'); renderDescriber(settings); }); });
  qsa('.desc-caltype').forEach(function(btn){ btn.addEventListener('click', function(){ df.calType=this.getAttribute('data-cal'); renderDescriber(settings); }); });

  if(g('descOutOrigin')) g('descOutOrigin').addEventListener('change', function(){ df.flightOutOrigin=this.value; });
  if(g('descOutDest')) g('descOutDest').addEventListener('change', function(){ df.flightOutDestination=this.value; });
  if(g('descInOrigin')) g('descInOrigin').addEventListener('change', function(){ df.flightInOrigin=this.value; });
  if(g('descInDest')) g('descInDest').addEventListener('change', function(){ df.flightInDestination=this.value; });
  if(g('descOutPrice')) g('descOutPrice').addEventListener('input', function(){ var v=this.value.replace(/[^0-9.]/g,''); this.value=v; df.flightOutAirlinePrice=v; });
  if(g('descInPrice')) g('descInPrice').addEventListener('input', function(){ var v=this.value.replace(/[^0-9.]/g,''); this.value=v; df.flightInAirlinePrice=v; });

  var outDateBtn = g('descOutDateBtn');
  if(outDateBtn) outDateBtn.addEventListener('click', function(){
    openCalendar(this, df.flightOutDate, function(picked){ df.flightOutDate=picked; renderDescriber(settings); });
  });
  var inDateBtn = g('descInDateBtn');
  if(inDateBtn) inDateBtn.addEventListener('click', function(){
    openCalendar(this, df.flightInDate, function(picked){ df.flightInDate=picked; renderDescriber(settings); });
  });

  qsa('.desc-hotel-city').forEach(function(sel){ sel.addEventListener('change', function(){
    var h = df.hotels[+this.dataset.idx]; h.city=this.value; h.name=''; h.agent=''; renderDescriber(settings);
  }); });
  qsa('.desc-hotel-name').forEach(function(sel){ sel.addEventListener('change', function(){ df.hotels[+this.dataset.idx].name=this.value; }); });
  qsa('.desc-hotel-agent').forEach(function(sel){ sel.addEventListener('change', function(){ df.hotels[+this.dataset.idx].agent=this.value; }); });
  qsa('.desc-hotel-checkin').forEach(function(btn){ btn.addEventListener('click', function(){
    var idx=+this.dataset.idx;
    openCalendar(this, df.hotels[idx].checkIn, function(picked){ df.hotels[idx].checkIn=picked; renderDescriber(settings); });
  }); });
  qsa('.desc-hotel-checkout').forEach(function(btn){ btn.addEventListener('click', function(){
    var idx=+this.dataset.idx;
    openCalendar(this, df.hotels[idx].checkOut, function(picked){ df.hotels[idx].checkOut=picked; renderDescriber(settings); });
  }); });
  qsa('.desc-hotel-nights').forEach(function(inp){ inp.addEventListener('input', function(){
    var v=this.value.replace(/[^0-9]/g,''); this.value=v; df.hotels[+this.dataset.idx].nights=v;
  }); });
  qsa('.desc-room-type').forEach(function(cb){ cb.addEventListener('change', function(){
    var h = df.hotels[+this.dataset.idx]; var rt=this.getAttribute('data-room'); var pos=h.roomTypes.indexOf(rt);
    if(this.checked && pos===-1) h.roomTypes.push(rt);
    if(!this.checked && pos!==-1) h.roomTypes.splice(pos,1);
  }); });
  qsa('.desc-room-rate').forEach(function(inp){ inp.addEventListener('input', function(){
    var v=this.value.replace(/[^0-9.]/g,''); this.value=v; df.hotels[+this.dataset.idx].roomRate=v;
  }); });
  qsa('.desc-room-currency').forEach(function(sel){ sel.addEventListener('change', function(){ df.hotels[+this.dataset.idx].roomRateCurrency=this.value; renderDescriber(settings); }); });
  qsa('.desc-service-rate').forEach(function(inp){ inp.addEventListener('input', function(){
    var v=this.value.replace(/[^0-9.]/g,''); this.value=v; df.hotels[+this.dataset.idx].serviceRate=v;
  }); });
  qsa('.desc-remove-hotel').forEach(function(btn){ btn.addEventListener('click', function(){ df.hotels.splice(+this.dataset.idx,1); renderDescriber(settings); }); });
  if(g('descAddHotel')) g('descAddHotel').addEventListener('click', function(){ df.hotels.push(freshDescriberHotel()); renderDescriber(settings); });
  if(g('descOtherInfo')) g('descOtherInfo').addEventListener('input', function(){ df.otherInfo=this.value; });

  if(g('descGenerate')) g('descGenerate').addEventListener('click', function(){ df.output = buildDescriberOutput(df); renderDescriber(settings); });
  if(g('descCopy')) g('descCopy').addEventListener('click', function(){ copyTextArea('descOutputArea', g('descCopy')); });
}

function routeTextSimple(o,d){ return (o||'—')+' ◀ '+(d||'—'); }

function buildDescriberOutput(df){
  var lines = [];
  var routeOut = (df.flightOutOrigin||df.flightOutDestination) ? routeTextSimple(df.flightOutOrigin, df.flightOutDestination) : '—';
  var routeIn = (df.flightInOrigin||df.flightInDestination) ? routeTextSimple(df.flightInOrigin, df.flightInDestination) : '—';
  lines.push('✈️ پرواز رفت: '+routeOut+(df.flightOutDate?(' | تاریخ: '+dateLabelFor(df.calType, df.flightOutDate)):'')+(df.flightOutAirlinePrice?(' | قیمت خرید از ایرلاین: '+fmtNum(parseFloat(df.flightOutAirlinePrice)||0)):''));
  lines.push('✈️ پرواز برگشت: '+routeIn+(df.flightInDate?(' | تاریخ: '+dateLabelFor(df.calType, df.flightInDate)):'')+(df.flightInAirlinePrice?(' | قیمت خرید از ایرلاین: '+fmtNum(parseFloat(df.flightInAirlinePrice)||0)):''));
  lines.push('');
  df.hotels.forEach(function(h,i){
    if(!h.name && !h.city && !h.roomRate && !h.serviceRate && !h.agent && !h.roomTypes.length && !h.nights && !h.checkIn && !h.checkOut) return;
    lines.push('🏨 هتل '+(i+1)+': '+(h.name||'—')+(h.city?(' — '+h.city):''));
    if(h.checkIn) lines.push('تاریخ ورود: '+dateLabelFor(df.calType, h.checkIn));
    if(h.checkOut) lines.push('تاریخ خروج: '+dateLabelFor(df.calType, h.checkOut));
    if(h.nights) lines.push('تعداد شب: '+h.nights);
    if(h.roomTypes.length) lines.push('نوع اتاق: '+h.roomTypes.join('، '));
    if(h.roomRate) lines.push('نرخ اتاق: '+fmtNum(parseFloat(h.roomRate)||0)+(h.roomRateCurrency?(' '+h.roomRateCurrency):''));
    if(h.serviceRate) lines.push('نرخ خدمات: '+fmtNum(parseFloat(h.serviceRate)||0)+(h.roomRateCurrency?(' '+h.roomRateCurrency):''));
    if(h.agent) lines.push('کارگذار تأمین: '+h.agent);
    lines.push('');
  });
  if(df.otherInfo && df.otherInfo.trim()){ lines.push('📝 سایر اطلاعات:'); lines.push(df.otherInfo.trim()); }
  return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

/* ================= Link request sub-tool ================= */
function renderLinkRequest(settings){
  var lf = LINK_FORM;
  var legsHtml = lf.legs.map(function(leg,i){
    return '<div class="voucher-card" data-leg="'+i+'">'+
      '<div class="voucher-card-head"><div class="voucher-idx">'+pDigits(i+1)+'</div><div style="flex:1;font-weight:700;">'+(lf.tourType==='combined'?('مسیر '+pDigits(i+1)):'مسیر تور')+'</div></div>'+
      '<div class="grid-2">'+
        '<label>مبدأ<select class="lr-origin" data-idx="'+i+'">'+cityOptions(settings.cities, leg.origin)+'</select></label>'+
        '<label>مقصد<select class="lr-dest" data-idx="'+i+'">'+cityOptions(settings.cities, leg.destination)+'</select></label>'+
      '</div>'+
      '<label>نام هتل<input type="text" class="lr-hotel-name" data-idx="'+i+'" value="'+escapeHtml(leg.hotelName)+'"></label>'+
      '<div class="grid-2">'+
        '<label>تاریخ رفت'+dateBtnHtml('lr-depart', leg.departDate, 'data-idx="'+i+'"')+'</label>'+
        '<label>تاریخ برگشت'+dateBtnHtml('lr-return', leg.returnDate, 'data-idx="'+i+'"')+'</label>'+
      '</div>'+
    '</div>';
  }).join('');

  qs('#tabContent').innerHTML = toolSwitcherHtml()+
    '<div class="card"><h2>اطلاعات درخواست</h2><div class="grid-2">'+
      '<label>آژانس درخواست‌دهنده<select id="lrAgency">'+listOptions(settings.agencies, lf.requestingAgency)+'</select></label>'+
      '<label>درصد مبلغ<input type="text" inputmode="numeric" id="lrPercentage" value="'+escapeHtml(lf.percentage)+'" maxlength="3"></label>'+
    '</div><label style="margin-top:12px;">مبلغ (ریال)<input type="text" inputmode="numeric" id="lrAmount" value="'+(lf.amountRial?fmtNum(lf.amountRial):'')+'"></label></div>'+
    '<div class="card"><div class="card-header-row"><h2>نوع تور</h2></div><div class="btn-group">'+
      '<button type="button" class="btn-small lr-tourtype '+(lf.tourType==='simple'?'':'btn-ghost')+'" data-type="simple">ساده</button>'+
      '<button type="button" class="btn-small lr-tourtype '+(lf.tourType==='combined'?'':'btn-ghost')+'" data-type="combined">ترکیبی</button>'+
    '</div></div>'+
    '<div class="card"><div class="card-header-row"><h2>'+(lf.tourType==='combined'?'مسیرهای تور (۲ مسیر)':'مسیر تور')+'</h2></div>'+legsHtml+'</div>'+
    (canEdit('describer') ? '<div class="card-header-row" style="margin-bottom:20px;"><button type="button" class="btn-primary" id="lrGenerate">تولید متن</button></div>' : '')+
    (lf.output ? (
      '<div class="card"><div class="card-header-row"><h2>متن آماده کپی</h2><button type="button" class="btn-small" id="lrCopy">📋 کپی</button></div>'+
      '<textarea readonly id="lrOutputArea" rows="14" style="white-space:pre-wrap;">'+escapeHtml(lf.output)+'</textarea></div>'
    ) : '');

  bindLinkRequest(settings);
}

function bindLinkRequest(settings){
  var g = function(id){ return document.getElementById(id); };
  var lf = LINK_FORM;

  qsa('.desc-tool-switch').forEach(function(btn){ btn.addEventListener('click', function(){ DESC_ACTIVE_TOOL=this.getAttribute('data-tool'); renderDescriber(settings); }); });

  if(g('lrAgency')) g('lrAgency').addEventListener('change', function(){ lf.requestingAgency=this.value; });
  if(g('lrPercentage')) g('lrPercentage').addEventListener('input', function(){
    var v=this.value.replace(/[^0-9]/g,''); if(v!==''){ var n=parseInt(v,10); if(n>100) v='100'; } this.value=v; lf.percentage=v;
  });
  var amtEl = g('lrAmount');
  if(amtEl) amtEl.addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,''); this.value=v?fmtNum(v):''; lf.amountRial=v; });

  qsa('.lr-tourtype').forEach(function(btn){ btn.addEventListener('click', function(){
    var type = this.getAttribute('data-type'); lf.tourType=type;
    if(type==='combined'){ while(lf.legs.length<2) lf.legs.push(freshLinkRequestLeg()); }
    else { lf.legs = [ lf.legs[0] || freshLinkRequestLeg() ]; }
    renderLinkRequest(settings);
  }); });

  qsa('.lr-origin').forEach(function(sel){ sel.addEventListener('change', function(){ lf.legs[+this.dataset.idx].origin=this.value; }); });
  qsa('.lr-dest').forEach(function(sel){ sel.addEventListener('change', function(){ lf.legs[+this.dataset.idx].destination=this.value; }); });
  qsa('.lr-hotel-name').forEach(function(inp){ inp.addEventListener('input', function(){ lf.legs[+this.dataset.idx].hotelName=this.value; }); });
  qsa('.lr-depart').forEach(function(btn){ btn.addEventListener('click', function(){
    var idx=+this.dataset.idx;
    openCalendar(this, lf.legs[idx].departDate, function(picked){ lf.legs[idx].departDate=picked; renderLinkRequest(settings); });
  }); });
  qsa('.lr-return').forEach(function(btn){ btn.addEventListener('click', function(){
    var idx=+this.dataset.idx;
    openCalendar(this, lf.legs[idx].returnDate, function(picked){ lf.legs[idx].returnDate=picked; renderLinkRequest(settings); });
  }); });

  if(g('lrGenerate')) g('lrGenerate').addEventListener('click', function(){ lf.output = buildLinkRequestOutput(lf); renderLinkRequest(settings); });
  if(g('lrCopy')) g('lrCopy').addEventListener('click', function(){ copyTextArea('lrOutputArea', g('lrCopy')); });
}

function buildLinkRequestOutput(lf){
  var lines = [];
  lines.push('🔗 درخواست لینک پرداخت');
  lines.push('آژانس درخواست‌دهنده: '+(lf.requestingAgency||'—'));
  lines.push('درصد مبلغ: '+(lf.percentage!==''&&lf.percentage!=null ? lf.percentage+'%' : '—'));
  lines.push('مبلغ: '+(lf.amountRial ? fmtNum(lf.amountRial)+' ریال' : '—'));
  lines.push('نوع تور: '+(lf.tourType==='combined' ? 'ترکیبی' : 'ساده'));
  lines.push('');
  lf.legs.forEach(function(leg,i){
    if(!leg.origin && !leg.destination && !leg.hotelName && !leg.departDate && !leg.returnDate) return;
    lines.push((lf.tourType==='combined' ? ('✈️ مسیر '+(i+1)+': ') : '✈️ مسیر: ') + (leg.origin||'—')+' به '+(leg.destination||'—'));
    if(leg.hotelName) lines.push('هتل: '+leg.hotelName);
    if(leg.departDate) lines.push('تاریخ رفت: '+dateLabelFor(lf.calType, leg.departDate));
    if(leg.returnDate) lines.push('تاریخ برگشت: '+dateLabelFor(lf.calType, leg.returnDate));
    lines.push('');
  });
  return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

function copyTextArea(id, btn){
  var area = document.getElementById(id);
  area.select();
  var done = function(){ var orig=btn.textContent; btn.textContent='✓ کپی شد'; setTimeout(function(){ btn.textContent=orig; }, 1800); };
  try{
    navigator.clipboard.writeText(area.value).then(done).catch(function(){ document.execCommand('copy'); done(); });
  }catch(e){ try{ document.execCommand('copy'); done(); }catch(e2){} }
}
