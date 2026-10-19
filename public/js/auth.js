(function(){
  const offlineMessage='Нет связи с сервером GARAGE. Проверьте подключение к интернету и доступность адреса сайта без VPN.';
  const api=async(path,body)=>{
    let r;
    try{
      r=await fetch(location.origin+path,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify(body)});
    }catch{throw Error(offlineMessage)}
    const j=await r.json().catch(()=>({}));
    if(!r.ok){
      if(r.status>=500)throw Error('Сервер GARAGE временно недоступен (HTTP '+r.status+'). Повторите попытку позже.');
      if(r.status===401)throw Error('Неверный пароль.');
      throw Error(j.error||'Ошибка сервера (HTTP '+r.status+').');
    }
    return j;
  };
  function gate(mode){document.getElementById('garageCloudGate')?.remove();const first=mode==='setup';const el=document.createElement('div');el.id='garageCloudGate';el.style='position:fixed;inset:0;background:linear-gradient(135deg,#0b1220,#111827 45%,#1e3a5f);z-index:99999;display:grid;place-items:center;padding:20px;overflow:auto';el.innerHTML=`<div style="width:min(430px,100%);background:#fff;color:#17202a;border-radius:20px;padding:26px;box-shadow:0 25px 90px rgba(0,0,0,.45)"><div style="font-size:42px;text-align:center">🔐</div><h2 style="text-align:center;margin:8px 0">${first?'Первый запуск GARAGE':'Вход в GARAGE'}</h2><p style="text-align:center;color:#7b8794;margin:0 0 18px">${first?'Создайте два разных пароля.':'Введите пароль входа.'}</p><input id="glogin" type="password" minlength="6" placeholder="Пароль входа (от 6 символов)" autocomplete="new-password" style="width:100%;padding:12px;border:1px solid #d6deea;border-radius:10px;box-sizing:border-box"><input id="gaction" type="password" minlength="6" placeholder="Пароль действий (от 6 символов)" autocomplete="new-password" style="width:100%;padding:12px;border:1px solid #d6deea;border-radius:10px;box-sizing:border-box;margin-top:9px;display:${first?'block':'none'}"><div id="gce" style="min-height:22px;color:#dc2626;font-size:13px;margin-top:8px"></div><button id="gcb" class="btn primary" style="width:100%;margin-top:5px">${first?'Создать пароли':'Войти'}</button><button id="gchange" class="btn" style="width:100%;margin-top:8px;display:${first?'none':'block'}">Сменить пароль входа</button></div>`;document.body.appendChild(el);const err=el.querySelector('#gce');
    el.querySelector('#gcb').onclick=async()=>{const b=el.querySelector('#gcb');b.disabled=true;try{const login=el.querySelector('#glogin').value,action=el.querySelector('#gaction').value;if(login.length<6)throw Error('Пароль входа: минимум 6 символов.');if(first){if(action===login)throw Error('Пароль действий должен отличаться от пароля входа.');if(action.length<6)throw Error('Пароль действий: минимум 6 символов.');await api('/api/auth/setup',{loginPassword:login,actionPassword:action})}else await api('/api/auth/login',{password:login});window.garageLoginPassword=login;await window.garageCloudSync.start(login);el.remove()}catch(e){err.textContent=e.message;b.disabled=false}};
    el.querySelector('#gchange')?.addEventListener('click',()=>openChangeLogin(el));
  }
  function openChangeLogin(gateEl){const old=prompt('Введите текущий пароль входа');if(old===null)return;const next=prompt('Введите новый пароль входа (минимум 6 символов)');if(next===null)return;api('/api/auth/change',{currentPassword:old,password:next}).then(()=>{window.garageLoginPassword=next;alert('Пароль входа изменён.');gateEl.querySelector('#gchange').focus()}).catch(e=>alert(e.message))}
  async function checkStatus(){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetch(location.origin+'/api/auth/status',{cache:'no-store',signal:controller.signal});
      if(!r.ok)throw Error('Сервер ответил HTTP '+r.status);
      const j=await r.json();
      if(typeof j.configured!=='boolean')throw Error('Некорректный ответ сервера');
      return j;
    }finally{clearTimeout(timeout)}
  }
  function connectionGate(detail){
    document.getElementById('garageCloudGate')?.remove();
    const el=document.createElement('div');
    el.id='garageCloudGate';
    el.style='position:fixed;inset:0;background:linear-gradient(135deg,#0b1220,#111827 45%,#1e3a5f);z-index:99999;display:grid;place-items:center;padding:20px;overflow:auto';
    el.innerHTML=`<div role="dialog" aria-modal="true" aria-labelledby="garageNetworkTitle" style="width:min(430px,100%);background:#fff;color:#17202a;border-radius:20px;padding:26px;box-shadow:0 25px 90px rgba(0,0,0,.45)">
      <div style="font-size:40px;text-align:center">📶</div>
      <h2 id="garageNetworkTitle" style="text-align:center;margin:8px 0">Нет связи с GARAGE</h2>
      <p style="text-align:center;color:#64748b;margin:0 0 14px;line-height:1.5">Страница загрузилась, но сервер не ответил. Это проблема подключения, а не подтверждение неверного пароля.</p>
      <p style="color:#64748b;font-size:13px;line-height:1.55;margin:0 0 12px">Проверьте этот же адрес через мобильный интернет. Если он работает только с VPN, возможны ограничения Wi‑Fi-провайдера или домена workers.dev.</p>
      <div id="garageNetworkDetail" style="font-size:12px;color:#9f3a3a;margin-bottom:10px;overflow-wrap:anywhere"></div>
      <button id="garageNetworkRetry" class="btn primary" style="width:100%;min-height:44px">Повторить подключение</button>
    </div>`;
    document.body.appendChild(el);
    el.querySelector('#garageNetworkDetail').textContent=detail||'';
    el.querySelector('#garageNetworkRetry').onclick=async()=>{
      const b=el.querySelector('#garageNetworkRetry');
      b.disabled=true;b.textContent='Проверяем соединение…';
      try{const status=await checkStatus();gate(status.configured?'login':'setup')}
      catch(e){el.querySelector('#garageNetworkDetail').textContent=e.message||offlineMessage;b.disabled=false;b.textContent='Повторить подключение'}
    };
  }
  async function init(){
    try{const status=await checkStatus();gate(status.configured?'login':'setup')}
    catch(e){connectionGate(e.message||offlineMessage)}
  }
  window.garageRequestActionPassword=async function(){
    return await new Promise(resolve=>{
      const old=document.getElementById('garageActionGate');old?.remove();
      const el=document.createElement('div');el.id='garageActionGate';el.style='position:fixed;inset:0;background:rgba(15,23,42,.58);z-index:100000;display:grid;place-items:center;padding:18px';
      el.innerHTML=`<div style="width:min(400px,100%);background:#fff;border-radius:18px;padding:22px;box-shadow:0 20px 70px rgba(0,0,0,.35)"><h3 style="margin:0 0 8px">Подтверждение действия</h3><p style="margin:0 0 14px;color:#718096;font-size:13px">Введите пароль для опасных действий.</p><input id="gap" type="password" minlength="6" autocomplete="current-password" placeholder="Пароль действий" style="width:100%;box-sizing:border-box;padding:11px;border:1px solid #d6deea;border-radius:10px"><div id="gae" style="min-height:20px;color:#dc2626;font-size:12px;margin-top:6px"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px"><button id="gac" class="btn">Отмена</button><button id="gav" class="btn primary">Подтвердить</button></div><button id="gach" class="btn" style="width:100%;margin-top:8px">Сменить пароль действий</button></div>`;
      document.body.appendChild(el);const input=el.querySelector('#gap'),err=el.querySelector('#gae');
      const close=v=>{el.remove();resolve(v)};
      el.querySelector('#gac').onclick=()=>close(false);
      el.querySelector('#gav').onclick=async()=>{try{await api('/api/auth/action',{password:input.value});close(input.value)}catch(e){err.textContent=e.message||'Не удалось подтвердить действие.';input.focus()}};
      el.querySelector('#gach').onclick=async()=>{const current=input.value||prompt('Введите текущий пароль действий');if(!current)return;const next=prompt('Новый пароль действий (минимум 6 символов)');if(next===null)return;try{await api('/api/auth/change-action',{currentPassword:current,password:next});alert('Пароль действий изменён.');input.value=''}catch(e){err.textContent=e.message}};
      input.addEventListener('keydown',e=>{if(e.key==='Enter')el.querySelector('#gav').click()});setTimeout(()=>input.focus(),0);
    });
  };
  window.garageChangeActionPassword=async function(){const current=prompt('Текущий пароль действий');if(current===null)return;const next=prompt('Новый пароль действий (минимум 6 символов)');if(next===null)return;try{await api('/api/auth/change-action',{currentPassword:current,password:next});alert('Пароль действий изменён.')}catch(e){alert(e.message)}};
  window.addEventListener('garage-auth-required',()=>gate('login'));
  window.addEventListener('load',()=>setTimeout(init,50));
})();
