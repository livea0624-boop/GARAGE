const SELLER_COLORS=['#5b8def','#3bb39a','#d88952','#8b7ed8','#5b6f8f','#c56b8f'];
const sellerColorKey=name=>'garageSellerColor_'+encodeURIComponent(name);
function getSellers(){
  let raw=garageStorage.getItem('garageSellers'), list;
  try{list=raw?JSON.parse(raw):null}catch(e){list=null}
  if(Array.isArray(list))list=[...new Set(list.filter(name=>typeof name==='string'&&name.trim()))];
  if(!Array.isArray(list)||!list.length){list=['Михаил','Владимир'];garageStorage.setItem('garageSellers',JSON.stringify(list))}
  return list;
}
function getCurrentSeller(){const list=getSellers(),saved=garageStorage.getItem('garageCurrentUser');return list.includes(saved)?saved:list[0]}
function getSellerColor(name){const saved=garageStorage.getItem(sellerColorKey(name));if(/^#[0-9a-f]{6}$/i.test(saved||''))return saved;const i=Math.max(0,getSellers().indexOf(name));return SELLER_COLORS[i%SELLER_COLORS.length]}
function sellerMark(name, cls='mini'){const n=String(name||'—');const c=getSellerColor(n);const safe=escapeHtml(n);return `<span class=\"seller-mark ${escapeHtml(cls)}\" style=\"color:${c};--seller-bg:${c}14\"><span class=\"seller-mark-dot\" style=\"background:${c}\"></span>${safe}</span>`}
function renderSellers(){
  const list=getSellers(), current=getCurrentSeller(), select=document.getElementById('currentSellerSwitch');
  select.replaceChildren(...list.map(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;return option}));
  select.value=current;
  document.getElementById('currentSellerName').textContent=current;
  const c=getSellerColor(current);document.getElementById('currentSellerName').style.color=c;document.getElementById('topAvatar').textContent=(current||'—').trim().slice(0,1).toUpperCase();document.getElementById('topAvatar').style.background=c+'22';document.getElementById('topAvatar').style.color=c;
}
function openSellerManager(){
  const current=getCurrentSeller(), list=getSellers();
  document.getElementById('sellerList').innerHTML=list.map(name=>{
    const c=getSellerColor(name), cur=name===current, esc=escapeHtml(name);
    return `<div class="seller-entry ${cur?'current':''}">
      <div class="seller-avatar" style="background:${c}22;color:${c}">${escapeHtml(name.trim().slice(0,1).toUpperCase())}</div>
      <div><b>${esc}</b><div class="seller-sub">${cur?'Текущий продавец':'Можно выбрать для работы'}</div></div>
      <div class="seller-actions"><input type="color" value="${c}" data-color="${esc}" title="Цвет продавца"><button class="btn ${cur?'primary':''}" data-select="${esc}">${cur?'✓ Текущий':'Выбрать'}</button><button class="btn" data-delete="${esc}" ${list.length<=1?'disabled':''}>🗑</button></div>
    </div>`;
  }).join('');
  document.getElementById('sellerModal').classList.remove('hidden');
}
function closeSellerManager(){document.getElementById('sellerModal').classList.add('hidden')}
function setCurrentSeller(name){if(!getSellers().includes(name))return;garageStorage.setItem('garageCurrentUser',name);renderSellers();openSellerManager()}
document.getElementById('currentSellerSwitch').addEventListener('change',e=>setCurrentSeller(e.target.value));
document.getElementById('sellerManage').onclick=openSellerManager;
document.getElementById('closeSellerModal').onclick=closeSellerManager;
document.getElementById('closeSellerModal2').onclick=closeSellerManager;
document.getElementById('addSeller').onclick=()=>{
  const input=document.getElementById('newSellerName'),name=input.value.trim(),list=getSellers();
  if(!name)return;
  if(list.some(x=>x.toLowerCase()===name.toLowerCase()))return;
  list.push(name);garageStorage.setItem('garageSellers',JSON.stringify(list));garageStorage.setItem(sellerColorKey(name),SELLER_COLORS[(list.length-1)%SELLER_COLORS.length]);input.value='';renderSellers();openSellerManager();
};
document.getElementById('sellerList').addEventListener('click',e=>{
  const sel=e.target.closest('[data-select]'),del=e.target.closest('[data-delete]');
  if(sel){setCurrentSeller(sel.dataset.select);return}
  if(del){
    const name=del.dataset.delete,list=getSellers();if(list.length<=1)return;
    showActionConfirm('delete-seller',()=>{const next=list.filter(x=>x!==name);garageStorage.setItem('garageSellers',JSON.stringify(next));garageStorage.removeItem(sellerColorKey(name));if(getCurrentSeller()===name)garageStorage.setItem('garageCurrentUser',next[0]);renderSellers();openSellerManager();},'Продавец «'+name+'» будет удалён из списка. Исторические операции этого продавца останутся в журнале.');
  }
});
document.getElementById('sellerList').addEventListener('input',e=>{
  if(e.target.dataset.color&&/^#[0-9a-f]{6}$/i.test(e.target.value)){garageStorage.setItem(sellerColorKey(e.target.dataset.color),e.target.value);renderSellers();openSellerManager()}
});
renderSellers();


function openClientCreate(){document.getElementById('clientModal').classList.remove('hidden');setTimeout(()=>document.getElementById('clientName')?.focus(),50)}
function closeClientCreate(){document.getElementById('clientModal').classList.add('hidden')}
function clearClientCreate(){['clientName','clientPhone','clientBrand','clientModel','clientYear','clientPlate','clientVin'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});document.querySelectorAll('#clientTags .client-tag').forEach(b=>b.classList.remove('active'))}
document.querySelectorAll('#clientTags .client-tag').forEach(btn=>{
  btn.onclick=()=>btn.classList.toggle('active');
});
document.getElementById('newClient').onclick=openClientCreate;
document.getElementById('homeNewClient')?.addEventListener('click',openClientCreate);
document.getElementById('closeClientModal').onclick=closeClientCreate;
document.getElementById('cancelClientModal').onclick=closeClientCreate;
function escapeHtml(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function getClients(){
  let list=[];
  try{list=JSON.parse(garageStorage.getItem('garageClients')||'[]')}catch(e){list=[]}
  return Array.isArray(list)?list:[];
}
function saveClients(list){garageStorage.setItem('garageClients',JSON.stringify(list))}
function nextUniqueClientId(){
  const used=new Set(getClients().map(c=>String(c?.id||'')));
  for(let attempt=0;attempt<20;attempt++){
    let id='';
    if(window.crypto&&typeof window.crypto.randomUUID==='function') id='c_'+window.crypto.randomUUID();
    else id='c_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
    if(!used.has(id)){used.add(id);return id;}
  }
  let seq=Math.max(0,parseInt(garageStorage.getItem('garageClientSequence')||'0',10)||0);
  do{seq++;}while(used.has('c_seq_'+seq));
  garageStorage.setItem('garageClientSequence',String(seq));
  return 'c_seq_'+seq;
}
function clientTagHtml(tag){
  const map={friend:['friend','🤝 Друг магазина'],regular:['regular','☆ Постоянный покупатель'],difficult:['difficult','😤 Назойливый клиент']};
  const x=map[tag]; return x?`<span class="client-mini-tag ${x[0]}">${x[1]}</span>`:'';
}
function getClientCarts(){
  try{const x=JSON.parse(garageStorage.getItem('garageClientCarts')||'{}');return x&&typeof x==='object'?x:{}}catch(e){return {}}
}
function saveClientCarts(carts){garageStorage.setItem('garageClientCarts',JSON.stringify(carts))}
function clearClientCart(id){const all=getClientCarts();delete all[String(id)];saveClientCarts(all);renderClients(document.getElementById('clientsSearch')?.value||'')}
function normalizePaymentMethod(value, detail, fallback='cash'){
  const v=String(value||'').toLowerCase();
  if(v==='card'||v==='cash')return v;
  const d=String(detail||'').toLowerCase();
  if(d.includes('карт'))return 'card';
  if(d.includes('налич'))return 'cash';
  return fallback;
}
function paymentTypeFromTotals(beforePaid,total,afterPaid){
  const before=Math.max(0,Number(beforePaid)||0);
  const t=Math.max(0,Number(total)||0);
  const after=Math.max(0,Number(afterPaid)||0);
  if(after>=t-0.001)return 'Оплата полностью';
  return before<=0.001?'Предоплата':'Доплата';
}
// Financial calculations use integer kopecks. Payment/refund records remain the
// source of truth; paidAmount and roundingAllocation are mutable allocations.
function moneyCents(value){
  const number=Number(value);
  return Number.isFinite(number)?Math.max(0,Math.round((number+Number.EPSILON)*100)):0;
}
function moneyAmount(value){return moneyCents(value)/100;}
function makePaymentRecord({amount,type,method,date,time,seller,createdAt,id}={}){
  const a=moneyAmount(amount);
  return {
    id:id||('p_'+(createdAt||Date.now())+'_'+Math.random().toString(36).slice(2,8)),
    amount:a,paymentAmount:a,paymentType:type||'Доплата',paymentMethod:method==='card'?'card':'cash',
    date:date||'',time:time||'',seller:seller||'—',createdAt:createdAt||''
  };
}
function buildLegacyPayments(order){
  const events=Array.isArray(order?.events)?order.events:[];
  const out=[]; let cumulative=0;
  events.forEach((e,idx)=>{
    if(!e||e.text!=='Получена оплата')return;
    const amount=Math.max(0,moneyValue(e.paymentAmount??e.amount));
    if(amount<=0)return;
    const before=cumulative; cumulative+=amount;
    const total=Math.max(0,Number(order.total)||0);
    const type=e.paymentType||paymentTypeFromTotals(before,total,cumulative);
    const method=normalizePaymentMethod(e.paymentMethod,e.detail,normalizePaymentMethod(order.paymentMethod||order.saleMethod,'','cash'));
    out.push(makePaymentRecord({
      id:'legacy_'+String(order.id)+'_'+idx,amount,type,method,date:e.date,time:e.time,seller:e.seller||order.seller||'—',createdAt:e.createdAt||''
    }));
  });
  if(!out.length){
    // Stored order.paid is net of refunds. Reconstruct gross receipts once;
    // otherwise each legacy normalization would subtract the same refund again.
    const paid=(moneyCents(order.paid)+moneyCents(getOrderRefundTotal(order)))/100;
    if(paid>0){
      const d=String(order.createdAt||'');
      out.push(makePaymentRecord({
        id:'legacy_total_'+String(order.id),amount:paid,
        type:paymentTypeFromTotals(0,Number(order.total)||0,paid),
        method:normalizePaymentMethod(order.paymentMethod||order.saleMethod,'','cash'),
        date:order.date||d.slice(0,10),time:d.includes('T')?d.slice(11,16):'',seller:order.seller||'—',createdAt:order.createdAt||''
      }));
    }
  }
  return out;
}
function normalizeClientOrder(raw){
  if(!raw || typeof raw!=='object') return null;
  const order=JSON.parse(JSON.stringify(raw));
  let changed=false;

  // Historical migration: once a clientId is assigned, all future history matching uses only clientId.
  if(!order.clientId){
    const phone=String(order.phone||'').replace(/\D/g,'');
    if(phone){
      const samePhone=getClients().filter(c=>String(c.phone||'').replace(/\D/g,'')===phone);
      if(samePhone.length===1){order.clientId=String(samePhone[0].id);changed=true;}
    }
    if(!order.clientId && order.client){
      const name=String(order.client||'').trim().toLowerCase();
      const sameName=getClients().filter(c=>String(c.name||'').trim().toLowerCase()===name);
      if(sameName.length===1){order.clientId=String(sameName[0].id);changed=true;}
    }
  }else{
    order.clientId=String(order.clientId);
  }

  if(!Array.isArray(order.items)){
    const qty=Math.max(1,Number(order.qty)||1);
    const total=Math.max(0,Number(order.total)||0);
    const baseTotal=Math.max(0,Number(order.baseTotal??total)||0);
    const discountPct=Math.max(0,Number(order.discountPct??order.discount??order.personalDiscount??0)||0);
    const discountAmount=Math.max(0,Number(order.discountAmount??(baseTotal*discountPct/100))||0);
    order.items=[{
      name:String(order.part||order.product||'Деталь'),article:String(order.partNumber||order.code||''),qty,
      price:qty?Math.max(0,Number(order.price??(baseTotal/qty))||0):0,
      discountPct,discountAmount:qty?discountAmount/qty:discountAmount,total,
      arrivalDate:order.arrivalDate||'',receivedQty:['stock','notified','done'].includes(order.status)?qty:0,
      issuedQty:order.status==='done'?qty:0,status:order.status==='done'?'taken':(order.status==='stock'?'stock':'transit')
    }];
    changed=true;
  }

  order.items=order.items.filter(Boolean).map(item=>{
    const x={...item};
    const qty=Math.max(0,Number(x.qty)||0);
    if(!Number.isFinite(Number(x.price))){x.price=0;changed=true;}
    if(!Number.isFinite(Number(x.discountPct))){x.discountPct=0;changed=true;}
    if(!Number.isFinite(Number(x.discountAmount))){x.discountAmount=0;changed=true;}
    if(!Number.isFinite(Number(x.receivedQty))){x.receivedQty=['stock','notified','partial_taken','taken'].includes(x.status)?qty:0;changed=true;}
    if(!Number.isFinite(Number(x.issuedQty))){x.issuedQty=x.status==='taken'?qty:(x.status==='partial_taken'?Math.min(qty,1):0);changed=true;}
    if(!x.status){x.status='transit';changed=true;}
    x.receivedQty=Math.max(0,Math.min(qty,Number(x.receivedQty)||0));
    x.issuedQty=Math.max(0,Math.min(x.receivedQty,Number(x.issuedQty)||0));
    if(reconcileOrderItemCounts(x))changed=true;
    if(!Array.isArray(x.discountHistory))x.discountHistory=[];
    return x;
  });

  if(!Array.isArray(order.events)){order.events=[];changed=true;}

  migrateLegacyLineRounding(order);
  ensureOrderRoundingAllocation(order);

  // Every payment is immutable historical data. Migrate legacy events once.
  if(Array.isArray(order.payments)&&order.payments.length){
    let cumulative=0;
    const totalForPayments=Math.max(0,Number(order.total)||0);
    const normalized=order.payments.map((p,idx)=>{
      const amount=moneyValue(p?.paymentAmount??p?.amount);
      const before=cumulative;
      cumulative+=amount;
      return {...p,...makePaymentRecord({
        id:p?.id||('p_'+String(order.id)+'_'+idx),amount,
        type:p?.paymentType||paymentTypeFromTotals(before,totalForPayments,cumulative),
        method:normalizePaymentMethod(p?.paymentMethod,p?.detail,order.paymentMethod||'cash'),
        date:p?.date||'',time:p?.time||'',seller:p?.seller||order.seller||'—',createdAt:p?.createdAt||''
      })};
    });
    if(JSON.stringify(normalized)!==JSON.stringify(order.payments)){order.payments=normalized;changed=true;}
  }else{
    const legacyPayments=buildLegacyPayments(order);
    if(JSON.stringify(legacyPayments)!==JSON.stringify(order.payments)){order.payments=legacyPayments;changed=true;}
  }

  const beforePaid=Number(order.paid);
  const beforeDebt=Number(order.debt);
  const beforeOverpayment=Number(order.overpayment);
  recalcOrderFinancials(order);
  if(Math.abs((Number(order.paid)||0)-(Number.isFinite(beforePaid)?beforePaid:0))>0.001 ||
     Math.abs((Number(order.debt)||0)-(Number.isFinite(beforeDebt)?beforeDebt:0))>0.001 ||
     Math.abs((Number(order.overpayment)||0)-(Number.isFinite(beforeOverpayment)?beforeOverpayment:0))>0.001) changed=true;
  return {order,changed:JSON.stringify(order)!==JSON.stringify(raw)};
}
function getClientOrders(){
  try{
    const x=JSON.parse(garageStorage.getItem('garageClientOrders')||'[]');
    if(!Array.isArray(x))return [];
    let changed=false;
    const list=x.map(normalizeClientOrder).filter(Boolean).map(r=>{changed=changed||r.changed;return r.order;});
    if(changed){try{garageStorage.setItem('garageClientOrders',JSON.stringify(list))}catch(e){}}
    return list;
  }catch(e){return []}
}
function saveClientOrders(list){garageStorage.setItem('garageClientOrders',JSON.stringify((Array.isArray(list)?list:[]).map(o=>normalizeClientOrder(o)?.order).filter(Boolean)))}
function nextClientOrderId(){
  const seq=Math.max(0,parseInt(garageStorage.getItem('garageOrderSequence')||'0',10)||0);
  const ids=[];
  getClientOrders().forEach(o=>ids.push(parseInt(o.id,10)));
  getCompletedOrders().forEach(o=>ids.push(parseInt(o.id,10)));
  try{
    const overrides=JSON.parse(garageStorage.getItem('garageOrderHistoryOverrides')||'{}');
    Object.values(overrides||{}).forEach(o=>ids.push(parseInt(o?.id,10)));
  }catch(e){}
  const maxExisting=ids.filter(Number.isFinite).reduce((m,n)=>Math.max(m,n),0);
  const next=Math.max(seq,maxExisting)+1;
  garageStorage.setItem('garageOrderSequence',String(next));
  return String(next);
}
function allocateOrderPayment(order,amount,selectedIndices){
  let left=moneyCents(amount);
  // Honour the selection first, then use any excess to settle other positions.
  // Only money above the remaining amount for the entire order is a credit.
  const selected=Array.isArray(selectedIndices)?selectedIndices:[];
  const indices=[...new Set([...selected,...(order.items||[]).map((_,i)=>i)])];
  indices.forEach(index=>{
    const item=order.items[index];
    if(!item||item.removed||left<=0)return;
    const remain=moneyCents(getItemRemaining(item));
    const part=Math.min(remain,left);
    if(part>0){item.paidAmount=(moneyCents(getItemPaid(item))+part)/100;left-=part;}
  });
  return left/100;
}
function getPaymentRoundingDiscount(order,amount,selectedIndices){
  const indices=[...new Set(Array.isArray(selectedIndices)?selectedIndices:[])];
  const selected=indices.map(i=>order.items?.[i]).filter(i=>i&&!i.removed);
  const available=selected.reduce((sum,item)=>sum+moneyCents(getItemRemaining(item)),0);
  const totalRemaining=(order.items||[]).reduce((sum,item)=>sum+(!item?.removed?moneyCents(getItemRemaining(item)):0),0);
  const entered=moneyCents(amount);
  const diff=Math.max(0,available-entered);
  // Округление разрешено ТОЛЬКО при последней оплате всего заказа.
  // Если оплачивается только часть позиций/остатка, разница остаётся обычным долгом.
  // При создании заказа эта функция не вызывается и на оформление не влияет.
  const isFinalPayment=available>0 && available===totalRemaining && entered<available;
  const MAX_ROUNDING_DISCOUNT=5000;
  if(isFinalPayment && diff>0 && diff<=MAX_ROUNDING_DISCOUNT) return diff/100;
  return 0;
}
function applyPaymentRoundingDiscount(order,discount,selectedIndices){
  ensureOrderRoundingAllocation(order);
  const value=moneyCents(discount);
  if(value<=0)return 0;
  const indices=[...new Set(Array.isArray(selectedIndices)?selectedIndices:[])];
  const available=indices.reduce((sum,i)=>{const item=order.items?.[i];return sum+(item&&!item.removed?moneyCents(getItemRemaining(item)):0)},0);
  const applied=Math.min(value,available);
  if(applied<=0)return 0;
  let left=applied;
  indices.forEach(i=>{
    const item=order.items?.[i];if(!item||item.removed||left<=0)return;
    const part=Math.min(left,moneyCents(getItemRemaining(item)));
    item.roundingAllocation=(moneyCents(item.roundingAllocation)+part)/100;
    left-=part;
  });
  order.roundingAdjustment=(moneyCents(order.roundingAdjustment)+applied)/100;
  ensureOrderRoundingAllocation(order);
  return applied/100;
}
function addOrderPayment(order,amount,method,seller,date,time,createdAt,selectedIndices){
  recalcOrderFinancials(order);
  amount=moneyAmount(amount);
  const beforePaid=Math.max(0,Number(order.paid)||0);
  const total=Math.max(0,Number(order.total)||0);
  const indices=Array.isArray(selectedIndices)?selectedIndices:(order.items||[]).map((_,i)=>i);
  const grossAfter=beforePaid+Math.max(0,Number(amount)||0);
  const type=paymentTypeFromTotals(beforePaid,total,grossAfter);
  const payment=makePaymentRecord({amount,type,method,date,time,seller,createdAt});
  order.payments=Array.isArray(order.payments)?order.payments:[];
  order.payments.push(payment);
  allocateOrderPayment(order,amount,indices);
  order.paymentMethod=payment.paymentMethod;
  recalcOrderFinancials(order);
  return payment;
}
function createClientOrder(){
  if(!clientCartContext)return;
  const client=getClients().find(c=>String(c.id)===String(clientCartContext.id));if(!client)return;
  const valid=cartItems.filter(x=>String(x.name||'').trim()&&((+x.price||0)>0)&&((+x.qty||0)>0));
  if(!valid.length||valid.length!==cartItems.length){toast('Заполните товар, цену и количество для каждой позиции.','error');return;}
  const totals=getCartTotals();
  const total=Math.max(0,+saleFinalInput.value||0);
  if(total>totals.afterDiscount+0.001){toast('Итоговая сумма не может быть выше суммы после скидки.','error');return;}
  const roundingAdjustment=Math.max(0,totals.afterDiscount-total);
  const id=nextClientOrderId();
  const cars=getClientCars(client);const car=cars[clientCartContext.carIndex]||cars[0]||{};
  const carName=[car.brand,car.model,car.plate].filter(Boolean).join(' · ')||'Автомобиль не указан';
  const now=new Date(),pad=n=>String(n).padStart(2,'0');
  const date=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());
  const displayDate=pad(now.getDate())+'.'+pad(now.getMonth()+1)+'.'+now.getFullYear();
  const time=pad(now.getHours())+':'+pad(now.getMinutes());
  const seller=getCurrentSeller();
  const items=valid.map(x=>{
    const price=Math.max(0,+x.price||0),qty=Math.max(0,+x.qty||0),pct=Math.min(100,Math.max(0,+getItemDiscountPercent(x)||0)),disc=price*pct/100;
    const createdAt=new Date().toISOString();
    return {
      name:String(x.name).trim(),article:String(x.name).trim(),qty,price,
      discountPct:pct,discountAmount:disc,total:Math.max(0,(price-disc)*qty),
      discountLocked:pct>0,
      discountAppliedAt:pct>0?createdAt:'',
      discountSource:pct>0?(x.discount!==''&&x.discount!=null?'position':'order'):'',
      discountHistory:pct>0?[{at:createdAt,seller:getCurrentSeller(),from:0,to:pct,beforePrice:price,afterUnitPrice:Math.max(0,price-disc),source:(x.discount!==''&&x.discount!=null?'position':'order')}]:[],
      roundingAllocation:0,arrivalDate:String(x.arrivalDate||''),receivedQty:0,issuedQty:0,status:'transit',paidAmount:0
    };
  });
  const enteredPaid=Math.max(0,moneyValue(document.getElementById('orderConfirmPaid')?.value));
  const order={
    id,client:client.name,clientId:String(client.id),phone:client.phone,car:carName,carIndex:clientCartContext.carIndex||0,seller,
    baseTotal:totals.base,discountTotal:totals.discountSum,roundingAdjustment,total,paid:0,debt:total,
    overpayment:0,status:'transit',paymentMethod:saleMethod,items,createdAt:now.toISOString(),date,notifiedAt:'',notificationStatus:'waiting',
    payments:[],events:[{date:displayDate,time,seller,text:'Создан заказ',detail:'Добавлены '+items.length+' позиции для '+carName+'.'}]
  };
  if(roundingAdjustment>0)order.events.push({date:displayDate,time,createdAt:now.toISOString(),seller,text:'Изменена итоговая сумма',detail:'После скидок применено ручное округление: − '+money0(roundingAdjustment)+' . Новый итог: '+money0(total)+'.',amount:'− '+money0(roundingAdjustment)});
  recalcOrderFinancials(order);
  if(enteredPaid>0){
    const payment=addOrderPayment(order,enteredPaid,saleMethod,seller,displayDate,time,now.toISOString());
    order.events.push({date:displayDate,time,seller,text:'Получена оплата',paymentType:payment.paymentType,paymentAmount:payment.paymentAmount,paymentMethod:payment.paymentMethod,createdAt:payment.createdAt,detail:payment.paymentType+' · '+(saleMethod==='card'?'карта':'наличные')+'.',amount:money0(payment.amount)});
    if(order.debt<=0.001)order.events.push({date:displayDate,time,seller,text:'Заказ оплачен',detail:'Долг закрыт. Фактически внесено: '+money0(payment.amount)+'.',amount:money0(payment.amount),paymentAmount:payment.paymentAmount,paymentMethod:payment.paymentMethod,createdAt:payment.createdAt});
  }
  const list=getClientOrders();list.unshift(order);saveClientOrders(list);saveOrderHistory(order);
  clientCartContext=null;clearClientCart(client.id);renderOrders();renderSalesJournal();renderHomeDashboard();
  document.getElementById('actionConfirmModal').classList.add('hidden');closeProductSale();toast('Заказ #'+id+' создан','ok','Заказ создан');
}
function getClientCart(id){const all=getClientCarts();const x=all[String(id)];return x&&Array.isArray(x.items)?x:{items:[],saleMethod:'cash',discount:'0',manualDiscount:'',final:0,carIndex:0}}
function clientCartTotals(cart){
  const items=Array.isArray(cart?.items)?cart.items:[]; let base=0,discountSum=0,afterDiscount=0;
  items.forEach(x=>{const line=moneyCents((+x.price||0)*(+x.qty||0));const pct=Math.min(100,Math.max(0,+x.discount||0));const net=moneyCents(line*(1-pct/100)/100);base+=line;discountSum+=line-net;afterDiscount+=net;});
  return {base:base/100,discountSum:discountSum/100,afterDiscount:afterDiscount/100,count:items.reduce((n,x)=>n+(+x.qty||0),0)};
}
function renderClientCartButton(btn,client){
  const cart=getClientCart(client.id), t=clientCartTotals(cart), count=t.count;
  btn.classList.toggle('has-items',count>0);
  if(!count){btn.innerHTML='<span class="client-cart-main">🛒 Корзина пуста</span>';return;}
  btn.innerHTML=`<span class="client-cart-main">🛒 Корзина <span class="client-cart-count">${count}</span></span><span class="client-cart-sub">${money0(t.afterDiscount)} · ${cart.items.length} поз.</span>`;
}
function getClientSearchCars(client){
  const cars=getClientCars(client);
  return cars.length?cars:[{brand:client.brand||'',model:client.model||'',year:client.year||'',plate:client.plate||'',vin:client.vin||''}];
}
function clientMatchesGlobalSearch(client,q){
  const hay=[client.name,client.phone,...getClientSearchCars(client).flatMap(car=>[car.brand,car.model,car.plate,car.vin,car.year])]
    .map(v=>String(v||'').toLowerCase()).join(' ');
  return hay.includes(q);
}
function renderGlobalSearchResults(query=''){
  const box=document.getElementById('globalSearchResults'); if(!box)return;
  const q=String(query||'').trim().toLowerCase();
  if(!q){box.classList.add('hidden');box.innerHTML='';return;}
  const matches=getClients().filter(c=>clientMatchesGlobalSearch(c,q)).slice(0,12);
  if(!matches.length){box.innerHTML='<div class="global-search-empty">Клиент или автомобиль не найден</div>';box.classList.remove('hidden');return;}
  box.innerHTML='<div class="global-search-hint">Профили клиентов</div>'+matches.map(c=>{
    const cars=getClientSearchCars(c);
    const carText=cars.map(car=>[car.brand,car.model,car.plate].filter(Boolean).join(' · ')).filter(Boolean).join(' / ')||'Автомобиль не указан';
    return `<button type="button" class="global-search-result" data-global-client="${escapeHtml(c.id)}"><span class="global-search-result-icon">👤</span><span class="global-search-result-main"><b>${escapeHtml(c.name||'Без имени')}</b><small>${escapeHtml(c.phone||'Телефон не указан')} · ${escapeHtml(carText)}</small></span></button>`;
  }).join('');
  box.classList.remove('hidden');
}
function setupGlobalSearch(){
  const input=document.getElementById('globalSearch'),box=document.getElementById('globalSearchResults'); if(!input||!box)return;
  input.addEventListener('input',e=>renderGlobalSearchResults(e.target.value));
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){input.value='';box.classList.add('hidden');return;}
    if(e.key==='Enter'){
      const first=box.querySelector('[data-global-client]');
      if(first){e.preventDefault();openClientProfile(first.dataset.globalClient);box.classList.add('hidden');input.blur();}
    }
  });
  box.addEventListener('click',e=>{const btn=e.target.closest('[data-global-client]');if(!btn)return;openClientProfile(btn.dataset.globalClient);box.classList.add('hidden');input.blur();});
  document.addEventListener('click',e=>{if(!e.target.closest('.global-search-wrap'))box.classList.add('hidden')});
}

