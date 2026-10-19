(function(){
  const FREE_DB_BYTES=500*1024*1024;
  const FREE_ACCOUNT_BYTES=5*1024*1024*1024;
  const FREE_READS_DAY=5000000;
  const FREE_WRITES_DAY=100000;
  let timer=null;
  function fmtBytes(n){n=Math.max(0,Number(n)||0);if(n<1024)return n+' Б';if(n<1024*1024)return (n/1024).toFixed(1)+' КБ';if(n<1024*1024*1024)return (n/1024/1024).toFixed(2)+' МБ';return (n/1024/1024/1024).toFixed(2)+' ГБ'}
  function fmtDuration(days){if(!Number.isFinite(days)||days<=0)return 'не определяется';if(days>=365)return `${(days/365).toFixed(1)} года`;if(days>=30)return `${(days/30).toFixed(1)} мес.`;if(days>=1)return `${days.toFixed(1)} дн.`;return `${Math.max(1,Math.round(days*24))} ч.`}
  function row(name,value,sub=''){return `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:11px 0;border-bottom:1px solid var(--line,#e5eaf0)"><div><b>${name}</b>${sub?`<div style="font-size:12px;color:#7b8794;margin-top:2px">${sub}</div>`:''}</div><b style="text-align:right">${value}</b></div>`}
  function render(j){
    const el=document.getElementById('hostingUsageTable'),note=document.getElementById('hostingUsageNote');if(!el)return;
    const used=Number(j.databaseBytes)||0, remain=Math.max(0,FREE_DB_BYTES-used), growth=Number(j.avgDailyGrowthBytes)||0;
    const days=growth>0?remain/growth:Infinity;
    const pct=Math.min(100,used/FREE_DB_BYTES*100);
    el.innerHTML=`<div style="border:1px solid var(--line,#e5eaf0);border-radius:12px;padding:0 14px;background:#fff">
      ${row('База D1 фактически занята',fmtBytes(used),`Лимит одной базы Free: ${fmtBytes(FREE_DB_BYTES)}`)}
      ${row('Осталось до лимита базы',fmtBytes(remain),`${pct.toFixed(2)}% лимита уже занято`)}
      ${row('Данные Garage (state_json)',fmtBytes(j.stateBytes),`Основная часть рабочих данных приложения`)}
      ${row('Служебные данные D1',fmtBytes(j.overheadBytes),`Индексы, страницы SQLite, auth и прочее; оценочно`)}
      ${row('Средний прирост в сутки',growth?fmtBytes(growth)+'/сутки':'Пока недостаточно данных','Расчёт по накопленным ежедневным замерам') }
      ${row('Ориентир до заполнения 500 МБ',growth?fmtDuration(days):'Будет рассчитано после накопления замеров','Это прогноз, а не фиксированный срок') }
      ${row('Лимит чтения D1 Free', '5 млн строк/сутки','Сбрасывается ежедневно в 00:00 UTC')}
      ${row('Лимит записи D1 Free','100 тыс. строк/сутки','Сбрасывается ежедневно в 00:00 UTC')}
      ${row('Workers-запросы Free','100 тыс./сутки','Общий лимит запросов Worker, также сбрасывается ежедневно')}
      ${row('Time Travel Free','7 дней','Это срок восстановления базы, а не срок хранения CRM-истории')}
    </div>`;
    note.textContent='Для точного прогноза по дням/часам/годам приложение накапливает ежедневные замеры. До появления нескольких замеров срок не выдумывается.';
  }
  async function load(){
    const box=document.getElementById('hostingUsageTable');if(!box||!window.garageCloudSync?.api)return;
    try{const password=window.garageLoginPassword;if(!password)return;const j=await window.garageCloudSync.api('/api/hosting-stats','GET',null,password);render(j)}
    catch(e){box.innerHTML=`<div style="padding:14px;border:1px solid #f0d4d4;background:#fffafa;border-radius:12px;color:#a33131">Не удалось получить статистику хранилища.</div>`;console.warn('GARAGE hosting stats:',e)}
  }
  window.garageHostingUsage={load};
  window.addEventListener('garage-cloud-loaded',load);
  window.addEventListener('load',()=>setTimeout(load,500));
  timer=setInterval(()=>{if(document.visibilityState==='visible')load()},60000);
})();

  const hostingToggle=document.getElementById('hostingUsageToggle');
  const hostingDetails=document.getElementById('hostingUsageDetails');
  if(hostingToggle&&hostingDetails){
    hostingToggle.addEventListener('click',()=>{
      const open=!hostingDetails.classList.contains('hidden');
      hostingDetails.classList.toggle('hidden');
      hostingToggle.setAttribute('aria-expanded',open?'false':'true');
      hostingToggle.textContent=open?'Показать ▾':'Скрыть ▴';
    });
  }
