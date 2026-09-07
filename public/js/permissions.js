"use strict";
var PERM_MODULES = null;
var NEW_USER_FORM = { username:'', password:'', fullName:'', roleId:'' };
var NEW_ROLE_NAME = '';

async function loadPermissions(){
  if(!S.user.isDeveloper){
    qs('#tabContent').innerHTML = '<div class="card"><p style="color:var(--danger);">فقط توسعه‌دهنده به این بخش دسترسی دارد.</p></div>';
    return;
  }
  var rolesRes = await api.get('/roles');
  var usersRes = await api.get('/users');
  PERM_MODULES = rolesRes.modules;
  renderPermissions(rolesRes.roles, usersRes.users);
}

function renderPermissions(roles, users){
  var roleRows = roles.map(function(role){
    if(role.isDeveloper){
      return '<div class="card"><h2>'+escapeHtml(role.name)+' <span class="pill">دسترسی کامل و غیرقابل تغییر</span></h2>'+
        '<p style="font-size:12.5px;color:var(--text-muted);">این نقش همیشه به همه بخش‌ها دسترسی کامل (مشاهده و ویرایش) دارد و فقط شما (توسعه‌دهنده) می‌توانید کاربر با این نقش داشته باشید.</p></div>';
    }
    var matrixRows = PERM_MODULES.map(function(m){
      var p = role.permissions[m.key] || {view:false,edit:false};
      return '<tr><td>'+m.label+'</td>'+
        '<td><input type="checkbox" class="perm-view" data-role="'+role.id+'" data-mod="'+m.key+'" '+(p.view?'checked':'')+'></td>'+
        '<td><input type="checkbox" class="perm-edit" data-role="'+role.id+'" data-mod="'+m.key+'" '+(p.edit?'checked':'')+'></td>'+
      '</tr>';
    }).join('');
    var roleCategoryHtml = '<label style="max-width:320px;margin-bottom:10px;">دسته این نقش در فرم‌ها (کانتر / کارشناس تأمین)'+
      '<select class="role-category" data-role="'+role.id+'">'+
        '<option value="" '+(!role.roleCategory?'selected':'')+'>— هیچکدام —</option>'+
        '<option value="counter" '+(role.roleCategory==='counter'?'selected':'')+'>کانتر (فروش)</option>'+
        '<option value="procurementExpert" '+(role.roleCategory==='procurementExpert'?'selected':'')+'>نیرو تأمین (کارشناس تأمین)</option>'+
      '</select></label>'+
      '<p style="font-size:11.5px;color:var(--text-muted);margin:-4px 0 10px;">با انتخاب این گزینه، هر کاربر فعال با این نقش خودکار در لیست کانتر یا کارشناس تأمین فرم‌های پرواز/هتل و رزرواسیون قرار می‌گیرد.</p>';
    return '<div class="card">'+
      '<div class="card-header-row"><h2>'+escapeHtml(role.name)+'</h2>'+
        '<div class="btn-group">'+
          '<button type="button" class="btn-small role-rename" data-role="'+role.id+'">تغییر نام</button>'+
          '<button type="button" class="btn-small btn-ghost role-delete" data-role="'+role.id+'">حذف نقش</button>'+
        '</div>'+
      '</div>'+
      '<label style="flex-direction:row;align-items:center;gap:10px;margin-bottom:10px;">'+
        '<input type="checkbox" class="role-viewall" data-role="'+role.id+'" '+(role.canViewAllMessages?'checked':'')+'>'+
        '<span>این نقش تمام گفتگوهای پیام‌رسان را (به‌جز درخواست‌های مرخصی که فقط به مدیر بخش می‌رسد) می‌بیند — برای نقش‌های مدیریتی</span>'+
      '</label>'+
      roleCategoryHtml+
      '<div class="table-wrap"><table class="perm-matrix"><thead><tr><th>بخش</th><th>مشاهده</th><th>ویرایش</th></tr></thead><tbody>'+matrixRows+'</tbody></table></div>'+
    '</div>';
  }).join('');

  var roleOptsForUsers = roles.map(function(r){ return '<option value="'+r.id+'">'+escapeHtml(r.name)+'</option>'; }).join('');
  var managerOptsForUsers = '<option value="">— بدون مدیر —</option>'+users.map(function(u){ return '<option value="'+u.id+'">'+escapeHtml(u.fullName)+'</option>'; }).join('');
  var userRows = users.map(function(u){
    var managerOpts = '<option value="">— بدون مدیر —</option>'+users.filter(function(x){ return x.id!==u.id; }).map(function(x){ return '<option value="'+x.id+'" '+(u.managerId===x.id?'selected':'')+'>'+escapeHtml(x.fullName)+'</option>'; }).join('');
    return '<tr><td>'+escapeHtml(u.fullName)+'</td><td>'+escapeHtml(u.username)+'</td>'+
      '<td><select class="user-role-select" data-id="'+u.id+'">'+roles.map(function(r){ return '<option value="'+r.id+'" '+(u.roleId===r.id?'selected':'')+'>'+escapeHtml(r.name)+'</option>'; }).join('')+'</select></td>'+
      '<td><input type="text" class="user-extension-input" data-id="'+u.id+'" value="'+escapeHtml(u.extension||'')+'" placeholder="داخلی" style="width:70px;"></td>'+
      '<td><input type="text" class="user-position-input" data-id="'+u.id+'" value="'+escapeHtml(u.position||'')+'" placeholder="سمت" style="width:110px;"></td>'+
      '<td><select class="user-manager-select" data-id="'+u.id+'">'+managerOpts+'</select></td>'+
      '<td><input type="checkbox" class="user-active-cb" data-id="'+u.id+'" '+(u.active?'checked':'')+'></td>'+
      '<td><div class="btn-group">'+
        '<button type="button" class="btn-small user-reset-pw" data-id="'+u.id+'">تغییر رمز</button>'+
        '<button type="button" class="icon-btn user-delete" data-id="'+u.id+'">🗑</button>'+
      '</div></td></tr>';
  }).join('');

  qs('#tabContent').innerHTML =
    '<div class="card"><h2>افزودن سطح دسترسی جدید (نقش)</h2>'+
      '<div class="add-row"><input type="text" id="newRoleName" placeholder="نام نقش، مثلاً «حسابدار»" value="'+escapeHtml(NEW_ROLE_NAME)+'"><button type="button" class="btn-small" id="addRoleBtn">افزودن نقش</button></div>'+
    '</div>'+
    roleRows+
    '<div class="card"><h2>افزودن کاربر جدید</h2>'+
      '<div class="grid-4">'+
        '<label>نام کامل<input type="text" id="nuFullName" value="'+escapeHtml(NEW_USER_FORM.fullName)+'"></label>'+
        '<label>نام کاربری<input type="text" id="nuUsername" value="'+escapeHtml(NEW_USER_FORM.username)+'"></label>'+
        '<label>رمز عبور موقت (حداقل ۱۲ کاراکتر، شامل حرف بزرگ/کوچک/عدد یا کاراکتر خاص)<input type="text" id="nuPassword" value="'+escapeHtml(NEW_USER_FORM.password)+'"></label>'+
        '<label>سطح دسترسی<select id="nuRole">'+roleOptsForUsers+'</select></label>'+
      '</div>'+
      '<div class="grid-4" style="margin-top:10px;">'+
        '<label>سمت (نمایش در پروفایل)<input type="text" id="nuPosition" placeholder="مثلاً کارشناس فروش"></label>'+
        '<label>داخلی<input type="text" id="nuExtension" placeholder="مثلاً ۱۰۲"></label>'+
        '<label>مدیر مستقیم (برای درخواست مرخصی)<select id="nuManager">'+managerOptsForUsers+'</select></label>'+
      '</div>'+
      '<button type="button" class="btn-primary" id="addUserBtn" style="margin-top:10px;">افزودن کاربر</button>'+
      '<span class="save-msg" id="nuMsg"></span>'+
    '</div>'+
    '<div class="card"><h2>کاربران سیستم</h2>'+
      '<p style="font-size:11.5px;color:var(--text-muted);">عکس پروفایل را فقط خود کاربر از تب «پروفایل من» آپلود می‌کند؛ نام، داخلی، سمت و مدیر فقط از همین‌جا قابل تنظیم است.</p>'+
      '<div class="table-wrap"><table><thead><tr><th>نام</th><th>نام کاربری</th><th>سطح دسترسی</th><th>داخلی</th><th>سمت</th><th>مدیر (برای مرخصی)</th><th>فعال</th><th></th></tr></thead><tbody>'+userRows+'</tbody></table></div>'+
    '</div>';

  bindPermissions();
}

