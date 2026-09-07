"use strict";
var NOTES_STATE = { list: [], search: '', newOpen: false };
var NOTES_NEW = { title:'', content:'', color:'yellow' };
var NOTES_EDITING = {}; // id -> {title, content, color} draft while a card is open for editing

var NOTES_COLORS = ['yellow','pink','blue','green','purple','orange'];
var NOTES_COLOR_LABEL = { yellow:'زرد', pink:'صورتی', blue:'آبی', green:'سبز', purple:'بنفش', orange:'نارنجی' };

// Developer-only "search everyone's notes" panel state — kept separate from
// the personal notes above so switching tabs never mixes the two.
var NOTES_ADMIN = { open:false, search:'', userId:'', list:[], users:[] };

async function loadNotes(){
  var params = NOTES_STATE.search ? ('?search='+encodeURIComponent(NOTES_STATE.search)) : '';
  var res = await api.get('/notes'+params);
  NOTES_STATE.list = res.notes;
  if(S.user.isDeveloper && !NOTES_ADMIN.users.length){
    var dir = await ensureDirectory();
    NOTES_ADMIN.users = Object.keys(dir).map(function(id){ return { id:id, fullName:dir[id].fullName }; });
  }
  renderNotes();
}

function noteColorSwatchesHtml(selected, idPrefix){
  return NOTES_COLORS.map(function(c){
    return '<button type="button" class="note-swatch note-swatch-'+c+(c===selected?' active':'')+'" '+
      'data-color="'+c+'" data-target="'+idPrefix+'" title="'+NOTES_COLOR_LABEL[c]+'"></button>';
  }).join('');
}

function noteCardHtml(n){
  var editing = NOTES_EDITING[n.id];
  if(editing){
    return '<div class="note-card note-color-'+editing.color+' note-editing" data-id="'+n.id+'">'+
      '<input type="text" class="note-edit-title" data-id="'+n.id+'" placeholder="عنوان (اختیاری)" value="'+escapeHtml(editing.title)+'" maxlength="150">'+
      '<textarea class="note-edit-content" data-id="'+n.id+'" rows="6" placeholder="متن یادداشت...">'+escapeHtml(editing.content)+'</textarea>'+
      '<div class="note-swatches">'+noteColorSwatchesHtml(editing.color, n.id)+'</div>'+
      '<div class="note-card-actions">'+
        '<button type="button" class="btn-small btn-primary note-save" data-id="'+n.id+'">ذخیره</button>'+
        '<button type="button" class="btn-small btn-ghost note-cancel" data-id="'+n.id+'">انصراف</button>'+
      '</div>'+
    '</div>';
  }
  return '<div class="note-card note-color-'+n.color+'" data-id="'+n.id+'">'+
    '<div class="note-card-top">'+
      (n.title ? '<b class="note-title">'+escapeHtml(n.title)+'</b>' : '<span></span>')+
      '<button type="button" class="note-pin'+(n.pinned?' active':'')+'" data-id="'+n.id+'" title="'+(n.pinned?'برداشتن سنجاق':'سنجاق کردن بالای لیست')+'">📌</button>'+
    '</div>'+
    '<div class="note-content">'+escapeHtml(n.content)+'</div>'+
    '<div class="note-card-actions">'+
      '<button type="button" class="icon-btn note-edit-btn" data-id="'+n.id+'" title="ویرایش">✏️</button>'+
      '<button type="button" class="icon-btn note-delete" data-id="'+n.id+'" title="حذف">🗑</button>'+
    '</div>'+
    '<div class="note-card-time">'+new Date(n.updatedAt).toLocaleString('fa-IR')+'</div>'+
  '</div>';
}

