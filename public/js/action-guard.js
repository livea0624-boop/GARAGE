(function(){
  'use strict';
  // Authorize import before opening the native file picker. Keep its password
  // in a one-use closure, never in the DOM or persistent browser storage.
  const ids=new Set(['exportGarageBackup','exportPreviousGarageBackup','importGarageBackup','confirmClearOrdersSales']);
  const allowed=new WeakSet(),pending=new WeakSet();
  document.addEventListener('click',async function(e){
    const button=e.target.closest('button');
    if(!button||!ids.has(button.id)||allowed.has(button))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(pending.has(button))return;
    pending.add(button);
    try{
      if(button.id==='importGarageBackup')window.GarageBackup.cancelImport();
      const password=await window.garageRequestActionPassword?.();
      if(!password)return;
      if(button.id==='importGarageBackup')window.GarageBackup.authorizeImport(password);
      if(button.id==='confirmClearOrdersSales')window.garageCloudSync?.authorizeAction(password);
      allowed.add(button);
      try{button.click()}finally{allowed.delete(button)}
    }finally{pending.delete(button)}
  },true);
})();
