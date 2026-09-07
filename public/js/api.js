(function(global){
"use strict";

// Reads the CSRF double-submit cookie (see middleware/csrf.js on the
// server) so it can be echoed back in a request header. This cookie is
// intentionally NOT httpOnly -- unlike the session cookie -- specifically
// so this line can read it.
function csrfCookieValue(){
  var m = document.cookie.match(/(?:^|;\s*)darvishi\.csrf=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function api(method, path, body){
  var opts = { method:method, credentials:'include', headers:{} };
  if(body !== undefined){ opts.headers['Content-Type']='application/json'; opts.body = JSON.stringify(body); }
  if(method !== 'GET'){
    var csrf = csrfCookieValue();
    if(csrf) opts.headers['X-CSRF-Token'] = csrf;
  }
  var res = await fetch('/api'+path, opts);
  var data = null;
  try{ data = await res.json(); }catch(e){ data = null; }
  if(!res.ok){
    var err = new Error((data && data.error) || ('خطای سرور (' + res.status + ')'));
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}
global.api = {
  get: function(path){ return api('GET', path); },
  post: function(path, body){ return api('POST', path, body || {}); },
  patch: function(path, body){ return api('PATCH', path, body || {}); },
  del: function(path){ return api('DELETE', path); }
};
})(window);
