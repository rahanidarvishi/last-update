"use strict";
var CAL_STATE = { jy:1, jm:1, selected:null, onPick:null };

function ensureCalendarDom(){
  if(document.getElementById('calendarPopup')) return;
  var overlay = document.createElement('div');
  overlay.id = 'calOverlay'; overlay.className = 'overlay hidden';
  var popup = document.createElement('div');
  popup.id = 'calendarPopup'; popup.className = 'calendar-popup hidden';
  document.body.appendChild(overlay);
  document.body.appendChild(popup);
}

function openCalendar(anchorEl, initial, onPick){
  ensureCalendarDom();
  var t = J.todayJalali();
  CAL_STATE.jy = initial ? initial.jy : t.jy;
  CAL_STATE.jm = initial ? initial.jm : t.jm;
  CAL_STATE.selected = initial || null;
  CAL_STATE.onPick = onPick;

  var popup = document.getElementById('calendarPopup');
  var overlay = document.getElementById('calOverlay');
  overlay.classList.remove('hidden');
  popup.classList.remove('hidden');

  var rect = anchorEl.getBoundingClientRect();
  var top = rect.bottom + 8, left = rect.left;
  if(left + 280 > window.innerWidth) left = window.innerWidth - 290;
  if(top + 320 > window.innerHeight) top = rect.top - 320;
  popup.style.top = Math.max(10, top) + 'px';
  popup.style.left = Math.max(10, left) + 'px';

  renderCalendar();
  overlay.onclick = closeCalendar;
}
function closeCalendar(){
  var popup = document.getElementById('calendarPopup');
  var overlay = document.getElementById('calOverlay');
  if(popup) popup.classList.add('hidden');
  if(overlay) overlay.classList.add('hidden');
}

// Jalali month lengths — mirrors the server's utils/jalali.js logic.
function jalaaliMonthLength(jy, jm){
  if(jm <= 6) return 31;
  if(jm <= 11) return 30;
  var g = J.toGregorian(jy, 12, 30);
  var back = J.toJalaali(g.gy, g.gm, g.gd);
  return (back.jm === 12 && back.jd === 30) ? 30 : 29;
}

function renderCalendar(){
  var popup = document.getElementById('calendarPopup');
  var jy = CAL_STATE.jy, jm = CAL_STATE.jm;
  var t = J.todayJalali();
  var daysInMonth = jalaaliMonthLength(jy, jm);
  var g = J.toGregorian(jy, jm, 1);
  var jsDay = new Date(g.gy, g.gm-1, g.gd).getDay(); // 0=Sunday
  var leadBlank = (jsDay + 1) % 7; // shift so week starts Saturday

  var weekdays = ['ش','ی','د','س','چ','پ','ج'];
  var wdHtml = weekdays.map(function(w){ return '<div class="cal-wd">'+w+'</div>'; }).join('');
  var cells = '';
  for(var i=0;i<leadBlank;i++) cells += '<button type="button" class="cal-day empty"></button>';
  for(var d=1; d<=daysInMonth; d++){
    var isToday = (t.jy===jy && t.jm===jm && t.jd===d);
    var sel = CAL_STATE.selected;
    var isSel = sel && sel.jy===jy && sel.jm===jm && sel.jd===d;
    cells += '<button type="button" class="cal-day '+(isToday?'today':'')+' '+(isSel?'selected':'')+'" data-d="'+d+'">'+J.toPersianDigits(d)+'</button>';
  }

  popup.innerHTML =
    '<div class="cal-head">'+
      '<div class="cal-nav"><button type="button" id="calPrevY">«</button><button type="button" id="calPrevM">‹</button></div>'+
      '<div class="cal-title">'+J.PERSIAN_MONTHS[jm-1]+' '+J.toPersianDigits(jy)+'</div>'+
      '<div class="cal-nav"><button type="button" id="calNextM">›</button><button type="button" id="calNextY">»</button></div>'+
    '</div>'+
    '<div class="cal-grid">'+wdHtml+cells+'</div>'+
    '<div class="cal-footer"><button type="button" id="calToday">امروز</button><button type="button" id="calClose">بستن</button></div>';

  popup.querySelectorAll('.cal-day:not(.empty)').forEach(function(btn){
    btn.addEventListener('click', function(){
      var d = parseInt(this.getAttribute('data-d'), 10);
      var picked = { jy: CAL_STATE.jy, jm: CAL_STATE.jm, jd: d };
      var cb = CAL_STATE.onPick;
      closeCalendar();
      cb(picked);
    });
  });
  document.getElementById('calPrevM').addEventListener('click', function(){ CAL_STATE.jm--; if(CAL_STATE.jm<1){CAL_STATE.jm=12; CAL_STATE.jy--;} renderCalendar(); });
  document.getElementById('calNextM').addEventListener('click', function(){ CAL_STATE.jm++; if(CAL_STATE.jm>12){CAL_STATE.jm=1; CAL_STATE.jy++;} renderCalendar(); });
  document.getElementById('calPrevY').addEventListener('click', function(){ CAL_STATE.jy--; renderCalendar(); });
  document.getElementById('calNextY').addEventListener('click', function(){ CAL_STATE.jy++; renderCalendar(); });
  document.getElementById('calToday').addEventListener('click', function(){ var tt=J.todayJalali(); CAL_STATE.jy=tt.jy; CAL_STATE.jm=tt.jm; renderCalendar(); });
  document.getElementById('calClose').addEventListener('click', closeCalendar);
}

// Small helper used by every tab: renders a "date-btn" button showing the
// selected Jalali date (or a placeholder), for a value object {jy,jm,jd}.
function dateBtnHtml(cls, value, extraAttrs){
  var label = (value && value.jy) ? J.toPersianDigits(J.jalaliStrOf(value.jy, value.jm, value.jd)) : 'انتخاب تاریخ';
  var empty = (value && value.jy) ? '' : 'empty';
  return '<button type="button" id="'+cls+'" class="date-btn '+cls+' '+empty+'" '+(extraAttrs||'')+'>'+label+'</button>';
}