function renderNotes(){
  var list = NOTES_STATE.list;
  var gridHtml = list.length ?
    '<div class="notes-grid">'+list.map(noteCardHtml).join('')+'</div>' :
    '<div class="empty-state">'+(NOTES_STATE.search ? 'یادداشتی با این جستجو پیدا نشد' : 'هنوز یادداشتی نداری — یکی بساز!')+'</div>';

  var newFormHtml = NOTES_STATE.newOpen ?
    '<div class="note-card note-color-'+NOTES_NEW.color+' note-editing note-new-card">'+
      '<input type="text" id="noteNewTitle" placeholder="عنوان (اختیاری)" value="'+escapeHtml(NOTES_NEW.title)+'" maxlength="150">'+
      '<textarea id="noteNewContent" rows="6" placeholder="متن یادداشت یا کار مهمت رو اینجا بنویس...">'+escapeHtml(NOTES_NEW.content)+'</textarea>'+
      '<div class="note-swatches">'+noteColorSwatchesHtml(NOTES_NEW.color, 'new')+'</div>'+
      '<div class="note-card-actions">'+
        '<button type="button" class="btn-small btn-primary" id="noteNewSave">افزودن یادداشت</button>'+
        '<button type="button" class="btn-small btn-ghost" id="noteNewCancel">انصراف</button>'+
      '</div>'+
    '</div>' : '';

  var devPanelHtml = S.user.isDeveloper ? notesAdminPanelHtml() : '';

  qs('#tabContent').innerHTML =
    '<div class="card">'+
      '<div class="filters">'+
        '<input type="text" id="noteSearch" placeholder="جستجو در یادداشت‌های من" value="'+escapeHtml(NOTES_STATE.search)+'" style="min-width:220px;">'+
        '<button type="button" class="btn-small" id="noteSearchBtn">جستجو</button>'+
        (NOTES_STATE.search ? '<button type="button" class="btn-small btn-ghost" id="noteClearSearch">پاک کردن</button>' : '')+
        (!NOTES_STATE.newOpen ? '<button type="button" class="btn-primary" id="noteAddBtn" style="margin-inline-start:auto;">+ یادداشت جدید</button>' : '')+
      '</div>'+
    '</div>'+
    '<div class="notes-grid-wrap">'+newFormHtml+gridHtml+'</div>'+
    devPanelHtml;

  bindNotes();
  if(S.user.isDeveloper) bindNotesAdmin();
}

function notesAdminPanelHtml(){
  var userOptionsHtml = '<option value="">همه کاربران</option>'+NOTES_ADMIN.users.map(function(u){
    return '<option value="'+u.id+'"'+(u.id===NOTES_ADMIN.userId?' selected':'')+'>'+escapeHtml(u.fullName)+'</option>';
  }).join('');

  var listHtml = '';
  if(NOTES_ADMIN.open){
    listHtml = NOTES_ADMIN.list.length ?
      '<div class="notes-grid">'+NOTES_ADMIN.list.map(function(n){
        return '<div class="note-card note-color-'+n.color+' note-readonly">'+
          '<div class="note-card-top">'+(n.title?'<b class="note-title">'+escapeHtml(n.title)+'</b>':'<span></span>')+(n.pinned?'<span title="سنجاق‌شده">📌</span>':'')+'</div>'+
          '<div class="note-content">'+escapeHtml(n.content)+'</div>'+
          '<div class="note-card-time">'+escapeHtml(n.ownerName)+' (@'+escapeHtml(n.ownerUsername)+') — '+new Date(n.updatedAt).toLocaleString('fa-IR')+'</div>'+
        '</div>';
      }).join('')+'</div>' :
      '<div class="empty-state">یادداشتی یافت نشد</div>';
  }

  return '<div class="card" style="margin-top:20px;">'+
    '<h2>جستجو در یادداشت‌های همه کاربران (فقط توسعه‌دهنده — فقط مشاهده)</h2>'+
    '<div class="filters">'+
      '<input type="text" id="noteAdminSearch" placeholder="جستجو در همه یادداشت‌ها" value="'+escapeHtml(NOTES_ADMIN.search)+'" style="min-width:220px;">'+
      '<label style="min-width:180px;">کاربر<select id="noteAdminUser">'+userOptionsHtml+'</select></label>'+
      '<button type="button" class="btn-small" id="noteAdminSearchBtn">جستجو</button>'+
    '</div>'+
    (NOTES_ADMIN.open ? '<div style="margin-top:14px;">'+listHtml+'</div>' : '<div class="save-msg" style="margin-top:8px;">برای مشاهده، جستجو کن یا یک کاربر انتخاب کن</div>')+
  '</div>';
}

