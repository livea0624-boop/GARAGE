/* Mobile-only navigation for GARAGE. Reuses existing page buttons and handlers. */
(() => {
  const PRIMARY = [
    ['home', '⌂', 'Главная'],
    ['clients', '♙', 'Клиенты'],
    ['orders', '▤', 'Заказы'],
    ['deliveries', '🚚', 'Поставки'],
    ['sales', '₽', 'Продажа']
  ];
  const SECONDARY = [
    ['history', '◷', 'История заказов'],
    ['settings', '⚙', 'Настройки']
  ];
  function init() {
    if (document.getElementById('garageMobileDock')) return;
    const originalNav = document.querySelector('aside .nav');
    if (!originalNav) return;
    const dock = document.createElement('nav');
    dock.id = 'garageMobileDock';
    dock.className = 'garage-mobile-dock';
    dock.setAttribute('aria-label', 'Быстрая навигация GARAGE');
    const more = document.createElement('div');
    more.id = 'garageMobileMore';
    more.className = 'garage-more-backdrop';
    more.hidden = true;
    more.innerHTML = '<div class="garage-more-panel" role="dialog" aria-modal="true" aria-label="Другие разделы"><h2>Другие разделы GARAGE</h2></div>';
    const panel = more.querySelector('.garage-more-panel');

    function makeButton(page, icon, label) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.mobilePage = page;
      const i = document.createElement('span');
      i.className = 'garage-dock-icon';
      i.textContent = icon;
      i.setAttribute('aria-hidden', 'true');
      const t = document.createElement('span');
      t.textContent = label;
      b.append(i, t);
      return b;
    }
    function navigate(page) {
      const link = originalNav.querySelector('button[data-page="' + page + '"]');
      if (!link) return;
      closeMore();
      link.click();
      document.querySelector('main')?.scrollTo?.({top:0,behavior:'instant'});
      window.scrollTo?.({top:0,behavior:'instant'});
      updateActive();
    }
    let priorFocus = null;
    const moreToggle = makeButton('more','⋯','Ещё');
    moreToggle.setAttribute('aria-expanded','false');
    moreToggle.setAttribute('aria-controls','garageMobileMore');
    function openMore() {
      priorFocus = document.activeElement;
      more.hidden = false;
      moreToggle.setAttribute('aria-expanded','true');
      panel.querySelector('button')?.focus();
    }
    function closeMore() {
      if (more.hidden) return;
      more.hidden = true;
      moreToggle.setAttribute('aria-expanded','false');
      if (priorFocus?.isConnected) priorFocus.focus({preventScroll:true});
    }
    function isMobileLayout() {
      return !document.body.classList.contains('garage-desktop-mode') &&
        (document.body.classList.contains('garage-mobile-mode') || window.matchMedia('(max-width:700px)').matches);
    }
    function updateActive() {
      const selected = originalNav.querySelector('button[data-page].active')?.dataset.page || 'home';
      dock.querySelectorAll('button[data-mobile-page]').forEach(button=>{
        const page = button.dataset.mobilePage;
        const active = page === selected || (page === 'more' && SECONDARY.some(([id])=>id===selected));
        button.classList.toggle('active',active);
        if (page !== 'more') {
          if(active) button.setAttribute('aria-current','page');
          else button.removeAttribute('aria-current');
        }
      });
      panel.querySelectorAll('button[data-mobile-page]').forEach(b=>{
        b.classList.toggle('active',b.dataset.mobilePage===selected);
      });
    }
    for(const [page,icon,label] of PRIMARY){
      const b=makeButton(page,icon,label);
      b.addEventListener('click',()=>navigate(page));
      dock.appendChild(b);
    }
    moreToggle.addEventListener('click',()=>more.hidden?openMore():closeMore());
    dock.appendChild(moreToggle);
    for(const [page,icon,label] of SECONDARY){
      const b=makeButton(page,icon,label);
      b.addEventListener('click',()=>navigate(page));
      panel.appendChild(b);
    }
    more.addEventListener('click',event=>{if(event.target===more)closeMore()});
    document.addEventListener('keydown',event=>{
      if(more.hidden)return;
      if(event.key==='Escape'){event.preventDefault();closeMore();}
      if(event.key==='Tab'){
        const buttons=[...panel.querySelectorAll('button')];
        if(!buttons.length)return;
        if(event.shiftKey && document.activeElement===buttons[0]){
          event.preventDefault();buttons[buttons.length-1].focus();
        }else if(!event.shiftKey && document.activeElement===buttons[buttons.length-1]){
          event.preventDefault();buttons[0].focus();
        }
      }
    });
    window.addEventListener('resize',()=>{if(!isMobileLayout())closeMore()},{passive:true});
    new MutationObserver(()=>{if(!isMobileLayout())closeMore()})
      .observe(document.body,{attributes:true,attributeFilter:['class']});
    originalNav.addEventListener('click',()=>queueMicrotask(updateActive));
    new MutationObserver(updateActive).observe(originalNav,{subtree:true,attributes:true,attributeFilter:['class']});
    document.body.append(dock,more);
    updateActive();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
