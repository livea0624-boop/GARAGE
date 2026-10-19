/* Dialog semantics, keyboard navigation and labels shared by static/dynamic views. */
(function(){
  'use strict';
  const DIALOGS='.overlay,#garageCloudGate,#garageActionGate';
  const FOCUSABLE='button,a[href],input:not([type="hidden"]),select,textarea,[tabindex]';
  const closeIds={notificationModal:'closeNotificationModal',clientModal:'closeClientModal',clientProfileModal:'closeClientProfile',clientEditModal:'closeClientEdit',productSaleModal:'closeProductSale',orderHistoryModal:'closeOrderHistory',removeItemModal:'removeItemCancel',returnDetailsModal:'closeReturnDetails',returnModal:'returnCancel',clearOrdersSalesModal:'cancelClearOrdersSales',actionConfirmModal:'confirmNo',sellerModal:'closeSellerModal',garageActionGate:'gac'};
  const openers=new Map();
  const inertElements=new Map();
  let open=[],serial=0,scheduled=false;

  function visible(el){return !!(el?.isConnected&&!el.closest('.hidden,[hidden]')&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')}
  function card(el){return el.firstElementChild||el}
  function focusables(el){return [...card(el).querySelectorAll(FOCUSABLE)].filter(node=>node.tabIndex>=0&&!node.matches(':disabled')&&visible(node))}
  function active(){return open[open.length-1]}
  function focusFirst(el){
    const controls=focusables(el);
    const target=controls.find(node=>node.hasAttribute('autofocus'))||controls.find(node=>node.matches('input:not([readonly]),textarea,select'))||controls[0]||card(el);
    target.focus({preventScroll:true});
  }
  function uniqueId(el,prefix){if(!el.id)el.id=prefix+(++serial);return el.id}

  function labelControls(root){
    root.querySelectorAll('label:not([for])').forEach(label=>{
      const field=label.closest('.field,.order-item-status-line')||label.parentElement;
      if(!field)return;
      const control=field.querySelector('input,select,textarea');
      if(control&&!label.contains(control))label.htmlFor=uniqueId(control,'garage-control-');
      else if(!control){
        const group=field.querySelector('.method,.client-tags');
        if(group){group.setAttribute('role','group');group.setAttribute('aria-labelledby',uniqueId(label,'garage-label-'))}
      }
    });
    root.querySelectorAll('input,select,textarea').forEach(control=>{
      if(control.type==='hidden'||control.getAttribute('aria-label')||control.getAttribute('aria-labelledby')||control.labels?.length)return;
      const text=control.placeholder||control.title||({glogin:'Пароль входа',gaction:'Пароль действий',gap:'Пароль действий'}[control.id]);
      if(text)control.setAttribute('aria-label',text);
    });
    root.querySelectorAll('button.close,.garage-toast-close').forEach(button=>{if(!button.hasAttribute('aria-label'))button.setAttribute('aria-label','Закрыть окно')});
    root.querySelectorAll('.method button,.order-pay-method button,.client-tag').forEach(button=>button.setAttribute('aria-pressed',button.classList.contains('active')?'true':'false'));
  }
  function decorate(el){
    const dialog=card(el);
    dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.tabIndex=-1;
    if(!dialog.hasAttribute('aria-label')&&!dialog.hasAttribute('aria-labelledby')){
      const heading=dialog.querySelector('h1,h2,h3');
      if(heading)dialog.setAttribute('aria-labelledby',uniqueId(heading,'garage-dialog-title-'));
      else dialog.setAttribute('aria-label','Диалог GARAGE');
    }
    dialog.querySelectorAll('#gce,#gae').forEach(error=>{error.setAttribute('role','alert');error.setAttribute('aria-live','polite')});
  }
  function restoreInert(){inertElements.forEach((wasInert,el)=>{if(el.isConnected)el.inert=wasInert});inertElements.clear()}
  function isolate(el){
    restoreInert();
    // Inert siblings along the path also handles notificationModal inside <main>.
    for(let node=el;node&&node!==document.body;node=node.parentElement){
      for(const sibling of node.parentElement?.children||[]){
        if(sibling===node||sibling.matches('script,style,link'))continue;
        inertElements.set(sibling,sibling.inert);sibling.inert=true;
      }
    }
  }
  function refresh(){
    scheduled=false;labelControls(document);
    const visibleDialogs=[...document.querySelectorAll(DIALOGS)].filter(visible);
    visibleDialogs.forEach(decorate);
    const closed=open.filter(el=>!visibleDialogs.includes(el));
    const fresh=visibleDialogs.filter(el=>!open.includes(el));
    fresh.forEach(el=>openers.set(el,document.activeElement));
    open=open.filter(el=>visibleDialogs.includes(el)).concat(fresh);
    // Authentication prompts sit above application dialogs, regardless of DOM order.
    const priority=el=>el.id==='garageActionGate'?2:el.id==='garageCloudGate'?1:0;
    open.sort((a,b)=>priority(a)-priority(b));
    open.forEach((el,index)=>{
      const depth=String(index);
      if(el.style.getPropertyValue('--garage-dialog-depth')!==depth)el.style.setProperty('--garage-dialog-depth',depth);
    });
    const current=active();
    document.body.classList.toggle('garage-dialog-open',!!current);
    if(current){
      isolate(current);
      if(!card(current).contains(document.activeElement)){
        const returning=closed.map(el=>openers.get(el)).reverse().find(el=>visible(el)&&card(current).contains(el));
        if(returning)returning.focus({preventScroll:true});else focusFirst(current);
      }
    }else{
      restoreInert();
      const opener=closed.map(el=>openers.get(el)).reverse().find(visible);
      if(opener)opener.focus({preventScroll:true});
    }
    closed.forEach(el=>openers.delete(el));
    document.querySelectorAll('.nav [data-page]').forEach(button=>{
      if(button.classList.contains('active'))button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
  }
  function schedule(){if(!scheduled){scheduled=true;queueMicrotask(refresh)}}
  document.addEventListener('keydown',event=>{
    const current=active();if(!current)return;
    if(event.key==='Escape'){
      const close=document.getElementById(closeIds[current.id])||current.querySelector('[data-dialog-close],.close');
      if(close&&!close.disabled){event.preventDefault();event.stopImmediatePropagation();close.click()}
    }else if(event.key==='Tab'){
      const list=focusables(current),first=list[0],last=list[list.length-1];
      if(!first){event.preventDefault();card(current).focus();return}
      if(event.shiftKey&&(document.activeElement===first||!list.includes(document.activeElement))){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||!list.includes(document.activeElement))){event.preventDefault();first.focus()}
    }else if(event.key==='Enter'&&!event.defaultPrevented&&event.target.matches('#glogin,#gaction')&&!event.target.closest('form')){
      event.preventDefault();current.querySelector('#gcb:not(:disabled)')?.click();
    }
  },true);
  document.addEventListener('focusin',event=>{
    const current=active();if(current&&!card(current).contains(event.target))focusFirst(current);
  });
  const observer=new MutationObserver(schedule);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden']});
  refresh();
})();
