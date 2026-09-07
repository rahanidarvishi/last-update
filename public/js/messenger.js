"use strict";
var MSG_COMPOSE = { type:'task', toUserId:'', toUserIds:[], subject:'', voucherNumber:'', body:'',
  leaveStartJy:null, leaveStartJm:null, leaveStartJd:null, leaveEndJy:null, leaveEndJm:null, leaveEndJd:null };
var MSG_FILTER = { type:'', status:'all' };
var MSG_OPEN_THREAD = null;
var MSG_REPLY_DRAFT = {};
var MSG_ADD_PARTICIPANT = {}; // { [threadId]: selectedUserId }

var TASK_STATUS_LABELS = { 'new':'تسک جدید', 'reviewing':'در حال بررسی', 'in-progress':'در حال انجام', 'done':'انجام‌شده' };
var LEAVE_STATUS_LABELS = { 'pending':'در انتظار تایید', 'approved':'تایید شده', 'rejected':'رد شده' };

async function loadMessenger(){
  if(!S.msgUsers) S.msgUsers = (await api.get('/messenger/users')).users;
  await ensureDirectory();
  var params = [];
  if(MSG_FILTER.type) params.push('type='+MSG_FILTER.type);
  if(MSG_FILTER.status && MSG_FILTER.status!=='all') params.push('status='+MSG_FILTER.status);
  var res = await api.get('/messenger/threads'+(params.length?('?'+params.join('&')):''));
  renderMessenger(res.threads);
}

function userOptions(selected, excludeSelf){
  var list = S.msgUsers.filter(function(u){ return !excludeSelf || u.id!==S.user.id; });
  var opts = '<option value="">— انتخاب کنید —</option>';
  list.forEach(function(u){ opts += '<option value="'+u.id+'" '+(selected===u.id?'selected':'')+'>'+escapeHtml(u.fullName)+'</option>'; });
  return opts;
}
function userName(u){ return u ? avatarNameHtml(u.id, u.fullName, 20) : '—'; }
function boundManager(){
  if(!S.user.managerId) return null;
  return S.msgUsers.find(function(u){ return u.id===S.user.managerId; }) || null;
}

