"use strict";
var NE_FORM = null;
function freshVoucherNE(){
  return { id:null, number:'', stayCity:'', hotel:'', agent:'', purchaseAmount:'', purchaseCurrency:'',
    serviceAmount:'', flightOutOrigin:'', flightOutDestination:'', flightInOrigin:'', flightInDestination:'',
    flightOutPriceMillion:'', flightInPriceMillion:'' };
}
function freshDepositNE(){ return { amount:'', jy:null, jm:null, jd:null, platform:'' }; }
function freshFormNE(){
  return { editingId:null, agency:'', counter:'', procurementExpert:'',
    vouchers:[ freshVoucherNE() ], totalAmount:'', deposits:[ freshDepositNE() ], needsCorrection:false };
}

async function loadNewEntry(){
  if(!NE_FORM) NE_FORM = freshFormNE();
  var settings = await ensureSettings();
  renderNewEntry(settings);
}

function hotelOptsForCity(settings, cityName, selected){
  var city = settings.cities.find(function(c){return c.name===cityName;});
  if(!city || !city.hotels.length) return '<option value="">— ابتدا شهر را انتخاب کن یا از تنظیمات هتل اضافه کن —</option>';
  return listOptions(city.hotels, selected);
}
function agentOptsForCity(settings, cityName, selected){
  var city = settings.cities.find(function(c){return c.name===cityName;});
  if(!city || !city.agents.length) return '<option value="">— ابتدا شهر را انتخاب کن یا از تنظیمات کارگذار اضافه کن —</option>';
  return listOptions(city.agents, selected);
}

