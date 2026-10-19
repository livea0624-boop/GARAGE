(function(){
  const KEY='garageInterfaceMode';
  const MOBILE_STYLE_IDS=['garage-mobile-v2','garage-mobile-v3','garage-mobile-v4-pixel-tune','garage-mobile-v6-polished','garage-mobile-v7-polished','garage-mobile-v14-clean-layout'];
  const MOBILE_SOURCE_IDS=[...MOBILE_STYLE_IDS,'garage-interface-mode-ui','garage-notification-scroll-fix','garage-responsive'];
  const labels={auto:'Автоматически',mobile:'Мобильная версия',desktop:'Компьютерная версия'};
  function getMode(){const v=garageStorage?.getItem?.(KEY);return ['auto','mobile','desktop'].includes(v)?v:'auto'}
  let forcedMobileStyle=null;
  function buildForcedMobileStyle(){
    if(forcedMobileStyle)return forcedMobileStyle;
    forcedMobileStyle=document.createElement('style');forcedMobileStyle.id='garage-mobile-forced-style';
    let css='';
    MOBILE_SOURCE_IDS.forEach(id=>{
      const el=document.getElementById(id),sheet=el?.sheet;if(!sheet)return;
      try{Array.from(sheet.cssRules||[]).forEach(rule=>{
        if(rule.type===CSSRule.MEDIA_RULE && /max-width\s*:\s*700px/.test(rule.conditionText||rule.media?.mediaText||'')){
          Array.from(rule.cssRules||[]).forEach(child=>{css+=child.cssText+'\n';});
        }
      })}catch(e){console.warn('GARAGE mobile mode CSS:',e)}
    });
    forcedMobileStyle.textContent=css;document.head.appendChild(forcedMobileStyle);return forcedMobileStyle;
  }
  function applyMode(mode){
    mode=['auto','mobile','desktop'].includes(mode)?mode:'auto';
    document.documentElement.dataset.garageInterfaceMode=mode;
    document.body.classList.toggle('garage-mobile-mode',mode==='mobile');
    document.body.classList.toggle('garage-desktop-mode',mode==='desktop');
    if(mode==='mobile')buildForcedMobileStyle().disabled=false;
    else if(forcedMobileStyle)forcedMobileStyle.disabled=true;
    MOBILE_STYLE_IDS.forEach(id=>{const el=document.getElementById(id);if(el)el.media=(mode==='desktop'?'not all':'all')});
    document.querySelectorAll('[data-interface-mode]').forEach(btn=>{
      const active=btn.dataset.interfaceMode===mode;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',active?'true':'false');
    });
    const status=document.getElementById('interfaceModeStatus');
    if(status)status.textContent='Текущий режим: '+labels[mode]+(mode==='auto'?' — определяется браузером':'');
  }
  function setMode(mode){
    garageStorage.setItem(KEY,mode);applyMode(mode);
    if(typeof toast==='function')toast('Режим интерфейса: '+labels[mode],'success');
  }
  function init(){
    applyMode(getMode());
    document.querySelectorAll('[data-interface-mode]').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.interfaceMode)));
  }
  window.garageInterfaceMode={get:getMode,set:setMode,apply:applyMode};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.addEventListener('garage-cloud-loaded',()=>applyMode(getMode()));
})();
