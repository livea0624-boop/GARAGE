(function(){
  'use strict';
  // Import requests its password after the file and final confirmation are
  // ready. Clearing also checks at the final button, so approval cannot expire
  // while the user reads a modal. No credential or bypass flag lives in the DOM.
  const ids=new Set(['exportGarageBackup','exportPreviousGarageBackup','confirmClearOrdersSales']);
  const allowed=new WeakSet(),pending=new WeakSet();
  document.addEventListener('click',async function(e){
    const button=e.target.closest('button');
    if(!button||!ids.has(button.id)||allowed.has(button))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(pending.has(button))return;
    pending.add(button);
    try{
      const password=await window.garageRequestActionPassword?.();
      if(!password)return;
      if(button.id==='confirmClearOrdersSales')window.garageCloudSync?.authorizeAction(password);
      allowed.add(button);
      try{button.click()}finally{allowed.delete(button)}
    }finally{pending.delete(button)}
  },true);
})();
