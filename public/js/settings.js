"use strict";
var SETTINGS_ACTIVE_CITY = '';
var CR_FORM = { currency:'', rate:'', jy:null, jm:null, jd:null };

async function loadSettings(){
  var settings = await ensureSettings(true);
  if(!SETTINGS_ACTIVE_CITY && settings.cities.length) SETTINGS_ACTIVE_CITY = settings.cities[0].id;
  renderSettings(settings);
}

function simpleListCard(title, listName, list, canE){
  var chips = list.length ? list.map(function(v){
    return '<div class="chip"><span>'+escapeHtml(v)+'</span>'+(canE?'<button type="button" class="icon-btn set-del-list" data-list="'+listName+'" data-val="'+escapeHtml(v)+'">✕</button>':'')+'</div>';
  }).join('') : '<div class="empty-state">موردی اضافه نشده</div>';
  return '<div class="card"><h2>'+title+'</h2>'+
    (canE ? '<div class="add-row"><input type="text" class="set-add-list-input" data-list="'+listName+'" placeholder="مقدار جدید"><button type="button" class="btn-small set-add-list" data-list="'+listName+'">افزودن</button></div>' : '')+
    '<div class="chip-list">'+chips+'</div></div>';
}

function renderSettings(settings){
  var canE = canEdit('settings');
  var activeCity = settings.cities.find(function(c){ return c.id===SETTINGS_ACTIVE_CITY; });

  var cityChips = settings.cities.length ? settings.cities.map(function(c){
    return '<div class="chip"><span>'+escapeHtml(c.name)+' <span style="color:var(--text-muted);font-weight:400;">('+pDigits(c.hotels.length)+' هتل، '+pDigits(c.agents.length)+' کارگذار)</span></span>'+(canE?'<button type="button" class="icon-btn set-del-city" data-id="'+c.id+'">✕</button>':'')+'</div>';
  }).join('') : '<div class="empty-state">شهری اضافه نشده</div>';

  var citySelectOpts = settings.cities.map(function(c){ return '<option value="'+c.id+'" '+(SETTINGS_ACTIVE_CITY===c.id?'selected':'')+'>'+escapeHtml(c.name)+'</option>'; }).join('');
  var hotelChips = activeCity && activeCity.hotels.length ? activeCity.hotels.map(function(h){
    return '<div class="chip"><span>'+escapeHtml(h)+'</span>'+(canE?'<button type="button" class="icon-btn set-del-hotel" data-hotel="'+escapeHtml(h)+'">✕</button>':'')+'</div>';
  }).join('') : '<div class="empty-state">هتلی اضافه نشده</div>';
  var agentChips = activeCity && activeCity.agents.length ? activeCity.agents.map(function(a){
    return '<div class="chip"><span>'+escapeHtml(a)+'</span>'+(canE?'<button type="button" class="icon-btn set-del-agent" data-agent="'+escapeHtml(a)+'">✕</button>':'')+'</div>';
  }).join('') : '<div class="empty-state">کارگذاری اضافه نشده</div>';

  var crf = CR_FORM;
  var crCurrencyOpts = settings.currencies.length ? listOptions(settings.currencies, crf.currency) : '<option value="">— اول یک ارز اضافه کن —</option>';
  var crRows = settings.currencyRates.slice().sort(function(a,b){
    return (b.jy*10000+b.jm*100+b.jd) - (a.jy*10000+a.jm*100+a.jd);
  }).map(function(cr){
    return '<tr><td>'+jStr(cr)+'</td><td><span class="pill">'+escapeHtml(cr.currency)+'</span></td><td class="amount-cell">'+fmtRial(cr.rate)+'</td>'+
      '<td>'+(canE?'<button type="button" class="icon-btn cr-del" data-id="'+cr.id+'">🗑</button>':'')+'</td></tr>';
  }).join('') || '<tr><td colspan="4" class="empty-state">نرخی ثبت نشده</td></tr>';

  qs('#tabContent').innerHTML =
    '<div class="card"><h2>مشخصات آژانس روی واچر/بلیت</h2>'+
      '<p style="font-size:12.5px;color:var(--text-muted);">این لوگو و نام روی فایل PDF واچر و بلیت مسافر چاپ می‌شود.</p>'+
      (settings.companySettings && settings.companySettings.logoDataUrl ? '<img src="'+settings.companySettings.logoDataUrl+'" style="max-height:60px;max-width:220px;display:block;margin-bottom:10px;border:1px solid var(--border);border-radius:8px;padding:6px;">' : '')+
      (canE ? '<div class="grid-2">'+
        '<label>لوگو (فایل تصویر)<input type="file" id="logoFileInput" accept="image/*"></label>'+
        '<label>نام آژانس به انگلیسی (برای بلیت)<input type="text" id="agencyNameEnInput" value="'+escapeHtml((settings.companySettings&&settings.companySettings.agencyNameEn)||'')+'" placeholder="e.g. Darvishi Luxury Travel Agency"></label>'+
      '</div><button type="button" class="btn-small" id="saveLogoBtn" style="margin-top:10px;">ذخیره</button><span class="save-msg" id="logoMsg"></span>' : '')+
    '</div>'+
    '<div class="grid-2">'+
      simpleListCard('لیست آژانس‌ها','agencies',settings.agencies,canE)+
      simpleListCard('لیست ارزها','currencies',settings.currencies,canE)+
    '</div>'+
    '<div class="card"><h2>کانترها و کارشناسان تأمین</h2>'+
      '<p style="font-size:12.5px;color:var(--text-muted);">این دو لیست دیگر اینجا تعریف نمی‌شوند — از تب «سطح دسترسی» می‌آیند: هر کاربر فعالی که نقشش «کانتر (فروش)» علامت خورده باشد، خودکار کانتر محسوب می‌شود و هر کاربری که نقشش «نیرو تأمین» باشد، خودکار کارشناس تأمین محسوب می‌شود.</p>'+
      '<div class="grid-2">'+
        '<div><div style="font-weight:700;margin-bottom:8px;">کانترها ('+pDigits(settings.counters.length)+')</div><div class="chip-list">'+
          (settings.counters.length ? settings.counters.map(function(v){ return '<div class="chip"><span>'+escapeHtml(v)+'</span></div>'; }).join('') : '<div class="empty-state">فعلاً کاربری با این دسته نیست</div>')+
        '</div></div>'+
        '<div><div style="font-weight:700;margin-bottom:8px;">کارشناسان تأمین ('+pDigits(settings.procurementExperts.length)+')</div><div class="chip-list">'+
          (settings.procurementExperts.length ? settings.procurementExperts.map(function(v){ return '<div class="chip"><span>'+escapeHtml(v)+'</span></div>'; }).join('') : '<div class="empty-state">فعلاً کاربری با این دسته نیست</div>')+
        '</div></div>'+
      '</div>'+
    '</div>'+
    '<div class="card"><h2>لیست شهرها</h2>'+
      (canE ? '<div class="add-row"><input type="text" id="newCityInput" placeholder="نام شهر جدید"><button type="button" class="btn-small" id="addCityBtn">افزودن</button></div>' : '')+
      '<div class="chip-list">'+cityChips+'</div></div>'+
    '<div class="card"><h2>هتل‌ها و کارگذارهای هر شهر</h2>'+
      (settings.cities.length ? (
        '<label>انتخاب شهر<select id="citySelect">'+citySelectOpts+'</select></label>'+
        '<div class="grid-2" style="margin-top:12px;">'+
          '<div><div style="font-weight:700;margin-bottom:8px;">هتل‌های '+escapeHtml(activeCity?activeCity.name:'')+'</div>'+
            (canE?'<div class="add-row"><input type="text" id="newHotelInput" placeholder="نام هتل"><button type="button" class="btn-small" id="addHotelBtn">افزودن</button></div>':'')+
            '<div class="chip-list">'+hotelChips+'</div></div>'+
          '<div><div style="font-weight:700;margin-bottom:8px;">کارگذارهای '+escapeHtml(activeCity?activeCity.name:'')+'</div>'+
            (canE?'<div class="add-row"><input type="text" id="newAgentInput" placeholder="نام کارگذار"><button type="button" class="btn-small" id="addAgentBtn">افزودن</button></div>':'')+
            '<div class="chip-list">'+agentChips+'</div></div>'+
        '</div>'
      ) : '<div class="empty-state">اول یک شهر اضافه کن</div>')+
    '</div>'+
    '<div class="card"><h2>نرخ روزانه ارزها</h2>'+
      '<p style="font-size:12.5px;color:var(--text-muted);">نرخ هر ارز را در روزی که تغییر کرد ثبت کن؛ سیستم برای هر واچر، آخرین نرخ ثبت‌شده تا تاریخ همان رزرو را برای محاسبه سود و بدهی استفاده می‌کند.</p>'+
      (canE ? '<div class="grid-4">'+
        '<label>ارز<select id="crCurrency">'+crCurrencyOpts+'</select></label>'+
        '<label>نرخ (ریال به‌ازای هر واحد)<input type="text" inputmode="numeric" id="crRate" value="'+(crf.rate?fmtNum(crf.rate):'')+'"></label>'+
        '<label>تاریخ'+dateBtnHtml('crDateBtn', crf, '')+'</label>'+
        '<div style="display:flex;align-items:end;"><button type="button" class="btn-primary" id="crSave">ثبت نرخ</button></div>'+
      '</div>' : '')+
      '<span class="save-msg" id="crMsg"></span>'+
      '<div class="table-wrap" style="margin-top:12px;"><table><thead><tr><th>تاریخ</th><th>ارز</th><th>نرخ</th><th></th></tr></thead><tbody>'+crRows+'</tbody></table></div>'+
    '</div>';

  bindSettings(settings);
}

