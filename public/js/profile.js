"use strict";

async function loadProfile(){
  var res = await api.get('/profile/me');
  renderProfile(res.profile);
}

function renderProfile(p){
  qs('#tabContent').innerHTML =
    '<div class="card" style="max-width:520px;">'+
      '<h2>پروفایل من</h2>'+
      '<div style="display:flex;align-items:center;gap:18px;margin-bottom:18px;">'+
        '<div id="profilePhotoPreview">'+avatarHtml(p.photoDataUrl, p.fullName, 84)+'</div>'+
        '<div>'+
          '<div class="btn-group">'+
            '<label class="btn-small" style="cursor:pointer;">آپلود عکس سازمانی<input type="file" id="profilePhotoInput" accept="image/*" style="display:none;"></label>'+
            (p.photoDataUrl ? '<button type="button" class="btn-small btn-ghost" id="profilePhotoRemove">حذف عکس</button>' : '')+
          '</div>'+
          '<div style="font-size:11.5px;color:var(--text-muted);margin-top:6px;">فقط شما می‌توانید عکس خودتان را عوض کنید؛ این عکس همه‌جا کنار نامتان نمایش داده می‌شود.</div>'+
          '<span class="save-msg" id="profilePhotoMsg"></span>'+
        '</div>'+
      '</div>'+
      '<div class="grid-2">'+
        '<label>نام و نام‌خانوادگی<input type="text" value="'+escapeHtml(p.fullName)+'" disabled></label>'+
        '<label>نام کاربری<input type="text" value="'+escapeHtml(p.username)+'" disabled></label>'+
        '<label>سمت<input type="text" value="'+escapeHtml(p.position||'—')+'" disabled></label>'+
        '<label>داخلی<input type="text" value="'+escapeHtml(p.extension||'—')+'" disabled></label>'+
        '<label>سطح دسترسی<input type="text" value="'+escapeHtml(p.roleName)+'" disabled></label>'+
      '</div>'+
      '<p style="font-size:11.5px;color:var(--text-muted);margin-top:12px;">نام، سمت، داخلی و سطح دسترسی فقط توسط توسعه‌دهنده از بخش «سطح دسترسی» قابل تغییر است.</p>'+
    '</div>';

  bindProfile();
}

function bindProfile(){
  var input = document.getElementById('profilePhotoInput');
  if(input) input.addEventListener('change', function(){
    var file = this.files && this.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = async function(){
      try{
        await api.post('/profile/me/photo', { photoDataUrl: reader.result });
        S.user.photoDataUrl = reader.result; // keep sidebar avatar in sync immediately
        S.directory = null; // invalidate the shared directory so the new photo shows everywhere
        flashMsg('profilePhotoMsg','ذخیره شد ✓', false);
        renderShell(); // re-renders sidebar avatar + reloads this tab
      }catch(e){ flashMsg('profilePhotoMsg', e.message, true); }
    };
    reader.readAsDataURL(file);
  });
  var removeBtn = document.getElementById('profilePhotoRemove');
  if(removeBtn) removeBtn.addEventListener('click', async function(){
    try{
      await api.post('/profile/me/photo', { photoDataUrl: '' });
      S.user.photoDataUrl = '';
      S.directory = null;
      flashMsg('profilePhotoMsg','عکس حذف شد', false);
      renderShell();
    }catch(e){ flashMsg('profilePhotoMsg', e.message, true); }
  });
}