function renderNewEntry(settings){
  var f = NE_FORM;
  var readOnly = !canEdit('newEntry');

  var voucherRows = f.vouchers.map(function(v, i){
    var outRial = v.flightOutPriceMillion ? fmtRial((parseFloat(v.flightOutPriceMillion)||0)*10000000) : '';
    var inRial = v.flightInPriceMillion ? fmtRial((parseFloat(v.flightInPriceMillion)||0)*10000000) : '';
    return '<div class="voucher-card" data-v="'+i+'">'+
      '<div class="voucher-card-head"><div class="voucher-idx">'+pDigits(i+1)+'</div>'+
        '<input type="text" class="ne-number" data-idx="'+i+'" placeholder="شماره واچر '+pDigits(i+1)+'" value="'+escapeHtml(v.number)+'"></div>'+
      '<div style="font-size:11px;font-weight:800;color:var(--gold-deep);">پرواز رفت</div>'+
      '<div class="grid-2">'+
        '<label>مبدا<select class="ne-out-origin" data-idx="'+i+'">'+cityOptions(settings.cities, v.flightOutOrigin)+'</select></label>'+
        '<label>مقصد<select class="ne-out-dest" data-idx="'+i+'">'+cityOptions(settings.cities, v.flightOutDestination)+'</select></label>'+
      '</div>'+
      '<label>قیمت پرواز رفت (میلیون تومان)<input type="text" inputmode="decimal" class="ne-out-price" data-idx="'+i+'" value="'+escapeHtml(v.flightOutPriceMillion)+'" placeholder="مثلاً 10"></label>'+
      (outRial ? '<div class="pill">= '+outRial+'</div>' : '') +
      '<div style="font-size:11px;font-weight:800;color:var(--gold-deep);">پرواز برگشت</div>'+
      '<div class="grid-2">'+
        '<label>مبدا<select class="ne-in-origin" data-idx="'+i+'">'+cityOptions(settings.cities, v.flightInOrigin)+'</select></label>'+
        '<label>مقصد<select class="ne-in-dest" data-idx="'+i+'">'+cityOptions(settings.cities, v.flightInDestination)+'</select></label>'+
      '</div>'+
      '<label>قیمت پرواز برگشت (میلیون تومان)<input type="text" inputmode="decimal" class="ne-in-price" data-idx="'+i+'" value="'+escapeHtml(v.flightInPriceMillion)+'" placeholder="مثلاً 10"></label>'+
      (inRial ? '<div class="pill">= '+inRial+'</div>' : '') +
      '<div style="font-size:11px;font-weight:800;color:var(--gold-deep);">هتل و خرید</div>'+
      '<label>شهر اقامت<select class="ne-stay-city" data-idx="'+i+'">'+cityOptions(settings.cities, v.stayCity||v.flightOutDestination)+'</select></label>'+
      '<div class="grid-2">'+
        '<label>هتل<select class="ne-hotel" data-idx="'+i+'">'+hotelOptsForCity(settings, v.stayCity||v.flightOutDestination, v.hotel)+'</select></label>'+
        '<label>کارگذار<select class="ne-agent" data-idx="'+i+'">'+agentOptsForCity(settings, v.stayCity||v.flightOutDestination, v.agent)+'</select></label>'+
      '</div>'+
      '<div class="grid-2">'+
        '<label>مبلغ خرید هتل<input type="text" inputmode="decimal" class="ne-purchase" data-idx="'+i+'" value="'+escapeHtml(v.purchaseAmount)+'"></label>'+
        '<label>ارز<select class="ne-currency" data-idx="'+i+'">'+listOptions(settings.currencies, v.purchaseCurrency,'از تنظیمات اضافه کن')+'</select></label>'+
      '</div>'+
      '<label>هزینه خدمات'+(v.purchaseCurrency?(' ('+escapeHtml(v.purchaseCurrency)+')'):'')+'<input type="text" inputmode="decimal" class="ne-service" data-idx="'+i+'" value="'+escapeHtml(v.serviceAmount)+'"></label>'+
    '</div>';
  }).join('');

  var depRows = f.deposits.map(function(d, i){
    return '<div class="deposit-card" data-d="'+i+'">'+
      '<div class="grid-3">'+
        '<label>مبلغ واریزی (ریال)<input type="text" inputmode="numeric" class="ne-dep-amount" data-idx="'+i+'" value="'+(d.amount?fmtNum(d.amount):'')+'"></label>'+
        '<label>تاریخ'+dateBtnHtml('ne-dep-date', d, 'data-idx="'+i+'"')+'</label>'+
        '<label>پلتفرم<select class="ne-dep-platform" data-idx="'+i+'">'+
          '<option value="">انتخاب کنید</option>'+
          '<option value="سپهر" '+(d.platform==='سپهر'?'selected':'')+'>سپهر</option>'+
          '<option value="سپهران" '+(d.platform==='سپهران'?'selected':'')+'>سپهران</option>'+
        '</select></label>'+
      '</div>'+
      '<button type="button" class="btn-small btn-ghost ne-dep-remove" data-idx="'+i+'">حذف این واریزی</button>'+
    '</div>';
  }).join('');

  var depSum = f.deposits.reduce(function(s,d){ return s + (parseFloat(d.amount)||0); }, 0);
  var total = parseFloat(f.totalAmount) || 0;
  var diff = total - depSum;

  qs('#tabContent').innerHTML =
    (f.editingId ? '<div class="card" style="background:var(--gold-tint);"><b>در حال ویرایش رکورد</b> — بعد از اصلاح «به‌روزرسانی» را بزنید. <button type="button" class="btn-small" id="neCancelEdit" style="margin-inline-start:10px;">لغو ویرایش</button></div>' : '') +
    '<div class="card"><h2>اطلاعات آژانس</h2><div class="grid-2">'+
      '<label>آژانس<select id="neAgency">'+listOptions(settings.agencies, f.agency,'از تنظیمات اضافه کن')+'</select></label>'+
      '<label>کانتر<select id="neCounter">'+listOptions(settings.counters, f.counter,'از تنظیمات اضافه کن')+'</select></label>'+
    '</div><div class="grid-2" style="margin-top:12px;">'+
      '<label>کارشناس تأمین<select id="neExpert">'+listOptions(settings.procurementExperts, f.procurementExpert,'از تنظیمات اضافه کن')+'</select></label>'+
    '</div></div>'+
    '<div class="card"><div class="card-header-row"><h2>واچرها ('+pDigits(f.vouchers.length)+' از ۱۰)</h2>'+
      '<div class="btn-group"><button type="button" class="btn-small" id="neAddVoucher">+ افزودن</button><button type="button" class="btn-small btn-ghost" id="neRemoveVoucher">- حذف آخرین</button></div>'+
    '</div>'+voucherRows+'</div>'+
    '<div class="card"><h2>مبلغ کل فروش</h2><label>مبلغ کل فروش (ریال)<input type="text" inputmode="numeric" id="neTotal" value="'+(total?fmtNum(total):'')+'"></label></div>'+
    '<div class="card"><div class="card-header-row"><h2>واریزی‌ها</h2><button type="button" class="btn-small" id="neAddDeposit">+ افزودن واریزی</button></div>'+
      depRows +
      '<div class="pill '+(diff===0&&total>0?'':(diff<0?'pill-danger':'pill-pending'))+'" style="margin-top:6px;">'+
        'مجموع واریزی: '+fmtRial(depSum)+' — '+(diff===0&&total>0?'مطابق مبلغ فروش ✓':(diff>0?('مانده: '+fmtRial(diff)):('واریزی بیش از فروش: '+fmtRial(Math.abs(diff)))))+
      '</div>'+
    '</div>'+
    '<div class="card"><label style="flex-direction:row;align-items:center;gap:10px;"><input type="checkbox" id="neNeedsCorrection" '+(f.needsCorrection?'checked':'')+'> <span>این رزرو نیاز به اصلاح دارد (اختیاری)</span></label></div>'+
    '<div class="card-header-row" style="margin-bottom:20px;">'+
      '<button type="button" class="btn-primary" id="neSave" '+(readOnly?'disabled':'')+'>'+(f.editingId?'به‌روزرسانی رکورد':'ذخیره رکورد')+'</button>'+
      '<span class="save-msg" id="neMsg"></span>'+
    '</div>';

  bindNewEntry(settings);
}