function renderMessenger(threads){
  var c = MSG_COMPOSE;
  var isLeave = c.type==='leave';
  var mgr = boundManager();
  // If this person has a manager bound to them (set in "سطح دسترسی"), a leave
  // request always goes to that one manager — no picking a different one.
  if(isLeave && mgr) c.toUserId = mgr.id;

  var recipientFieldHtml;
  if(isLeave && mgr){
    recipientFieldHtml = '<label>گیرنده (مدیر بخش شما)<input type="text" value="'+escapeHtml(mgr.fullName)+'" disabled style="opacity:.75;"></label>';
  } else if(isLeave){
    recipientFieldHtml = '<label>گیرنده (به مدیر خودتان — از بخش «سطح دسترسی» برایتان تعیین نشده، لطفاً یکی را انتخاب کنید)<select id="msgTo">'+userOptions(c.toUserId, true)+'</select></label>';
  } else {
    // Task messages can be a group ticket — pick one or several recipients at once.
    var pickable = S.msgUsers.filter(function(u){ return u.id!==S.user.id; });
    recipientFieldHtml = '<label>گیرندگان (می‌توانید چند نفر همزمان انتخاب کنید)'+
      '<div class="chip-list" id="msgToMulti" style="max-height:170px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px;">'+
        (pickable.length ? pickable.map(function(u){
          var checked = c.toUserIds.indexOf(u.id)!==-1;
          return '<label style="display:flex;align-items:center;gap:6px;padding:4px 2px;font-weight:400;cursor:pointer;">'+
            '<input type="checkbox" class="msg-to-cb" value="'+u.id+'" '+(checked?'checked':'')+'>'+
            '<span>'+escapeHtml(u.fullName)+'</span>'+
          '</label>';
        }).join('') : '<div class="empty-state">کاربر دیگری وجود ندارد</div>')+
      '</div></label>';
  }

  var composeHtml =
    '<div class="card"><h2>ارسال پیام / درخواست جدید</h2>'+
      '<div class="btn-group" style="margin-bottom:12px;">'+
        '<button type="button" class="btn-small msg-type-btn '+(c.type==='task'?'':'btn-ghost')+'" data-type="task">پیام کاری</button>'+
        '<button type="button" class="btn-small msg-type-btn '+(c.type==='leave'?'':'btn-ghost')+'" data-type="leave">درخواست مرخصی</button>'+
      '</div>'+
      '<div class="grid-2">'+
        recipientFieldHtml+
        (isLeave ? '' : '<label>موضوع<input type="text" id="msgSubject" value="'+escapeHtml(c.subject)+'"></label>')+
      '</div>'+
      (isLeave ?
        '<div class="grid-2" style="margin-top:12px;">'+
          '<label>تاریخ شروع مرخصی'+dateBtnHtml('msgLeaveStartBtn', {jy:c.leaveStartJy,jm:c.leaveStartJm,jd:c.leaveStartJd}, '')+'</label>'+
          '<label>تاریخ پایان مرخصی'+dateBtnHtml('msgLeaveEndBtn', {jy:c.leaveEndJy,jm:c.leaveEndJm,jd:c.leaveEndJd}, '')+'</label>'+
        '</div>'+
        '<label style="margin-top:12px;">دلیل مرخصی<textarea id="msgBody" rows="3">'+escapeHtml(c.body)+'</textarea></label>'
        :
        '<label style="margin-top:12px;">شماره واچر مرتبط (اختیاری)<input type="text" id="msgVoucher" value="'+escapeHtml(c.voucherNumber)+'"></label>'+
        '<label style="margin-top:12px;">متن پیام<textarea id="msgBody" rows="3">'+escapeHtml(c.body)+'</textarea></label>'
      )+
      '<div class="card-header-row" style="margin-top:12px;"><button type="button" class="btn-primary" id="msgSend">'+(isLeave?'ارسال درخواست مرخصی':'ارسال پیام')+'</button><span class="save-msg" id="msgSendMsg"></span></div>'+
    '</div>';

  var statusOptions = isLeave ? LEAVE_STATUS_LABELS : TASK_STATUS_LABELS;
  var typeTabs = '<button type="button" class="status-tab '+(MSG_FILTER.type===''?'active':'')+'" data-t="">همه</button>'+
    '<button type="button" class="status-tab '+(MSG_FILTER.type==='task'?'active':'')+'" data-t="task">پیام‌های کاری</button>'+
    '<button type="button" class="status-tab '+(MSG_FILTER.type==='leave'?'active':'')+'" data-t="leave">درخواست‌های مرخصی</button>';

  var threadsHtml = threads.length ? threads.map(function(t){
    var labels = t.type==='leave' ? LEAVE_STATUS_LABELS : TASK_STATUS_LABELS;
    var pillCls = (t.status==='done'||t.status==='approved') ? '' : (t.status==='rejected' ? 'pill-danger' : 'pill-pending');
    var leaveInfo = t.leaveDetails ? (' — از '+jStr({jy:t.leaveDetails.startJy,jm:t.leaveDetails.startJm,jd:t.leaveDetails.startJd})+' تا '+jStr({jy:t.leaveDetails.endJy,jm:t.leaveDetails.endJm,jd:t.leaveDetails.endJd})) : '';
    var open = MSG_OPEN_THREAD === t.threadId;
    var participantsLine = (t.participants && t.participants.length) ?
      ('<div style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px;">'+
        t.participants.map(function(p){ return avatarNameHtml(p.id, p.fullName, 18); }).join('')+
      '</div>') :
      ('<div style="font-size:12px;color:var(--text-muted);">از '+userName(t.fromUser)+' به '+userName(t.toUser)+'</div>');
    return '<div class="voucher-card" data-thread="'+t.threadId+'" style="cursor:pointer;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">'+
        '<div><b>'+(t.type==='leave'?'🗓 درخواست مرخصی':escapeHtml(t.subject||'(بدون موضوع)'))+'</b>'+leaveInfo+
          participantsLine+(t.voucherNumber?('<div style="font-size:12px;color:var(--text-muted);">واچر: '+escapeHtml(t.voucherNumber)+'</div>'):'')+'</div>'+
        '<div><span class="pill '+pillCls+'">'+labels[t.status]+'</span></div>'+
      '</div>'+
      (open ? '<div id="threadBody_'+t.threadId+'" class="empty-state">در حال بارگذاری…</div>' : '') +
    '</div>';
  }).join('') : '<div class="empty-state">پیامی یافت نشد</div>';

  qs('#tabContent').innerHTML = composeHtml +
    '<div class="card"><div class="status-tabs">'+typeTabs+'</div><div>'+threadsHtml+'</div></div>';

  bindMessenger(threads);
  if(MSG_OPEN_THREAD) loadThreadBody(MSG_OPEN_THREAD);
}

