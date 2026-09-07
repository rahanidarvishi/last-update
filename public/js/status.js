"use strict";
var STATUS_PRESETS = [];
var MOOD_PRESETS = [];
var STATUS_DRAFT = { statusEmoji:'', statusText:'', moodEmoji:'', moodText:'' };
var STATUS_CUSTOM_MODE = false;
var MOOD_CUSTOM_MODE = false;

async function loadStatusBoard(){
  if(!STATUS_PRESETS.length){
    var presets = await api.get('/status/presets');
    STATUS_PRESETS = presets.statusPresets;
    MOOD_PRESETS = presets.moodPresets;
  }
  await ensureDirectory();
  var res = await api.get('/status');
  renderStatusBoard(res.board);
}

function timeAgoFa(iso){
  if(!iso) return '';
  var diffMin = Math.round((Date.now() - new Date(iso).getTime())/60000);
  if(diffMin < 1) return 'همین الان';
  if(diffMin < 60) return pDigits(diffMin)+' دقیقه پیش';
  var diffHr = Math.round(diffMin/60);
  if(diffHr < 24) return pDigits(diffHr)+' ساعت پیش';
  return pDigits(Math.round(diffHr/24))+' روز پیش';
}

function renderStatusBoard(board){
  var canE = canEdit('statusBoard');
  var me = board.find(function(b){ return b.isSelf; });

  var editorHtml = '';
  if(canE && me){
    var statusChips = STATUS_PRESETS.map(function(p){
      var active = !STATUS_CUSTOM_MODE && me.statusEmoji===p.emoji && me.statusText===p.text;
      return '<button type="button" class="btn-small status-preset-btn" data-emoji="'+p.emoji+'" data-text="'+escapeHtml(p.text)+'" style="'+(active?'background:var(--primary);color:#fff;':'')+'">'+p.emoji+' '+p.text+'</button>';
    }).join(' ');
    var moodChips = MOOD_PRESETS.map(function(p){
      var active = !MOOD_CUSTOM_MODE && me.moodEmoji===p.emoji && me.moodText===p.text;
      return '<button type="button" class="btn-small mood-preset-btn" data-emoji="'+p.emoji+'" data-text="'+escapeHtml(p.text)+'" style="'+(active?'background:var(--gold-deep);color:#fff;':'')+'">'+p.emoji+' '+p.text+'</button>';
    }).join(' ');

    editorHtml =
      '<div class="card" style="border-color:var(--gold);">'+
        '<h2>وضعیت الان تو چیه؟ 👋</h2>'+
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:700;">یکی رو انتخاب کن یا خودت یه چیز بنویس:</div>'+
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">'+statusChips+
          '<button type="button" class="btn-small btn-ghost" id="statusCustomBtn">✏️ چیز دیگه‌ای بنویسم</button>'+
        '</div>'+
        (STATUS_CUSTOM_MODE ? '<div class="grid-2" style="margin-top:6px;"><input type="text" id="statusCustomEmoji" placeholder="یک ایموجی (اختیاری)" maxlength="4" value="'+escapeHtml(STATUS_DRAFT.statusEmoji)+'"><input type="text" id="statusCustomText" placeholder="مثلاً: رفتم دنبال چاپگر بگردم" value="'+escapeHtml(STATUS_DRAFT.statusText)+'"></div><button type="button" class="btn-small" id="statusCustomSave" style="margin-top:8px;">ثبت وضعیت</button>' : '')+

        '<h2 style="margin-top:18px;">مود امروزت چیه؟ 🎭</h2>'+
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;font-weight:700;">این کاملاً برای شوخی و صمیمیته — هرچی دلت خواست بنویس:</div>'+
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">'+moodChips+
          '<button type="button" class="btn-small btn-ghost" id="moodCustomBtn">✏️ مود خودمو می‌نویسم</button>'+
        '</div>'+
        (MOOD_CUSTOM_MODE ? '<div class="grid-2" style="margin-top:6px;"><input type="text" id="moodCustomEmoji" placeholder="یک ایموجی (اختیاری)" maxlength="4" value="'+escapeHtml(STATUS_DRAFT.moodEmoji)+'"><input type="text" id="moodCustomText" placeholder="مثلاً: امروز بی‌حوصله‌ام، دوروبرم نگردید" value="'+escapeHtml(STATUS_DRAFT.moodText)+'"></div><button type="button" class="btn-small" id="moodCustomSave" style="margin-top:8px;">ثبت مود</button>' : '')+
      '</div>';
  }

  var boardHtml = board.map(function(b){
    var borderColor = b.isSelf ? 'var(--gold)' : 'var(--border)';
    var leaveNote = b.onLeave ? '<div style="font-size:11px;color:var(--primary-dark);font-weight:700;margin-top:4px;">🌴 طبق مرخصی تاییدشده</div>' : '';
    return '<div class="voucher-card" style="border-color:'+borderColor+';">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">'+
        '<div>'+
          '<div style="display:flex;align-items:center;gap:8px;">'+avatarHtml((S.directory&&S.directory[b.userId]?S.directory[b.userId].photoDataUrl:''), b.fullName, 30)+'<b style="color:var(--ink);font-size:14.5px;">'+escapeHtml(b.fullName)+(b.isSelf?' <span class="pill">خودت</span>':'')+'</b></div>'+
          '<div style="margin-top:6px;font-size:14px;">'+(b.statusEmoji||'✅')+' '+escapeHtml(b.statusText||'—')+'</div>'+
          (b.moodText ? '<div style="margin-top:4px;font-size:13px;color:var(--gold-deep);font-weight:600;">'+(b.moodEmoji||'🎭')+' '+escapeHtml(b.moodText)+'</div>' : '')+
          leaveNote+
        '</div>'+
        '<div style="font-size:11px;color:var(--text-muted);white-space:nowrap;">'+(b.updatedAt?timeAgoFa(b.updatedAt):'')+'</div>'+
      '</div>'+
    '</div>';
  }).join('');

  qs('#tabContent').innerHTML =
    editorHtml +
    '<div class="card"><h2>روی میز کی چه خبره؟</h2>'+boardHtml+'</div>';

  bindStatusBoard();
}