function bindNotes(){
  var g = function(id){ return document.getElementById(id); };

  if(g('noteSearch')) g('noteSearch').addEventListener('input', function(){ NOTES_STATE.search=this.value; });
  if(g('noteSearch')) g('noteSearch').addEventListener('keydown', function(e){ if(e.key==='Enter') loadNotes(); });
  if(g('noteSearchBtn')) g('noteSearchBtn').addEventListener('click', loadNotes);
  if(g('noteClearSearch')) g('noteClearSearch').addEventListener('click', function(){ NOTES_STATE.search=''; loadNotes(); });

  if(g('noteAddBtn')) g('noteAddBtn').addEventListener('click', function(){
    NOTES_STATE.newOpen = true; NOTES_NEW = { title:'', content:'', color:'yellow' }; renderNotes();
  });
  if(g('noteNewCancel')) g('noteNewCancel').addEventListener('click', function(){
    NOTES_STATE.newOpen = false; renderNotes();
  });
  if(g('noteNewTitle')) g('noteNewTitle').addEventListener('input', function(){ NOTES_NEW.title=this.value; });
  if(g('noteNewContent')) g('noteNewContent').addEventListener('input', function(){ NOTES_NEW.content=this.value; });
  if(g('noteNewSave')) g('noteNewSave').addEventListener('click', async function(){
    if(!NOTES_NEW.title.trim() && !NOTES_NEW.content.trim()){ alert('یادداشت خالی است'); return; }
    try{
      await api.post('/notes', NOTES_NEW);
      NOTES_STATE.newOpen = false;
      loadNotes();
    }catch(e){ alert(e.message); }
  });

  qsa('.note-swatch').forEach(function(btn){ btn.addEventListener('click', function(){
    var target = this.getAttribute('data-target'), color = this.getAttribute('data-color');
    if(target === 'new'){ NOTES_NEW.color = color; }
    else if(NOTES_EDITING[target]){ NOTES_EDITING[target].color = color; }
    renderNotes();
  }); });

  qsa('.note-pin').forEach(function(btn){ btn.addEventListener('click', async function(){
    var id = this.getAttribute('data-id');
    var n = NOTES_STATE.list.find(function(x){ return x.id===id; });
    if(!n) return;
    try{ await api.patch('/notes/'+id, { pinned: !n.pinned }); loadNotes(); }
    catch(e){ alert(e.message); }
  }); });

  qsa('.note-edit-btn').forEach(function(btn){ btn.addEventListener('click', function(){
    var id = this.getAttribute('data-id');
    var n = NOTES_STATE.list.find(function(x){ return x.id===id; });
    if(!n) return;
    NOTES_EDITING[id] = { title:n.title, content:n.content, color:n.color };
    renderNotes();
  }); });
  qsa('.note-edit-title').forEach(function(inp){ inp.addEventListener('input', function(){
    var id = this.getAttribute('data-id'); if(NOTES_EDITING[id]) NOTES_EDITING[id].title = this.value;
  }); });
  qsa('.note-edit-content').forEach(function(inp){ inp.addEventListener('input', function(){
    var id = this.getAttribute('data-id'); if(NOTES_EDITING[id]) NOTES_EDITING[id].content = this.value;
  }); });
  qsa('.note-cancel').forEach(function(btn){ btn.addEventListener('click', function(){
    delete NOTES_EDITING[this.getAttribute('data-id')]; renderNotes();
  }); });
  qsa('.note-save').forEach(function(btn){ btn.addEventListener('click', async function(){
    var id = this.getAttribute('data-id');
    var draft = NOTES_EDITING[id];
    if(!draft) return;
    if(!draft.title.trim() && !draft.content.trim()){ alert('یادداشت خالی است'); return; }
    try{
      await api.patch('/notes/'+id, draft);
      delete NOTES_EDITING[id];
      loadNotes();
    }catch(e){ alert(e.message); }
  }); });

  qsa('.note-delete').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این یادداشت حذف شود؟')) return;
    try{ await api.del('/notes/'+this.getAttribute('data-id')); loadNotes(); }
    catch(e){ alert(e.message); }
  }); });
}

function bindNotesAdmin(){
  var g = function(id){ return document.getElementById(id); };
  if(g('noteAdminSearch')) g('noteAdminSearch').addEventListener('input', function(){ NOTES_ADMIN.search=this.value; });
  if(g('noteAdminSearch')) g('noteAdminSearch').addEventListener('keydown', function(e){ if(e.key==='Enter') runNotesAdminSearch(); });
  if(g('noteAdminUser')) g('noteAdminUser').addEventListener('change', function(){ NOTES_ADMIN.userId=this.value; runNotesAdminSearch(); });
  if(g('noteAdminSearchBtn')) g('noteAdminSearchBtn').addEventListener('click', runNotesAdminSearch);
}

async function runNotesAdminSearch(){
  var params = [];
  if(NOTES_ADMIN.search) params.push('search='+encodeURIComponent(NOTES_ADMIN.search));
  if(NOTES_ADMIN.userId) params.push('userId='+encodeURIComponent(NOTES_ADMIN.userId));
  var res = await api.get('/notes/all'+(params.length?'?'+params.join('&'):''));
  NOTES_ADMIN.list = res.notes;
  NOTES_ADMIN.users = res.users;
  NOTES_ADMIN.open = true;
  renderNotes();
}