function bindMessenger(threads){
  qsa('.msg-type-btn').forEach(function(btn){ btn.addEventListener('click', function(){ MSG_COMPOSE.type=this.getAttribute('data-type'); loadMessenger(); }); });
  var g = function(id){ return document.getElementById(id); };
  if(g('msgTo')) g('msgTo').addEventListener('change', function(){ MSG_COMPOSE.toUserId=this.value; });
  qsa('.msg-to-cb').forEach(function(cb){ cb.addEventListener('change', function(){
    var id = this.value;
    var idx = MSG_COMPOSE.toUserIds.indexOf(id);
    if(this.checked && idx===-1) MSG_COMPOSE.toUserIds.push(id);
    else if(!this.checked && idx!==-1) MSG_COMPOSE.toUserIds.splice(idx,1);
  }); });
  if(g('msgSubject')) g('msgSubject').addEventListener('input', function(){ MSG_COMPOSE.subject=this.value; });
  if(g('msgVoucher')) g('msgVoucher').addEventListener('input', function(){ MSG_COMPOSE.voucherNumber=this.value; });
  if(g('msgBody')) g('msgBody').addEventListener('input', function(){ MSG_COMPOSE.body=this.value; });
  var startBtn = g('msgLeaveStartBtn');
  if(startBtn) startBtn.addEventListener('click', function(){
    openCalendar(this, MSG_COMPOSE.leaveStartJy?{jy:MSG_COMPOSE.leaveStartJy,jm:MSG_COMPOSE.leaveStartJm,jd:MSG_COMPOSE.leaveStartJd}:null, function(picked){
      MSG_COMPOSE.leaveStartJy=picked.jy; MSG_COMPOSE.leaveStartJm=picked.jm; MSG_COMPOSE.leaveStartJd=picked.jd;
      loadMessenger();
    });
  });
  var endBtn = g('msgLeaveEndBtn');
  if(endBtn) endBtn.addEventListener('click', function(){
    openCalendar(this, MSG_COMPOSE.leaveEndJy?{jy:MSG_COMPOSE.leaveEndJy,jm:MSG_COMPOSE.leaveEndJm,jd:MSG_COMPOSE.leaveEndJd}:null, function(picked){
      MSG_COMPOSE.leaveEndJy=picked.jy; MSG_COMPOSE.leaveEndJm=picked.jm; MSG_COMPOSE.leaveEndJd=picked.jd;
      loadMessenger();
    });
  });
  if(g('msgSend')) g('msgSend').addEventListener('click', submitMessage);

  qsa('.status-tab[data-t]').forEach(function(btn){ btn.addEventListener('click', function(){ MSG_FILTER.type=this.getAttribute('data-t'); loadMessenger(); }); });

  qsa('[data-thread]').forEach(function(card){
    card.addEventListener('click', function(e){
      var id = this.getAttribute('data-thread');
      MSG_OPEN_THREAD = (MSG_OPEN_THREAD===id) ? null : id;
      loadMessenger();
    });
  });
}