function renderClients(filter=''){
  const listEl=document.getElementById('clientsList'); if(!listEl)return;
  const q=String(filter||document.getElementById('clientsSearch')?.value||'').trim().toLowerCase();
  const filterMode=document.getElementById('clientsFilter')?.value||'all';
  const clients=getClients().filter(c=>{
    const cars=getClientSearchCars(c); const orders=getAllClientOrders().filter(o=>clientOrderMatches(o,c)); const active=orders.filter(o=>!getArchivedOrderIds().has(String(o.id))&&orderHasActiveItems(o)); const hasDebt=active.some(o=>(Number(o.debt)||0)>0); const waiting=active.some(o=>(o.items||[]).some(i=>!i.removed&&getItemExpectedQty(i)>0)); const notify=getOrdersNeedingNotification().some(o=>String(o.clientId||'')===String(c.id));
    const hay=[c.name,c.phone,...cars.flatMap(car=>[car.brand,car.model,car.plate,car.vin,car.year])].join(' ').toLowerCase();
    return (!q||hay.includes(q)) && (filterMode==='all'||(filterMode==='active'&&active.length)||(filterMode==='debt'&&hasDebt)||(filterMode==='waiting'&&waiting)||(filterMode==='notify'&&notify));
  });
  if(!clients.length){listEl.innerHTML='<div class="client-empty">Клиенты по выбранным условиям не найдены.</div>';return;}
  listEl.innerHTML=clients.map(c=>{
    const cars=getClientCars(c); const carText=cars.map(car=>[car.brand,car.model,car.plate].filter(Boolean).join(' · ')).filter(Boolean).join(' / ')||'Автомобиль не указан'; const tags=(c.tags||[]).map(clientTagHtml).join(''); const sellerInfo=c.seller?`<div class="client-seller">Создал ${sellerMark(c.seller,'mini')}</div>`:''; const clientCart=getClientCart(c.id),clientCartTotal=clientCartTotals(clientCart); const cartClass=clientCartTotal.count?'client-cart has-items':'client-cart'; const cartHtml=clientCartTotal.count?`<span class="client-cart-main">🛒 Корзина <span class="client-cart-count">${clientCartTotal.count}</span></span><span class="client-cart-sub">${money0(clientCartTotal.afterDiscount)} · ${clientCart.items.length} поз.</span>`:'<span class="client-cart-main">🛒 Корзина пуста</span>';
    return `<div class="client-card" data-client-id="${escapeHtml(c.id)}"><div class="client-main"><div class="client-name">${escapeHtml(c.name)}</div><div class="client-meta">${escapeHtml(c.phone)} · ${cars.length} авто${carText?' · '+escapeHtml(carText):''}</div>${tags?`<div class="client-tag-list">${tags}</div>`:''}${sellerInfo}</div><button type="button" class="${cartClass}" data-client-cart="${escapeHtml(c.id)}">${cartHtml}</button><div class="client-actions"><button class="btn" data-client-profile="${escapeHtml(c.id)}">Открыть профиль</button><button class="btn primary" data-client-order="${escapeHtml(c.id)}">🛒 Заказать</button><button class="btn client-delete-btn" type="button" data-client-delete="${escapeHtml(c.id)}">🗑 Удалить</button></div></div>`;
  }).join('');
}
function deleteClientCard(id){
  const list=getClients();
  const client=list.find(c=>String(c.id)===String(id));
  if(!client)return;
  showActionConfirm('delete-client',()=>{
    const current=getClients();
    const idx=current.findIndex(c=>String(c.id)===String(id));
    if(idx<0)return;
    current.splice(idx,1);
    saveClients(current);
    const carts=getClientCarts(); delete carts[String(id)]; saveClientCarts(carts);
    renderClients(document.getElementById('clientsSearch')?.value||'');
    toast('Карточка клиента удалена','ok','Клиент удалён');
  },`Карточка клиента «${String(client.name||'Без имени')}» будет удалена. Заказы, история и продажи этого клиента останутся в системе.`);
}
function getClientCars(client){
  if(Array.isArray(client?.cars)&&client.cars.length)return client.cars;
  if(client && (client.brand||client.model||client.year||client.plate||client.vin)) return [{brand:client.brand,model:client.model,year:client.year,plate:client.plate,vin:client.vin}];
  return [];
}
function getAllClientOrders(){return getAllKnownOrders();}
function clientOrderMatches(order,client){return !!order?.clientId&&!!client?.id&&String(order.clientId)===String(client.id);}
function clientHistoryRows(client,query=''){
  const q=String(query||'').trim().toLowerCase();
  const rows=[];
  getAllClientOrders().filter(o=>clientOrderMatches(o,client)).forEach(order=>{
    const car=String(order.car||'');
    (order.items||[]).forEach((item,idx)=>{
      if(item.removed)return;
      const hay=[item.article,item.name,car,order.id,order.seller,order.client].map(v=>String(v||'').toLowerCase()).join(' ');
      if(q&&!hay.includes(q))return;
      const evs=(order.events||[]).filter(e=>e.text==='Создан заказ');
      const ev=evs[0]||order.events?.[0]||{};
      rows.push({orderId:order.id,item,itemIndex:idx,date:ev.date||'—',time:ev.time||'',seller:order.seller||ev.seller||'—',car});
    });
  });
  return rows.sort((a,b)=>{
    const ad=a.date.split('.').reverse().join('')+' '+a.time,bd=b.date.split('.').reverse().join('')+' '+b.time;
    return bd.localeCompare(ad);
  });
}
function renderClientHistory(client,query=''){
  const list=document.getElementById('clientHistoryList'); if(!list)return;
  const q=String(query||'').trim().toLowerCase();
  const orders=getAllClientOrders().filter(o=>clientOrderMatches(o,client)).filter(order=>{
    const active=(order.items||[]).filter(i=>!i.removed);
    const hay=[order.id,order.car,order.seller,order.client,...active.flatMap(i=>[i.name,i.article])].map(v=>String(v||'').toLowerCase()).join(' ');
    return !q||hay.includes(q);
  }).sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));
  if(!orders.length){list.innerHTML='<div class="client-history-empty">Заказов по этому клиенту не найдено.</div>';return;}
  list.innerHTML=orders.map(order=>{
    const active=(order.items||[]).filter(i=>!i.removed);
    const allNames=active.map(i=>`${escapeHtml(i.name||'Деталь')} × ${Math.max(0,Number(i.qty)||0)}`).join(', ');
    const preview=active.slice(0,3).map(i=>`<span class="client-order-item-chip">${escapeHtml(i.name||'Деталь')} · ${Math.max(0,Number(i.qty)||0)} шт.</span>`).join('');
    const extra=active.length>3?`<span class="client-order-item-more">+${active.length-3}</span>`:'';
    const aggregate=getOrderAggregateStatus(order)||{label:'—',cls:'status-arrived'};
    const date=order.date||String(order.createdAt||'').slice(0,10)||'—';
    const paid=Math.max(0,Number(order.paid)||0), debt=Math.max(0,Number(order.debt)||0), total=Math.max(0,Number(order.total)||0);
    return `<div class="client-order-history-row">
      <div class="client-order-history-main">
        <div class="client-order-history-top"><b>Заказ #${escapeHtml(order.id)}</b><span class="client-order-status ${aggregate.cls}">${escapeHtml(aggregate.label)}</span></div>
        <small>${escapeHtml(date)}${order.car?' · '+escapeHtml(order.car):''}${order.seller?' · '+escapeHtml(order.seller):''}</small>
        <div class="client-order-items-preview" title="${escapeHtml(allNames)}">${preview}${extra}</div>
      </div>
      <div class="client-order-history-finance"><b>${money0(total)}</b><small class="${debt?'red':'green'}">${debt?'Долг '+money0(debt):'Оплачен'}</small><small>Оплачено ${money0(paid)}</small></div>
      <div class="client-order-history-action"><button class="btn primary" type="button" data-client-order-open="${escapeHtml(String(order.id))}">Открыть заказ</button></div>
    </div>`;
  }).join('');
}
function openClientProfile(id){
  const client=getClients().find(c=>String(c.id)===String(id)); if(!client)return;
  const cars=getClientCars(client);
  const initials=String(client.name||'К').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'К';
  const tags=(client.tags||[]).map(clientTagHtml).join('');
  const carsHtml=cars.length?cars.map((car,i)=>`<div class="client-car-row">
    <div class="client-car-main"><b>${escapeHtml([car.brand,car.model].filter(Boolean).join(' ')||'Автомобиль '+(i+1))}</b><small>${car.vin?'VIN: '+escapeHtml(car.vin):'VIN не указан'}</small></div>
    <div class="client-car-cell"><small>Госномер</small><b>${escapeHtml(car.plate||'—')}</b></div>
    <div class="client-car-cell"><small>Год</small><b>${escapeHtml(car.year||'—')}</b></div>
    <div class="client-car-actions"><button class="btn client-car-vin-btn" data-client-vin="${escapeHtml(client.id)}" data-car-index="${i}">${car.vin?'Копировать VIN':'Указать VIN'}</button><button class="btn client-car-edit-btn" data-edit-client-car="${escapeHtml(client.id)}" data-car-index="${i}">Изменить</button></div>
  </div>`).join(''):'<div class="client-history-empty">Автомобили пока не добавлены.</div>';
  const clientOrders=getAllClientOrders().filter(o=>clientOrderMatches(o,client));
  const activeOrders=clientOrders.filter(o=>getArchivedOrderIds? !getArchivedOrderIds().has(String(o.id)) && orderHasActiveItems(o):orderHasActiveItems(o));
  const debtTotal=activeOrders.reduce((sum,o)=>sum+Math.max(0,Number(o.debt)||0),0);
  const lastOrder=clientOrders.slice().sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')))[0];
  const lastEvent=clientOrders.flatMap(o=>(o.events||[]).map(e=>({order:o,event:e}))).sort((a,b)=>{const ad=(a.event.date||'').split('.').reverse().join('')+' '+(a.event.time||''),bd=(b.event.date||'').split('.').reverse().join('')+' '+(b.event.time||'');return bd.localeCompare(ad);})[0];
  document.getElementById('clientProfileTitle').textContent=client.name||'Карточка клиента';
  document.getElementById('clientProfileTitle').dataset.clientId=client.id;
  document.getElementById('clientProfileSub').textContent=client.phone||'Телефон не указан';
  const avatar=document.getElementById('clientProfileAvatar'); if(avatar)avatar.textContent=initials;
  document.getElementById('clientProfileBody').innerHTML=`
    <div class="client-profile-hero">
      <div class="client-profile-identity">
        <div class="client-profile-name">${escapeHtml(client.name||'Без имени')}</div>
        <div class="client-profile-meta-row">
          <span class="client-profile-meta-chip">☎ ${escapeHtml(client.phone||'Телефон не указан')}</span>
          <span class="client-profile-meta-chip">🚗 ${cars.length} авто</span>
          ${client.seller?`<span class="client-profile-meta-chip">Создал ${sellerMark(client.seller,'mini')}</span>`:''}
        </div>
        ${tags?`<div class="client-profile-tags">${tags}</div>`:''}
      </div>
      <div class="client-profile-head-actions">
        <button class="btn primary client-profile-order-btn" type="button" data-client-profile-order="${escapeHtml(client.id)}">🛒 Заказать</button>
        <button class="btn client-profile-edit-btn" data-edit-client-profile="${escapeHtml(client.id)}">Изменить профиль</button>
      </div>
    </div>

    <div class="client-profile-stat-grid">
      <div class="client-profile-stat"><small>Активных заказов</small><b>${activeOrders.length}</b></div>
      <div class="client-profile-stat ${debtTotal?'debt':'good'}"><small>Текущий долг</small><b>${money0(debtTotal)}</b></div>
      <div class="client-profile-stat"><small>Последний заказ</small><b>${escapeHtml(lastOrder?('#'+lastOrder.id):'—')}</b></div>
      <div class="client-profile-stat"><small>Последняя активность</small><b>${escapeHtml(lastEvent?.event?.text||'—')}</b></div>
    </div>

    <div class="client-profile-section">
      <div class="client-profile-section-head">
        <div class="client-profile-section-title"><span class="client-profile-section-icon">🚗</span><div><b>Автомобили клиента</b><small>Данные машин, VIN и госномера</small></div></div>
        <span class="client-profile-section-count">${cars.length} авто</span>
      </div>
      <div class="client-profile-section-body">
        <div class="client-profile-actions-row"><button class="btn primary" data-add-client-car="${escapeHtml(client.id)}">＋ Добавить автомобиль</button></div>
        <div class="client-cars-list">${carsHtml}</div>
      </div>
    </div>

    <div class="client-profile-section">
      <div class="client-profile-section-head">
        <div class="client-profile-section-title"><span class="client-profile-section-icon">📋</span><div><b>История заказов клиента</b><small>Позиции и операции только этого клиента</small></div></div>
        <span class="client-profile-section-count">${clientOrders.length} заказов</span>
      </div>
      <div class="client-profile-section-body">
        <input class="client-history-search" id="clientHistorySearch" placeholder="Поиск по номеру детали, названию детали, автомобилю или заказу…">
        <div id="clientHistoryList" class="client-history-list"></div>
      </div>
    </div>
    <div id="clientOrderDetailPanel" class="client-order-detail-panel hidden"></div>`;
  document.getElementById('clientProfileModal').classList.remove('hidden');
  const body=document.getElementById('clientProfileBody');
  body.querySelector('[data-client-profile-order]')?.addEventListener('click',()=>openClientCart(client.id));
  body.querySelector('[data-edit-client-profile]')?.addEventListener('click',()=>openClientEditProfile(client.id));
  body.querySelector('[data-add-client-car]')?.addEventListener('click',()=>openClientAddCar(client.id));
  body.querySelectorAll('[data-client-vin]').forEach(btn=>btn.addEventListener('click',()=>handleClientVin(btn.dataset.clientVin,Number(btn.dataset.carIndex))));
  body.querySelectorAll('[data-edit-client-car]').forEach(btn=>btn.addEventListener('click',()=>openClientEditCar(btn.dataset.editClientCar,Number(btn.dataset.carIndex))));
  body.addEventListener('click',e=>{
    const payBtn=e.target.closest('[data-client-order-go-payment]');
    if(payBtn){e.preventDefault();e.stopPropagation();goToOrderPaymentFromClientProfile(payBtn.dataset.clientOrderGoPayment);return;}
    const orderBtn=e.target.closest('[data-client-order-open]');
    if(orderBtn){e.preventDefault();e.stopPropagation();openClientOrderFromProfile(orderBtn.dataset.clientOrderOpen);return;}
  });
  body.querySelector('#clientHistorySearch')?.addEventListener('input',e=>renderClientHistory(client,e.target.value));
  renderClientHistory(client,'');
}

function toast(message, type='ok', title=''){
  let stack=document.querySelector('.toast-stack');
  if(!stack){stack=document.createElement('div');stack.className='toast-stack';document.body.appendChild(stack);}
  const isError=type==='error';
  const el=document.createElement('div'); el.className='garage-toast '+(isError?'error':'ok');
  const defaultTitle=isError?'Не удалось выполнить действие':'Готово';
  el.innerHTML=`<div class="garage-toast-icon">${isError?'!':'✓'}</div><div class="garage-toast-content"><div class="garage-toast-title">${escapeHtml(title||defaultTitle)}</div><div class="garage-toast-text">${escapeHtml(String(message||''))}</div></div><button class="garage-toast-close" type="button" aria-label="Закрыть">×</button><div class="garage-toast-progress"></div>`;
  const close=()=>{if(!el.isConnected)return;el.style.opacity='0';el.style.transform='translateY(6px)';el.style.transition='.18s ease';setTimeout(()=>el.remove(),180)};
  el.querySelector('.garage-toast-close').addEventListener('click',close);
  stack.appendChild(el);
  setTimeout(close,2800);
}

