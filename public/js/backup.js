(function(){
  'use strict';
  const deviceKeys=new Set(['garageCurrentUser','garageInterfaceMode']);
  const credentialKeys=new Set(['garageSitePassword','garageLoginPassword','garageActionPassword','GARAGE_API_PASSWORD']);
  const arrayKeys=new Set(['garageClients','garageClientOrders','garageCompletedOrders','garageWarehouseSales','garageReturns']);
  const mapKeys=new Set(['garageClientCarts','garageOrderHistoryOverrides','garageCompletedOrderOverrides']);
  const legacyKeys=new Set(['garageArchivedOrders','garageOrderArchive']);
  const sequenceKeys=new Set(['garageClientSequence','garageOrderSequence']);
  const rollbackKey='GARAGE_ROLLBACK_BACKUP';
  const maxFileBytes=5*1024*1024;
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  const isSharedKey=key=>arrayKeys.has(key)||mapKeys.has(key)||legacyKeys.has(key)||sequenceKeys.has(key)||key==='garageSellers'||key.startsWith('garageSellerColor_');
  function invalid(path){throw new Error('Некорректные данные в резервной копии: '+path+'.')}
  function safeTree(value,path,depth=0){
    if(depth>32)invalid(path+' (слишком большая вложенность)');
    if(value===null||typeof value!=='object')return;
    for(const [key,child] of Object.entries(value)){
      if(['__proto__','prototype','constructor'].includes(key))invalid(path+'.'+key);
      safeTree(child,path+'.'+key,depth+1);
    }
  }
  function texts(value,fields,path){for(const field of fields)if(has(value,field)&&value[field]!==null&&typeof value[field]!=='string')invalid(path+'.'+field)}
  function numbers(value,fields,path){
    for(const field of fields){
      if(!has(value,field)||value[field]===null||value[field]==='')continue;
      const n=value[field];
      if(!['string','number'].includes(typeof n)||!Number.isFinite(Number(n))||Number(n)<0)invalid(path+'.'+field);
    }
  }
  function records(value,path,validate){
    if(!Array.isArray(value))invalid(path);
    value.forEach((item,i)=>{if(!record(item))invalid(path+'['+i+']');validate?.(item,path+'['+i+']')});
  }
  // Payment IDs include ISO timestamps, so ':' and '.' are valid too. Quotes,
  // whitespace and HTML delimiters are never part of an application ID.
  function identifier(value,path){if(!['string','number'].includes(typeof value)||!/^[A-Za-z0-9_.:-]+$/.test(String(value))||(typeof value==='number'&&!Number.isFinite(value)))invalid(path)}
  function uniqueIds(value,path){
    const ids=new Set();
    value.forEach((item,i)=>{identifier(item.id,path+'['+i+'].id');const id=String(item.id);if(ids.has(id))invalid(path+' (повторяется id '+id+')');ids.add(id)});
  }
  const commonText=['name','article','seller','date','time','createdAt','paymentMethod','status','arrivalDate','client','clientId','phone','car','comment'];
  const itemNumbers=['qty','price','discount','discountPct','discountAmount','total','receivedQty','issuedQty','paidAmount','roundingAllocation','refundAmount'];
  function signedMoney(value,path){
    if(!['string','number'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value)))invalid(path);
    const cents=Number(value)*100;
    if(!Number.isSafeInteger(Math.round(cents))||Math.abs(cents-Math.round(cents))>0.000001)invalid(path+' (ожидается сумма в рублях с точностью до копейки)');
  }
  function item(value,path){
    texts(value,commonText,path);numbers(value,itemNumbers,path);
    for(const field of ['discount','discountPct'])if(value[field]!==''&&value[field]!=null&&Number(value[field])>100)invalid(path+'.'+field);
    for(const field of ['discountHistory','refundHistory'])if(has(value,field))records(value[field],path+'.'+field,history);
    if(has(value,'legacyLineRounding'))signedMoney(value.legacyLineRounding,path+'.legacyLineRounding');
    if(has(value,'refundLedger')){records(value.refundLedger,path+'.refundLedger',refund);uniqueIds(value.refundLedger,path+'.refundLedger')}
  }
  function refund(value,path){
    identifier(value.id,path+'.id');signedMoney(value.amount,path+'.amount');
    texts(value,['date','time','createdAt','seller','reason','paymentMethod'],path);
  }
  function payment(value,path){
    texts(value,['paymentType','paymentMethod','date','time','seller','createdAt','detail'],path);
    numbers(value,['amount','paymentAmount'],path);
    if((value.paymentAmount??value.amount)==null||(value.paymentAmount??value.amount)==='')invalid(path+'.amount');
    if(value.id!=null)identifier(value.id,path+'.id');
  }
  function order(value,path){
    identifier(value.id,path+'.id');texts(value,commonText,path);
    if(has(value,'roundingAllocationVersion')&&value.roundingAllocationVersion!==1)invalid(path+'.roundingAllocationVersion');
    numbers(value,['total','baseTotal','discountTotal','roundingAdjustment','paid','debt','overpayment'],path);
    records(value.items,path+'.items',item);
    if(has(value,'payments'))records(value.payments,path+'.payments',payment);
    if(has(value,'events'))records(value.events,path+'.events',event);
    if(has(value,'notificationAttempts'))records(value.notificationAttempts,path+'.notificationAttempts',(entry,p)=>texts(entry,['date','time','at','createdAt','seller','result','note','phone'],p));
  }
  function client(value,path){
    identifier(value.id,path+'.id');
    if(typeof value.name!=='string'||!value.name.trim())invalid(path+'.name');
    texts(value,['name','phone','brand','model','year','plate','vin','seller','createdAt'],path);
    if(has(value,'tags')&&(!Array.isArray(value.tags)||value.tags.some(tag=>typeof tag!=='string')))invalid(path+'.tags');
    if(has(value,'cars'))records(value.cars,path+'.cars',(car,p)=>texts(car,['brand','model','year','plate','vin'],p));
  }
  function sale(value,path){
    identifier(value.id,path+'.id');texts(value,commonText,path);numbers(value,['total','baseTotal','roundDiscount','roundingAdjustment'],path);records(value.items,path+'.items',item);
  }
  function returned(value,path){
    identifier(value.id,path+'.id');texts(value,['product','reason',...commonText],path);numbers(value,['amount'],path);
    if(has(value,'history'))records(value.history,path+'.history',history);
  }
  function history(value,path){texts(value,['at','date','time','seller','action','product','reason','source'],path);numbers(value,['from','to','beforePrice','afterUnitPrice'],path)}
  function event(value,path){
    texts(value,['date','time','text','detail','seller','createdAt','paymentType','paymentMethod'],path);
    for(const field of ['amount','paymentAmount'])if(has(value,field)&&value[field]!==null&&!['string','number'].includes(typeof value[field]))invalid(path+'.'+field);
  }
  function cart(value,path){
    records(value.items,path+'.items',item);texts(value,['saleMethod','updatedAt'],path);numbers(value,['manualDiscount','final','roundingAdjustment','carIndex'],path);
    if(value.discount!=='manual'){numbers(value,['discount'],path);if(value.discount!==''&&value.discount!=null&&Number(value.discount)>100)invalid(path+'.discount')}
  }
  function validate(payload,{allowEmpty=false}={}){
    if(!record(payload)||!['garage-local-backup-v1','garage-local-backup-v2'].includes(payload.format)||!record(payload.data))throw new Error('Файл не похож на резервную копию ГАРАЖ.');
    safeTree(payload.data,'data');
    const state={};let businessRecords=0;
    for(const [key,raw] of Object.entries(payload.data)){
      if(typeof raw!=='string')invalid(key+' (ожидается строка)');
      if(deviceKeys.has(key)||credentialKeys.has(key))continue;
      if(!isSharedKey(key))invalid(key+' (неизвестный ключ)');
      if(sequenceKeys.has(key)){
        if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))invalid(key);
      }else if(key.startsWith('garageSellerColor_')){
        if(!/^#[0-9a-f]{6}$/i.test(raw))invalid(key);
      }else{
        let value;try{value=JSON.parse(raw)}catch{invalid(key+' (неверный JSON)')}
        safeTree(value,key);
        if(key==='garageSellers'){
          if(!Array.isArray(value)||!value.length||value.some(name=>typeof name!=='string'||!name.trim())||new Set(value).size!==value.length)invalid(key);
        }else if(arrayKeys.has(key)){
          const validateRecord=key==='garageClients'?client:key==='garageWarehouseSales'?sale:key==='garageReturns'?returned:order;
          records(value,key,validateRecord);uniqueIds(value,key);businessRecords+=value.length;
        }else if(mapKeys.has(key)){
          if(!record(value))invalid(key);
          for(const [id,entry] of Object.entries(value)){
            if(!record(entry))invalid(key+'.'+id);
            if(key==='garageClientCarts'){cart(entry,key+'.'+id);businessRecords+=entry.items.length}
            else{order(entry,key+'.'+id);if(String(entry.id)!==id)invalid(key+'.'+id+'.id');businessRecords++}
          }
        }else if(!Array.isArray(value)&&!record(value))invalid(key);
      }
      state[key]=raw;
    }
    if(!businessRecords&&!allowEmpty){const error=new Error('В копии нет клиентов, заказов, продаж или товаров в корзинах. Импорт удалит текущие данные.');error.code='EMPTY_BACKUP';throw error}
    return state;
  }
  function make(storage){
    const data={};
    for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key&&isSharedKey(key)){const raw=storage.getItem(key);if(typeof raw==='string')data[key]=raw}}
    return {format:'garage-local-backup-v2',createdAt:new Date().toISOString(),data};
  }
  function createRollback(storage){
    const backup=make(storage),serialized=JSON.stringify(backup);
    try{
      window.localStorage.setItem(rollbackKey,serialized);
      if(window.localStorage.getItem(rollbackKey)!==serialized)throw new Error('backup not persisted');
    }catch{throw new Error('Не удалось сохранить копию текущих данных в браузере. Освободите место или разрешите локальное хранение и повторите импорт.')}
    window.dispatchEvent?.(new Event('garage-backup-updated'));
    return backup;
  }
  function previous(){
    try{
      const payload=JSON.parse(window.localStorage.getItem(rollbackKey));
      if(!record(payload)||!['garage-local-backup-v1','garage-local-backup-v2'].includes(payload.format)||!record(payload.data))return null;
      // A download is lossless for business data, including old schemas. Keep
      // legacy credentials/preferences out even if an older copy contained them.
      const data=Object.fromEntries(Object.entries(payload.data).filter(([key,raw])=>isSharedKey(key)&&typeof raw==='string'));
      return {format:'garage-local-backup-v2',createdAt:typeof payload.createdAt==='string'?payload.createdAt:'',data};
    }catch{return null}
  }
  window.GarageBackup=Object.freeze({validate,make,createRollback,previous,rollbackKey,maxFileBytes});
})();
