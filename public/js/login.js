"use strict";

// Same CSRF double-submit cookie read as public/js/api.js -- duplicated
// here (rather than requiring api.js on the login page) because login.js
// runs before any session exists and is deliberately kept dependency-free.
function csrfCookieValue(){
  var m = document.cookie.match(/(?:^|;\s*)darvishi\.csrf=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function loadCaptcha(){
  var res = await fetch('/api/auth/captcha', {credentials:'include'});
  var data = await res.json();
  document.getElementById('captchaQuestion').textContent = data.question;
  document.getElementById('captchaInput').value = '';
}
document.getElementById('captchaRefresh').addEventListener('click', loadCaptcha);

// ---- Airplane logo click animation: the plane flies straight up and out
// through the top of its own square, then comes back in from the bottom
// and flies back up into place. Contained to the little logo box only. ----
(function(){
  var btn = document.getElementById('planeLogoBtn');
  var icon = document.getElementById('planeLogoIcon');
  if(!btn || !icon) return;
  var flying = false;

  btn.addEventListener('click', function(){
    if(flying) return;
    flying = true;
    icon.classList.remove('flying');
    void icon.offsetWidth; // restart the animation even on rapid re-clicks
    icon.classList.add('flying');
  });

  icon.addEventListener('animationend', function(){
    icon.classList.remove('flying');
    flying = false;
  });
})();

// If already logged in, skip the login page entirely.
(async function(){
  try{
    var res = await fetch('/api/auth/me', {credentials:'include'});
    var data = await res.json();
    if(data.user){ window.location.href = '/app.html'; return; }
  }catch(e){}
  loadCaptcha();
})();

document.getElementById('loginForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var errEl = document.getElementById('loginError');
  var btn = document.getElementById('loginBtn');
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'در حال ورود…';
  try{
    var csrf = csrfCookieValue();
    var res = await fetch('/api/auth/login', {
      method:'POST', credentials:'include',
      headers: csrf ? {'Content-Type':'application/json', 'X-CSRF-Token': csrf} : {'Content-Type':'application/json'},
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value,
        captcha: document.getElementById('captchaInput').value
      })
    });
    var data = await res.json();
    if(!res.ok){
      errEl.textContent = data.error || 'خطا در ورود';
      loadCaptcha();
      return;
    }
    window.location.href = '/app.html';
  }catch(e){
    errEl.textContent = 'خطا در اتصال به سرور';
  }finally{
    btn.disabled = false; btn.textContent = 'ورود';
  }
});