let clientEditContext={mode:null,clientId:null,carIndex:null};
let pendingVinCopy=false;
function setEditField(id,value){const el=document.getElementById(id);if(el)el.value=value??''}
function setClientEditCarFields(car={}){
  setEditField('editCarBrand',car.brand); setEditField('editCarModel',car.model); setEditField('editCarYear',car.year); setEditField('editCarPlate',car.plate); setEditField('editCarVin',car.vin);
}
function setClientEditMode(mode){
  const profile=mode==='profile';
  const addCar=mode==='add-car';
  document.getElementById('editClientNameWrap').style.display=profile?'':'none';
  document.getElementById('editClientPhoneWrap').style.display=profile?'':'none';
  ['editCarBrandWrap','editCarModelWrap','editCarYearWrap','editCarPlateWrap','editCarVinWrap'].forEach(id=>document.getElementById(id).style.display=(!profile)?'':'none');
  document.getElementById('editClientTagsWrap').style.display=profile?'':'none';
  document.getElementById('saveClientEdit').textContent=addCar?'Добавить автомобиль':'Сохранить';
}
function openClientEditProfile(id){
  pendingVinCopy=false;
  const client=getClients().find(c=>String(c.id)===String(id)); if(!client)return;
  clientEditContext={mode:'profile',clientId:id,carIndex:null};
  document.getElementById('clientEditTitle').textContent='Редактирование профиля';
  setClientEditMode('profile');
  setEditField('editClientName',client.name); setEditField('editClientPhone',client.phone); setClientEditCarFields({});
  document.getElementById('editClientTags').querySelectorAll('.client-tag').forEach(b=>b.classList.toggle('active',(client.tags||[]).includes(b.dataset.tag)));
  document.getElementById('clientEditModal').classList.remove('hidden');
}
async function copyClientVin(vin){
  const value=String(vin||'').trim(); if(!value)return false;
  try{await navigator.clipboard.writeText(value);return true;}catch(e){
    const ta=document.createElement('textarea'); ta.value=value; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
    let ok=false; try{ok=document.execCommand('copy')}catch(err){} ta.remove(); return ok;
  }
}
function handleClientVin(id,index){
  const client=getClients().find(c=>String(c.id)===String(id)); if(!client)return;
  const cars=getClientCars(client), car=cars[index]; if(!car)return;
  const vin=String(car.vin||'').trim();
  if(vin){copyClientVin(vin).then(ok=>ok?toast(vin,'ok','VIN скопирован'):toast('Браузер не разрешил копирование. Попробуйте ещё раз.','error','Не удалось скопировать VIN'));return;}
  pendingVinCopy=true;
  openClientEditCar(id,index);
  setTimeout(()=>{document.getElementById('editCarVin')?.focus();},50);
  toast('Введите VIN и сохраните — он будет скопирован автоматически');
}
function openClientEditCar(id,index){
  const client=getClients().find(c=>String(c.id)===String(id)); if(!client)return;
  const cars=getClientCars(client), car=cars[index]; if(!car)return;
  clientEditContext={mode:'car',clientId:id,carIndex:index};
  document.getElementById('clientEditTitle').textContent='Изменение автомобиля';
  setClientEditMode('car');
  setEditField('editClientName',''); setEditField('editClientPhone',''); setClientEditCarFields(car);
  document.getElementById('clientEditModal').classList.remove('hidden');
}
function openClientAddCar(id){
  pendingVinCopy=false;
  const client=getClients().find(c=>String(c.id)===String(id)); if(!client)return;
  clientEditContext={mode:'add-car',clientId:id,carIndex:null};
  document.getElementById('clientEditTitle').textContent='Добавление автомобиля';
  setClientEditMode('add-car');
  setEditField('editClientName',''); setEditField('editClientPhone',''); setClientEditCarFields({});
  document.getElementById('clientEditModal').classList.remove('hidden');
}
function closeClientEdit(){document.getElementById('clientEditModal').classList.add('hidden'); clientEditContext={mode:null,clientId:null,carIndex:null}; pendingVinCopy=false;}
document.getElementById('closeClientEdit')?.addEventListener('click',closeClientEdit);
document.getElementById('cancelClientEdit')?.addEventListener('click',closeClientEdit);
document.getElementById('clientEditModal')?.addEventListener('click',e=>{if(e.target.id==='clientEditModal')closeClientEdit();});
document.getElementById('editClientTags')?.querySelectorAll('.client-tag').forEach(btn=>btn.addEventListener('click',()=>btn.classList.toggle('active')));
document.getElementById('saveClientEdit')?.addEventListener('click',()=>{
  const ctx=clientEditContext, list=getClients(), client=list.find(c=>String(c.id)===String(ctx.clientId)); if(!client)return;
  const car={brand:document.getElementById('editCarBrand').value.trim(),model:document.getElementById('editCarModel').value.trim(),year:document.getElementById('editCarYear').value.trim(),plate:document.getElementById('editCarPlate').value.trim(),vin:document.getElementById('editCarVin').value.trim()};
  if(ctx.mode==='profile'){
    const name=document.getElementById('editClientName').value.trim(), phone=document.getElementById('editClientPhone').value.trim();
    if(!name||!phone){toast('Укажите ФИО и телефон');return;}
    client.name=name; client.phone=phone; client.tags=[...document.querySelectorAll('#editClientTags .client-tag.active')].map(b=>b.dataset.tag);
    saveClients(list); renderClients(document.getElementById('clientsSearch')?.value||''); closeClientEdit(); openClientProfile(client.id); toast('Профиль клиента сохранён');
  }else if(ctx.mode==='car'){
    const cars=getClientCars(client); cars[ctx.carIndex]=car; client.cars=cars;
    if(ctx.carIndex===0)['brand','model','year','plate','vin'].forEach(k=>client[k]=car[k]);
    const shouldCopyVin=pendingVinCopy && !!car.vin;
    pendingVinCopy=false;
    saveClients(list); renderClients(document.getElementById('clientsSearch')?.value||''); closeClientEdit(); openClientProfile(client.id);
    if(shouldCopyVin){copyClientVin(car.vin).then(ok=>ok?toast(car.vin,'ok','VIN сохранён и скопирован'):toast('VIN сохранён, но браузер не разрешил копирование.','error','VIN сохранён'));}else toast('Автомобиль сохранён');
  }else if(ctx.mode==='add-car'){
    if(!car.brand&&!car.model&&!car.plate&&!car.vin&&!car.year){toast('Укажите данные автомобиля');return;}
    const cars=getClientCars(client); cars.push(car); client.cars=cars;
    if(cars.length===1)['brand','model','year','plate','vin'].forEach(k=>client[k]=car[k]);
    saveClients(list); renderClients(document.getElementById('clientsSearch')?.value||''); closeClientEdit(); openClientProfile(client.id); toast('Автомобиль добавлен');
  }
});
function closeClientProfile(){document.getElementById('clientProfileModal').classList.add('hidden');}
function renderClientOrderDetail(order){
  const panel=document.getElementById('clientOrderDetailPanel');
  if(!panel||!order)return;
  const aggregate=getOrderAggregateStatus(order)||{value:'empty',label:'Без активных позиций',cls:'status-arrived'};
  const activeItems=(order.items||[]).filter(i=>!i.removed);
  const archived=getCompletedOrdersSafeForHistory(order.id)!==null;
  const statusMeta={
    transit:{icon:'↗',note:'Есть позиции, которые ещё не поступили на склад.'},
    stock:{icon:'✓',note:'Все позиции поступили на склад и готовы к выдаче.'},
    notified:{icon:'✓',note:'Заказ собран и клиент уведомлён.'},
    partial_taken:{icon:'◐',note:'Клиент забрал часть позиций.'},
    taken:{icon:'✓',note:'Все активные позиции выданы клиенту.'}
  }[aggregate.value]||{icon:'•',note:'Текущее состояние заказа.'};
  const itemStatusMeta={
    transit:{icon:'↗',label:'В пути',note:'Ожидается поступление',cls:'transit'},
    stock:{icon:'✓',label:'На складе',note:'Готово к выдаче',cls:'stock'},
    notified:{icon:'✓',label:'Уведомлен',note:'Клиент уведомлён',cls:'notified'},
    partial_taken:{icon:'◐',label:'Частично забрал',note:'Выдана часть позиции',cls:'partial_taken'},
    taken:{icon:'✓',label:'Выдан',note:'Позиция полностью выдана',cls:'taken'}
  };
  const total=Math.max(0,Number(order.total)||0),paid=Math.max(0,Number(order.paid)||0),debt=Math.max(0,Number(order.debt)||0);
  const issued=activeItems.reduce((n,i)=>n+getItemIssuedQty(i),0);
  const stock=activeItems.reduce((n,i)=>n+getItemOnStockQty(i),0);
  const expected=activeItems.reduce((n,i)=>n+getItemExpectedQty(i),0);
  const itemHtml=(order.items||[]).map((item,index)=>{
    if(item.removed){
      const refund=Number(item.refundAmount)||0;
      return `<div class="client-order-detail-item removed">
        <div class="client-order-detail-item-main"><div class="client-order-detail-item-head"><span class="client-order-detail-num">${index+1}</span><div><b>${escapeHtml(item.name||'Деталь')}</b><small>Артикул: ${escapeHtml(item.article||'—')}</small></div></div><div class="client-order-detail-removed">Позиция удалена${item.removedReason?' · '+escapeHtml(item.removedReason):''}${refund>0?' · Возврат '+money0(refund):''}</div></div>
      </div>`;
    }
    const st=getOrderItemStatus(item);
    const meta=itemStatusMeta[st]||{icon:'•',label:st||'—',note:'Текущее состояние',cls:'stock'};
    const qty=Math.max(0,Number(item.qty)||0);
    const before=Math.max(0,Number(item.price)||0);
    const pct=Math.max(0,Number(item.discountPct)||0);
    const disc=Math.max(0,Number(item.discountAmount)||0);
    const after=pct>0?Math.max(0,before-disc):before;
    const itemTotal=getItemEffectiveTotal(item);
    const itemPaid=getItemPaid(item);
    const remaining=getItemRemaining(item);
    return `<div class="client-order-detail-item">
      <div class="client-order-detail-item-main">
        <div class="client-order-detail-item-head"><span class="client-order-detail-num">${index+1}</span><div><b>${escapeHtml(item.name||'Деталь')}</b><small>Артикул: ${escapeHtml(item.article||'—')}</small></div></div>
        <div class="client-order-detail-metrics"><span><b>${qty}</b> заказано</span><span><b>${getItemReceivedQty(item)}</b> пришло</span><span><b>${getItemOnStockQty(item)}</b> на складе</span><span><b>${getItemIssuedQty(item)}</b> выдано</span>${getItemExpectedQty(item)>0?`<span class="pending"><b>${getItemExpectedQty(item)}</b> ожидается</span>`:''}</div>
      </div>
      <div class="client-order-detail-status ${meta.cls}"><span>${meta.icon}</span><div><b>${escapeHtml(meta.label)}</b><small>${escapeHtml(meta.note)}</small></div></div>
      <div class="client-order-detail-money"><div><small>Цена</small><b>${money0(before)}</b></div>${pct>0?`<div><small>Скидка</small><b class="discount">−${pct}%</b></div>`:''}<div><small>К оплате</small><b>${money0(itemTotal)}</b></div><div><small>Оплачено</small><b class="paid">${money0(itemPaid)}</b></div><div><small>Осталось</small><b class="${remaining>0?'debt':'paid'}">${money0(remaining)}</b></div></div>
    </div>`;
  }).join('');
  const events=(order.events||[]).slice().reverse().slice(0,12).map(ev=>`<div class="client-order-detail-event"><time>${escapeHtml(ev.date||'—')}<br>${escapeHtml(ev.time||'')}</time><div><b>${escapeHtml(ev.text||'')}</b><small>${escapeHtml(ev.detail||'')}${ev.seller?' · ':''}${ev.seller?sellerMark(ev.seller,'mini'):''}</small></div><strong>${ev.amount?escapeHtml(ev.amount):''}</strong></div>`).join('');
  const date=order.date||String(order.createdAt||'').slice(0,10)||'—';
  panel.innerHTML=`
    <div class="client-order-detail-head">
      <div><div class="client-order-detail-kicker">Подробности заказа</div><h3>Заказ #${escapeHtml(String(order.id))}</h3><p>${escapeHtml(order.car||'Автомобиль не указан')} · ${escapeHtml(date)}${order.seller?' · '+escapeHtml(order.seller):''}${archived?' · История':''}</p></div>
      <div class="client-order-detail-head-actions">
        ${(!archived && debt>0.001)?`<button class="btn primary client-order-go-payment" type="button" data-client-order-go-payment="${escapeHtml(String(order.id))}">💳 Перейти к оплате</button>`:''}
        <button class="btn" type="button" data-client-order-detail-close>Свернуть</button>
      </div>
    </div>
    <div class="client-order-detail-status-overview"><div class="client-order-detail-status-icon">${statusMeta.icon}</div><div><small>Статус заказа</small><b>${escapeHtml(aggregate.label)}</b><span>${escapeHtml(statusMeta.note)}</span></div><div class="client-order-detail-status-count"><b>${activeItems.length}</b><small>позиций</small></div></div>
    <div class="client-order-detail-summary"><div><small>Итого</small><b>${money0(total)}</b></div><div><small>Оплачено</small><b class="paid">${money0(paid)}</b></div><div><small>Долг</small><b class="${debt?'debt':''}">${money0(debt)}</b></div><div><small>На складе</small><b>${stock}</b></div><div><small>Ожидается</small><b>${expected}</b></div><div><small>Выдано</small><b>${issued}</b></div></div>
    <div class="client-order-detail-section-title">Позиции заказа</div>
    <div class="client-order-detail-items">${itemHtml||'<div class="client-history-empty">Активных позиций нет.</div>'}</div>
    <div class="client-order-detail-section-title">Последние действия</div>
    <div class="client-order-detail-events">${events||'<div class="client-history-empty">История действий пуста.</div>'}</div>`;
  panel.classList.remove('hidden');
  panel.querySelector('[data-client-order-detail-close]')?.addEventListener('click',()=>{panel.classList.add('hidden');panel.innerHTML='';});
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function openClientOrderFromProfile(orderId){
  const key=String(orderId||'').trim();
  if(!key){toast('У заказа отсутствует номер.','error','Заказ не найден');return;}
  const order=getOrderHistory(key);
  if(!order){toast('Не удалось найти этот заказ. Он мог быть удалён или данные ещё не обновились.','error','Заказ не найден');return;}
  renderClientOrderDetail(order);
}
function goToOrderPaymentFromClientProfile(orderId){
  const key=String(orderId||'').trim();
  if(!key){toast('У заказа отсутствует номер.','error','Заказ не найден');return;}
  const order=getOrderHistory(key);
  if(!order){toast('Не удалось найти этот заказ. Он мог быть удалён или данные ещё не обновились.','error','Заказ не найден');return;}
  if(getCompletedOrdersSafeForHistory(key)!==null){
    toast('Завершённый заказ находится в Истории и недоступен для оплаты.','error','Заказ уже завершён');
    return;
  }
  closeClientProfile();
  document.querySelector('.nav button[data-page="orders"]')?.click();
  setTimeout(()=>openOrderHistory(key),40);
}
document.getElementById('closeClientProfile')?.addEventListener('click',closeClientProfile);
document.getElementById('closeClientProfileBottom')?.addEventListener('click',closeClientProfile);
document.getElementById('clientProfileModal')?.addEventListener('click',e=>{if(e.target.id==='clientProfileModal')closeClientProfile();});
let clientCartContext=null;
function persistClientCart(){
  if(!clientCartContext)return;
  const all=getClientCarts();
  const id=String(clientCartContext.id);
  const totals=getCartTotals();
  all[id]={items:JSON.parse(JSON.stringify(cartItems)),saleMethod,discount:saleDiscount.value,manualDiscount:saleManualDiscount.value,final:Number.isFinite(+saleFinalInput.value)?(+saleFinalInput.value):totals.afterDiscount,roundingAdjustment:Math.max(0,Number(saleRoundingAdjustment)||0),carIndex:clientCartContext.carIndex||0,updatedAt:new Date().toISOString()};
  saveClientCarts(all);
  renderClients(document.getElementById('clientsSearch')?.value||'');
}
function openClientCart(id){
  const client=getClients().find(c=>String(c.id)===String(id)); if(!client)return;
  const cart=getClientCart(client.id);
  clientCartContext={id:String(client.id),name:client.name||'',phone:client.phone||'',carIndex:Number(cart.carIndex)||0};
  closeClientProfile();
  document.getElementById('productSaleTitle').textContent='Корзина клиента';
  const sub=document.getElementById('clientCartSub');
  if(sub){sub.textContent=client.name+(client.phone?' · '+client.phone:'');sub.style.display='block';}
  const contextBar=document.getElementById('clientCartContextBar');
  const carSelect=document.getElementById('clientCartCarSelect');
  const cars=getClientCars(client);
  if(contextBar){contextBar.style.display='block';document.getElementById('clientCartClientName').textContent=client.name||'Клиент';}
  if(carSelect){carSelect.innerHTML=cars.length?cars.map((car,i)=>`<option value="${i}">${escapeHtml([car.brand,car.model,car.plate].filter(Boolean).join(' · ')||('Автомобиль '+(i+1)))}</option>`).join(''):'<option value="0">Автомобиль не указан</option>';carSelect.value=String(Math.min(clientCartContext.carIndex,Math.max(0,cars.length-1)));}
  productSaleModal.classList.remove('hidden');
  saleMethod=cart.saleMethod==='card'?'card':'cash';
  cartItems=Array.isArray(cart.items)&&cart.items.length?JSON.parse(JSON.stringify(cart.items)):[{name:'',price:0,qty:1,discount:'',arrivalDate:''}];
  saleDiscount.value=cart.discount||'0';
  saleManualDiscount.value=cart.manualDiscount||'';
  saleManualDiscount.style.display=saleDiscount.value==='manual'?'block':'none';
  document.querySelectorAll('[data-sale-method]').forEach(b=>b.classList.toggle('active',b.dataset.saleMethod===saleMethod));
  saleRoundingAdjustment=Math.max(0,Number(cart.roundingAdjustment)||0);
  if(!('roundingAdjustment' in cart) && Number.isFinite(+cart.final)) { const oldTotal=clientCartTotals(cart); saleRoundingAdjustment=Math.max(0,oldTotal.afterDiscount-(+cart.final||0)); }
  saleFinalInput.value=Number.isFinite(+cart.final)?(+cart.final):0;
  renderCart();
  recalcProductSale(false);
  document.getElementById('saveProductSale').textContent='Создать заказ';
  if(carSelect)carSelect.onchange=()=>{clientCartContext.carIndex=Number(carSelect.value)||0;persistClientCart()};
  setTimeout(()=>document.querySelector('#cartList input[data-k="name"]')?.focus(),50);
}
function startClientOrder(id){openClientCart(id)}


document.getElementById('saveClientModal').onclick=()=>{
  const name=document.getElementById('clientName').value.trim();
  const phone=document.getElementById('clientPhone').value.trim();
  if(!name||!phone){toast('Укажите ФИО и телефон');return;}
  const client={
    id:nextUniqueClientId(),name,phone,brand:document.getElementById('clientBrand').value.trim(),model:document.getElementById('clientModel').value.trim(),
    year:document.getElementById('clientYear').value.trim(),plate:document.getElementById('clientPlate').value.trim(),vin:document.getElementById('clientVin').value.trim(),
    tags:[...document.querySelectorAll('#clientTags .client-tag.active')].map(b=>b.dataset.tag),seller:getCurrentSeller(),createdAt:new Date().toISOString()
  };
  const clients=getClients(); clients.unshift(client); saveClients(clients); renderClients(document.getElementById('clientsSearch')?.value||'');
  closeClientCreate(); clearClientCreate();
  document.querySelector('.nav button[data-page="clients"]')?.click();
  toast('Клиент создан');
};
const clientsNewBtn=document.querySelector('#clients .head .btn.primary'); if(clientsNewBtn)clientsNewBtn.onclick=openClientCreate;
const clientsNewTop=document.getElementById('clientsNewTop'); if(clientsNewTop)clientsNewTop.onclick=openClientCreate;
document.getElementById('clientsSearch')?.addEventListener('input',e=>renderClients(e.target.value));
document.getElementById('clientsFilter')?.addEventListener('change',()=>renderClients());
document.getElementById('ordersSearch')?.addEventListener('input',renderOrders);
document.getElementById('ordersStatusFilter')?.addEventListener('change',renderOrders);
document.getElementById('historySearch')?.addEventListener('input',renderCompletedOrders);
document.getElementById('historySeller')?.addEventListener('change',renderCompletedOrders);
setupGlobalSearch();
document.getElementById('clientsList')?.addEventListener('click',e=>{
  const profile=e.target.closest('[data-client-profile]');
  const order=e.target.closest('[data-client-order]');
  const cart=e.target.closest('[data-client-cart]');
  const del=e.target.closest('[data-client-delete]');
  if(del){deleteClientCard(del.dataset.clientDelete);return;}
  if(profile){openClientProfile(profile.dataset.clientProfile);return;}
  if(order){openClientCart(order.dataset.clientOrder);return;}
  if(cart){openClientCart(cart.dataset.clientCart);return;}
});
renderClients();

const quickSaleBtn=document.getElementById('quickSale');
const salesPageBtn=document.querySelector('.nav button[data-page="sales"]');
function goToSalesAndSell(){
  if(salesPageBtn) salesPageBtn.click();
  setTimeout(()=>openProductSale(),0);
}
quickSaleBtn.onclick=goToSalesAndSell;

const productSaleModal=document.getElementById('productSaleModal');
const cartList=document.getElementById('cartList');
const saleDiscount=document.getElementById('saleDiscount');
const saleManualDiscount=document.getElementById('saleManualDiscount');
const saleFinalInput=document.getElementById('saleFinalInput');
let saleMethod='cash';
let cartItems=[];
let saleRoundingAdjustment=0;

function money(n){const v=Math.round((Number(n)||0)*100)/100;return new Intl.NumberFormat('ru-RU',{minimumFractionDigits:Number.isInteger(v)?0:2,maximumFractionDigits:2}).format(v)+' ₽'}
function money0(n){return money(Math.max(0,Number(n)||0))}
function renderCart(){
  const count=cartItems.reduce((a,x)=>a+(+x.qty||0),0);
  document.getElementById('cartCount').textContent=count+' '+(count===1?'товар':(count>=2&&count<=4?'товара':'товаров'));
  if(!cartItems.length){
    cartList.innerHTML='<div class="cart-empty">Корзина пуста. Добавьте первый товар.</div>';
    return;
  }
  cartList.innerHTML=cartItems.map((x,i)=>`
    <div class="cart-item">
      <div class="cart-thumb" aria-hidden="true">📦</div>
      <div><label>Товар / артикул</label><input data-i="${i}" data-k="name" value="${escapeHtml(x.name)}" placeholder="Название или артикул"></div>
      <div><label>Цена</label><input data-i="${i}" data-k="price" type="number" min="0" value="${escapeHtml(x.price)}"></div>
      <div><label>Количество</label><input data-i="${i}" data-k="qty" type="number" min="1" value="${escapeHtml(x.qty)}"></div>
      <div class="item-discount-wrap"><label class="item-discount-label">% скидки</label><input class="item-discount" data-i="${i}" data-k="discount" type="number" min="0" max="100" step="0.01" value="${escapeHtml(x.discount)}" placeholder="—"><span class="discount-mark">%</span></div>
      <div class="cart-arrival-date"><label>Дата поступления</label><input data-i="${i}" data-k="arrivalDate" type="date" value="${escapeHtml(x.arrivalDate)}"></div>
      <div class="line-total">${money0((+x.price||0)*(+x.qty||0)*(1-(x.discount===''||x.discount==null?getSaleDiscountPercent():Math.min(100,Math.max(0,+x.discount||0)))/100))}</div>
      <button class="cart-remove" data-remove="${i}" title="Удалить товар">×</button>
    </div>`).join('');
}
function getSaleDiscountPercent(){
  if(saleMethod==='card') return 0;
  if(saleDiscount.value==='manual') return Math.min(100,Math.max(0,+saleManualDiscount.value||0));
  return +saleDiscount.value||0;
}
function getItemDiscountPercent(item){
  if(saleMethod==='card') return 0;
  if(item.discount!=='' && item.discount!=null) return Math.min(100,Math.max(0,+item.discount||0));
  return getSaleDiscountPercent();
}
function getCartTotals(){
  let base=0, discountSum=0, afterDiscount=0;
  cartItems.forEach(item=>{
    const lineBase=moneyCents(Math.max(0,+item.price||0)*Math.max(0,+item.qty||0));
    const pct=getItemDiscountPercent(item);
    const net=moneyCents(lineBase*(1-pct/100)/100);
    base+=lineBase; discountSum+=lineBase-net; afterDiscount+=net;
  });
  return {base:base/100,discountSum:discountSum/100,afterDiscount:afterDiscount/100};
}
function recalcProductSale(resetRounding=false){
  const totals=getCartTotals();
  const base=totals.base,pctSum=totals.discountSum,afterPercent=totals.afterDiscount;
  if(saleMethod==='card'){
    saleRoundingAdjustment=0;
    saleFinalInput.value=moneyAmount(afterPercent);
  }else if(document.activeElement===saleFinalInput){
    const entered=moneyAmount(Math.max(0,Math.min(afterPercent,Number(saleFinalInput.value)||0)));
    saleFinalInput.value=entered;
    saleRoundingAdjustment=Math.max(0,moneyCents(afterPercent)-moneyCents(entered))/100;
  }else{
    if(resetRounding)saleRoundingAdjustment=0;
    saleRoundingAdjustment=Math.max(0,Math.min(afterPercent,Number(saleRoundingAdjustment)||0));
    saleFinalInput.value=Math.max(0,moneyCents(afterPercent)-moneyCents(saleRoundingAdjustment))/100;
    saleRoundingAdjustment=Math.max(0,moneyCents(afterPercent)-moneyCents(saleFinalInput.value))/100;
  }
  const final=Math.max(0,Number(saleFinalInput.value)||0);
  const preview=document.getElementById('saleDiscountPreview'),previewPercent=document.getElementById('salePreviewPercent'),previewTotal=document.getElementById('salePreviewTotal');
  if(saleMethod==='cash'&&pctSum===0&&base>0){
    preview.classList.remove('hidden');previewPercent.textContent='5%';previewTotal.textContent=money0(Math.max(0,base-base*0.05));
  }else preview.classList.add('hidden');
  document.getElementById('saleBase').textContent=money0(base);
  document.getElementById('saleDiscountSum').textContent=money0(pctSum);
  cartList.querySelectorAll('.cart-item').forEach((row,i)=>{
    const item=cartItems[i];if(!item)return;
    const lineBase=(+item.price||0)*(+item.qty||0),linePct=getItemDiscountPercent(item),line=row.querySelector('.line-total');
    if(line)line.textContent=money0(lineBase*(1-linePct/100));
  });
  const row=document.getElementById('saleRoundRow');row.classList.toggle('hidden',saleMethod!=='cash'||saleRoundingAdjustment<=0);
  document.getElementById('saleRoundSum').textContent=money0(saleRoundingAdjustment);
  saleDiscount.disabled=saleMethod==='card';
  cartList.querySelectorAll('.item-discount').forEach(input=>{input.disabled=saleMethod==='card';});
  saleFinalInput.readOnly=saleMethod==='card';
  document.getElementById('salePaymentHint').textContent=saleMethod==='card'?'При оплате картой скидка и ручное округление не применяются.':'При наличных итог можно округлить вручную. Округление сохраняется отдельно в заказе.';
  void final;
}
function openProductSale(){
  clientCartContext=null;
  document.getElementById('productSaleTitle').textContent='Продажа со склада';
  const clientSub=document.getElementById('clientCartSub'); if(clientSub){clientSub.textContent='';clientSub.style.display='none';}
  const clientBar=document.getElementById('clientCartContextBar'); if(clientBar)clientBar.style.display='none';
  document.getElementById('saveProductSale').textContent='Продажа со склада';
  productSaleModal.classList.remove('hidden');
  saleMethod='cash';
  cartItems=[{name:'',price:0,qty:1,discount:'',arrivalDate:''}];
  saleDiscount.value='0';
  saleManualDiscount.value='';
  saleManualDiscount.style.display='none';
  document.querySelectorAll('[data-sale-method]').forEach(b=>b.classList.toggle('active',b.dataset.saleMethod==='cash'));
  saleRoundingAdjustment=0;
  saleFinalInput.value='0';
  renderCart();
  recalcProductSale(true);
}
function closeProductSale(){if(clientCartContext)persistClientCart(); productSaleModal.classList.add('hidden'); clientCartContext=null; document.getElementById('productSaleTitle').textContent='Продажа со склада'; const sub=document.getElementById('clientCartSub'); if(sub){sub.textContent='';sub.style.display='none';} const bar=document.getElementById('clientCartContextBar'); if(bar)bar.style.display='none'; document.getElementById('saveProductSale').textContent='Продажа со склада';}
document.getElementById('addCartItem').onclick=()=>{
  cartItems.push({name:'',price:0,qty:1,discount:'',arrivalDate:''});
  renderCart();recalcProductSale(false);
  const inputs=cartList.querySelectorAll('input[data-k="name"]'); if(inputs.length)inputs[inputs.length-1].focus();
  if(clientCartContext)persistClientCart();
};
cartList.addEventListener('input',e=>{
  const i=e.target.dataset.i,k=e.target.dataset.k;
  if(i===undefined)return;
  const idx=+i;
  if(k==='name') cartItems[idx].name=e.target.value;
  else if(k==='discount') cartItems[idx].discount=e.target.value===''?'':Math.min(100,Math.max(0,+e.target.value||0));
  else if(k==='arrivalDate') cartItems[idx].arrivalDate=String(e.target.value||'');
  else cartItems[idx][k]=e.target.value===''?'':(+e.target.value||0);
  // Не перерисовываем всю корзину во время ввода:
  // иначе браузер теряет фокус после первой буквы/цифры.
  const row=e.target.closest('.cart-item');
  if(row){
    const line=row.querySelector('.line-total');
    const lineBase=(+cartItems[idx].price||0)*(+cartItems[idx].qty||0);
    const linePct=getItemDiscountPercent(cartItems[idx]);
    line.textContent=money0(lineBase*(1-linePct/100));
  }
  recalcProductSale(true);
  if(clientCartContext)persistClientCart();
});
cartList.addEventListener('click',e=>{
  const b=e.target.closest('[data-remove]');if(!b)return;
  cartItems.splice(+b.dataset.remove,1); if(!cartItems.length)cartItems=[{name:'',price:0,qty:1,discount:'',arrivalDate:''}]; renderCart();recalcProductSale(false); if(clientCartContext)persistClientCart();
});
saleDiscount.addEventListener('change',()=>{
  saleManualDiscount.style.display=saleDiscount.value==='manual'?'block':'none';
  const totals=getCartTotals();
  saleFinalInput.value=moneyAmount(totals.afterDiscount);
  saleRoundingAdjustment=0;
  recalcProductSale(true);
  if(clientCartContext)persistClientCart();
});
saleManualDiscount.addEventListener('input',()=>{
  const totals=getCartTotals();
  saleFinalInput.value=moneyAmount(totals.afterDiscount);
  saleRoundingAdjustment=0;
  recalcProductSale(true);
  if(clientCartContext)persistClientCart();
});
saleFinalInput.addEventListener('input',()=>{recalcProductSale();if(clientCartContext)persistClientCart();});
document.querySelectorAll('[data-sale-method]').forEach(btn=>btn.addEventListener('click',()=>{
  saleMethod=btn.dataset.saleMethod;
  document.querySelectorAll('[data-sale-method]').forEach(b=>b.classList.toggle('active',b===btn));
  const totals=getCartTotals();
  saleRoundingAdjustment=0;
  saleFinalInput.value=moneyAmount(totals.afterDiscount);
  recalcProductSale(true);
  if(clientCartContext)persistClientCart();
}));
document.getElementById('closeProductSale').onclick=closeProductSale;
document.getElementById('cancelProductSale').onclick=confirmCancelProductSale;
function showActionConfirm(type, onYes, detailText){
  const box=document.getElementById('actionConfirmModal');
  const icon=document.getElementById('confirmIcon');
  const title=document.getElementById('confirmTitle');
  const text=document.getElementById('confirmText');
  const yes=document.getElementById('confirmYes');
  const paidInput=document.getElementById('orderConfirmPaid');
  const paidLabel=paidInput?.previousElementSibling;
  if(paidInput){paidInput.type='number';paidInput.min='0';paidInput.step='0.01';}
  if(paidLabel)paidLabel.textContent='К оплате сейчас';
  if(type==='cancel'){
    icon.textContent='×'; icon.style.background='#fff5f5'; icon.style.color='#c53030';
    title.textContent='Отменить продажу?';
    text.textContent='Введённые товары и данные этой продажи будут закрыты без сохранения.';
    yes.textContent='Да, отменить'; yes.className='btn danger';
  }else if(type==='complete-order'){
    icon.textContent='✓'; icon.style.background='#edf9f1'; icon.style.color='#28763f';
    title.textContent='Заказ готов к удалению';
    text.textContent='Заказ полностью оплачен и все его позиции выданы клиенту. Нажмите «Удалить заказ», затем потребуется повторное подтверждение. После удаления заказ попадёт в раздел «История».';
    yes.textContent='🗑 Удалить заказ'; yes.className='btn danger';
  }else if(type==='restore-order'){
    icon.textContent='↩'; icon.style.background='#eff6ff'; icon.style.color='#2563eb';
    title.textContent='Вернуть заказ?';
    text.textContent='Заказ снова появится в разделе «Заказы» и его можно будет продолжить оформлять.';
    yes.textContent='Да, вернуть заказ'; yes.className='btn primary';
  }else if(type==='payment'){
    icon.textContent='₽'; icon.style.background='#edf9f1'; icon.style.color='#28763f';
    title.textContent='Подтвердить оплату?';
    text.textContent=detailText || 'Оплата будет записана в историю заказа и журнал продаж.';
    yes.textContent='✓ Подтвердить оплату'; yes.className='btn success';
  }else if(type==='discount'){
    icon.textContent='%'; icon.style.background='#fff7e8'; icon.style.color='#a56608';
    title.textContent='Применить скидку?';
    text.textContent=detailText || 'Скидка будет сохранена по выбранным позициям.';
    yes.textContent='✓ Применить скидку'; yes.className='btn success';
  }else if(type==='status'){
    icon.textContent='↻'; icon.style.background='#eff6ff'; icon.style.color='#2563eb';
    title.textContent='Изменить статус позиции?';
    text.textContent=detailText || 'Изменение статуса будет записано в историю заказа.';
    yes.textContent='Изменить статус'; yes.className='btn primary';
  }else if(type==='issue-whole-order'){
    icon.textContent='✓'; icon.style.background='#f4edff'; icon.style.color='#7850a9';
    title.textContent='Выдать весь заказ?';
    text.textContent=detailText || 'Все доступные позиции будут отмечены как полностью выданные клиенту.';
    yes.textContent='✓ Выдать весь заказ'; yes.className='btn primary';
  }else if(type==='issue-item'){
    icon.textContent='✓'; icon.style.background='#f4edff'; icon.style.color='#7850a9';
    title.textContent='Подтвердить выдачу?';
    text.textContent=detailText || 'Укажите фактически выданное количество.';
    const details=document.getElementById('orderConfirmDetails'); details.classList.remove('hidden');
    document.getElementById('orderConfirmTotal').textContent='Количество к выдаче';
    document.getElementById('orderConfirmDebt').textContent='шт.';
    const paid=document.getElementById('orderConfirmPaid'); paid.type='number'; paid.min='1'; paid.step='1'; paid.value='1'; paidLabel && (paidLabel.textContent='Выдано, шт.');
    paid.oninput=()=>{}; yes.textContent='✓ Подтвердить выдачу'; yes.className='btn primary';
  }else if(type==='return'){
    icon.textContent='↩'; icon.style.background='#fff5f5'; icon.style.color='#b53d3d';
    title.textContent='Подтвердить возврат?';
    text.textContent=detailText || 'Деньги будут отражены как возврат из кассы.';
    yes.textContent='↩ Подтвердить возврат'; yes.className='btn danger';
  }else if(type==='delete-seller'){
    icon.textContent='🗑'; icon.style.background='#fff5f5'; icon.style.color='#b53d3d';
    title.textContent='Удалить продавца?';
    text.textContent=detailText || 'Продавец будет удалён из текущего списка. История операций сохранится.';
    yes.textContent='Да, удалить'; yes.className='btn danger';
  }else if(type==='delete-client'){
    icon.textContent='🗑'; icon.style.background='#fff5f5'; icon.style.color='#b42318';
    title.textContent='Удалить карточку клиента?';
    text.textContent=detailText || 'Карточка клиента будет удалена. Заказы, история и продажи останутся в системе.';
    yes.textContent='🗑 Да, удалить карточку'; yes.className='btn danger';
  }else if(type==='import-backup'){
    icon.textContent='⬆'; icon.style.background='#fff7e8'; icon.style.color='#a56608';
    title.textContent='Импортировать резервную копию?';
    text.textContent=detailText || 'Текущие локальные данные гаража будут заменены данными из файла.';
    yes.textContent='Да, импортировать'; yes.className='btn danger';
  }else if(type==='create-order'){
    icon.textContent='✓'; icon.style.background='#eff6ff'; icon.style.color='#2563eb';
    title.textContent='Создать заказ?';
    text.textContent='Проверьте сумму заказа и сумму оплаты сейчас.';
    const details=document.getElementById('orderConfirmDetails'); details.classList.remove('hidden');
    const total=Math.max(0,+saleFinalInput.value||0);
    document.getElementById('orderConfirmTotal').textContent=money0(total);
    const paid=document.getElementById('orderConfirmPaid'); paid.value='0';
    const updateDebt=()=>{const p=Math.max(0,moneyValue(paid.value));const debt=Math.max(0,total-p);const over=Math.max(0,p-total);document.getElementById('orderConfirmDebt').textContent=over>0?('0 ₽ · переплата '+money0(over)):money0(debt)};
    paid.oninput=updateDebt; updateDebt();
    yes.textContent='Подтверждаю'; yes.className='btn success';
  }else{
    icon.textContent='✓'; icon.style.background='#eff6ff'; icon.style.color='#2563eb';
    title.textContent='Подтвердить продажу?';
    text.textContent='Продажа будет сохранена в журнале продаж.';
    yes.textContent='Да, продать'; yes.className='btn success';
  }
  if(type!=='create-order'&&type!=='issue-item')document.getElementById('orderConfirmDetails').classList.add('hidden');
  box.classList.remove('hidden');
  const no=()=>{box.classList.add('hidden');document.getElementById('confirmNo').onclick=null;yes.onclick=null};
  document.getElementById('confirmNo').onclick=no;
  yes.onclick=()=>{box.classList.add('hidden');yes.onclick=null;document.getElementById('confirmNo').onclick=null;onYes()};
}
function confirmCancelProductSale(){
  showActionConfirm('cancel',closeProductSale);
}
document.getElementById('saveProductSale').onclick=()=>{
  if(clientCartContext){
    if(cartItems.some(x=>!String(x.name).trim()||(+x.price||0)<=0||(+x.qty||0)<=0)){toast('Заполните товар, цену и количество для каждой позиции.','error');return;}
    const totals=getCartTotals(); const total=Math.max(0,+saleFinalInput.value||0);
    if(total>totals.afterDiscount){toast('Итоговая сумма не может быть выше суммы после скидки.','error');return;}
    persistClientCart(); showActionConfirm('create-order',createClientOrder); return;
  }
  if(!cartItems.length)return;
  if(cartItems.some(x=>!String(x.name).trim()||(+x.price||0)<=0||(+x.qty||0)<=0)){toast('Заполните товар, цену и количество для каждой позиции.','error');return}
  const totals=getCartTotals();
  const base=totals.base;
  const pctSum=totals.discountSum;
  const afterPercent=totals.afterDiscount;
  const final=+saleFinalInput.value||0;
  if(final>afterPercent){toast('Итоговая сумма не может быть выше суммы после скидки.','error');return}
  showActionConfirm('sell',()=>{
    const round=Math.max(0,afterPercent-final);
    const saleNow=new Date(); const sale={id:Date.now(),items:JSON.parse(JSON.stringify(cartItems)),baseTotal:base,discountPercent:getSaleDiscountPercent(),discountPercentAmount:pctSum,roundDiscount:round,roundingAdjustment:round,total:final,paymentMethod:saleMethod,seller:getCurrentSeller(),date:saleNow.toISOString().slice(0,10),createdAt:saleNow.toISOString()};
    const all=JSON.parse(garageStorage.getItem('garageWarehouseSales')||'[]');all.unshift(sale);garageStorage.setItem('garageWarehouseSales',JSON.stringify(all));
    renderSalesJournal();
    closeProductSale();
  });
};
function getCompletedOrdersSafeForHistory(key){
  try{
    const list=getCompletedOrders();
    return list.find(o=>String(o.id)===String(key))||null;
  }catch(e){return null}
}
function getAllKnownOrders(){
  const byId=new Map();
  const add=(raw)=>{
    const normalized=normalizeClientOrder(raw);
    const order=normalized?.order||raw;
    if(!order||order.id==null)return;
    const key=String(order.id);
    if(!byId.has(key))byId.set(key,JSON.parse(JSON.stringify(order)));
  };
  // Один источник для всех экранов: архив -> активные -> legacy history overrides.
  getCompletedOrders().forEach(add);
  getClientOrders().forEach(add);
  try{
    const overrides=JSON.parse(garageStorage.getItem('garageOrderHistoryOverrides')||'{}');
    Object.values(overrides||{}).forEach(add);
  }catch(e){}
    return [...byId.values()];
}
function getOrderHistory(id){
  const key=String(id);
  const order=getAllKnownOrders().find(o=>String(o.id)===key);
  return order?JSON.parse(JSON.stringify(order)):null;
}
function saveOrderHistory(order){
  const key=String(order.id);
  const completed=getCompletedOrders();
  const completedIndex=completed.findIndex(o=>String(o.id)===key);
  if(completedIndex>=0){
    completed[completedIndex]=JSON.parse(JSON.stringify(order));
    saveCompletedOrders(completed);
    return;
  }
  const active=getClientOrders();
  const activeIndex=active.findIndex(o=>String(o.id)===key);
  if(activeIndex>=0){
    active[activeIndex]=JSON.parse(JSON.stringify(order));
    saveClientOrders(active);
    return;
  }
  const overrides=JSON.parse(garageStorage.getItem('garageOrderHistoryOverrides')||'{}');
  overrides[key]=JSON.parse(JSON.stringify(order));
  garageStorage.setItem('garageOrderHistoryOverrides',JSON.stringify(overrides));
}
function getItemRawTotal(item){const pct=Math.max(0,Number(item.discountPct)||0);const qty=Math.max(0,Number(item.qty)||0);const before=Math.max(0,Number(item.price)||0);const d=Math.max(0,Number(item.discountAmount)||0);const after=pct>0?Math.max(0,before-d):before;return after*qty;}
function orderItemFinalTotal(item){return Math.max(0,moneyCents(getItemRawTotal(item))+(Math.round((Number(item.legacyLineRounding)||0)*100)))/100;}
function migrateLegacyLineRounding(order){
  if(order.roundingAllocationVersion===1)return;
  const rows=(order.items||[]).filter(item=>!item.removed).map(item=>{
    const raw=getItemRawTotal(item);
    return {item,raw,rounded:moneyCents(raw)};
  });
  const rawSubtotal=rows.reduce((sum,row)=>sum+row.raw,0);
  const target=moneyCents(rawSubtotal);
  const storedTotal=Number(order.total);
  const storedRounding=Number(order.roundingAdjustment);
  const rawRounding=Number.isFinite(storedRounding)?Math.max(0,Math.min(rawSubtotal,storedRounding)):Math.max(0,rawSubtotal-storedTotal);
  if(Number.isFinite(storedTotal)&&storedTotal>=0&&storedTotal<=rawSubtotal+0.001&&Math.abs(storedTotal-(rawSubtotal-rawRounding))<=0.001){
    // Round the final legacy total as a whole: independently rounding a raw
    // half-kopeck subtotal and its adjustment can otherwise add a new debt.
    order.roundingAdjustment=Math.max(0,target-moneyCents(storedTotal))/100;
  }
  const rounded=rows.reduce((sum,row)=>sum+row.rounded,0);
  let residual=target-rounded;
  // Old versions rounded the aggregate rather than each line. Apportion that
  // existing subtotal once so loading an old paid order cannot add kopeck debt.
  rows.forEach(row=>{delete row.item.legacyLineRounding;});
  const direction=Math.sign(residual);
  rows.sort((a,b)=>direction*((b.raw*100-b.rounded)-(a.raw*100-a.rounded)));
  for(const row of rows){
    if(!residual)break;
    if(direction<0&&row.rounded===0)continue;
    row.item.legacyLineRounding=direction/100;
    residual-=direction;
  }
}
let removeItemContext=null;
let returnEditContext=null;
function openRemoveItemModal(orderId,index){
  const order=getOrderHistory(orderId); if(!order)return;
  const item=order.items[index]; if(!item||item.removed)return;
  removeItemContext={orderId:String(orderId),index};
  document.getElementById('removeItemText').textContent='«'+item.name+'» будет исключена из текущей суммы заказа на '+money0(item.total||0)+'. В истории останется запись с причиной.';
  document.getElementById('removeItemReason').value='';
  ensureOrderItemPayments(order); const prepaidHint=getItemPaid(item);
  document.getElementById('removeItemRefund').value=prepaidHint>0?prepaidHint:0;
  document.getElementById('removeItemModal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('removeItemReason').focus(),30);
}
function closeRemoveItemModal(){removeItemContext=null;document.getElementById('removeItemModal').classList.add('hidden')}
function confirmRemoveItem(){
  if(!removeItemContext)return;
  const order=getOrderHistory(removeItemContext.orderId); if(!order)return;
  const item=order.items[removeItemContext.index]; if(!item||item.removed)return;
  const reason=(document.getElementById('removeItemReason').value||'').trim()||'Причина не указана';
  ensureOrderItemPayments(order);
  const amount=getItemEffectiveTotal(item);
  const requestedRefund=moneyAmount(moneyValue(document.getElementById('removeItemRefund').value));
  ensureOrderItemPayments(order); const itemPaidBefore=getItemPaid(item); const refund=Math.min(amount,requestedRefund,itemPaidBefore);
  // Removing a position also removes its own discount; it must never spread
  // that discount to the remaining positions a second time.
  order.roundingAdjustment=(moneyCents(order.roundingAdjustment)-moneyCents(item.roundingAllocation))/100;
  item.removed=true;
  item.removedAmount=amount;
  item.removedReason=reason;
  recordItemRefundChange(item,refund,{seller:getCurrentSeller(),createdAt:new Date().toISOString(),reason});
  item.refundableAmount=itemPaidBefore;
  item.refundRecordedAt=refund>0?new Date().toISOString():'';
  item.refundSeller=refund>0?getCurrentSeller():'';
  item.refundPaymentMethod='cash';
  item.paidAmount=0;
  order.overpayment=Math.max(0,Number(order.overpayment)||0)+Math.max(0,itemPaidBefore-refund);
  recalcOrderFinancials(order);
  const now=new Date();
  const pad=n=>String(n).padStart(2,'0');
  order.events=Array.isArray(order.events)?order.events:[];
  order.events.push({
    date:pad(now.getDate())+'.'+pad(now.getMonth()+1)+'.'+now.getFullYear(),
    time:pad(now.getHours())+':'+pad(now.getMinutes()),
    seller:getCurrentSeller(),
    text:'Удалена позиция',
    detail:item.name+' · '+reason+(refund>0?' · Возврат из кассы':' · Без возврата из кассы'),
    amount:refund>0?'− '+money0(refund):''
  });
  if(refund>0){
    order.events.push({
      date:pad(now.getDate())+'.'+pad(now.getMonth()+1)+'.'+now.getFullYear(),
      time:pad(now.getHours())+':'+pad(now.getMinutes()),
      seller:getCurrentSeller(),
      text:'Возврат из кассы',
      createdAt:now.toISOString(),paymentMethod:'cash',
      detail:item.name+' · '+reason,
      amount:'− '+money0(refund)
    });
  }
  saveOrderHistory(order);
  closeRemoveItemModal();
  renderOrders();
  renderHomeDashboard();
  renderSalesJournal();
  if((order.items||[]).some(i=>!i.removed)){
    openOrderHistory(order.id);
  }else{
    closeOrderHistory();
    toast('Все позиции заказа удалены — заказ убран из раздела «Заказы».','ok','Заказ #'+order.id);
  }
}
function ensureOrderItemPayments(order){
  const active=(order.items||[]).filter(i=>!i.removed);
  const netPaid=Array.isArray(order.payments)
    ? Math.max(0,moneyCents(getOrderPaymentLedgerTotal(order))-moneyCents(getOrderRefundTotal(order)))
    : moneyCents(order.paid);
  let left=netPaid;
  let changed=false;
  // paidAmount describes where real money is allocated, not a second ledger.
  // Preserve existing allocations first, then apply released/legacy credit.
  active.forEach(item=>{
    const next=Math.min(moneyCents(item.paidAmount),moneyCents(getItemEffectiveTotal(item)),left);
    if(item.paidAmount!==next/100){item.paidAmount=next/100;changed=true;}
    left-=next;
  });
  active.forEach(item=>{
    const part=Math.min(left,moneyCents(getItemRemaining(item)));
    if(part>0){item.paidAmount=(moneyCents(item.paidAmount)+part)/100;left-=part;changed=true;}
    if(getItemPaid(item)>0 && !item.discountLocked){item.discountLocked=true;changed=true;}
  });
  active.forEach(item=>{
    const qty=Math.max(0,Number(item.qty)||0);
    if(!Number.isFinite(Number(item.receivedQty))) { item.receivedQty=['stock','notified','partial_taken','taken'].includes(item.status)?qty:0; changed=true; }
    if(!Number.isFinite(Number(item.issuedQty))) { item.issuedQty=item.status==='taken'?qty:(item.status==='partial_taken'?Math.min(qty,1):0); changed=true; }
    item.receivedQty=Math.max(0,Math.min(qty,Number(item.receivedQty)||0));
    item.issuedQty=Math.max(0,Math.min(Number(item.receivedQty)||0,Number(item.issuedQty)||0));
  });
  return changed;
}
function getItemPaid(item){return moneyAmount(item?.paidAmount)}
function getItemRemaining(item){return Math.max(0,moneyCents(getItemEffectiveTotal(item))-moneyCents(getItemPaid(item)))/100;}
function getItemQty(item){return Math.max(0,Number(item?.qty)||0)}
function getItemReceivedQty(item){
  const qty=getItemQty(item); const explicit=Number(item?.receivedQty);
  if(Number.isFinite(explicit))return Math.max(0,Math.min(qty,explicit));
  return ['stock','notified','partial_taken','taken'].includes(getOrderItemStatus(item))?qty:0;
}
function getItemIssuedQty(item){
  const received=getItemReceivedQty(item); const explicit=Number(item?.issuedQty);
  if(Number.isFinite(explicit))return Math.max(0,Math.min(received,explicit));
  return getOrderItemStatus(item)==='taken'?received:(getOrderItemStatus(item)==='partial_taken'?Math.min(received,1):0);
}
function getItemOnStockQty(item){return Math.max(0,getItemReceivedQty(item)-getItemIssuedQty(item))}
function getItemExpectedQty(item){return Math.max(0,getItemQty(item)-getItemReceivedQty(item))}
function setItemIssueQty(item,qty){
  const next=Math.max(0,Math.min(getItemReceivedQty(item),Math.floor(Number(qty)||0)));
  item.issuedQty=next;
  if(next>=getItemQty(item)) item.status='taken';
  else if(next>0) item.status='partial_taken';
  else item.status=getItemReceivedQty(item)>0?(item.status==='notified'?'notified':'stock'):'transit';
  return next;
}
function getOrderItemsSubtotal(order){return (order.items||[]).filter(i=>!i.removed).reduce((sum,item)=>sum+moneyCents(orderItemFinalTotal(item)),0)/100;}
function ensureOrderRoundingAllocation(order){
  const active=(order.items||[]).filter(i=>!i.removed);
  const subtotal=active.reduce((sum,item)=>sum+moneyCents(orderItemFinalTotal(item)),0);
  const storedTotal=Number(order.total);
  if(!Number.isFinite(Number(order.roundingAdjustment))){
    order.roundingAdjustment=Number.isFinite(storedTotal)&&moneyCents(storedTotal)<=subtotal?(subtotal-moneyCents(storedTotal))/100:0;
  }
  let target=Math.min(subtotal,moneyCents(order.roundingAdjustment));
  const shares=active.map(item=>Math.min(moneyCents(orderItemFinalTotal(item)),moneyCents(item.roundingAllocation)));
  const allocated=shares.reduce((sum,value)=>sum+value,0);
  // Existing shares are stable. When their position is removed or its price is
  // reduced, its discount cannot move to other goods and create another credit.
  if(order.roundingAllocationVersion===1)target=Math.min(target,allocated);
  let remaining=target;
  active.forEach((item,index)=>{
    const share=Math.min(shares[index],remaining);
    item.roundingAllocation=share/100;
    remaining-=share;
  });
  if(remaining>0){
    const distribute=(unpaidOnly)=>{
      const capacities=active.map(item=>Math.max(0,moneyCents(orderItemFinalTotal(item))-moneyCents(item.roundingAllocation)-(unpaidOnly?moneyCents(getItemPaid(item)):0)));
      let capacityLeft=capacities.reduce((sum,value)=>sum+value,0);
      active.forEach((item,index)=>{
        const capacity=capacities[index];
        const part=capacityLeft>0?Math.min(capacity,Math.floor(remaining*capacity/capacityLeft)):0;
        item.roundingAllocation=(moneyCents(item.roundingAllocation)+part)/100;
        remaining-=part;capacityLeft-=capacity;
      });
    };
    distribute(true);
    if(remaining>0)distribute(false);
  }
  order.roundingAllocationVersion=1;
  order.roundingAdjustment=(target-remaining)/100;
  order.total=(subtotal-target+remaining)/100;
}
function getItemEffectiveTotal(item){return Math.max(0,moneyCents(orderItemFinalTotal(item))-moneyCents(item?.roundingAllocation))/100;}
function getOrderPaymentLedgerTotal(order){
  const payments=Array.isArray(order?.payments)?order.payments:[];
  return payments.reduce((sum,p)=>sum+moneyCents(p?.paymentAmount??p?.amount),0)/100;
}
function getOrderRefundTotal(order){
  return (order?.items||[]).reduce((sum,item)=>sum+moneyCents(getItemRefundTotal(item)),0)/100;
}
function getItemRefundTotal(item){
  if(!Array.isArray(item?.refundLedger))return moneyAmount(item?.refundAmount);
  const total=item.refundLedger.reduce((sum,entry)=>{
    const value=Number(entry?.amount);
    return sum+(Number.isFinite(value)?Math.round(value*100):0);
  },0);
  return Math.max(0,total)/100;
}
function recordItemRefundChange(item,amount,details={}){
  const before=moneyCents(getItemRefundTotal(item));
  const after=moneyCents(amount);
  if(!Array.isArray(item.refundLedger)){
    item.refundLedger=before>0?[{id:'legacy_refund',amount:before/100,createdAt:item.refundRecordedAt||'',seller:item.refundSeller||'',paymentMethod:item.refundPaymentMethod||'cash'}]:[];
  }
  if(after!==before)item.refundLedger.push({id:'r_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),amount:(after-before)/100,createdAt:details.createdAt||new Date().toISOString(),seller:details.seller||'',paymentMethod:'cash',reason:details.reason||''});
  item.refundAmount=after/100;
}
function getMaxItemRefund(order,item){
  const current=moneyCents(getItemRefundTotal(item));
  const entitlement=Math.max(moneyCents(item.refundableAmount),moneyCents(getItemPaid(item))+current);
  const available=Math.max(0,moneyCents(getOrderPaymentLedgerTotal(order))-moneyCents(getOrderRefundTotal(order))+current);
  return Math.min(entitlement,available)/100;
}
function recalcOrderFinancials(order){
  ensureOrderRoundingAllocation(order);
  (order.items||[]).forEach(item=>{if(Array.isArray(item.refundLedger))item.refundAmount=getItemRefundTotal(item);});
  const ledger=moneyCents(getOrderPaymentLedgerTotal(order));
  const refunds=moneyCents(getOrderRefundTotal(order));
  const netPaid=Math.max(0,ledger-refunds);
  order.paid=netPaid/100;
  order.overpayment=Math.max(0,netPaid-moneyCents(order.total))/100;
  order.debt=Math.max(0,moneyCents(order.total)-netPaid)/100;
  ensureOrderItemPayments(order);
}
function applyOrderDiscountToItems(order,selected,pct){
  let changed=0,locked=0,cancelled=0;
  selected.forEach(i=>{
    const item=order.items[i];if(!item||item.removed)return;
    const price=Math.max(0,Number(item.price)||0),qty=Math.max(0,Number(item.qty)||0);
    const currentPct=Math.max(0,Number(item.discountPct)||0);
    const paidBefore=getItemPaid(item);
    if(pct===0){
      if(currentPct<=0){locked++;return;}
      const beforeUnit=price,beforeDiscount=price*currentPct/100;
      item.discountPct=0;item.discountAmount=0;delete item.legacyLineRounding;item.total=moneyAmount(price*qty);
      item.discountHistory=Array.isArray(item.discountHistory)?item.discountHistory:[];
      item.discountHistory.unshift({at:new Date().toISOString(),seller:getCurrentSeller(),from:currentPct,to:0,beforePrice:Math.max(0,beforeUnit-beforeDiscount),afterUnitPrice:beforeUnit});
      // Once a discount has been explicitly used, cancelling it is the final state:
      // the same position must not receive another discount later in this order.
      item.discountLocked=true;
      item.discountCancelledAt=new Date().toISOString();
      changed++;cancelled++;
      return;
    }
    if(currentPct>0||item.discountLocked){locked++;return;}
    const beforeUnit=price,newDiscount=price*pct/100;
    item.discountPct=pct;item.discountAmount=newDiscount;delete item.legacyLineRounding;item.total=moneyAmount((price-newDiscount)*qty);
    item.discountHistory=Array.isArray(item.discountHistory)?item.discountHistory:[];
    item.discountHistory.unshift({at:new Date().toISOString(),seller:getCurrentSeller(),from:0,to:pct,beforePrice:beforeUnit,afterUnitPrice:Math.max(0,beforeUnit-newDiscount)});
    if(getItemPaid(item)>0)item.discountLocked=true;
    changed++;
  });
  recalcOrderFinancials(order);
  return {changed,locked,tooMuchPaid:0,discountCredit:0,cancelled};
}
function persistOrderAfterChange(order,text,openAfter=true){
  const now=new Date(),pad=n=>String(n).padStart(2,'0');order.events=Array.isArray(order.events)?order.events:[];
  order.events.push({date:pad(now.getDate())+'.'+pad(now.getMonth()+1)+'.'+now.getFullYear(),time:pad(now.getHours())+':'+pad(now.getMinutes()),seller:getCurrentSeller(),text,detail:'',amount:''});
  saveOrderHistory(order);const dynamic=getClientOrders();const idx=dynamic.findIndex(o=>String(o.id)===String(order.id));if(idx>=0){dynamic[idx]=order;saveClientOrders(dynamic)}
  renderOrders();renderSalesJournal();renderHomeDashboard();if(openAfter)openOrderHistory(order.id);
}
function applyOrderDiscount(){
  const body=document.getElementById('orderHistoryBody'),orderId=body?.dataset.orderId;if(!orderId)return;const order=getOrderHistory(orderId);if(!order)return;ensureOrderItemPayments(order);
  const selected=[...body.querySelectorAll('[data-discount-item]:checked')].map(x=>Number(x.dataset.discountItem)).filter(Number.isInteger);
  if(!selected.length){toast('Выберите товары галочками для применения скидки.','error');return;}
  const typeValue=body.querySelector('#orderDiscountType')?.value||'0';
  let pct=Number(typeValue);if(typeValue==='manual')pct=Number(body.querySelector('#orderDiscountManual')?.value||0);pct=Math.min(100,Math.max(0,pct));
  if(typeValue==='manual'&&pct<=0){toast('Укажите размер скидки.','error');return;}
  const isCancel=pct===0;
  const detailsText=isCancel
    ? 'Скидка будет отменена у '+selected.length+' выбранных позиций. Если позиция уже была оплачена, её оплаченная сумма сохранится, а оставшийся долг будет пересчитан.'
    : 'Скидка '+pct+'% будет применена к '+selected.length+' выбранным позициям. Уже зафиксированные скидки не изменятся.';
  showActionConfirm('discount',()=>{
    const current=getOrderHistory(order.id);if(!current)return;
    const result=applyOrderDiscountToItems(current,selected,pct);recalcOrderFinancials(current);
    const details=[];
    if(result.cancelled)details.push('Скидка отменена у '+result.cancelled+' позиций.');
    if(result.changed-result.cancelled>0)details.push('Применена скидка '+pct+'% к '+(result.changed-result.cancelled)+' позициям.');
    if(result.locked)details.push(result.locked+' позиций пропущено — изменить их текущую скидку нельзя.');
    persistOrderAfterChange(current,isCancel?'Отменена скидка товаров':'Изменена скидка товаров'); toast(details.join(' '),result.changed?'ok':'error','Изменение скидки');
  },detailsText);
}
function applySingleOrderItemDiscount(index){
  const body=document.getElementById('orderHistoryBody'),orderId=body?.dataset.orderId;if(!orderId)return;const order=getOrderHistory(orderId);if(!order)return;ensureOrderItemPayments(order);
  const type=body.querySelector(`[data-item-discount-type="${index}"]`),manual=body.querySelector(`[data-item-discount-manual="${index}"]`);const typeValue=type?.value||'0';let pct=Number(typeValue);if(typeValue==='manual')pct=Number(manual?.value||0);pct=Math.min(100,Math.max(0,pct));
  if(typeValue==='manual'&&pct<=0){toast('Укажите размер скидки.','error');return;}
  const isCancel=pct===0;
  showActionConfirm('discount',()=>{
    const current=getOrderHistory(order.id);if(!current)return;
    const result=applyOrderDiscountToItems(current,[index],pct);if(!result.changed){toast(result.locked?(isCancel?'У товара уже нет скидки для отмены.':'Скидка уже применена к этому товару.'):'Скидку изменить нельзя.','error');return;}
    persistOrderAfterChange(current,isCancel?'Отменена скидка товара':'Изменена скидка товара');toast(isCancel?'Скидка отменена у товара':'Скидка '+pct+'% применена к товар','ok',isCancel?'Скидка отменена':'Скидка применена');
  },isCancel?'Скидка будет отменена у товара «'+(order.items[index]?.name||'товар')+'».':'Скидка '+pct+'% будет применена к товару «'+(order.items[index]?.name||'товар')+'».');
}
function recordOrderPayment(orderId){
  const order=getOrderHistory(orderId); if(!order)return;
  ensureOrderItemPayments(order);
  const selected=[...document.querySelectorAll('#orderHistoryBody [data-pay-item]:checked')].map(x=>Number(x.dataset.payItem)).filter(Number.isInteger);
  if(!selected.length){toast('Выберите хотя бы один товар для оплаты.','error');return;}
  const amount=Math.max(0,Number(document.getElementById('orderPaymentAmount')?.value)||0);
  if(amount<=0){toast('Укажите сумму оплаты.','error');return;}
  const method=document.querySelector('#orderHistoryBody [data-order-pay-method].active')?.dataset.orderPayMethod||'cash';
  const available=selected.reduce((sum,i)=>sum+(order.items[i]?getItemRemaining(order.items[i]):0),0);
  const selectedLabel=selected.length===1?'1 позицию':selected.length+' позиции';
  const rounding=getPaymentRoundingDiscount(order,amount,selected);
  const detail=`Внести ${money0(amount)} · ${method==='card'?'карта':'наличные'} · выбрано: ${selectedLabel}.${rounding>0?' Разница '+money0(rounding)+' ₽ будет оформлена как скидка за округление — долг клиента не останется.':amount>order.debt+0.001?' Остаток сверх долга всего заказа сохранится как переплата.':amount>available+0.001?' Излишек закроет долг по другим позициям заказа.':''}`;
  showActionConfirm('payment',()=>recordOrderPaymentNow(orderId),detail);
}

function recordOrderPaymentNow(orderId){
  const order=getOrderHistory(orderId);if(!order)return;
  ensureOrderItemPayments(order);
  const selected=[...document.querySelectorAll('#orderHistoryBody [data-pay-item]:checked')].map(x=>Number(x.dataset.payItem)).filter(Number.isInteger);
  if(!selected.length){toast('Выберите хотя бы один товар для оплаты.','error');return;}
  const amount=Math.max(0,moneyValue(document.getElementById('orderPaymentAmount')?.value));
  if(amount<=0){toast('Укажите сумму оплаты.','error');return;}
  const method=document.querySelector('#orderHistoryBody [data-order-pay-method].active')?.dataset.orderPayMethod||'cash';
  const rounding=getPaymentRoundingDiscount(order,amount,selected);
  const now=new Date(),pad=n=>String(n).padStart(2,'0');
  const date=pad(now.getDate())+'.'+pad(now.getMonth()+1)+'.'+now.getFullYear(),time=pad(now.getHours())+':'+pad(now.getMinutes()),seller=getCurrentSeller(),createdAt=now.toISOString();
  const appliedRounding=applyPaymentRoundingDiscount(order,rounding,selected);
  const payment=addOrderPayment(order,amount,method,seller,date,time,createdAt,selected);
  if(appliedRounding>0){
    order.events=Array.isArray(order.events)?order.events:[];
    order.events.push({date,time,createdAt,seller,text:'Скидка за округление при оплате',detail:'Клиент внес '+money0(amount)+' ₽ вместо '+money0(amount+appliedRounding)+' ₽. Разница списана как скидка за округление.',amount:'− '+money0(appliedRounding)});
  }
  order.events=Array.isArray(order.events)?order.events:[];
  order.events.push({date,time,createdAt,seller,text:'Получена оплата',paymentType:payment.paymentType,paymentAmount:payment.paymentAmount,paymentMethod:payment.paymentMethod,detail:payment.paymentType+' · '+(method==='card'?'карта':'наличные')+'.',amount:money0(payment.amount)});
  if(order.debt<=0.001){
    order.events.push({date,time,createdAt,seller,text:'Заказ оплачен',detail:'Долг закрыт. Фактически внесено: '+money0(payment.amount)+'.',amount:money0(payment.amount),paymentAmount:payment.paymentAmount,paymentMethod:payment.paymentMethod});
  }
  saveOrderHistory(order);renderOrders();renderSalesJournal();openOrderHistory(order.id);toast('Оплата '+money0(payment.amount)+' внесена','ok','Оплата записана');
}
function toggleAllOrderPaymentChecks(box){
  document.querySelectorAll('#orderHistoryBody [data-pay-item]:not(:disabled)').forEach(x=>x.checked=box.checked);
  updateOrderPaymentAmount();
}
function toggleAllOrderDiscountChecks(box){
  document.querySelectorAll('#orderHistoryBody [data-discount-item]:not(:disabled)').forEach(x=>x.checked=box.checked);
  updateOrderDiscountInfo();
}
function syncOrderSelectAllCheckbox(){
  const body=document.getElementById('orderHistoryBody'); if(!body)return;
  const master=body.querySelector('#orderSelectAll'); if(!master)return;
  const boxes=[...body.querySelectorAll('[data-pay-item]:not(:disabled)')];
  const checked=boxes.filter(x=>x.checked).length;
  if(!master.hasAttribute('data-keep-enabled')) master.disabled=boxes.length===0;
  master.checked=boxes.length>0 && checked===boxes.length;
  master.indeterminate=checked>0 && checked<boxes.length;
}
function updateOrderPaymentAmount(){
  const orderId=document.getElementById('orderHistoryBody')?.dataset.orderId;if(!orderId)return;const order=getOrderHistory(orderId);if(!order)return;ensureOrderItemPayments(order);
  const selected=[...document.querySelectorAll('#orderHistoryBody [data-pay-item]:checked')].map(x=>Number(x.dataset.payItem));
  const total=selected.reduce((sum,i)=>sum+(order.items[i]?getItemRemaining(order.items[i]):0),0);const input=document.getElementById('orderPaymentAmount');if(input)input.value=total>0?String(Math.round(total*100)/100):'0';
  const info=document.getElementById('orderPaymentSelected');if(info)info.textContent=selected.length?`Выбрано позиций: ${selected.length} · к оплате ${money0(total)}`:'Выберите товары галочками';
  const discountHint=document.getElementById('orderPaymentDiscountHint');
  if(discountHint){
    // After any previously applied order discount, do not suggest another 5% discount.
    discountHint.classList.toggle('hidden',getOrderDiscountSummary(order).everApplied);
    const value=discountHint.querySelector('b');
    if(value) value.textContent=selected.length&&total>0?money0(total*0.95):'—';
  }
  syncOrderSelectAllCheckbox();
}
function updateOrderDiscountInfo(){
  const body=document.getElementById('orderHistoryBody');if(!body)return;
  const orderId=body.dataset.orderId;
  const order=orderId?getOrderHistory(orderId):null;
  const selected=[...body.querySelectorAll('[data-discount-item]:checked')];
  const locked=selected.filter(x=>x.disabled).length;
  const eligible=selected.filter(x=>!x.disabled).length;
  const info=body.querySelector('#orderDiscountSelected');
  if(info)info.textContent=selected.length?`Выбрано: ${selected.length} · можно изменить скидку: ${eligible}`:'Выберите товары галочками';
  const preview=body.querySelector('#orderDiscountPreview');
  if(preview){
    const label=preview.querySelector('span');
    const value=preview.querySelector('b');
    const typeValue=body.querySelector('#orderDiscountType')?.value||'0';
    let pct=Number(typeValue);
    if(typeValue==='manual')pct=Number(body.querySelector('#orderDiscountManual')?.value||0);
    pct=Math.min(100,Math.max(0,pct));
    if(order && selected.length && pct>0){
      let base=0,after=0;
      selected.forEach(box=>{
        const idx=Number(box.dataset.discountItem);
        const item=order.items?.[idx];
        if(!item||item.removed)return;
        const qty=Math.max(0,Number(item.qty)||0);
        const price=Math.max(0,Number(item.price)||0);
        const currentDiscount=Math.max(0,Number(item.discountAmount)||0);
        const currentUnit=Math.max(0,price-currentDiscount);
        const currentTotal=Math.max(0,Number(item.total)||currentUnit*qty);
        const canChange=!box.disabled;
        base += canChange ? price*qty : currentTotal;
        after += canChange ? Math.max(0,(price-price*pct/100)*qty) : currentTotal;
      });
      const saving=Math.max(0,base-after);
      if(label)label.textContent=`После скидки ${pct}%`;
      if(value)value.innerHTML=`${money0(after)}<small>экономия ${money0(saving)}</small>`;
      preview.classList.add('has-value');
    }else{
      if(label)label.textContent='Сумма после скидки';
      if(value)value.innerHTML='—';
      preview.classList.remove('has-value');
    }
  }
  syncOrderSelectAllCheckbox();
}
function getOrderDiscountSummary(order){
  const active=(order.items||[]).filter(item=>!item.removed);
  const everApplied=(order.items||[]).some(item=>
    Number(item.discountPct)>0||Number(item.discountAmount)>0||
    (Array.isArray(item.discountHistory)&&item.discountHistory.some(entry=>Number(entry.to)>0))
  );
  let cents=0, count=0;
  active.forEach(item=>{
    const pct=Math.max(0,Number(item.discountPct)||0);
    const price=Math.max(0,Number(item.price)||0);
    const unitDiscount=Math.max(0,Number(item.discountAmount)||0);
    if(pct>0){
      count++;
      const qty=Math.max(0,Number(item.qty)||0);
      cents+=moneyCents(Math.min(price,unitDiscount||price*pct/100)*qty);
    }
  });
  return {amount:cents/100,count,everApplied};
}
function openOrderHistory(id){
  const order=getOrderHistory(id);
  if(!order){toast('Не удалось найти заказ','error','Заказ не найден');return;}
  const archived=getCompletedOrdersSafeForHistory(id)!==null;
  const statusChanged=archived?false:normalizeOrderStatuses(order);
  const itemPaymentChanged=ensureOrderItemPayments(order);
  if(!archived && (statusChanged||itemPaymentChanged)){
    saveOrderHistory(order);
  }
  document.getElementById('orderHistoryTitle').textContent='Заказ #'+order.id;
  document.getElementById('orderHistorySub').innerHTML=escapeHtml(order.client)+' · '+escapeHtml(order.car)+' · '+sellerMark(order.seller,'mini');
  const body=document.getElementById('orderHistoryBody');body.dataset.orderId=String(order.id);body.classList.toggle('order-history-archived',archived);
  const aggregate=getOrderAggregateStatus(order)||{value:'empty',label:'Без активных позиций',cls:'status-arrived'};
  const activeItems=order.items.filter(item=>!item.removed);
  const discountSummary=getOrderDiscountSummary(order);
  const statusCounts={transit:0,stock:0,notified:0,taken:0,partial_taken:0};
  let totalExpected=0,totalStock=0,totalIssued=0;
  activeItems.forEach(i=>{
    const st=getOrderItemStatus(i);
    statusCounts[st]=(statusCounts[st]||0)+1;
    totalExpected+=getItemExpectedQty(i); totalStock+=getItemOnStockQty(i); totalIssued+=getItemIssuedQty(i);
  });
  const statusDetail=`<div class="order-status-detail"><span>📦 ${totalExpected} ожидается</span><span>🏬 ${totalStock} на складе · готово к выдаче</span><span>✓ ${totalIssued} выдано</span>${statusCounts.partial_taken?`<span>◐ ${statusCounts.partial_taken} частично</span>`:''}</div>`;
  const selectedPaid=activeItems.reduce((s,i)=>s+getItemRemaining(i),0);
  const items=order.items.map((item,i)=>{
    const pct=Math.max(0,Number(item.discountPct)||0),qty=Math.max(0,Number(item.qty)||0),d=Math.max(0,Number(item.discountAmount)||0),before=Math.max(0,Number(item.price)||0),after=pct>0?Math.max(0,before-d):before,positionTotal=orderItemFinalTotal(item),itemPaid=getItemPaid(item),remaining=getItemRemaining(item);
    if(item.removed)return `<div class="order-item-card is-removed"><div class="order-item-primary"><div class="order-item-headline"><span class="order-item-number">${i+1}</span><div class="order-item-title"><b>${escapeHtml(item.name||'Деталь')}</b><small>Артикул: ${escapeHtml(item.article||'—')}</small></div></div><div class="order-removed-block"><b>Позиция удалена</b>Причина: ${escapeHtml(item.removedReason||'Не указана')}<br>${Number(item.refundAmount||0)>0?'Возврат: '+money0(item.refundAmount):'Возврата не было'} ${Number(item.refundAmount||0)>0?`<button class="order-return-edit-btn" data-edit-order-return="${escapeHtml(String(order.id))}" data-edit-return-index="${i}">Изменить</button>`:''}</div></div><div class="order-item-status-box"><div class="order-status-box-top"><span class="order-status-box-icon">×</span><div><small>Состояние позиции</small><b>Удалена</b><span>Не участвует в заказе</span></div></div></div><div class="order-item-right"><div class="order-item-money"><div class="order-money-main"><small>Было к оплате</small><b>${money0(item.removedAmount||positionTotal)}</b></div></div><div class="order-item-paycol"><div class="pay-state">Позиция больше не участвует в расчёте заказа.</div></div></div></div>`;
    const locked=Boolean(item.discountLocked);
    const discountEditor=archived
      ? `<div class="order-item-controls"><span class="mini-action" style="cursor:default;color:#64748b;background:#f8fafc;border-color:#e2e8f0">🔒 Архивный заказ</span></div>`
      : (locked&&pct>0?`<div class="order-item-controls"><span class="mini-action locked-discount">🔒 Скидка ${pct}% зафиксирована</span><button type="button" class="mini-action cancel-discount" data-cancel-item-discount="${i}">Отменить скидку</button></div>`:locked?`<div class="order-item-controls"><span class="mini-action locked-discount neutral">✓ Без скидки зафиксировано</span></div>`:`<div class="order-item-controls discount-editor"><span class="control-label">Скидка</span><select data-item-discount-type="${i}"><option value="0">Без скидки</option><option value="5">5%</option><option value="10">10%</option><option value="manual">Своя %</option></select><input data-item-discount-manual="${i}" type="number" min="0" max="100" step="0.01" placeholder="%"><button type="button" class="mini-action apply-discount" data-apply-item-discount="${i}">Применить</button></div>`);
    const payCheck=archived
      ? `<div class="select-pay disabled"><span>✓ Заказ завершён</span></div>`
      : (remaining>0?`<label class="select-pay"><input type="checkbox" data-pay-item="${i}"><span>Выбрать для оплаты</span></label>`:`<div class="select-pay disabled"><span>✓ Полностью оплачено</span></div>`);
    const itemStatus=getOrderItemStatus(item);
    const statusMeta={
      transit:{icon:'↗',label:'В пути',note:'Ожидается поступление'},
      stock:{icon:'✓',label:'На складе',note:'Готово к выдаче'},
      notified:{icon:'✓',label:'Уведомлен',note:'Клиент уведомлён'},
      partial_taken:{icon:'◐',label:'Частично забрал',note:'Выдана часть позиции'},
      taken:{icon:'✓',label:'Выдан',note:'Позиция полностью выдана'}
    }[itemStatus]||{icon:'•',label:itemStatus||'—',note:'Текущее состояние'};
    const qtyParts=`<div class="order-item-metrics"><span><b>${qty}</b> заказано</span><span><b>${getItemReceivedQty(item)}</b> пришло</span><span><b>${getItemOnStockQty(item)}</b> на складе</span><span><b>${getItemIssuedQty(item)}</b> выдано</span>${getItemExpectedQty(item)>0?`<span class="pending"><b>${getItemExpectedQty(item)}</b> ожидается</span>`:''}</div>`;
    return `<div class="order-item-card ${remaining<=0?'is-paid':''}">
      <div class="order-item-primary">
        <div class="order-item-headline"><span class="order-item-number">${i+1}</span><div class="order-item-title"><b>${escapeHtml(item.name||'Деталь')}</b><small>Артикул: ${escapeHtml(item.article||'—')}</small></div></div>
        ${qtyParts}
        <div class="order-item-price-row"><span>Цена за шт. <b>${money0(before)}</b></span><span class="after">После скидки <b>${money0(after)}</b></span>${pct>0?`<span class="discount">−${pct}% · −${money0(d)} / шт.</span>`:''}</div>
        ${discountEditor}
      </div>
      <div class="order-item-status-box ${itemStatus}">
        <div class="order-status-box-top"><span class="order-status-box-icon">${statusMeta.icon}</span><div><small>Состояние позиции</small><b>${statusMeta.label}</b><span>${statusMeta.note}</span></div></div>
        ${archived?`<div class="order-item-status-value ${orderItemStatusClass(itemStatus)}">${escapeHtml(statusMeta.label)}</div>`:`<select class="order-item-status-select ${orderItemStatusClass(itemStatus)}" data-order-item-status="${escapeHtml(String(order.id))}" data-item-index="${i}">${orderItemStatusOptions(itemStatus)}</select>`}
        <div class="order-item-status-progress"><span style="width:${qty?Math.min(100,(getItemIssuedQty(item)/qty)*100):0}%"></span></div>
      </div>
      <div class="order-item-right">
        <div class="order-item-money">
          <div class="order-money-main"><small>К оплате</small><b>${money0(getItemEffectiveTotal(item))}</b></div>
          ${Number(item.roundingAllocation)>0?`<div class="money-line"><span>Округление</span><b class="remain">−${money0(item.roundingAllocation)}</b></div>`:''}
          <div class="money-line"><span>Оплачено</span><b class="paid">${money0(itemPaid)}</b></div>
          <div class="money-line"><span>Осталось</span><b class="remain">${money0(remaining)}</b></div>
          <div class="order-item-payment-state">${remaining>0?'Есть остаток к оплате':'Оплата позиции закрыта'}</div>
        </div>
        <div class="order-item-paycol">
          ${payCheck}
          <div class="pay-state">${remaining>0?'Отметьте позицию для оплаты':'Позиция полностью оплачена'}</div>
          ${archived?'':'<div class="order-item-controls remove-row"><button class="mini-action danger-lite" type="button" data-remove-order-item="'+escapeHtml(String(order.id))+'" data-remove-item-index="'+i+'">Удалить позицию</button></div>'}
        </div>
      </div>
    </div>`;
  }).join('');
  const events=(order.events||[]).slice().reverse().map(ev=>`<div class="event"><time>${escapeHtml(ev.date)}<br>${escapeHtml(ev.time)}</time><div><b>${escapeHtml(ev.text)}</b><small>${escapeHtml(ev.detail||'')} · ${sellerMark(ev.seller,'mini')}</small></div><div class="amount">${ev.amount?escapeHtml(ev.amount):''}</div></div>`).join('');
  const ready=isOrderReadyToComplete(order);
  const completionBar=archived
    ? `<div class="order-complete-bar ready"><div><b>✓ Заказ завершён и находится в Истории</b><small>Этот заказ уже закрыт и повторному удалению не подлежит.</small></div></div>`
    : (ready?'<div class="order-complete-bar ready"><div><b>Заказ готов к удалению</b><small>Все позиции выданы клиенту и заказ полностью оплачен. После удаления он будет перемещён в «История».</small></div><button class="btn danger" type="button" id="completeOrderBtn">🗑 Удалить и отправить в историю</button>':'<div class="order-complete-bar"><div><b>Заказ ещё не готов к удалению</b><small>Удаление доступно только после полной оплаты и полной выдачи всех активных позиций.</small></div></div>');
  const orderStatusMeta={
    transit:{icon:'↗',note:'Есть позиции, которые ещё не поступили на склад.'},
    stock:{icon:'✓',note:'Все позиции уже поступили на склад и готовы к дальнейшей выдаче.'},
    notified:{icon:'✓',note:'Заказ собран и отмечен как готовый к выдаче клиенту.'},
    partial_taken:{icon:'◐',note:'Клиент уже забрал часть позиций заказа.'},
    taken:{icon:'✓',note:'Все активные позиции заказа выданы клиенту.'}
  }[aggregate.value]||{icon:'•',note:'Текущее состояние заказа.'};
  body.innerHTML=`<div class="order-status-overview"><div class="order-status-card ${aggregate.value}"><div class="order-status-card-icon">${orderStatusMeta.icon}</div><div class="order-status-card-main"><div class="order-status-card-kicker">Статус заказа</div><div class="order-status-card-label">${escapeHtml(aggregate.label)}</div><div class="order-status-card-note">${escapeHtml(orderStatusMeta.note)}</div></div><div class="order-status-card-side"><small>Позиций</small><b>${activeItems.length}</b></div></div>${statusDetail}</div><div class="order-workspace"><div class="order-main-column"><div class="order-summary-bar"><div class="order-summary-card"><span>Итого</span><b>${money0(order.total)}</b>${Number(order.roundingAdjustment)>0?`<small style="display:block;color:#c47a12;margin-top:3px">Округление −${money0(order.roundingAdjustment)}</small>`:''}</div><div class="order-summary-card paid"><span>Оплачено</span><b>${money0(order.paid)}</b></div><div class="order-summary-card debt"><span>Долг</span><b>${money0(order.debt)}</b></div><div class="order-summary-card"><span>Позиций</span><b>${activeItems.length}</b><small style="display:block;margin-top:6px;color:#6b5a92;line-height:1.35">${discountSummary.count?'Скидка: −'+money0(discountSummary.amount)+' · '+discountSummary.count+' поз.':'Скидка не применена'}</small></div></div><div class="order-panel"><div class="order-panel-head"><div class="order-panel-head-main"><div><b>Позиции заказа</b><span>${activeItems.length} шт. · оплата и статус по каждой позиции</span></div><label class="order-select-all"><input type="checkbox" id="orderSelectAll" ${archived?'disabled':''}><span>Выбрать всё</span></label></div>${archived?'':'<button class="btn" type="button" id="markWholeOrderTaken">✓ Выдан весь заказ</button>'}</div><div class="order-items-list">${items}</div></div>${completionBar}</div><div class="order-side-column">${archived?'<div class="order-side-card"><div class="order-side-title">Архивный заказ</div><div class="order-side-note">Оплата, скидки, удаление позиций и изменение статусов здесь недоступны. Заказ уже завершён.</div></div>':'<div class="order-side-card"><div class="order-side-title">Оплата выбранных позиций</div>'}<input class="order-pay-amount" id="orderPaymentAmount" type="number" min="0" step="0.01" value="0" placeholder="Сумма"><div class="order-pay-method"><button type="button" data-order-pay-method="cash" class="active">💵 Наличные</button><button type="button" data-order-pay-method="card">💳 Карта</button></div><div class="order-selection-bar" id="orderPaymentSelected">Выберите позиции</div><div class="order-payment-discount-hint" id="orderPaymentDiscountHint"><span>Если применить скидку 5%</span><b>—</b></div><div class="order-action-grid" style="margin-top:9px"><button class="btn" type="button" id="orderPayAll">Оплатить весь остаток</button><button class="btn primary" type="button" id="orderPaySelected">Внести оплату</button></div><div class="order-side-note">Сначала оплачиваются выбранные позиции, затем остальные неоплаченные. Сумма сверх долга всего заказа сохраняется как переплата.</div></div><div class="order-side-card"><div class="order-side-title">Скидка выбранным позициям</div><div class="order-discount-box"><select id="orderDiscountType"><option value="0">0% — без скидки / отменить</option><option value="5">5%</option><option value="10">10%</option><option value="manual">Своя %</option></select><input id="orderDiscountManual" type="number" min="0" max="100" step="0.01" placeholder="%" style="display:none"><button class="btn wide" type="button" id="applyOrderDiscount">Применить скидку</button></div><div class="order-selection-bar" id="orderDiscountSelected">Выберите позиции</div><div class="order-discount-preview" id="orderDiscountPreview"><span>Сумма после скидки</span><b>—</b></div><div class="order-side-note">После оплаты обычное изменение скидки фиксируется. Отменить уже установленную скидку до 0% можно отдельно; оплаченная сумма сохраняется, а остаток заказа пересчитывается.</div></div><div class="order-side-card"><div class="order-side-title">Последние действия</div><div class="order-history-compact">${events||'<div style="font-size:11px;color:#8792a1">История пока пуста</div>'}</div></div></div></div>`;
  body.querySelectorAll('[data-pay-item]').forEach(x=>x.addEventListener('change',updateOrderPaymentAmount));
  body.querySelectorAll('[data-discount-item]').forEach(x=>x.addEventListener('change',updateOrderDiscountInfo));
  body.querySelector('#orderSelectAll')?.addEventListener('change',e=>toggleAllOrderPaymentChecks(e.currentTarget));
  body.querySelector('#orderPaySelected')?.addEventListener('click',()=>recordOrderPayment(order.id));
  body.querySelector('#orderPayAll')?.addEventListener('click',()=>{body.querySelectorAll('[data-pay-item]:not(:disabled)').forEach(x=>x.checked=true);updateOrderPaymentAmount();});
  body.querySelector('#applyOrderDiscount')?.addEventListener('click',applyOrderDiscount);
  body.querySelectorAll('[data-apply-item-discount]').forEach(btn=>btn.addEventListener('click',()=>applySingleOrderItemDiscount(Number(btn.dataset.applyItemDiscount))));
  body.querySelectorAll('[data-cancel-item-discount]').forEach(btn=>btn.addEventListener('click',()=>{
    const idx=Number(btn.dataset.cancelItemDiscount);
    const item=order.items[idx];
    if(!item)return;
    showActionConfirm('discount',()=>{
      const current=getOrderHistory(order.id);if(!current)return;
      const result=applyOrderDiscountToItems(current,[idx],0);
      if(!result.changed){toast('Скидка уже отменена или недоступна.','error');return;}
      persistOrderAfterChange(current,'Отменена скидка товара');
      toast('Скидка отменена у товара','ok','Скидка отменена');
    },'Скидка будет отменена у товара «'+(item.name||'товар')+'».');
  }));
  body.querySelectorAll('[data-order-pay-method]').forEach(btn=>btn.addEventListener('click',()=>{body.querySelectorAll('[data-order-pay-method]').forEach(x=>x.classList.remove('active'));btn.classList.add('active')}));
  body.querySelector('#orderDiscountType')?.addEventListener('change',e=>{const el=body.querySelector('#orderDiscountManual');el.style.display=e.target.value==='manual'?'block':'none';updateOrderDiscountInfo()});
  body.querySelector('#orderDiscountManual')?.addEventListener('input',updateOrderDiscountInfo);
  body.querySelectorAll('[data-item-discount-type]').forEach(sel=>sel.addEventListener('change',()=>{const input=body.querySelector(`[data-item-discount-manual="${sel.dataset.itemDiscountType}"]`);if(input)input.style.display=sel.value==='manual'?'block':'none'}));
  body.querySelectorAll('[data-order-item-status]').forEach(sel=>sel.addEventListener('change',()=>{
    const idx=Number(sel.dataset.itemIndex), previous=order.items[idx]?.status||'transit', next=sel.value;
    if(next==='partial_taken'){
      const item=order.items[idx]; const max=getItemReceivedQty(item); const current=getItemIssuedQty(item);
      const details=document.getElementById('actionConfirmModal');
      showActionConfirm('issue-item',()=>{
        const value=Math.max(0,Math.min(max,Math.floor(Number(document.getElementById('orderConfirmPaid')?.value)||0)));
        if(value<=0){toast('Укажите количество выданных штук.','error');return;}
        const currentOrder=getOrderHistory(order.id); if(!currentOrder)return;
        setItemIssueQty(currentOrder.items[idx],value);
        persistOrderAfterChange(currentOrder,'Изменена выдача товара: '+currentOrder.items[idx].name+' · '+value+' из '+getItemQty(currentOrder.items[idx])+' шт.');
        renderOrders();renderDeliveries();renderHomeDashboard();openOrderHistory(order.id);
      },'Укажите, сколько штук клиент забрал. Доступно к выдаче: '+max+' шт.');
    }else{
      showActionConfirm('status',()=>{sel.className='order-item-status-select '+orderItemStatusClass(next);setOrderItemStatus(order.id,idx,next)},'Позиция «'+(order.items[idx]?.name||'товар')+'» будет переведена в новый статус.');
    }
    sel.value=previous; sel.className='order-item-status-select '+orderItemStatusClass(previous);
  }));
  body.querySelectorAll('[data-pay-item]').forEach(x=>{x.dataset.discountItem=x.dataset.payItem;x.addEventListener('change',updateOrderDiscountInfo);});
  body.querySelectorAll('[data-pay-item]').forEach(x=>{x.closest('.select-pay')?.addEventListener('click',e=>{if(e.target.tagName!=='INPUT'&&!x.disabled)x.checked=!x.checked;updateOrderPaymentAmount();updateOrderDiscountInfo();})});
  syncOrderSelectAllCheckbox();
  body.querySelectorAll('.order-item-top').forEach((el,idx)=>{const item=activeItems[idx];});
  body.querySelector('#markWholeOrderTaken')?.addEventListener('click',()=>showActionConfirm('issue-whole-order',()=>{
    const current=getOrderHistory(order.id);
    if(!current)return;
    const active=(current.items||[]).filter(item=>!item.removed);
    if(!active.length){toast('В заказе нет активных позиций','error');return;}
    const now=new Date(),pad=n=>String(n).padStart(2,'0');
    active.forEach(item=>{ item.receivedQty=getItemQty(item); item.issuedQty=getItemQty(item); item.status='taken'; });
    current.events=Array.isArray(current.events)?current.events:[];
    current.events.push({date:pad(now.getDate())+'.'+pad(now.getMonth()+1)+'.'+now.getFullYear(),time:pad(now.getHours())+':'+pad(now.getMinutes()),seller:getCurrentSeller(),text:'Выдан весь заказ',detail:`Все ${active.length} активные позиции отмечены как выданные.`,amount:''});
    persistOrderAfterChange(current,'Выдан весь заказ');
    renderOrders();renderDeliveries();renderHomeDashboard();
    openOrderHistory(current.id);
    toast('Весь заказ отмечен как выданный','ok','Заказ #'+current.id);
  }));
  body.querySelector('#completeOrderBtn')?.addEventListener('click',()=>showActionConfirm('complete-order',()=>{
    if(!isOrderReadyToComplete(getOrderHistory(order.id)||order)){toast('Сначала полностью оплатите и выдайте все позиции заказа.','error','Заказ ещё не готов');return;}
    completeOrder(order.id);
  }));
  updateOrderPaymentAmount();updateOrderDiscountInfo();
  document.getElementById('orderHistoryModal').classList.remove('hidden');
  if(ready && !archived){
    setTimeout(()=>{
      if(document.getElementById('orderHistoryModal')?.classList.contains('hidden'))return;
      if(document.getElementById('actionConfirmModal')?.classList.contains('hidden')){
        showActionConfirm('complete-order',()=>{
          if(!isOrderReadyToComplete(getOrderHistory(order.id)||order)){
            toast('Сначала полностью оплатите и выдайте все позиции заказа.','error','Заказ ещё не готов');
            return;
          }
          completeOrder(order.id);
        });
      }
    },120);
  }
}
function closeOrderHistory(){document.getElementById('orderHistoryModal').classList.add('hidden')}
document.getElementById('closeOrderHistory').onclick=closeOrderHistory;
document.getElementById('closeOrderHistory2').onclick=closeOrderHistory;
document.getElementById('removeItemCancel').onclick=closeRemoveItemModal;
document.getElementById('removeItemConfirm').onclick=confirmRemoveItem;
document.getElementById('orderHistoryBody')?.addEventListener('click',e=>{const edit=e.target.closest('[data-edit-order-return]');if(edit){e.stopPropagation();openReturnEdit('order',edit.dataset.editOrderReturn,Number(edit.dataset.editReturnIndex));return;}const btn=e.target.closest('[data-remove-order-item]');if(btn){e.stopPropagation();openRemoveItemModal(btn.dataset.removeOrderItem,Number(btn.dataset.removeItemIndex));}});
document.getElementById('ordersRows')?.addEventListener('click',e=>{const del=e.target.closest('[data-order-delete]');if(del){e.stopPropagation();deleteOrder(del.dataset.orderDelete);return;}const btn=e.target.closest('[data-order-history]');if(btn){e.stopPropagation();openOrderHistory(btn.dataset.orderHistory)}});

function getReturns(){
  try{const data=JSON.parse(garageStorage.getItem('garageReturns')||'[]');return Array.isArray(data)?data:[]}catch(e){return []}
}
function saveReturns(list){garageStorage.setItem('garageReturns',JSON.stringify(list))}
function todayIso(){return new Date().toISOString().slice(0,10)}
function openStandaloneReturnDetails(id){
  const x=getReturns().find(r=>String(r.id)===String(id));
  if(!x)return;
  const body=document.getElementById('returnDetailsBody');
  if(!body)return;
  body.innerHTML=`
    <div class="order-detail-summary" style="grid-template-columns:repeat(2,1fr)">
      <div class="order-detail-stat"><span>Сумма возврата</span><b style="color:#b53d3d">− ${money0(x.amount)}</b></div>
      <div class="order-detail-stat"><span>Дата и время</span><b>${escapeHtml(x.date||'—')}${x.time?' · '+escapeHtml(x.time):''}</b></div>
      <div class="order-detail-stat"><span>Товар / артикул</span><b>${escapeHtml(x.product||'—')}</b></div>
      <div class="order-detail-stat"><span>Кто оформил</span><b>${sellerMark(x.seller||'','mini')}</b></div>
    </div>
    <div class="order-detail-section">
      <div class="order-detail-title">Причина возврата</div>
      <div style="padding:12px;border:1px solid #e5eaf1;border-radius:11px;background:#f8fafc">${escapeHtml(x.reason||'Причина не указана')}</div>
    </div>
    <div class="order-detail-section">
      <div class="order-detail-title">История изменений</div>
      <div class="order-history-compact">${(Array.isArray(x.history)?x.history:[]).map(h=>`<div class="event"><time>${escapeHtml(h.date||'')}</time><div><b>${escapeHtml(h.action||'Изменение')}</b><small>${sellerMark(h.seller||'','mini')} · ${escapeHtml(h.product||x.product||'')}</small></div><div class="amount">${money0(h.from||0)} → ${money0(h.to||0)}</div></div>`).join('')||'<div style="font-size:11px;color:#8792a1">Изменений пока не было.</div>'}</div>
    </div>
  `;
  document.getElementById('returnDetailsModal')?.classList.remove('hidden');
}
function openReturnModal(){
  returnEditContext=null;
  document.getElementById('returnProductNumber').value='';
  document.getElementById('returnReason').value='';
  document.getElementById('returnAmount').value='';
  document.getElementById('returnConfirm').textContent='Оформить возврат';
  document.querySelector('#returnModal h3').textContent='Возврат';
  document.getElementById('returnModal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('returnProductNumber')?.focus(),30);
}
function openReturnEdit(type,id,index){
  returnEditContext={type,id:String(id),index:Number(index)};
  if(type==='standalone'){
    const x=getReturns().find(r=>String(r.id)===String(id)); if(!x)return;
    document.getElementById('returnProductNumber').value=x.product||'';
    document.getElementById('returnReason').value=x.reason||'';
    document.getElementById('returnAmount').value=moneyValue(x.amount);
  }else{
    const order=getOrderHistory(id),item=order?.items?.[Number(index)]; if(!order||!item)return;
    document.getElementById('returnProductNumber').value=item.article||item.name||'';
    document.getElementById('returnReason').value=item.removedReason||'';
    document.getElementById('returnAmount').value=moneyValue(item.refundAmount||0);
  }
  document.getElementById('returnConfirm').textContent='Сохранить изменения';
  document.querySelector('#returnModal h3').textContent='Изменить возврат';
  document.getElementById('returnModal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('returnAmount')?.focus(),30);
}
function closeReturnModal(){returnEditContext=null;document.getElementById('returnModal').classList.add('hidden')}
function confirmReturn(){
  const product=String(document.getElementById('returnProductNumber').value||'').trim();
  const reason=String(document.getElementById('returnReason').value||'').trim();
  const entered=String(document.getElementById('returnAmount').value||'').trim();
  const requested=/^[-−–—]/.test(entered)?-1:moneyAmount(moneyValue(entered));
  if(!product||!reason||requested<0){
    document.getElementById('returnReason').style.borderColor=reason?'#dfe4eb':'#e5a5a5';
    document.getElementById('returnAmount').style.borderColor=requested>=0?'#dfe4eb':'#e5a5a5';
    return;
  }
  let finalAmount=requested;
  if(returnEditContext?.type==='order'){
    const order=getOrderHistory(returnEditContext.id); const item=order?.items?.[returnEditContext.index]; if(!order||!item)return;
    ensureOrderItemPayments(order); const maxRefund=getMaxItemRefund(order,item); finalAmount=Math.min(requested,maxRefund);
    if(requested>finalAmount+0.001)toast('Сумма возврата уменьшена до суммы, фактически оплаченной по этой позиции: '+money0(finalAmount),'ok','Ограничение возврата');
  }
  const action=()=>{
    const now=new Date(),iso=now.toISOString(),date=now.toLocaleDateString('ru-RU'),time=now.toTimeString().slice(0,5),seller=getCurrentSeller();
    if(returnEditContext?.type==='standalone'){
      const list=getReturns(); const index=list.findIndex(r=>String(r.id)===String(returnEditContext.id)); if(index<0){toast('Возврат не найден','error','Изменение не сохранено');return;}
      const old=list[index]; const history=Array.isArray(old.history)?old.history.slice():[];
      history.unshift({at:iso,date,time,seller,action:'Изменение возврата',from:Number(old.amount)||0,to:finalAmount,product,reason});
      list[index]={...old,product,reason,amount:finalAmount,editedAt:iso,editedBy:seller,history};
      saveReturns(list); closeReturnModal(); renderSalesJournal(); toast('Возврат сохранён','ok','Сумма и причина обновлены'); return;
    }
    if(returnEditContext?.type==='order'){
      const order=getOrderHistory(returnEditContext.id); const item=order?.items?.[returnEditContext.index]; if(!order||!item)return;
      ensureOrderItemPayments(order); const oldRefund=getItemRefundTotal(item); const maxRefund=getMaxItemRefund(order,item); const refund=Math.min(finalAmount,maxRefund); const history=Array.isArray(item.refundHistory)?item.refundHistory.slice():[];
      history.unshift({at:iso,date,time,seller,action:'Изменение возврата',from:oldRefund,to:refund,product,reason}); item.refundHistory=history; recordItemRefundChange(item,refund,{createdAt:iso,seller,reason}); item.removedReason=reason; item.refundRecordedAt=refund>0?iso:''; item.refundSeller=refund>0?seller:''; item.refundPaymentMethod='cash'; if(product&&!item.article)item.article=product;
      // Для удалённой позиции остаток её оплаты живёт как переплата по заказу. При изменении возврата меняем только эту разницу.
      order.overpayment=Math.max(0,(Number(order.overpayment)||0)+oldRefund-refund);
      recalcOrderFinancials(order);
      // Keep the original cash transaction in history; corrections are new
      // signed entries rather than rewriting an earlier seller's transaction.
      const events=Array.isArray(order.events)?order.events:[];
      const delta=(moneyCents(refund)-moneyCents(oldRefund))/100;
      if(delta!==0)events.push({date,time,createdAt:iso,seller,text:'Корректировка возврата',paymentMethod:'cash',detail:item.name+' · '+reason,refundAdjustment:delta,amount:(delta>0?'− ':'+ ')+money0(Math.abs(delta))});
      events.push({date,time,createdAt:iso,seller,text:'Изменён возврат',detail:item.name+' · было '+money0(oldRefund)+' → стало '+money0(refund)+' · '+reason,amount:'− '+money0(refund)});
      order.events=events; saveOrderHistory(order); closeReturnModal(); openOrderHistory(order.id); renderSalesJournal(); return;
    }
    const list=getReturns(),returnNow=new Date(); list.unshift({id:Date.now(),product,reason,amount:finalAmount,seller,date:returnNow.toISOString().slice(0,10),time:returnNow.toTimeString().slice(0,5),createdAt:returnNow.toISOString(),paymentMethod:'cash',history:[]}); saveReturns(list); closeReturnModal(); renderSalesJournal(); toast('Возврат оформлен','ok','Деньги отражены в «Продажах»');
  };
  showActionConfirm('return',action,'Сумма возврата: '+money0(finalAmount)+' · '+product+' · '+reason);
}
function getCompletedOrders(){
  try{
    const raw=JSON.parse(garageStorage.getItem('garageCompletedOrders')||'[]');
    if(!Array.isArray(raw))return [];
    let changed=false;
    const list=raw.map(o=>{const r=normalizeClientOrder(o);if(r?.changed)changed=true;return r?.order||o;}).filter(Boolean);
    if(changed)garageStorage.setItem('garageCompletedOrders',JSON.stringify(list));
    return list;
  }catch(e){return []}
}
function saveCompletedOrders(list){garageStorage.setItem('garageCompletedOrders',JSON.stringify((Array.isArray(list)?list:[]).map(o=>normalizeClientOrder(o)?.order).filter(Boolean)))}
function getArchivedOrderIds(){return new Set(getCompletedOrders().map(o=>String(o.id)))}
function orderHasActiveItems(order){return (order?.items||[]).some(i=>!i.removed);}
function getActiveClientOrders(){
  const archived=getArchivedOrderIds();
  return getClientOrders().map(raw=>getOrderHistory(raw.id)||raw).filter(o=>!archived.has(String(o.id)) && o.status!=='completed' && orderHasActiveItems(o));
}
function renderCompletedOrders(){
  const rows=document.getElementById('completedOrdersRows'); if(!rows)return;
  const q=String(document.getElementById('historySearch')?.value||'').trim().toLowerCase();
  const sellerFilter=document.getElementById('historySeller')?.value||'all';
  const list=getCompletedOrders().map(o=>{ensureOrderItemPayments(o);return o}).slice().sort((a,b)=>String(b.completedAt||'').localeCompare(String(a.completedAt||''))).filter(order=>{
    const items=(order.items||[]); const hay=[order.id,order.client,order.phone,order.car,order.seller,...items.map(i=>i.name),...items.map(i=>i.article||'')].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(sellerFilter==='all'||order.seller===sellerFilter);
  });
  if(!list.length){rows.innerHTML='<div class="history-archive-empty"><div class="history-archive-icon">✓</div><b>История пуста по выбранному фильтру</b><span>Измените поиск или продавца.</span></div>';return;}
  rows.innerHTML=list.map(order=>{
    const items=(order.items||[]).filter(i=>!i.removed); const when=order.completedAt?new Date(order.completedAt):null; const date=when&&!isNaN(when)?when.toLocaleDateString('ru-RU'):''; const time=when&&!isNaN(when)?when.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'';
    const qty=items.reduce((n,i)=>n+getItemQty(i),0);
    return `<div class="row completed-order-row" data-completed-order="${escapeHtml(String(order.id))}"><div><b>#${escapeHtml(String(order.id))} · ${escapeHtml(order.client||'')}</b><small>${escapeHtml(order.car||'Автомобиль не указан')} · ${items.length} поз. · ${qty} шт. · ${sellerMark(order.seller||'','mini')} · завершён ${escapeHtml(date)} ${escapeHtml(time)}</small></div><div class="completed-order-actions"><span class="completed-status-badge">Выдано</span><b>${money0(order.total)}</b><button class="btn" type="button" data-restore-order="${escapeHtml(String(order.id))}">↩ Вернуть в заказы</button><button class="order-history-btn" type="button" data-archive-history="${escapeHtml(String(order.id))}">◷ История</button></div></div>`;
  }).join('');
}
function completeOrder(orderId){
  if(getCompletedOrdersSafeForHistory(orderId)) return;
  const order=getOrderHistory(orderId); if(!order)return;
  if(!isOrderReadyToComplete(order)){toast('Сначала выдайте и полностью оплатите все товары заказа.','error','Заказ ещё не готов');return;}
  const completed=JSON.parse(JSON.stringify(order));
  completed.completedAt=new Date().toISOString();
  completed.completedBy=getCurrentSeller();
  completed.status='completed';
  completed.notificationStatus='completed';
  completed.notifiedAt=completed.notifiedAt||new Date().toISOString();
  const list=getCompletedOrders().filter(o=>String(o.id)!==String(order.id));
  list.unshift(completed);
  saveCompletedOrders(list);
  // Архив является единственным источником истины для завершённого заказа.
  const dynamic=getClientOrders().filter(o=>String(o.id)!==String(order.id));
  saveClientOrders(dynamic);
  const overrides=JSON.parse(garageStorage.getItem('garageOrderHistoryOverrides')||'{}');
  delete overrides[String(order.id)];
  garageStorage.setItem('garageOrderHistoryOverrides',JSON.stringify(overrides));
  renderOrders(); renderSalesJournal(); renderCompletedOrders(); closeOrderHistory();
  document.querySelector('.nav button[data-page="history"]')?.click();
  toast('Заказ перемещён в историю','ok','Заказ #'+order.id+' завершён');
}
function restoreCompletedOrder(orderId){
  const list=getCompletedOrders(); const idx=list.findIndex(o=>String(o.id)===String(orderId)); if(idx<0)return;
  const order=JSON.parse(JSON.stringify(list[idx])); delete order.completedAt; delete order.completedBy; order.status='active'; order.notifiedAt=''; order.notificationStatus='waiting';
  const dynamic=getClientOrders().filter(o=>String(o.id)!==String(order.id)); dynamic.unshift(order); saveClientOrders(dynamic);
  list.splice(idx,1); saveCompletedOrders(list); saveOrderHistory(order);
  renderOrders(); renderSalesJournal(); renderCompletedOrders();
  document.querySelector('.nav button[data-page="orders"]')?.click();
  toast('Заказ возвращён в раздел «Заказы»','ok','Заказ #'+order.id);
}
var ORDER_ITEM_STATUSES=[
  {value:'transit',label:'В пути',cls:'status-transit'},
  {value:'stock',label:'На складе',cls:'status-arrived'},
  {value:'notified',label:'Уведомлен · готов к выдаче',cls:'status-notified'},
  {value:'partial_taken',label:'Частично забрал',cls:'status-partial-taken'},
  {value:'taken',label:'Выдан',cls:'status-taken'}
];
function getOrderItemStatus(item){
  const list=Array.isArray(ORDER_ITEM_STATUSES)?ORDER_ITEM_STATUSES:[];
  return list.some(s=>s.value===item?.status)?item.status:'transit';
}
function orderItemStatusClass(value){return ORDER_ITEM_STATUSES.find(s=>s.value===value)?.cls||'status-transit'}
function orderItemStatusOptions(selected){return ORDER_ITEM_STATUSES.map(s=>`<option value="${s.value}" ${s.value===selected?'selected':''}>${s.label}</option>`).join('')}
function setOrderItemStatus(orderId,index,value){
  if(!ORDER_ITEM_STATUSES.some(s=>s.value===value))return;
  const order=getOrderHistory(orderId); if(!order||!order.items?.[index])return;
  const item=order.items[index]; ensureOrderItemPayments(order);
  const qty=getItemQty(item);
  if(value==='taken'){item.receivedQty=Math.max(getItemReceivedQty(item),qty);item.issuedQty=qty;}
  else if(value==='partial_taken'){item.receivedQty=Math.max(getItemReceivedQty(item),1);item.issuedQty=Math.min(getItemReceivedQty(item),Math.max(1,Number(item.issuedQty)||0));}
  else if(value==='stock'||value==='notified'){item.receivedQty=qty;item.issuedQty=0;}
  else if(value==='transit'){item.receivedQty=0;item.issuedQty=0;order.notifiedAt='';order.notificationStatus='waiting';}
  item.status=value;
  // Ручной возврат всех активных позиций в «На складе» запускает новый цикл уведомления.
  if(value==='stock'){
    const activeItems=(order.items||[]).filter(i=>!i.removed);
    const allStock=activeItems.length>0&&activeItems.every(i=>getOrderItemStatus(i)==='stock');
    if(allStock){order.notifiedAt='';order.notificationStatus='waiting';}
  }
  persistOrderAfterChange(order,'Изменён статус товара: '+ORDER_ITEM_STATUSES.find(s=>s.value===value).label);
  toast('Статус товара изменён','ok','Заказ #'+order.id); renderDeliveries(); renderOrders(); renderHomeDashboard();
}
function reconcileOrderItemCounts(item){
  const qty=Math.max(0,Number(item.qty)||0);
  const status=String(item.status||'transit');
  const beforeReceived=Number(item.receivedQty)||0;
  const beforeIssued=Number(item.issuedQty)||0;
  // Status is the intentional selection. Older/manual edits may have left
  // receivedQty/issuedQty from the previous status, causing conflicting cards.
  if(status==='transit'){
    // Partial deliveries legitimately stay in transit until the last item arrives.
    if(qty>0 && beforeReceived>=qty)item.receivedQty=0;
    item.issuedQty=0;
  }else if(status==='stock'||status==='notified'){
    item.receivedQty=qty;
    item.issuedQty=0;
  }else if(status==='taken'){
    item.receivedQty=qty;
    item.issuedQty=qty;
  }
  // Do not overwrite legitimate partial_taken quantities.
  return (Number(item.receivedQty)||0)!==beforeReceived ||
         (Number(item.issuedQty)||0)!==beforeIssued;
}
function normalizeOrderStatuses(order){
  let changed=false;
  (order.items||[]).forEach(item=>{
    const old=item.status;
    const map={unpaid:'taken',paid:'taken',paidstock:'stock',partial:'partial_taken'};
    if(map[old]){item.status=map[old];changed=true;}
    if(!ORDER_ITEM_STATUSES.some(s=>s.value===item.status)){item.status='transit';changed=true;}
    const qty=getItemQty(item);
    if(!Number.isFinite(Number(item.receivedQty))){item.receivedQty=['stock','notified','partial_taken','taken'].includes(item.status)?qty:0;changed=true;}
    if(!Number.isFinite(Number(item.issuedQty))){item.issuedQty=item.status==='taken'?qty:(item.status==='partial_taken'?Math.min(qty,1):0);changed=true;}
    const oldR=Number(item.receivedQty)||0,oldI=Number(item.issuedQty)||0;
    item.receivedQty=Math.max(0,Math.min(qty,oldR));
    item.issuedQty=Math.max(0,Math.min(item.receivedQty,oldI));
    if(reconcileOrderItemCounts(item))changed=true;
    if(item.issuedQty>=qty&&qty>0&&item.status!=='taken'){item.status='taken';changed=true;}
  });
  return changed;
}
function getOrderAggregateStatus(order){
  const active=(order.items||[]).filter(i=>!i.removed); if(!active.length)return null;
  active.forEach(i=>{if(!Number.isFinite(Number(i.receivedQty))||!Number.isFinite(Number(i.issuedQty)))normalizeOrderStatuses(order)});
  const transit=active.reduce((n,i)=>n+getItemExpectedQty(i),0);
  const stock=active.reduce((n,i)=>n+getItemOnStockQty(i),0);
  const issued=active.reduce((n,i)=>n+getItemIssuedQty(i),0);
  const totalQty=active.reduce((n,i)=>n+getItemQty(i),0);
  const notifiedStock=active.reduce((n,i)=>n+(getItemOnStockQty(i)>0&&getOrderItemStatus(i)==='notified'?getItemOnStockQty(i):0),0);
  const hasPendingItems=active.some(i=>getOrderItemStatus(i)==='transit'||getItemExpectedQty(i)>0);
  if(totalQty>0&&issued>=totalQty)return {value:'taken',label:'Выдан',cls:'status-taken'};
  if(issued>0)return {value:'partial_taken',label:'Частично забрал',cls:'status-partial-taken'};
  if(notifiedStock>0 && notifiedStock===stock && !hasPendingItems)return {value:'notified',label:'Уведомлен · готов к выдаче',cls:'status-notified'};
  if(stock>0 && !hasPendingItems)return {value:'stock',label:'На складе',cls:'status-arrived'};
  if(transit>=totalQty&&totalQty>0)return {value:'transit',label:'В пути',cls:'status-transit'};
  return {value:'transit',label:'В пути',cls:'status-transit'};
}
function isOrderReadyToComplete(order){
  const active=(order.items||[]).filter(i=>!i.removed);
  return active.length>0 && active.every(i=>getItemIssuedQty(i)>=getItemQty(i)) && active.every(i=>getItemRemaining(i)<=0.001);
}
function getNotificationAttempts(order){
  return Array.isArray(order?.notificationAttempts)?order.notificationAttempts:[];
}
function getLastNotificationAttempt(order){
  const a=getNotificationAttempts(order);
  return a.length?a[a.length-1]:null;
}
function getOrdersNeedingNotification(){
  const archived=getArchivedOrderIds();
  const THREE_DAYS=3*24*60*60*1000;
  return getActiveClientOrders().filter(order=>{
    if(archived.has(String(order.id)))return false;
    const active=(order.items||[]).filter(i=>!i.removed);
    if(!active.length)return false;

    const statuses=active.map(getOrderItemStatus);
    // На Главную попадает только полностью поступивший заказ.
    // Пока хотя бы одна позиция в пути — уведомлять клиента рано.
    const allArrived=active.every(i=>['stock','notified'].includes(getOrderItemStatus(i)) && getItemExpectedQty(i)===0 && getItemIssuedQty(i)===0);
    if(!allArrived)return false;

    // Если все позиции вручную возвращены в «На складе», это новый цикл уведомления.
    if(statuses.every(s=>s==='stock'))return true;

    // После успешного уведомления ждём 3 суток. Если клиент не забрал заказ,
    // он снова появляется на Главной для повторного звонка.
    if(order.notifiedAt){
      const elapsed=Date.now()-new Date(order.notifiedAt).getTime();
      if(!Number.isFinite(elapsed) || elapsed<THREE_DAYS)return false;
      // Если за это время часть заказа уже выдана, повторно показываем
      // только пока остаются невыданные позиции.
      if(active.every(i=>getOrderItemStatus(i)==='taken'))return false;
      return true;
    }

    // Первый контакт: все позиции должны быть на складе и ещё не уведомлены.
    return statuses.every(s=>s==='stock');
  });
}
function notificationInitial(order){
  const n=String(order.client||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  return n||'?';
}
function renderHomeDashboard(){
  const orders=getActiveClientOrders();
  const waiting=orders.filter(o=>(o.items||[]).some(i=>!i.removed&&getOrderItemStatus(i)==='transit')).length;
  const today=new Date().toISOString().slice(0,10); const todayCount=orders.filter(o=>String(o.date||o.createdAt||'').slice(0,10)===today).length;
  const notify=getOrdersNeedingNotification();
  const vals=document.querySelectorAll('#home .home-minimal-stat .value');
  if(vals[0])vals[0].textContent=String(waiting);
  if(vals[1])vals[1].textContent=String(todayCount);
  if(vals[2])vals[2].textContent=String(notify.length);
  const banner=document.getElementById('homeNotifyBanner');
  const listEl=document.getElementById('homeNotifyList');
  if(banner){
    banner.classList.toggle('hidden',notify.length===0);
    const text=banner.querySelector('[data-notify-text]');
    if(text)text.textContent=notify.length?`Всего клиентов: ${notify.length}`:'';
    if(listEl){
      listEl.innerHTML=notify.map(order=>{
        const items=(order.items||[]).filter(i=>!i.removed);
        const itemText=items.map(i=>`${escapeHtml(i.name)} × ${Math.max(0,Number(i.qty)||0)}`).join(', ');
        const attempts=getNotificationAttempts(order);
        const last=getLastNotificationAttempt(order);
        const failedCount=attempts.filter(a=>a.result==='failed').length;
        const rowClass=failedCount?' notify-failed':'';
        const attemptText=failedCount?`Не дозвонился · ${failedCount} ${failedCount===1?'попытка':failedCount<5?'попытки':'попыток'}`:'';
        return `<div class="home-notify-row${rowClass}">
          <div class="home-notify-client"><b>${escapeHtml(order.client||'Клиент')}</b><small>${escapeHtml(order.phone||'Телефон не указан')} · ${escapeHtml(order.car||'Автомобиль не указан')}</small>${attemptText?`<div class="notify-attempts">${escapeHtml(attemptText)}</div>`:''}</div>
          <div class="home-notify-order">Заказ #${escapeHtml(order.id)}</div>
          <div class="home-notify-items" title="${escapeHtml(itemText)}">${itemText||'Детали заказа'}</div>
          <button class="btn primary" type="button" data-home-notify-order="${escapeHtml(String(order.id))}">Уведомить</button>
        </div>`;
      }).join('');
      listEl.querySelectorAll('[data-home-notify-order]').forEach(btn=>btn.addEventListener('click',()=>openNotificationForOrder(btn.dataset.homeNotifyOrder)));
    }
  }
}
function openNotificationForOrder(orderId){
  const list=getOrdersNeedingNotification();
  const order=list.find(x=>String(x.id)===String(orderId));
  if(!order){renderHomeDashboard();return;}
  const body=document.getElementById('notificationModalBody');
  const items=(order.items||[]).filter(i=>!i.removed);
  recalcOrderFinancials(order);
  const aggregate=getOrderAggregateStatus(order);
  const paid=Number(order.paid)||0;
  const debt=Number(order.debt)||0;
  const total=Number(order.total)||0;
  const discountSummary=getOrderDiscountSummary(order);
  const hasPrepayment=paid>0||getOrderPaymentLedgerTotal(order)>0;
  const cashPayment=(order.paymentMethod||order.saleMethod)!=='card';
  const canPreviewCashDiscount=cashPayment&&!hasPrepayment&&!discountSummary.everApplied&&debt>0;
  const date=order.date||String(order.createdAt||'').slice(0,10)||'—';
  const paymentMethod=(order.paymentMethod||order.saleMethod)==='card'?'Карта':'Наличные';
  const itemRows=items.map(i=>{
    const finalTotal=orderItemFinalTotal(i);
    const itemPaid=getItemPaid(i);
    const remain=getItemRemaining(i);
    const status=getOrderItemStatus(i);
    const statusLabel=ORDER_ITEM_STATUSES.find(x=>x.value===status)?.label||status||'—';
    const discount=Number(i.discountPct)||0;
    return `<div class="notification-item-full">
      <div class="item-name">${escapeHtml(i.name||'Запчасть')}<small>${escapeHtml(i.article||'Артикул не указан')} · ${escapeHtml(statusLabel)}</small></div>
      <div class="num">${Math.max(0,Number(i.qty)||0)} шт.</div>
      <div class="num">${money0(Number(i.price)||0)}<small>за шт.</small></div>
      <div class="num">${discount?`− ${money0((Number(i.price)||0)*discount/100*Math.max(0,Number(i.qty)||0))}`:'Без скидки'}<small>${discount?discount+'% скидка':' '}</small></div>
      <div class="num"><b>${money0(finalTotal)}</b><small>опл. ${money0(itemPaid)} · долг ${money0(remain)}</small></div>
    </div>`;
  }).join('');
  body.innerHTML=`
    <div class="notification-client">
      <div class="notification-avatar">${escapeHtml(notificationInitial(order))}</div>
      <div><b>${escapeHtml(order.client||'Клиент')}</b><small>${escapeHtml(order.phone||'Телефон не указан')} · ${escapeHtml(order.car||'Автомобиль не указан')}</small></div>
    </div>
    <div class="notification-full-grid">
      <div class="notification-info-card"><span>Заказ</span><b>#${escapeHtml(order.id)}</b></div>
      <div class="notification-info-card"><span>Дата заказа</span><b>${escapeHtml(date)}</b></div>
      <div class="notification-info-card"><span>Статус</span><b>${escapeHtml(aggregate?.label||'—')}</b></div>
      <div class="notification-info-card"><span>Способ оплаты</span><b>${escapeHtml(paymentMethod)}</b></div>
      <div class="notification-info-card"><span>Продавец</span><b>${escapeHtml(order.seller||'—')}</b></div>
      <div class="notification-info-card"><span>VIN</span><b>${escapeHtml(order.vin||'Не указан')}</b></div>
    </div>
    <div class="notification-items-full">
      <div class="notification-items-full-title">Состав текущего заказа · ${items.length} поз.</div>
      ${itemRows||'<div class="notification-info-card">Нет активных позиций</div>'}
    </div>
    <div class="notification-totals">
      <div class="notification-total"><span>Сумма заказа</span><b>${money0(total)}</b></div>
      <div class="notification-total paid"><span>Оплачено</span><b>${money0(paid)}</b></div>
      <div class="notification-total debt"><span>Остаток</span><b>${money0(debt)}</b></div>
    </div>
    <div class="notification-info-card" style="margin-top:10px;background:#faf8ff;border-color:#e6def1">
      <span>Скидка по всему заказу</span>
      <b>${discountSummary.count?'Применена скидка −'+money0(discountSummary.amount)+' на '+discountSummary.count+' поз.':discountSummary.everApplied?'Ранее применялась, сейчас отменена':'Не применялась'}</b>
    </div>
    ${canPreviewCashDiscount?`<div class="notification-info-card" style="margin-top:10px;background:#f6fbff;border-color:#d8e8f8">
      <span>Калькулятор скидки за наличные · только просмотр</span>
      <label for="notificationCashDiscount" style="display:block;margin:9px 0 5px;font-size:12px">Предполагаемая скидка, %</label>
      <input id="notificationCashDiscount" type="number" min="0" max="100" step="0.1" value="5" style="width:105px;max-width:100%;box-sizing:border-box;font-size:16px;padding:9px 10px;border:1px solid #cfddea;border-radius:9px">
      <div style="margin-top:10px;font-size:12px;color:#64748b">Экономия: <b id="notificationCashSaving">—</b></div>
      <div style="margin-top:5px;font-size:14px">К оплате с учётом скидки: <b id="notificationCashDue">—</b></div>
      <small style="display:block;margin-top:8px;color:#718096">Только расчёт для разговора. Не меняет заказ, платежи, долг или историю.</small>
    </div>`:`<div class="notification-info-card" style="margin-top:10px"><span>Калькулятор скидки наличными</span><b>${hasPrepayment?'Недоступен: уже была оплата':discountSummary.everApplied?'Недоступен: скидка уже применялась':!cashPayment?'Недоступен: оплата не наличными':'Недоступен: нет остатка к оплате'}</b></div>`}
    ${order.comment?`<div class="notification-info-card" style="margin-top:10px"><span>Комментарий</span><b>${escapeHtml(order.comment)}</b></div>`:''}`;
  if(canPreviewCashDiscount){
    const input=body.querySelector('#notificationCashDiscount');
    const updateCashPreview=()=>{
      const value=Number(input.value);
      const pct=Number.isFinite(value)?Math.max(0,Math.min(100,value)):0;
      const saving=moneyAmount(debt*pct/100);
      const amount=moneyAmount(Math.max(0,debt-saving));
      body.querySelector('#notificationCashSaving').textContent=money0(saving);
      body.querySelector('#notificationCashDue').textContent=money0(amount);
    };
    input.addEventListener('input',updateCashPreview);
    updateCashPreview();
  }
  document.getElementById('notificationModal').dataset.orderId=String(order.id);
  document.getElementById('notificationModal').classList.remove('hidden');
}
function openNextNotification(){
  const list=getOrdersNeedingNotification();
  if(!list.length){closeNotificationModal();renderHomeDashboard();return;}
  openNotificationForOrder(list[0].id);
}
function closeNotificationModal(){document.getElementById('notificationModal')?.classList.add('hidden')}
function markNotificationFailed(){
  const id=document.getElementById('notificationModal')?.dataset.orderId;if(!id)return;
  const order=getOrderHistory(id);if(!order)return;
  const now=new Date(),pad=n=>String(n).padStart(2,'0');
  order.notificationAttempts=Array.isArray(order.notificationAttempts)?order.notificationAttempts:[];
  order.notificationAttempts.push({result:'failed',at:now.toISOString()});
  order.notificationStatus='not_reached';
  order.notifiedAt='';
  order.events=Array.isArray(order.events)?order.events:[];
  order.events.push({date:pad(now.getDate())+'.'+pad(now.getMonth()+1)+'.'+now.getFullYear(),time:pad(now.getHours())+':'+pad(now.getMinutes()),seller:getCurrentSeller(),text:'Не дозвонился',detail:`Попытка связи №${order.notificationAttempts.filter(a=>a.result==='failed').length}.`,amount:''});
  saveOrderHistory(order);const list=getClientOrders();const idx=list.findIndex(o=>String(o.id)===String(order.id));if(idx>=0){list[idx]=order;saveClientOrders(list)}
  renderOrders();renderSalesJournal();renderHomeDashboard();toast('Попытка связи сохранена','ok','Заказ #'+order.id);closeNotificationModal();
}
function confirmNotification(){
  const id=document.getElementById('notificationModal')?.dataset.orderId; if(!id)return;
  const order=getOrderHistory(id);if(!order)return;
  order.notifiedAt=new Date().toISOString(); order.notificationStatus='notified';
  (order.items||[]).forEach(item=>{if(!item.removed&&getOrderItemStatus(item)==='stock')item.status='notified';});
  const now=new Date(),pad=n=>String(n).padStart(2,'0'); order.events=Array.isArray(order.events)?order.events:[];
  order.events.push({date:pad(now.getDate())+'.'+pad(now.getMonth()+1)+'.'+now.getFullYear(),time:pad(now.getHours())+':'+pad(now.getMinutes()),seller:getCurrentSeller(),text:'Клиент уведомлён',detail:'Клиенту сообщено о поступлении заказа.',amount:''});
  saveOrderHistory(order); const list=getClientOrders();const idx=list.findIndex(o=>String(o.id)===String(order.id));if(idx>=0){list[idx]=order;saveClientOrders(list)}
  renderOrders();renderSalesJournal();renderHomeDashboard();toast('Клиент отмечен как уведомлённый','ok','Заказ #'+order.id);openNextNotification();
}

function deliveryDateInfo(value){
  const raw=String(value||'').trim();
  if(!raw)return {label:'Срок не указан',kind:'none',iso:''};
  const d=new Date(raw+'T00:00:00');
  if(isNaN(d))return {label:'Срок не указан',kind:'none',iso:''};
  const now=new Date(); now.setHours(0,0,0,0);
  const diff=Math.round((d-now)/86400000);
  const label=d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});
  if(diff<0)return {label:'Просрочено · '+label,kind:'overdue',iso:raw};
  if(diff===0)return {label:'Сегодня · '+label,kind:'today',iso:raw};
  if(diff===1)return {label:'Завтра · '+label,kind:'future',iso:raw};
  return {label:'Ожидаем · '+label,kind:'future',iso:raw};
}
function renderDeliveries(){
  const rows=document.getElementById('deliveriesRows'); if(!rows)return;
  const query=String(document.getElementById('deliveriesSearch')?.value||'').trim().toLowerCase();
  const archived=getArchivedOrderIds();
  const orders=getActiveClientOrders().filter(o=>!archived.has(String(o.id)));
  const byClient=new Map();

  orders.forEach(order=>{
    (order.items||[]).forEach((item,index)=>{
      if(item.removed)return;
      const status=getOrderItemStatus(item);
      if(status!=='transit')return;
      const name=String(item.name||'').toLowerCase();
      const article=String(item.article||'').toLowerCase();
      const client=String(order.client||'').toLowerCase();
      const phone=String(order.phone||'').toLowerCase();
      const car=String(order.car||'').toLowerCase();
      const clientRecord=order.clientId ? getClients().find(c=>String(c?.id)===String(order.clientId)) : null;
      const clientCars=clientRecord ? getClientCars(clientRecord) : [];
      const clientCarText=clientCars.map(c=>[
        c?.brand,c?.model,c?.plate,c?.vin,c?.year
      ].filter(Boolean).join(' ')).join(' ').toLowerCase();
      const searchHaystack=[name,article,client,phone,car,clientCarText].join(' ');
      if(query && !searchHaystack.includes(query))return;

      const clientKey=String(order.clientId||('legacy:'+String(order.client||'').trim().toLowerCase()+':'+String(order.phone||'')));
      if(!byClient.has(clientKey)){
        byClient.set(clientKey,{clientId:clientKey,client:order.client||'Клиент',phone:order.phone||'',orders:new Map()});
      }
      const clientGroup=byClient.get(clientKey);
      const orderKey=String(order.id);
      if(!clientGroup.orders.has(orderKey))clientGroup.orders.set(orderKey,{order,items:[]});
      clientGroup.orders.get(orderKey).items.push({order,item,index});
    });
  });

  const groups=[...byClient.values()].sort((a,b)=>String(a.client).localeCompare(String(b.client),'ru'));
  if(!groups.length){
    rows.innerHTML=query
      ? '<div class="delivery-empty"><div style="font-size:24px">⌕</div><b>Ничего не найдено</b><span>Попробуйте другое название или код детали.</span></div>'
      : '<div class="delivery-empty"><div style="font-size:24px">✓</div><b>Поставок в ожидании нет</b><span>Все детали уже поступили.</span></div>';
    return;
  }

  rows.innerHTML=groups.map(group=>{
    const orderGroups=[...group.orders.values()].sort((a,b)=>String(b.order.createdAt||b.order.date||'').localeCompare(String(a.order.createdAt||a.order.date||'')));
    const clientPositions=orderGroups.reduce((sum,g)=>sum+g.items.length,0);
    const clientQty=orderGroups.reduce((sum,g)=>sum+g.items.reduce((n,x)=>n+Math.max(0,getItemQty(x.item)-getItemReceivedQty(x.item)),0),0);
    return `<div class="delivery-client-simple">
      <div class="delivery-client-simple-head">
        <div><b>${escapeHtml(group.client)}</b><small>${escapeHtml(group.phone||'Телефон не указан')}</small></div>
        <div class="delivery-client-simple-count">${orderGroups.length} ${orderGroups.length===1?'заказ':'заказа'} · ${clientPositions} поз. · ${clientQty} шт.</div>
      </div>
      <div class="delivery-client-simple-orders">${orderGroups.map(({order,items})=>{
        const orderQty=items.reduce((sum,x)=>sum+Math.max(0,getItemQty(x.item)-getItemReceivedQty(x.item)),0);
        return `<div class="delivery-order-simple">
          <div class="delivery-order-simple-head">
            <div><b>Заказ #${escapeHtml(String(order.id))}</b><small>${escapeHtml(order.car||'Автомобиль не указан')} · ${escapeHtml(order.date||String(order.createdAt||'').slice(0,10))}</small></div>
            <div class="delivery-order-simple-actions"><span>${items.length} ${items.length===1?'позиция':'позиции'} · ${orderQty} шт.</span><button class="btn mini" type="button" data-delivery-open-order="${escapeHtml(String(order.id))}">Открыть заказ</button></div>
          </div>
          <div class="delivery-items-simple">${items.map(({item,index})=>{
            const total=getItemQty(item), received=getItemReceivedQty(item), expected=Math.max(0,total-received);
            const dateInfo=deliveryDateInfo(item.arrivalDate||order.arrivalDate||'');
            const dateClass=dateInfo.kind==='overdue'?'overdue':dateInfo.kind==='today'?'today':'';
            return `<div class="delivery-item-simple" data-delivery-order="${escapeHtml(String(order.id))}" data-delivery-index="${index}">
              <div class="delivery-item-icon">▦</div>
              <div class="delivery-item-main"><b>${escapeHtml(item.name||'Деталь')}</b><small>Код: ${escapeHtml(item.article||'—')}</small>${dateInfo.iso?`<span class="delivery-item-date ${dateClass}">${escapeHtml(dateInfo.label)}</span>`:''}</div>
              <div class="delivery-item-qty"><b>${expected}</b><small>шт. в пути</small>${received?`<span>получено ${received} из ${total}</span>`:''}</div>
              <div class="delivery-item-status">${expected<total?'<span class="delivery-status partial">Частично пришло</span>':'<span class="delivery-status">В пути</span>'}</div>
              <div class="delivery-item-action"><button class="btn mini delivery-arrival-btn" type="button" data-delivery-arrived="all"><span class="delivery-arrival-icon">✓</span><span>${expected===total?'Заказ пришёл':'Принять всё'}</span></button>${expected>1?`<button class="btn mini delivery-one-btn" type="button" data-delivery-arrived="one">+1</button>`:''}</div>
            </div>`;
          }).join('')}</div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }).join('');
}

function markDeliveryArrived(orderId,index,mode='all'){
  const order=getOrderHistory(orderId); if(!order||!order.items?.[index])return;
  const item=order.items[index]; if(item.removed||getOrderItemStatus(item)!=='transit')return;
  const totalQty=getItemQty(item),received=getItemReceivedQty(item),expected=Math.max(0,totalQty-received); if(expected<=0)return;
  const addQty=mode==='one'?Math.min(1,expected):expected;
  item.receivedQty=Math.min(totalQty,received+addQty); item.issuedQty=Math.min(getItemIssuedQty(item),item.receivedQty); item.status=item.receivedQty>=totalQty?'stock':'transit';
  const now=new Date(),pad=n=>String(n).padStart(2,'0'); order.events=Array.isArray(order.events)?order.events:[];
  order.events.push({date:pad(now.getDate())+'.'+pad(now.getMonth()+1)+'.'+now.getFullYear(),time:pad(now.getHours())+':'+pad(now.getMinutes()),seller:getCurrentSeller(),text:addQty===expected?'Деталь полностью поступила на склад':'Частично поступила деталь',detail:(item.name||'Деталь')+' · заказ #'+order.id+' · '+addQty+' шт.',amount:''});
  persistOrderAfterChange(order,addQty===expected?'Деталь поступила на склад: '+(item.name||'Деталь'):'Частичное поступление: '+(item.name||'Деталь')+' · '+addQty+' шт.',false);
  renderDeliveries(); renderOrders(); renderHomeDashboard();

  // Открываем экран заказа только тогда, когда поступила последняя ожидаемая позиция
  // и заказ полностью собран. Частичное поступление ничего дополнительно не открывает.
  const activeItems=(order.items||[]).filter(i=>!i.removed);
  const fullyCollected=activeItems.length>0 && activeItems.every(i=>getItemExpectedQty(i)<=0);
  toast(addQty===expected?'Деталь переведена на склад':'Принято '+addQty+' шт.','ok','Заказ #'+order.id);
  if(fullyCollected){
    setTimeout(()=>openOrderHistory(order.id),80);
  }
}
function deleteOrder(orderId){
  const id=String(orderId);
  const order=getOrderHistory(id);
  if(!order)return;
  if(!isOrderReadyToComplete(order)){
    toast('Удаление доступно только после полной оплаты и полной выдачи всех позиций.','error','Заказ ещё не готов');
    return;
  }
  showActionConfirm('complete-order',()=>{
    const fresh=getOrderHistory(id)||order;
    if(!isOrderReadyToComplete(fresh)){
      toast('Состояние заказа изменилось. Сначала полностью оплатите и выдайте все позиции.','error','Удаление отменено');
      return;
    }
    completeOrder(id);
  });
}

function renderOrders(){
  const rows=document.getElementById('ordersRows'); if(!rows)return;
  const searchQ=String(document.getElementById('ordersSearch')?.value||'').trim().toLowerCase();
  const statusFilter=document.getElementById('ordersStatusFilter')?.value||'all';
  const archived=getArchivedOrderIds();
  const all=getAllKnownOrders().filter(order=>!archived.has(String(order.id))&&order.status!=='completed'&&orderHasActiveItems(order));
  all.sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));
  const filtered=all.filter(order=>{
    normalizeOrderStatuses(order); ensureOrderItemPayments(order);
    const active=(order.items||[]).filter(i=>!i.removed); const aggregate=getOrderAggregateStatus(order);
    const search=[order.id,order.client,order.phone,order.car,order.seller,...active.map(i=>i.name),...active.map(i=>i.article||'')].join(' ').toLowerCase();
    const qOk=!searchQ||search.includes(searchQ);
    const statusOk=statusFilter==='all'||(statusFilter==='debt'?(Number(order.debt)||0)>0:aggregate?.value===statusFilter);
    return qOk&&statusOk;
  });
  if(!filtered.length){rows.innerHTML='<div class="history-archive-empty"><div class="history-archive-icon">⌕</div><b>Заказы не найдены</b><span>Измените поиск или фильтр.</span></div>';return;}
  rows.innerHTML=filtered.map(order=>{
    normalizeOrderStatuses(order); ensureOrderItemPayments(order);
    const active=(order.items||[]).filter(i=>!i.removed); const aggregate=getOrderAggregateStatus(order); if(!aggregate)return '';
    const search=[order.id,order.client,order.phone,order.car,order.seller,...active.map(i=>i.name),...active.map(i=>i.article||'')].join(' ').toLowerCase();
    const debt=moneyValue(order.debt),paid=moneyValue(order.paid),total=moneyValue(order.total); const progress=total?Math.min(100,Math.round(paid/total*100)):100;
    let expected=0,stock=0,issued=0; active.forEach(i=>{expected+=getItemExpectedQty(i);stock+=getItemOnStockQty(i);issued+=getItemIssuedQty(i)});
    const parts=[]; if(issued)parts.push(`✓ ${issued} выдано`); if(stock)parts.push(`🏬 ${stock} на складе · готово к выдаче`); if(expected)parts.push(`⏳ ${expected} ожидается`); const stateText=parts.join(' · ')||'Нет активных позиций';
    const detailHtml=`<div class="order-status-detail prominent">${parts.map(x=>`<span>${escapeHtml(x)}</span>`).join('')}</div>`;
    return `<div class="row order-list-row" data-order-id="${escapeHtml(order.id)}" data-search="${escapeHtml(search)}"><div style="min-width:0"><b>#${escapeHtml(order.id)} · ${escapeHtml(order.client)}</b><small>${escapeHtml(order.car||'Автомобиль не указан')} · ${active.length} поз. · ${active.reduce((n,i)=>n+getItemQty(i),0)} шт.</small><div class="order-list-seller">${order.seller?sellerMark(order.seller,'mini'):'<span class="seller-mark mini" style="color:#8792a1"><span class="seller-mark-dot" style="background:#8792a1"></span>Не указан</span>'}</div>${detailHtml}<div style="margin-top:8px;height:5px;background:#edf0f4;border-radius:99px;overflow:hidden;max-width:330px"><div style="width:${progress}%;height:100%;background:${debt?'#5b8def':'#36a269'}"></div></div></div><div class="order-row-right"><div class="order-status-main"><span class="order-status-badge ${aggregate.cls}">${escapeHtml(aggregate.label)}</span><div class="order-status-caption">${escapeHtml(stateText)}</div></div><div><small style="color:#8792a1">Оплачено</small><b class="green">${money0(paid)}</b></div><div><small style="color:#8792a1">Долг</small><b class="${debt?'red':'green'}">${money0(debt)}</b></div><div class="order-row-actions"><button class="order-history-btn" data-order-history="${escapeHtml(order.id)}">Открыть</button><button class="order-history-btn order-delete-btn" data-order-delete="${escapeHtml(order.id)}" title="Удалить заказ" aria-label="Удалить заказ">🗑</button></div></div></div>`;
  }).join('');
}
function fillSellerFilter(id){
  const el=document.getElementById(id); if(!el)return;
  const current=el.value||'all';
  const names=getSellers();
  el.innerHTML='<option value="all">Все продавцы</option>'+names.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  el.value=names.includes(current)?current:'all';
}
function moneyValue(v){
  if(typeof v==='number')return Math.max(0,v);
  let raw=String(v??'').trim();
  if(!raw)return 0;
  raw=raw.replace(/\s|\u00a0/g,'').replace(/[−–—]/g,'-').replace(/[^0-9,\.\-]/g,'');
  if(!raw)return 0;
  const lastComma=raw.lastIndexOf(','), lastDot=raw.lastIndexOf('.');
  if(lastComma>=0&&lastDot>=0){
    if(lastComma>lastDot)raw=raw.replace(/\./g,'').replace(',', '.');
    else raw=raw.replace(/,/g,'');
  }else if(lastComma>=0){
    raw=raw.replace(',', '.');
  }
  const n=Number(raw);
  return Number.isFinite(n)?Math.max(0,n):0;
}
function parseRowAmount(row){return moneyValue(row.dataset.amount)}
function updateSalesSummary(){
  let earned=0,cash=0,card=0;
  const warehouse=JSON.parse(garageStorage.getItem('garageWarehouseSales')||'[]');
  warehouse.forEach(x=>{
    const total=moneyValue(x.total);
    earned+=total;
    if(x.paymentMethod==='card') card+=total; else cash+=total;
  });
  document.querySelectorAll('#salesRows .sales-journal-row[data-operation="order"]').forEach(row=>{
    const amount=parseRowAmount(row); const payment=row.dataset.payment;
    earned+=amount; if(payment==='card') card+=amount; else cash+=amount;
  });
  document.querySelectorAll('#salesRows .sales-journal-row[data-operation="return"]').forEach(row=>{
    const amount=parseRowAmount(row); const payment=row.dataset.payment;
    earned-=amount; if(payment==='card') card-=amount; else cash-=amount;
  });
  document.getElementById('salesEarned').textContent=money0(earned);
  document.getElementById('salesCash').textContent=money0(cash);
  document.getElementById('salesCard').textContent=money0(card);
}
function renderSalesJournal(){
  const rows=document.getElementById('salesRows'),empty=document.getElementById('salesEmpty');if(!rows||!empty)return;
  const warehouse=JSON.parse(garageStorage.getItem('garageWarehouseSales')||'[]');
  const html=[];
  warehouse.forEach(x=>{
    const items=Array.isArray(x.items)?x.items:[];const search=[items.map(i=>i.name).join(' '),items.map(i=>i.article||'').join(' '),x.seller].join(' ').toLowerCase();
    html.push(`<div class="row warehouse-sale-row sales-journal-row" data-search="${escapeHtml(search)}" data-date="${escapeHtml(x.date||'')}" data-sort="${escapeHtml(x.createdAt||x.date||'')}" data-payment="${escapeHtml(x.paymentMethod||'cash')}" data-seller="${escapeHtml(x.seller||'')}" data-operation="warehouse" data-amount="${moneyValue(x.total)}"><div class="sale-row-thumb" aria-hidden="true">🛒</div><div class="sale-row-main"><b>${items.map(i=>escapeHtml(i.name)).join(', ')}</b><div class="sale-row-meta"><span class="sale-chip">${sellerMark(x.seller,'mini')}</span><span class="sale-chip">${x.paymentMethod==='card'?'💳 Карта':'💵 Наличные'}</span><span class="sale-chip">${items.length} поз.</span><span class="sale-chip">${escapeHtml(x.date||'')}</span><span class="sale-chip">🛒 Со склада</span>${moneyValue(x.roundDiscount)>0?`<span class="sale-chip round">Округление −${money0(x.roundDiscount)}</span>`:''}</div></div><div class="sale-row-total"><b>${money0(x.total)}</b></div></div>`);
  });
  getAllKnownOrders().forEach(order=>{
    const payments=Array.isArray(order.payments)?order.payments:[];
    payments.forEach((p)=>{
      const paidAmount=moneyValue(p.paymentAmount??p.amount);if(paidAmount<=0)return;
      const date=p.date?p.date.split('.').reverse().join('-'):String(order.date||order.createdAt||'').slice(0,10);
      const sortKey=p.createdAt||(date+'T'+(p.time||'00:00:00'));
      const type=p.paymentType||'Доплата',method=normalizePaymentMethod(p.paymentMethod,'',order.paymentMethod||'cash');
      const search=['оплата',type,'заказ',order.id,order.client,order.car,...(order.items||[]).map(i=>i.name),...(order.items||[]).map(i=>i.article||'')].join(' ').toLowerCase();
      html.push(`<div class="row sales-journal-row" data-order-id="${escapeHtml(order.id)}" data-search="${escapeHtml(search)}" data-date="${escapeHtml(date)}" data-sort="${escapeHtml(sortKey)}" data-payment="${escapeHtml(method)}" data-seller="${escapeHtml(p.seller||order.seller||'')}" data-operation="order" data-amount="${paidAmount}"><div class="sale-row-thumb" aria-hidden="true">💳</div><div class="sale-row-main"><b>${escapeHtml(type)} · Заказ #${escapeHtml(order.id)}</b><div class="sale-row-meta"><span class="sale-chip">${sellerMark(p.seller||order.seller,'mini')}</span><span class="sale-chip">${method==='card'?'💳 Карта':'💵 Наличные'}</span><span class="sale-chip">📦 Из заказа</span><span class="sale-chip">${escapeHtml(date)}${p.time?' · '+escapeHtml(p.time):''}</span><span class="sale-chip">${escapeHtml(order.client||'')}</span>${order.car?`<span class="sale-chip">${escapeHtml(order.car)}</span>`:''}</div></div><div class="sale-row-history"><button class="order-history-btn" data-order-history="${escapeHtml(order.id)}">◷ История заказа</button></div><div class="sale-row-total"><b>${money0(paidAmount)}</b><small>${escapeHtml(type.toLowerCase())}</small></div></div>`);
    });
    (order.items||[]).forEach((item,idx)=>{
      if(!item.removed)return;
      const refundAmount=moneyValue(item.refundAmount);if(!(refundAmount>0))return;
      const dateObj=item.refundRecordedAt?new Date(item.refundRecordedAt):null;
      const date=dateObj&&!isNaN(dateObj)?dateObj.toISOString().slice(0,10):(String(order.date||order.createdAt||'').slice(0,10)||todayIso());
      const sortKey=item.refundRecordedAt||(date+'T00:00:00');
      const seller=item.refundSeller||order.seller||'';
      const search=['возврат',order.id,order.client,order.car,item.name,item.article||'',item.removedReason||''].join(' ').toLowerCase();
      html.push(`<div class="row sales-journal-row return-sales-row" data-order-id="${escapeHtml(String(order.id))}" data-search="${escapeHtml(search)}" data-date="${escapeHtml(date)}" data-sort="${escapeHtml(sortKey)}" data-payment="cash" data-seller="${escapeHtml(seller)}" data-operation="return" data-amount="${refundAmount}"><div class="sale-row-thumb" aria-hidden="true">↩️</div><div class="sale-row-main"><b>Возврат · Заказ #${escapeHtml(order.id)} · ${escapeHtml(item.name)}</b><div class="sale-row-meta"><span class="sale-chip">${sellerMark(seller,'mini')}</span><span class="sale-chip">💵 Наличные</span><span class="sale-chip">↩️ Возврат</span><span class="sale-chip">${escapeHtml(date)}${dateObj&&!isNaN(dateObj)?' · '+escapeHtml(dateObj.toTimeString().slice(0,5)):''}</span><span class="sale-chip">${escapeHtml(item.removedReason||'')}</span></div></div><div class="sale-row-history"><button class="order-history-btn" data-order-history="${escapeHtml(String(order.id))}">◷ Подробности заказа</button></div><div class="sale-row-total return-row-total"><b>− ${money0(refundAmount)}</b><small>возврат из кассы</small><button class="return-edit-btn" data-edit-order-return="${escapeHtml(String(order.id))}" data-edit-return-index="${idx}">Изменить</button></div></div>`);
    });
  });
  getReturns().forEach(x=>{
    const amount=moneyValue(x.amount),search=['возврат',x.product,x.reason,x.seller].join(' ').toLowerCase();
    html.push(`<div class="row sales-journal-row return-sales-row" data-search="${escapeHtml(search)}" data-date="${escapeHtml(x.date||'')}" data-sort="${escapeHtml(x.createdAt||((x.date||'')+'T'+(x.time||'00:00')))}" data-payment="${escapeHtml(x.paymentMethod||'cash')}" data-seller="${escapeHtml(x.seller||'')}" data-operation="return" data-amount="${amount}"><div class="sale-row-thumb" aria-hidden="true">↩️</div><div class="sale-row-main"><b>Возврат · ${escapeHtml(x.product)}</b><div class="sale-row-meta"><span class="sale-chip">${sellerMark(x.seller,'mini')}</span><span class="sale-chip">${x.paymentMethod==='card'?'💳 Карта':'💵 Наличные'}</span><span class="sale-chip">↩️ Возврат</span><span class="sale-chip">${escapeHtml(x.date||'')}</span><span class="sale-chip">${escapeHtml(x.reason||'')}</span></div></div><div class="sale-row-history"><button class="return-details-btn" data-return-details="${escapeHtml(String(x.id))}">◷ Подробности</button></div><div class="sale-row-total return-row-total"><b>− ${money0(amount)}</b><small>возврат из кассы</small><button class="return-edit-btn" data-edit-standalone-return="${escapeHtml(String(x.id))}">Изменить</button></div></div>`);
  });
  rows.innerHTML=html.join('');
  [...rows.querySelectorAll('.sales-journal-row')].sort((a,b)=>String(b.dataset.sort||b.dataset.date||'').localeCompare(String(a.dataset.sort||a.dataset.date||''))).forEach(row=>rows.appendChild(row));
  updateSalesSummary();applySalesFilters();
}
function eventsForReturn(order,item){
  const name=String(item?.name||'');
  return (Array.isArray(order?.events)?order.events:[]).filter(e=>e&&e.text==='Возврат из кассы'&&(!name||String(e.detail||'').includes(name)));
}
function applySalesFilters(){
  const q=(document.getElementById('salesSearch')?.value||'').trim().toLowerCase();
  const date=document.getElementById('salesDate')?.value||'';
  const payment=document.getElementById('salesPayment')?.value||'all';
  const seller=document.getElementById('salesSeller')?.value||'all';
  const operation=document.getElementById('salesOperation')?.value||'all';
  const rows=document.querySelectorAll('#salesRows .sales-journal-row'); let visible=0;
  rows.forEach(row=>{
    const okSearch=!q||(row.dataset.search||'').toLowerCase().includes(q);
    const okDate=!date||row.dataset.date===date;
    const okPay=payment==='all'||row.dataset.payment===payment;
    const okSeller=seller==='all'||row.dataset.seller===seller;
    const okOperation=operation==='all'||row.dataset.operation===operation;
    const show=okSearch&&okDate&&okPay&&okSeller&&okOperation;
    row.classList.toggle('hidden',!show); if(show)visible++;
  });
  emptyToggleSales(visible>0);
}
function emptyToggleSales(hasRows){document.getElementById('salesEmpty')?.classList.toggle('hidden',hasRows)}
function setupSalesFilters(){
  fillSellerFilter('salesSeller');
  ['salesSearch','salesDate','salesPayment','salesSeller','salesOperation'].forEach(id=>{
    const el=document.getElementById(id);
    el?.addEventListener('input',applySalesFilters);
    el?.addEventListener('change',applySalesFilters);
  });
  document.getElementById('salesReset')?.addEventListener('click',()=>{
    document.getElementById('salesSearch').value='';
    document.getElementById('salesDate').value='';
    document.getElementById('salesPayment').value='all';
    document.getElementById('salesSeller').value='all';
    document.getElementById('salesOperation').value='all';
    applySalesFilters();
  });
}

function makeGarageBackup(){
  return window.GarageBackup.make(garageStorage);
}
function downloadGarageBackup(payload,filename){
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),500);
}
function exportGarageBackup(){
  downloadGarageBackup(makeGarageBackup(),'garage-backup-'+todayIso()+'.json');
  toast('Резервная копия выгружена в JSON','ok','Экспорт завершён');
}
function updatePreviousGarageBackupButton(){
  const button=document.getElementById('exportPreviousGarageBackup');if(!button)return;
  const available=!!window.GarageBackup.previous();button.hidden=!available;button.disabled=!available;button.classList.toggle('hidden',!available);
}
function exportPreviousGarageBackup(){
  const payload=window.GarageBackup.previous();
  if(!payload){updatePreviousGarageBackupButton();toast('В этом браузере нет копии до последнего импорта.','error');return}
  downloadGarageBackup(payload,'garage-before-import-'+todayIso()+'.json');
  toast('Копия до последнего импорта выгружена в JSON.','ok','Экспорт завершён');
}
async function applyGarageBackup(payload,{actionPassword:approvedPassword}={}){
  try{
    let state;
    try{state=window.GarageBackup.validate(payload)}catch(error){
      if(error.code!=='EMPTY_BACKUP')throw error;
      if(!window.confirm(error.message+' Продолжить импорт пустой копии?'))return false;
      state=window.GarageBackup.validate(payload,{allowEmpty:true});
    }
    if(!window.garageCloudSync?.replace)throw new Error('Войдите в GARAGE и дождитесь подключения к облаку.');
    const actionPassword=approvedPassword||await window.garageRequestActionPassword?.();
    if(!actionPassword)return false;
    await window.garageCloudSync.save({actionPassword});
    window.GarageBackup.createRollback(garageStorage);
    // Keep the current screen and storage intact until the server confirms the
    // replacement against the exact version we loaded. Conflicts abort safely.
    await window.garageCloudSync.replace(state,{actionPassword});
    location.reload();
    return true;
  }catch(error){toast(error.message||'Не удалось сохранить импорт в облако. Текущие данные сохранены.','error','Импорт не завершён');return false}
}
document.getElementById('exportGarageBackup')?.addEventListener('click',exportGarageBackup);
document.getElementById('exportPreviousGarageBackup')?.addEventListener('click',exportPreviousGarageBackup);
window.addEventListener('garage-backup-updated',updatePreviousGarageBackupButton);
window.addEventListener('storage',event=>{if(event.key===window.GarageBackup.rollbackKey||event.key===null)updatePreviousGarageBackupButton()});
updatePreviousGarageBackupButton();
document.getElementById('importGarageBackup')?.addEventListener('click',()=>{
  if(!window.GarageBackup.hasImportAuthorization())return;
  const input=document.getElementById('garageBackupFile');
  if(input){input.value='';input.click()}else window.GarageBackup.cancelImport();
});
document.getElementById('garageBackupFile')?.addEventListener('cancel',()=>window.GarageBackup.cancelImport());
document.getElementById('garageBackupFile')?.addEventListener('change',e=>{
  const actionPassword=window.GarageBackup.consumeImportAuthorization();
  const file=e.target.files?.[0]; if(!file)return;
  if(!actionPassword){e.target.value='';toast('Сначала подтвердите пароль действий кнопкой «Импортировать данные».','error','Импорт отменён');return}
  if(file.size>window.GarageBackup.maxFileBytes){toast('Размер копии превышает 5 МБ.','error','Импорт отменён');e.target.value='';return}
  const reader=new FileReader();
  reader.onerror=()=>{toast('Не удалось прочитать файл.','error','Импорт отменён');e.target.value=''};
  reader.onload=()=>{try{const payload=JSON.parse(reader.result);window.GarageBackup.validate(payload,{allowEmpty:true});showActionConfirm('import-backup',()=>applyGarageBackup(payload,{actionPassword}),'Общие данные на всех устройствах будут заменены данными из файла «'+file.name+'». Перед заменой в браузере сохранится копия текущих данных.');}catch(err){toast(err instanceof SyntaxError?'Не удалось прочитать JSON-файл.':err.message,'error','Импорт отменён');}finally{e.target.value='';}};
  reader.readAsText(file,'utf-8');
});

let financialsVisible=true;
function setFinancialVisibility(){
  document.querySelectorAll('[data-financial-value]').forEach(el=>el.classList.toggle('financial-hidden',!financialsVisible));
  const btn=document.getElementById('toggleFinancials');
  if(btn){btn.textContent=financialsVisible?'👁️':'🙈';btn.title=financialsVisible?'Скрыть суммы':'Показать суммы';btn.setAttribute('aria-label',btn.title)}
}
document.getElementById('salesRows')?.addEventListener('click',e=>{
  const editStandalone=e.target.closest('[data-edit-standalone-return]');
  if(editStandalone){e.stopPropagation();openReturnEdit('standalone',editStandalone.dataset.editStandaloneReturn);return;}
  const editOrder=e.target.closest('[data-edit-order-return]');
  if(editOrder){e.stopPropagation();openReturnEdit('order',editOrder.dataset.editOrderReturn,editOrder.dataset.editReturnIndex);return;}
  const returnDetails=e.target.closest('[data-return-details]');
  if(returnDetails){e.stopPropagation();openStandaloneReturnDetails(returnDetails.dataset.returnDetails);return;}
  const btn=e.target.closest('[data-order-history]');
  if(btn){e.stopPropagation();openOrderHistory(btn.dataset.orderHistory);}
});
document.getElementById('closeReturnDetails')?.addEventListener('click',()=>document.getElementById('returnDetailsModal')?.classList.add('hidden'));
document.getElementById('closeReturnDetailsBtn')?.addEventListener('click',()=>document.getElementById('returnDetailsModal')?.classList.add('hidden'));

fillSellerFilter('historySeller');
renderOrders();
renderDeliveries();
renderSalesJournal();
renderCompletedOrders();
renderHomeDashboard();
setupSalesFilters();

document.getElementById('toggleFinancials')?.addEventListener('click',()=>{financialsVisible=!financialsVisible;setFinancialVisibility()});
setFinancialVisibility();

document.getElementById('completedOrdersRows')?.addEventListener('click',e=>{
  const restore=e.target.closest('[data-restore-order]');
  if(restore){e.stopPropagation();const id=restore.dataset.restoreOrder;showActionConfirm('restore-order',()=>restoreCompletedOrder(id));return;}
  const hist=e.target.closest('[data-archive-history]');
  if(hist){e.stopPropagation();const order=getCompletedOrders().find(o=>String(o.id)===String(hist.dataset.archiveHistory));if(order)openOrderHistory(order.id);}
});
document.getElementById('deliveriesSearch')?.addEventListener('input',()=>renderDeliveries());
document.getElementById('deliveriesRows')?.addEventListener('click',e=>{
  const open=e.target.closest('[data-delivery-open-order]');
  if(open){e.stopPropagation();openOrderHistory(open.dataset.deliveryOpenOrder);return;}
  const row=e.target.closest('[data-delivery-order]');
  const btn=e.target.closest('[data-delivery-arrived]');
  if(btn&&row){e.stopPropagation();markDeliveryArrived(row.dataset.deliveryOrder,Number(row.dataset.deliveryIndex),btn.dataset.deliveryArrived);return;}
});
document.querySelectorAll('.nav button').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(btn.dataset.page).classList.add('active');
  if(btn.dataset.page==='history')renderCompletedOrders();
  if(btn.dataset.page==='orders')renderOrders();
  if(btn.dataset.page==='deliveries')renderDeliveries();
  if(btn.dataset.page==='home'){renderHomeDashboard();}
}));
document.getElementById('salesSellButton')?.addEventListener('click',openProductSale);
document.getElementById('salesReturnButton')?.addEventListener('click',openReturnModal);
document.getElementById('returnCancel')?.addEventListener('click',closeReturnModal);
document.getElementById('returnConfirm')?.addEventListener('click',confirmReturn);
document.getElementById('returnModal')?.addEventListener('click',e=>{if(e.target.id==='returnModal')closeReturnModal()});
document.getElementById('closeNotificationModal')?.addEventListener('click',closeNotificationModal);document.getElementById('laterNotification')?.addEventListener('click',closeNotificationModal);document.getElementById('confirmNotification')?.addEventListener('click',confirmNotification);
document.getElementById('failedNotification')?.addEventListener('click',markNotificationFailed);document.getElementById('notificationModal')?.addEventListener('click',e=>{if(e.target.id==='notificationModal')closeNotificationModal()});

