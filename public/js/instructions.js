"use strict";
var INS_FILTER = { department:'', subject:'', search:'' };
var INS_NEW = { department:'', subject:'', description:'' };
var INS_LAST_DEPARTMENTS = [];

function insFilterParams(){
  var params = [];
  if(INS_FILTER.department) params.push('department='+encodeURIComponent(INS_FILTER.department));
  if(INS_FILTER.subject) params.push('subject='+encodeURIComponent(INS_FILTER.subject));
  if(INS_FILTER.search) params.push('search='+encodeURIComponent(INS_FILTER.search));
  return params;
}

async function loadInstructions(){
  var params = insFilterParams();
  var res = await api.get('/instructions'+(params.length?'?'+params.join('&'):''));
  INS_LAST_DEPARTMENTS = res.departments;
  renderInstructions(res.instructions, res.departments, res.canCreate);
}

function resetInsFilterAndLoad(){ loadInstructions(); }

function instructionCard(ins){
  var canDelete = ins.createdBy === S.user.id || S.user.isDeveloper;
  return '<div class="voucher-card">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">'+
      '<div>'+
        '<span class="pill">'+escapeHtml(ins.department)+'</span>'+
        '<b style="margin-inline-start:8px;">'+escapeHtml(ins.subject)+'</b>'+
      '</div>'+
      (canDelete ? '<button type="button" class="icon-btn ins-delete" data-id="'+ins.id+'" title="حذف">🗑</button>' : '')+
    '</div>'+
    '<div style="white-space:pre-wrap;margin-top:8px;font-size:13px;">'+escapeHtml(ins.description)+'</div>'+
    '<div style="font-size:11px;color:var(--text-muted);margin-top:8px;">'+escapeHtml(ins.createdByName)+' — '+new Date(ins.createdAt).toLocaleString('fa-IR')+'</div>'+
  '</div>';
}

function renderInstructions(list, departments, canCreate){
  var departmentOptionsHtml = departments.map(function(d){ return '<option value="'+escapeHtml(d)+'">'; }).join('');

  var formHtml = '';
  if(canCreate){
    formHtml = '<div class="card"><h2>دستورالعمل جدید</h2>'+
      '<div class="grid-3">'+
        '<label>بخش<input type="text" id="insNewDepartment" list="insDepartmentList" value="'+escapeHtml(INS_NEW.department)+'" placeholder="مثلاً رزرواسیون"></label>'+
        '<label>موضوع<input type="text" id="insNewSubject" value="'+escapeHtml(INS_NEW.subject)+'" placeholder="مثلاً نحوه صدور واچر"></label>'+
      '</div>'+
      '<label style="margin-top:10px;">توضیحات<textarea id="insNewDescription" rows="4" placeholder="متن دستورالعمل...">'+escapeHtml(INS_NEW.description)+'</textarea></label>'+
      '<datalist id="insDepartmentList">'+departmentOptionsHtml+'</datalist>'+
      '<div class="card-header-row" style="margin-top:10px;"><button type="button" class="btn-primary" id="insNewSubmit">ثبت دستورالعمل</button><span class="save-msg" id="insNewMsg"></span></div>'+
    '</div>';
  }

  var listHtml = list.length ?
    list.map(instructionCard).join('') :
    '<div class="empty-state">دستورالعملی یافت نشد</div>';

  qs('#tabContent').innerHTML = formHtml+
    '<div class="card">'+
      '<div class="filters">'+
        '<input type="text" id="insSearch" placeholder="جستجو در همه موارد" value="'+escapeHtml(INS_FILTER.search)+'" style="min-width:200px;">'+
        '<label style="min-width:160px;">بخش<input type="text" id="insDeptFilter" list="insDepartmentListFilter" value="'+escapeHtml(INS_FILTER.department)+'" placeholder="همه بخش‌ها"></label>'+
        '<label style="min-width:160px;">موضوع<input type="text" id="insSubjectFilter" value="'+escapeHtml(INS_FILTER.subject)+'" placeholder="همه موضوع‌ها"></label>'+
        '<button type="button" class="btn-small" id="insSearchBtn">جستجو</button>'+
        '<button type="button" class="btn-small btn-ghost" id="insClearFilter">پاک کردن فیلتر</button>'+
      '</div>'+
      '<datalist id="insDepartmentListFilter">'+departmentOptionsHtml+'</datalist>'+
    '</div>'+
    '<div class="card"><h2>لیست دستورالعمل‌ها ('+pDigits(list.length)+')</h2>'+listHtml+'</div>';

  bindInstructions();
}

function bindInstructions(){
  var g = function(id){ return document.getElementById(id); };

  if(g('insNewDepartment')) g('insNewDepartment').addEventListener('input', function(){ INS_NEW.department=this.value; });
  if(g('insNewSubject')) g('insNewSubject').addEventListener('input', function(){ INS_NEW.subject=this.value; });
  if(g('insNewDescription')) g('insNewDescription').addEventListener('input', function(){ INS_NEW.description=this.value; });
  if(g('insNewSubmit')) g('insNewSubmit').addEventListener('click', async function(){
    if(!INS_NEW.department.trim()){ flashMsg('insNewMsg','بخش را وارد کنید', true); return; }
    if(!INS_NEW.subject.trim()){ flashMsg('insNewMsg','موضوع را وارد کنید', true); return; }
    if(!INS_NEW.description.trim()){ flashMsg('insNewMsg','توضیحات را وارد کنید', true); return; }
    try{
      await api.post('/instructions', {
        department: INS_NEW.department, subject: INS_NEW.subject, description: INS_NEW.description
      });
      INS_NEW = { department:'', subject:'', description:'' };
      flashMsg('insNewMsg','دستورالعمل ثبت شد ✓', false);
      loadInstructions();
    }catch(e){ flashMsg('insNewMsg', e.message, true); }
  });

  if(g('insSearch')) g('insSearch').addEventListener('input', function(){ INS_FILTER.search=this.value; });
  if(g('insSearch')) g('insSearch').addEventListener('keydown', function(e){ if(e.key==='Enter') resetInsFilterAndLoad(); });
  if(g('insDeptFilter')) g('insDeptFilter').addEventListener('input', function(){ INS_FILTER.department=this.value; });
  if(g('insDeptFilter')) g('insDeptFilter').addEventListener('change', resetInsFilterAndLoad);
  if(g('insSubjectFilter')) g('insSubjectFilter').addEventListener('input', function(){ INS_FILTER.subject=this.value; });
  if(g('insSearchBtn')) g('insSearchBtn').addEventListener('click', resetInsFilterAndLoad);
  if(g('insClearFilter')) g('insClearFilter').addEventListener('click', function(){
    INS_FILTER = { department:'', subject:'', search:'' };
    loadInstructions();
  });

  qsa('.ins-delete').forEach(function(btn){ btn.addEventListener('click', async function(){
    if(!confirm('این دستورالعمل حذف شود؟')) return;
    try{ await api.del('/instructions/'+this.getAttribute('data-id')); loadInstructions(); }
    catch(e){ alert(e.message); }
  }); });
}