function bindSettings(settings){
  var logoInput = document.getElementById('logoFileInput');
  var pendingLogoDataUrl = null;
  if(logoInput) logoInput.addEventListener('change', function(){
    var file = this.files && this.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){ pendingLogoDataUrl = reader.result; };
    reader.readAsDataURL(file);
  });
  var saveLogoBtn = document.getElementById('saveLogoBtn');
  if(saveLogoBtn) saveLogoBtn.addEventListener('click', async function(){
    try{
      var body = { agencyNameEn: document.getElementById('agencyNameEnInput').value };
      if(pendingLogoDataUrl) body.logoDataUrl = pendingLogoDataUrl;
      await api.post('/settings/logo', body);
      flashMsg('logoMsg','ذخیره شد ✓', false);
      loadSettings();
    }catch(e){ flashMsg('logoMsg', e.message, true); }
  });

  qsa('.set-add-list').forEach(function(btn){ btn.addEventListener('click', async function(){
    var listName = this.getAttribute('data-list');
    var input = document.querySelector('.set-add-list-input[data-list="'+listName+'"]');
    var val = input.value.trim();
    if(!val) return;
    await api.post('/settings/list/'+listName, { value: val });
    loadSettings();
  }); });
  qsa('.set-del-list').forEach(function(btn){ btn.addEventListener('click', async function(){
    await api.del('/settings/list/'+this.getAttribute('data-list')+'/'+encodeURIComponent(this.getAttribute('data-val')));
    loadSettings();
  }); });

  var g = function(id){ return document.getElementById(id); };
  if(g('addCityBtn')) g('addCityBtn').addEventListener('click', async function(){
    var val = document.getElementById('newCityInput').value.trim();
    if(!val) return;
    var res = await api.post('/settings/cities', { name: val });
    SETTINGS_ACTIVE_CITY = res.city.id;
    loadSettings();
  });
  qsa('.set-del-city').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این شهر و هتل/کارگذارهایش حذف شود؟')) return;
    await api.del('/settings/cities/'+this.getAttribute('data-id'));
    SETTINGS_ACTIVE_CITY = '';
    loadSettings();
  }); });
  if(g('citySelect')) g('citySelect').addEventListener('change', function(){ SETTINGS_ACTIVE_CITY = this.value; loadSettings(); });
  if(g('addHotelBtn')) g('addHotelBtn').addEventListener('click', async function(){
    var val = document.getElementById('newHotelInput').value.trim();
    if(!val) return;
    await api.post('/settings/cities/'+SETTINGS_ACTIVE_CITY+'/hotels', { name: val });
    loadSettings();
  });
  qsa('.set-del-hotel').forEach(function(btn){ btn.addEventListener('click', async function(){
    await api.del('/settings/cities/'+SETTINGS_ACTIVE_CITY+'/hotels/'+encodeURIComponent(this.getAttribute('data-hotel')));
    loadSettings();
  }); });
  if(g('addAgentBtn')) g('addAgentBtn').addEventListener('click', async function(){
    var val = document.getElementById('newAgentInput').value.trim();
    if(!val) return;
    await api.post('/settings/cities/'+SETTINGS_ACTIVE_CITY+'/agents', { name: val });
    loadSettings();
  });
  qsa('.set-del-agent').forEach(function(btn){ btn.addEventListener('click', async function(){
    await api.del('/settings/cities/'+SETTINGS_ACTIVE_CITY+'/agents/'+encodeURIComponent(this.getAttribute('data-agent')));
    loadSettings();
  }); });

  if(g('crCurrency')) g('crCurrency').addEventListener('change', function(){ CR_FORM.currency=this.value; });
  if(g('crRate')) g('crRate').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,''); this.value=v?fmtNum(v):''; CR_FORM.rate=v; });
  var crDateBtn = g('crDateBtn');
  if(crDateBtn) crDateBtn.addEventListener('click', function(){
    openCalendar(this, CR_FORM.jy?{jy:CR_FORM.jy,jm:CR_FORM.jm,jd:CR_FORM.jd}:null, function(picked){
      CR_FORM.jy=picked.jy; CR_FORM.jm=picked.jm; CR_FORM.jd=picked.jd;
      loadSettings();
    });
  });
  if(g('crSave')) g('crSave').addEventListener('click', async function(){
    if(!CR_FORM.currency || !CR_FORM.rate || !CR_FORM.jy){ flashMsg('crMsg','ارز، نرخ و تاریخ را کامل کنید', true); return; }
    try{
      await api.post('/settings/currency-rates', { currency:CR_FORM.currency, rate:parseFloat(CR_FORM.rate), jy:CR_FORM.jy, jm:CR_FORM.jm, jd:CR_FORM.jd });
      CR_FORM = { currency:'', rate:'', jy:null, jm:null, jd:null };
      flashMsg('crMsg','ثبت شد ✓', false);
      loadSettings();
    }catch(e){ flashMsg('crMsg', e.message, true); }
  });
  qsa('.cr-del').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این نرخ حذف شود؟')) return;
    await api.del('/settings/currency-rates/'+this.getAttribute('data-id'));
    loadSettings();
  }); });
}