function bindPermissions(){
  var g = function(id){ return document.getElementById(id); };

  if(g('addRoleBtn')) g('addRoleBtn').addEventListener('click', async function(){
    var name = document.getElementById('newRoleName').value.trim();
    if(!name){ return; }
    await api.post('/roles', { name: name });
    NEW_ROLE_NAME = '';
    loadPermissions();
  });

  qsa('.role-rename').forEach(function(btn){ btn.addEventListener('click', async function(){
    var name = prompt('نام جدید نقش را وارد کنید:');
    if(!name) return;
    await api.patch('/roles/'+this.getAttribute('data-role'), { name: name });
    loadPermissions();
  }); });
  qsa('.role-delete').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این نقش حذف شود؟ (اگر کاربری با این نقش وجود داشته باشد، حذف نمی‌شود)')) return;
    try{ await api.del('/roles/'+this.getAttribute('data-role')); loadPermissions(); }
    catch(e){ alert(e.message); }
  }); });
  qsa('.role-viewall').forEach(function(cb){ cb.addEventListener('change', async function(){
    await api.patch('/roles/'+this.getAttribute('data-role'), { canViewAllMessages: this.checked });
  }); });
  qsa('.role-category').forEach(function(sel){ sel.addEventListener('change', async function(){
    await api.patch('/roles/'+this.getAttribute('data-role'), { roleCategory: this.value || null });
    S.settings = null; // counters/procurementExperts lists derive from this — force a refetch
    loadPermissions();
  }); });

  function pushPermUpdate(roleId){
    var permissions = {};
    PERM_MODULES.forEach(function(m){
      var viewEl = document.querySelector('.perm-view[data-role="'+roleId+'"][data-mod="'+m.key+'"]');
      var editEl = document.querySelector('.perm-edit[data-role="'+roleId+'"][data-mod="'+m.key+'"]');
      permissions[m.key] = { view: viewEl?viewEl.checked:false, edit: editEl?editEl.checked:false };
    });
    return api.patch('/roles/'+roleId, { permissions: permissions });
  }
  qsa('.perm-view, .perm-edit').forEach(function(cb){
    cb.addEventListener('change', async function(){
      // edit implies view, visually too
      if(this.classList.contains('perm-edit') && this.checked){
        var viewEl = document.querySelector('.perm-view[data-role="'+this.dataset.role+'"][data-mod="'+this.dataset.mod+'"]');
        if(viewEl) viewEl.checked = true;
      }
      await pushPermUpdate(this.getAttribute('data-role'));
    });
  });

  if(g('addUserBtn')) g('addUserBtn').addEventListener('click', async function(){
    var body = {
      fullName: document.getElementById('nuFullName').value.trim(),
      username: document.getElementById('nuUsername').value.trim(),
      password: document.getElementById('nuPassword').value,
      roleId: document.getElementById('nuRole').value,
      position: document.getElementById('nuPosition').value.trim(),
      extension: document.getElementById('nuExtension').value.trim(),
      managerId: document.getElementById('nuManager').value || null
    };
    try{
      await api.post('/users', body);
      NEW_USER_FORM = { username:'', password:'', fullName:'', roleId:'' };
      flashMsg('nuMsg','کاربر ایجاد شد ✓', false);
      S.msgUsers = null; // invalidate messenger recipient cache
      S.directory = null; // invalidate name/photo directory cache
      loadPermissions();
    }catch(e){ flashMsg('nuMsg', e.message, true); }
  });

  qsa('.user-role-select').forEach(function(sel){ sel.addEventListener('change', async function(){
    await api.patch('/users/'+this.getAttribute('data-id'), { roleId: this.value });
    S.settings = null; // role change may move this user in/out of counter or کارشناس تأمین lists
  }); });
  qsa('.user-extension-input').forEach(function(inp){ inp.addEventListener('change', async function(){
    await api.patch('/users/'+this.getAttribute('data-id'), { extension: this.value.trim() });
    S.directory = null;
  }); });
  qsa('.user-position-input').forEach(function(inp){ inp.addEventListener('change', async function(){
    await api.patch('/users/'+this.getAttribute('data-id'), { position: this.value.trim() });
    S.directory = null;
  }); });
  qsa('.user-manager-select').forEach(function(sel){ sel.addEventListener('change', async function(){
    try{ await api.patch('/users/'+this.getAttribute('data-id'), { managerId: this.value || null }); }
    catch(e){ alert(e.message); loadPermissions(); }
  }); });
  qsa('.user-active-cb').forEach(function(cb){ cb.addEventListener('change', async function(){
    await api.patch('/users/'+this.getAttribute('data-id'), { active: this.checked });
    S.settings = null;
  }); });
  qsa('.user-reset-pw').forEach(function(btn){ btn.addEventListener('click', async function(){
    var pw = prompt('رمز عبور موقت جدید را وارد کنید (حداقل ۱۲ کاراکتر، شامل حرف بزرگ/کوچک/عدد یا کاراکتر خاص):');
    if(!pw) return;
    try{ await api.patch('/users/'+this.getAttribute('data-id'), { newPassword: pw }); alert('رمز عبور تغییر کرد.'); }
    catch(e){ alert(e.message); }
  }); });
  qsa('.user-delete').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این کاربر حذف شود؟')) return;
    try{ await api.del('/users/'+this.getAttribute('data-id')); loadPermissions(); }
    catch(e){ alert(e.message); }
  }); });
}