function bindNewEntry(settings){
  var f = NE_FORM;
  var g = function(id){ return document.getElementById(id); };

  if(g('neAgency')) g('neAgency').addEventListener('change', function(){ f.agency=this.value; });
  if(g('neCounter')) g('neCounter').addEventListener('change', function(){ f.counter=this.value; });
  if(g('neExpert')) g('neExpert').addEventListener('change', function(){ f.procurementExpert=this.value; });
  if(g('neNeedsCorrection')) g('neNeedsCorrection').addEventListener('change', function(){ f.needsCorrection=this.checked; });
  if(g('neCancelEdit')) g('neCancelEdit').addEventListener('click', function(){ NE_FORM = freshFormNE(); renderNewEntry(settings); });

  qsa('.ne-number').forEach(function(el){ el.addEventListener('input', function(){ f.vouchers[+this.dataset.idx].number = this.value; }); });
  qsa('.ne-out-origin').forEach(function(el){ el.addEventListener('change', function(){ f.vouchers[+this.dataset.idx].flightOutOrigin = this.value; }); });
  qsa('.ne-out-dest').forEach(function(el){ el.addEventListener('change', function(){
    var v = f.vouchers[+this.dataset.idx]; v.flightOutDestination = this.value; v.stayCity=''; v.hotel=''; v.agent=''; renderNewEntry(settings);
  }); });
  qsa('.ne-in-origin').forEach(function(el){ el.addEventListener('change', function(){ f.vouchers[+this.dataset.idx].flightInOrigin = this.value; }); });
  qsa('.ne-in-dest').forEach(function(el){ el.addEventListener('change', function(){ f.vouchers[+this.dataset.idx].flightInDestination = this.value; }); });
  qsa('.ne-out-price').forEach(function(el){ el.addEventListener('input', function(){
    var v = this.value.replace(/[^0-9.]/g,''); this.value=v; f.vouchers[+this.dataset.idx].flightOutPriceMillion = v;
  }); });
  qsa('.ne-in-price').forEach(function(el){ el.addEventListener('input', function(){
    var v = this.value.replace(/[^0-9.]/g,''); this.value=v; f.vouchers[+this.dataset.idx].flightInPriceMillion = v;
  }); });
  qsa('.ne-stay-city').forEach(function(el){ el.addEventListener('change', function(){
    var v = f.vouchers[+this.dataset.idx]; v.stayCity = this.value; v.hotel=''; v.agent=''; renderNewEntry(settings);
  }); });
  qsa('.ne-hotel').forEach(function(el){ el.addEventListener('change', function(){ f.vouchers[+this.dataset.idx].hotel = this.value; }); });
  qsa('.ne-agent').forEach(function(el){ el.addEventListener('change', function(){ f.vouchers[+this.dataset.idx].agent = this.value; }); });
  qsa('.ne-purchase').forEach(function(el){ el.addEventListener('input', function(){
    var v = this.value.replace(/[^0-9.]/g,''); this.value=v; f.vouchers[+this.dataset.idx].purchaseAmount = v;
  }); });
  qsa('.ne-currency').forEach(function(el){ el.addEventListener('change', function(){ f.vouchers[+this.dataset.idx].purchaseCurrency = this.value; renderNewEntry(settings); }); });
  qsa('.ne-service').forEach(function(el){ el.addEventListener('input', function(){
    var v = this.value.replace(/[^0-9.]/g,''); this.value=v; f.vouchers[+this.dataset.idx].serviceAmount = v;
  }); });

  if(g('neAddVoucher')) g('neAddVoucher').addEventListener('click', function(){ if(f.vouchers.length<10){ f.vouchers.push(freshVoucherNE()); renderNewEntry(settings); } });
  if(g('neRemoveVoucher')) g('neRemoveVoucher').addEventListener('click', function(){ if(f.vouchers.length>1){ f.vouchers.pop(); renderNewEntry(settings); } });

  if(g('neTotal')){
    g('neTotal').addEventListener('input', function(){
      var v = this.value.replace(/[^0-9]/g,''); this.value = v?fmtNum(v):''; f.totalAmount = v;
    });
  }

  qsa('.ne-dep-amount').forEach(function(el){ el.addEventListener('input', function(){
    var v = this.value.replace(/[^0-9]/g,''); this.value = v?fmtNum(v):''; f.deposits[+this.dataset.idx].amount = v;
  }); });
  qsa('.ne-dep-date').forEach(function(el){ el.addEventListener('click', function(){
    var idx = +this.dataset.idx;
    var d = f.deposits[idx];
    openCalendar(this, d.jy?{jy:d.jy,jm:d.jm,jd:d.jd}:null, function(picked){
      d.jy=picked.jy; d.jm=picked.jm; d.jd=picked.jd;
      renderNewEntry(settings);
    });
  }); });
  qsa('.ne-dep-platform').forEach(function(el){ el.addEventListener('change', function(){ f.deposits[+this.dataset.idx].platform = this.value; }); });
  qsa('.ne-dep-remove').forEach(function(el){ el.addEventListener('click', function(){
    f.deposits.splice(+this.dataset.idx,1); if(!f.deposits.length) f.deposits.push(freshDepositNE()); renderNewEntry(settings);
  }); });
  if(g('neAddDeposit')) g('neAddDeposit').addEventListener('click', function(){ f.deposits.push(freshDepositNE()); renderNewEntry(settings); });

  if(g('neSave')) g('neSave').addEventListener('click', function(){ submitNewEntry(); });
}