// ===== Очистка всех заказов и продаж =====
(function(){
  const open=document.getElementById('clearOrdersSalesBtn');
  const modal=document.getElementById('clearOrdersSalesModal');
  let approvedPassword='';
  const close=()=>{approvedPassword='';modal?.classList.add('hidden');};
  if(!open||!modal)return;
  let opening=false;
  open.addEventListener('click',async()=>{
    if(opening||!modal.classList.contains('hidden'))return;
    opening=true;open.disabled=true;
    try{
      if(typeof window.garageRequestActionPassword!=='function')throw Error('Проверка пароля действий недоступна.');
      const password=await window.garageRequestActionPassword();
      if(!password)return;
      approvedPassword=password;
      modal.classList.remove('hidden');
    }catch(error){if(typeof toast==='function')toast(error.message||'Не удалось проверить пароль','error');}
    finally{opening=false;open.disabled=false;}
  });
  document.getElementById('closeClearOrdersSales')?.addEventListener('click',close);
  document.getElementById('cancelClearOrdersSales')?.addEventListener('click',close);
  modal.addEventListener('click',e=>{if(e.target===modal)close()});
  document.getElementById('confirmClearOrdersSales')?.addEventListener('click',async()=>{
    const confirmButton=document.getElementById('confirmClearOrdersSales');
    if(confirmButton?.disabled)return;
    if(confirmButton)confirmButton.disabled=true;
    try{
      // Already verified on the server before showing the final confirmation.
      const actionPassword=approvedPassword;
      if(!actionPassword)throw new Error('Сначала подтвердите пароль действий.');
      const keys=['garageClientOrders','garageCompletedOrders','garageOrderHistoryOverrides','garageWarehouseSales','garageReturns','garageClientCarts','garageArchivedOrders','garageOrderArchive','garageCompletedOrderOverrides'];
      const backup=keys.map(key=>[key,garageStorage.getItem(key)]);
      try{
        keys.forEach(key=>garageStorage.removeItem(key));
        if(!window.garageCloudSync?.save)throw new Error('Нет подключения к облаку. Очистка отменена.');
        await window.garageCloudSync.save({actionPassword});
      }catch(error){
        backup.forEach(([key,value])=>value===null?garageStorage.removeItem(key):garageStorage.setItem(key,value));
        throw error;
      }
      close();
      if(typeof renderOrders==='function')renderOrders();
      if(typeof renderSalesJournal==='function')renderSalesJournal();
      if(typeof renderCompletedOrders==='function')renderCompletedOrders();
      if(typeof renderHomeDashboard==='function')renderHomeDashboard();
      if(typeof toast==='function')toast('Все заказы и продажи очищены','ok');
    }catch(error){
      if(typeof toast==='function')toast(error.message||'Не удалось очистить данные','error');
    }finally{if(confirmButton)confirmButton.disabled=false;}
  });

})();