async function submitMessage(){
  var c = MSG_COMPOSE;
  var isLeave = c.type==='leave';
  if(isLeave){
    if(!c.toUserId){ flashMsg('msgSendMsg','گیرنده را انتخاب کنید', true); return; }
  } else {
    if(!c.toUserIds.length){ flashMsg('msgSendMsg','حداقل یک گیرنده انتخاب کنید', true); return; }
  }
  if(!c.body || !c.body.trim()){ flashMsg('msgSendMsg','متن را وارد کنید', true); return; }
  var body = { type:c.type, subject:c.subject, voucherNumber:c.voucherNumber, body:c.body };
  if(isLeave) body.toUserId = c.toUserId; else body.toUserIds = c.toUserIds;
  if(c.type==='leave'){
    if(!c.leaveStartJy || !c.leaveEndJy){ flashMsg('msgSendMsg','تاریخ شروع و پایان مرخصی را انتخاب کنید', true); return; }
    body.leaveDetails = {
      startJy:c.leaveStartJy, startJm:c.leaveStartJm, startJd:c.leaveStartJd,
      endJy:c.leaveEndJy, endJm:c.leaveEndJm, endJd:c.leaveEndJd, reason:c.body
    };
  }
  try{
    await api.post('/messenger/threads', body);
    MSG_COMPOSE = { type:c.type, toUserId:'', toUserIds:[], subject:'', voucherNumber:'', body:'',
      leaveStartJy:null, leaveStartJm:null, leaveStartJd:null, leaveEndJy:null, leaveEndJm:null, leaveEndJd:null };
    flashMsg('msgSendMsg','ارسال شد ✓', false);
    loadMessenger();
  }catch(e){ flashMsg('msgSendMsg', e.message, true); }
}

async function loadThreadBody(threadId){
  var container = document.getElementById('threadBody_'+threadId);
  if(!container) return;
  try{
    var res = await api.get('/messenger/threads/'+threadId);
    renderThreadBody(container, threadId, res.messages, res.participants||[]);
  }catch(e){
    container.innerHTML = '<div style="color:var(--danger);">'+escapeHtml(e.message)+'</div>';
  }
}