function bindStatusBoard(){
  qsa('.status-preset-btn').forEach(function(btn){ btn.addEventListener('click', async function(){
    STATUS_CUSTOM_MODE = false;
    await api.patch('/status/me', { statusEmoji:this.getAttribute('data-emoji'), statusText:this.getAttribute('data-text') });
    loadStatusBoard();
  }); });
  qsa('.mood-preset-btn').forEach(function(btn){ btn.addEventListener('click', async function(){
    MOOD_CUSTOM_MODE = false;
    await api.patch('/status/me', { moodEmoji:this.getAttribute('data-emoji'), moodText:this.getAttribute('data-text') });
    loadStatusBoard();
  }); });

  var g = function(id){ return document.getElementById(id); };
  if(g('statusCustomBtn')) g('statusCustomBtn').addEventListener('click', function(){ STATUS_CUSTOM_MODE=true; loadStatusBoard(); });
  if(g('moodCustomBtn')) g('moodCustomBtn').addEventListener('click', function(){ MOOD_CUSTOM_MODE=true; loadStatusBoard(); });
  if(g('statusCustomSave')) g('statusCustomSave').addEventListener('click', async function(){
    var emoji = g('statusCustomEmoji').value.trim() || '💬';
    var text = g('statusCustomText').value.trim();
    if(!text){ alert('یه متن بنویس'); return; }
    await api.patch('/status/me', { statusEmoji:emoji, statusText:text });
    STATUS_CUSTOM_MODE = false;
    loadStatusBoard();
  });
  if(g('moodCustomSave')) g('moodCustomSave').addEventListener('click', async function(){
    var emoji = g('moodCustomEmoji').value.trim() || '🎭';
    var text = g('moodCustomText').value.trim();
    if(!text){ alert('یه متن بنویس'); return; }
    await api.patch('/status/me', { moodEmoji:emoji, moodText:text });
    MOOD_CUSTOM_MODE = false;
    loadStatusBoard();
  });
}