async function submitNewEntry(){
  var f = NE_FORM;
  if(!f.agency || !f.counter){ flashMsg('neMsg','آژانس و کانتر را انتخاب کنید', true); return; }
  var vouchers = f.vouchers.filter(function(v){ return v.number.trim(); }).map(function(v){
    return {
      id: v.id, number: v.number.trim(), stayCity: v.stayCity, hotel: v.hotel, agent: v.agent,
      purchaseAmount: parseFloat(v.purchaseAmount)||0, purchaseCurrency: v.purchaseCurrency,
      serviceAmount: parseFloat(v.serviceAmount)||0,
      flightOutOrigin: v.flightOutOrigin, flightOutDestination: v.flightOutDestination,
      flightInOrigin: v.flightInOrigin, flightInDestination: v.flightInDestination,
      flightOutPriceMillion: parseFloat(v.flightOutPriceMillion)||0, flightInPriceMillion: parseFloat(v.flightInPriceMillion)||0
    };
  });
  if(!vouchers.length){ flashMsg('neMsg','حداقل یک شماره واچر وارد کنید', true); return; }
  var total = parseFloat(f.totalAmount)||0;
  if(!(total>0)){ flashMsg('neMsg','مبلغ کل فروش را وارد کنید', true); return; }

  var deposits = [];
  for(var i=0;i<f.deposits.length;i++){
    var d = f.deposits[i];
    var hasSome = d.amount || d.jy || d.platform;
    if(!hasSome) continue;
    if(!d.amount || !d.jy || !d.platform){ flashMsg('neMsg','ردیف واریزی '+pDigits(i+1)+' ناقص است', true); return; }
    deposits.push({ amount: parseFloat(d.amount)||0, jy:d.jy, jm:d.jm, jd:d.jd, platform:d.platform });
  }

  var body = { agency:f.agency, counter:f.counter, procurementExpert:f.procurementExpert,
    vouchers:vouchers, totalAmount:total, deposits:deposits, needsCorrection:f.needsCorrection };
  try{
    if(f.editingId){
      await api.patch('/records/'+f.editingId, body);
      flashMsg('neMsg','رکورد به‌روزرسانی شد ✓', false);
    } else {
      await api.post('/records', body);
      flashMsg('neMsg','رکورد ذخیره شد ✓', false);
    }
    NE_FORM = freshFormNE();
    renderNewEntry(await ensureSettings());
  }catch(e){ flashMsg('neMsg', e.message, true); }
}

// Called from the Records tab's "edit" button.
function editRecordInNewEntry(record){
  NE_FORM = {
    editingId: record.id, agency: record.agency, counter: record.counter, procurementExpert: record.procurementExpert||'',
    vouchers: record.vouchers.map(function(v){
      return { id:v.id, number:v.number, stayCity:v.stayCity||'', hotel:v.hotel||'', agent:v.agent||'',
        purchaseAmount: v.purchaseAmount||'', purchaseCurrency: v.purchaseCurrency||'', serviceAmount: v.serviceAmount||'',
        flightOutOrigin: v.flightOutOrigin||'', flightOutDestination: v.flightOutDestination||'',
        flightInOrigin: v.flightInOrigin||'', flightInDestination: v.flightInDestination||'',
        flightOutPriceMillion: v.flightOutPriceMillion||'', flightInPriceMillion: v.flightInPriceMillion||'' };
    }),
    totalAmount: record.totalAmount||'',
    deposits: record.deposits.length ? record.deposits.map(function(d){
      return { amount:d.amount, jy:d.jy, jm:d.jm, jd:d.jd, platform:d.platform };
    }) : [ freshDepositNE() ],
    needsCorrection: !!record.needsCorrection
  };
  switchTab('newEntry');
}