function renderThreadBody(container, threadId, messages, participants){
  var root = messages[0];
  var isLeave = root.type==='leave';
  var statusLabels = isLeave ? LEAVE_STATUS_LABELS : TASK_STATUS_LABELS;
  var history = messages.map(function(m){
    return '<div style="border-bottom:1px dashed var(--border);padding:8px 0;">'+
      '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);">'+
        '<span><b>'+userName(m.fromUser)+'</b></span><span>'+new Date(m.createdAt).toLocaleString('fa-IR')+'</span>'+
      '</div>'+
      (m.leaveDetails ? ('<div style="font-size:12.5px;margin-top:4px;">بازه: '+jStr({jy:m.leaveDetails.startJy,jm:m.leaveDetails.startJm,jd:m.leaveDetails.startJd})+' تا '+jStr({jy:m.leaveDetails.endJy,jm:m.leaveDetails.endJm,jd:m.leaveDetails.endJd})+'</div>') : '')+
      '<div style="margin-top:4px;font-size:13.5px;white-space:pre-wrap;">'+escapeHtml(m.body)+'</div>'+
    '</div>';
  }).join('');

  var canRespond = canEdit('messenger');
  var statusControlHtml = '';
  if(canRespond){
    if(isLeave){
      var isRecipientOrManager = (root.toUser && root.toUser.id===S.user.id) || S.user.isDeveloper;
      if(isRecipientOrManager && root.status==='pending'){
        statusControlHtml = '<div class="btn-group" style="margin-top:8px;">'+
          '<button type="button" class="btn-small thread-status" data-thread="'+threadId+'" data-status="approved">✓ تایید مرخصی</button>'+
          '<button type="button" class="btn-small btn-ghost thread-status" data-thread="'+threadId+'" data-status="rejected">✕ رد مرخصی</button>'+
        '</div>';
      } else {
        statusControlHtml = '<div style="margin-top:8px;"><span class="pill">وضعیت: '+statusLabels[root.status]+'</span></div>';
      }
    } else {
      statusControlHtml = '<label style="margin-top:8px;max-width:220px;">وضعیت تسک<select class="thread-status-select" data-thread="'+threadId+'">'+
        Object.keys(TASK_STATUS_LABELS).map(function(k){ return '<option value="'+k+'" '+(root.status===k?'selected':'')+'>'+TASK_STATUS_LABELS[k]+'</option>'; }).join('')+
      '</select></label>';
    }
  }

  // Group tickets: show who's on the thread, and let any participant loop
  // in someone new later on (not offered for leave requests — those stay
  // a strict 1:1 employee↔manager conversation).
  var participantsHtml = '';
  if(!isLeave){
    var existingIds = {}; participants.forEach(function(p){ existingIds[p.id]=true; });
    var addable = (S.msgUsers||[]).filter(function(u){ return !existingIds[u.id]; });
    var selected = MSG_ADD_PARTICIPANT[threadId] || '';
    participantsHtml = '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border);">'+
      '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">شرکت‌کنندگان این تیکت:</div>'+
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:'+(canRespond&&addable.length?'8px':'0')+';">'+
        participants.map(function(p){ return avatarNameHtml(p.id, p.fullName, 20); }).join('')+
      '</div>'+
      (canRespond && addable.length ?
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'+
          '<select class="thread-add-participant-select" data-thread="'+threadId+'" style="max-width:220px;">'+
            '<option value="">+ افزودن نفر به این تیکت</option>'+
            addable.map(function(u){ return '<option value="'+u.id+'" '+(selected===u.id?'selected':'')+'>'+escapeHtml(u.fullName)+'</option>'; }).join('')+
          '</select>'+
          '<button type="button" class="btn-small thread-add-participant-btn" data-thread="'+threadId+'">افزودن</button>'+
          '<span class="save-msg" id="threadAddMsg_'+threadId+'"></span>'+
        '</div>' : '')+
    '</div>';
  }

  var replyHtml = '';
  if(canRespond){
    var draft = MSG_REPLY_DRAFT[threadId] || '';
    replyHtml = '<label style="margin-top:10px;">پاسخ<textarea class="thread-reply-input" data-thread="'+threadId+'" rows="2">'+escapeHtml(draft)+'</textarea></label>'+
      '<button type="button" class="btn-primary thread-reply-submit" data-thread="'+threadId+'" style="margin-top:6px;">ارسال پاسخ</button>';
  }

  container.innerHTML = '<div class="deposit-card" style="margin-top:0;">'+history+statusControlHtml+participantsHtml+replyHtml+'</div>';
  container.className = '';

  qsa('.thread-status[data-thread="'+threadId+'"]').forEach(function(btn){
    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      await api.patch('/messenger/threads/'+threadId+'/status', { status:this.getAttribute('data-status') });
      loadMessenger();
    });
  });
  var sel = container.querySelector('.thread-status-select[data-thread="'+threadId+'"]');
  if(sel) sel.addEventListener('click', function(e){ e.stopPropagation(); });
  if(sel) sel.addEventListener('change', async function(){
    await api.patch('/messenger/threads/'+threadId+'/status', { status:this.value });
    loadMessenger();
  });
  var addSel = container.querySelector('.thread-add-participant-select[data-thread="'+threadId+'"]');
  if(addSel){
    addSel.addEventListener('click', function(e){ e.stopPropagation(); });
    addSel.addEventListener('change', function(){ MSG_ADD_PARTICIPANT[threadId] = this.value; });
  }
  var addBtn = container.querySelector('.thread-add-participant-btn[data-thread="'+threadId+'"]');
  if(addBtn) addBtn.addEventListener('click', async function(e){
    e.stopPropagation();
    var userId = MSG_ADD_PARTICIPANT[threadId];
    if(!userId){ flashMsg('threadAddMsg_'+threadId, 'یک نفر را انتخاب کنید', true); return; }
    try{
      await api.post('/messenger/threads/'+threadId+'/participants', { userId:userId });
      delete MSG_ADD_PARTICIPANT[threadId];
      loadMessenger(); // re-fetches the thread list + reopens this thread body (MSG_OPEN_THREAD stays set)
    }catch(e2){ flashMsg('threadAddMsg_'+threadId, e2.message, true); }
  });
  var replyInput = container.querySelector('.thread-reply-input[data-thread="'+threadId+'"]');
  if(replyInput){
    replyInput.addEventListener('click', function(e){ e.stopPropagation(); });
    replyInput.addEventListener('input', function(){ MSG_REPLY_DRAFT[threadId] = this.value; });
  }
  var replyBtn = container.querySelector('.thread-reply-submit[data-thread="'+threadId+'"]');
  if(replyBtn) replyBtn.addEventListener('click', async function(e){
    e.stopPropagation();
    var text = (MSG_REPLY_DRAFT[threadId]||'').trim();
    if(!text) return;
    await api.post('/messenger/threads/'+threadId+'/replies', { body:text });
    delete MSG_REPLY_DRAFT[threadId];
    loadMessenger();
  });
}
