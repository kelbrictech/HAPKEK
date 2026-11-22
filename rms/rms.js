(() => {
  const API=(window.HAPKEK_RMS_API||"").replace(/\/$/,"");
  const $=id=>document.getElementById(id);
  const show=(id,on)=>$(id).hidden=!on;
  let currentStaff=null;
  async function api(path,options={}){
    const r=await fetch(API+path,{...options,credentials:"include",cache:"no-store",headers:{"Content-Type":"application/json",...(options.headers||{})}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error(data.error||"Request failed");e.status=r.status;throw e;}return data;
  }
  function cell(text){const td=document.createElement("td");td.textContent=text==null?"—":String(text);return td;}
  function row(parent,values){const tr=document.createElement("tr");values.forEach(v=>tr.append(v instanceof Node?v:cell(v)));parent.append(tr);}
  function fmt(value){if(!value)return "—";return new Date(value).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"});}
  async function loadNicknames(){try{const d=await api("/api/staff/users");const select=$("nickname");select.replaceChildren(new Option("Select your nickname",""));d.users.forEach(u=>select.add(new Option(u.nickname,u.nickname)));}catch{$("nickname").replaceChildren(new Option("Could not load users",""));}}
  function routeSignedIn(staff){currentStaff=staff;$("userName").textContent=staff.displayName;$("userRole").textContent=staff.role||"staff";show("loginPanel",false);show("pinSetupPanel",Boolean(staff.mustChangePin));show("accessPanel",false);if(staff.mustChangePin){show("appContent",false);return;}show("appContent",true);const canManage=["owner","admin","manager"].includes(staff.role);document.querySelectorAll(".admin-only,.admin-nav").forEach(el=>{el.hidden=!canManage;});show("users",staff.role==="admin");show("posManagement",canManage);refresh();}
  async function loadUsers(){const d=await api("/api/rms/users");const body=$("userRows");body.replaceChildren();const select=$("staffNickname");select.replaceChildren(new Option("Select nickname",""));d.users.filter(u=>u.role!=="admin").forEach(u=>{select.add(new Option(u.nickname,u.nickname));row(body,[u.nickname,u.role,u.active?"Active":"Pending",u.mustChangePin?"Temporary PIN required":"Set"]);});}
  async function loadOverview(){const d=await api("/api/rms/overview");$("dateLine").textContent=`Business date: ${d.date} · Philippine time`;$("plays").textContent=d.metrics.playsToday.toLocaleString();$("issued").textContent=d.metrics.vouchersIssuedToday.toLocaleString();$("redeemed").textContent=d.metrics.vouchersRedeemedToday.toLocaleString();$("outstanding").textContent=d.metrics.outstandingToday.toLocaleString();
    const body=$("prizeRows");body.replaceChildren();d.prizes.forEach(p=>{const remaining=Math.max(0,Number(p.daily_limit)-Number(p.issued_today));const state=!p.active?"Inactive":remaining===0?"Sold out":"Available";row(body,[p.label,p.daily_limit, p.issued_today,remaining,state]);});
  }
  async function loadVouchers(){const params=new URLSearchParams({limit:"100",status:$("voucherStatus").value});if($("voucherDate").value)params.set("date",$("voucherDate").value);const d=await api("/api/rms/vouchers?"+params);const body=$("voucherRows");body.replaceChildren();if(!d.vouchers.length){row(body,["No matching vouchers","","","","",""]);return;}d.vouchers.forEach(v=>{const status=document.createElement("span");status.className="status"+(v.redeemed_at?" used":"");status.textContent=v.redeemed_at?"REDEEMED":"ISSUED";row(body,[v.voucher_code,v.label,v.player_id,fmt(v.created_at),status,v.redeemed_by||"—"]);});}
  async function loadAudit(){const d=await api("/api/rms/audit");const body=$("auditRows");body.replaceChildren();if(!d.events.length){row(body,["No audit events yet","","","",""]);return;}d.events.forEach(a=>{let details="";try{details=JSON.stringify(JSON.parse(a.details_json));}catch{}row(body,[fmt(a.created_at),a.display_name||a.username||"System",a.action,a.entity_type+" "+(a.entity_id||""),details]);});}
  async function refresh(){try{if(["owner","admin","manager"].includes(currentStaff?.role)){await Promise.all([loadOverview(),loadVouchers(),loadAudit(),loadPosManagement(),...(currentStaff?.role==="admin"?[loadUsers()]:[])]);}}catch(e){if(e.status===401){show("appContent",false);show("loginPanel",true);}else console.error(e);}}
  async function session(){try{const d=await api("/api/staff/me");routeSignedIn(d.staff);}catch{show("loginPanel",true);show("pinSetupPanel",false);show("appContent",false);show("accessPanel",false);}}

  const POS_NAMES={bavarian:"Bavarian",cheese:"Cheese",ube:"Ube",choco:"Choco",strawberry:"Strawberry"};
  const POS_PRICE=150,POS_PIECES=15;
  let posFlavor="bavarian",posQty=1,posCart={},posPayment="cash",posRequestId=null;
  const posMoney=n=>"₱"+Number(n||0).toLocaleString("en-PH");
  const posBoxes=()=>Object.values(posCart).reduce((a,b)=>a+b,0);
  const posTotal=()=>posBoxes()*POS_PRICE;
  function posProductRender(){$("productQty").textContent=posQty;$("addOrderTotal").textContent=posMoney(posQty*POS_PRICE);}
  function posCartRender(){
    const list=$("cartItems");list.replaceChildren();const flavors=Object.keys(posCart).filter(f=>posCart[f]>0);$("emptyCart").hidden=flavors.length>0;
    flavors.forEach(flavor=>{
      const line=document.createElement("article");line.className="cart-line";
      const main=document.createElement("div");main.className="cart-line-main";
      const title=document.createElement("strong");title.textContent=POS_NAMES[flavor]+" box";
      const detail=document.createElement("small");detail.textContent="15 pcs × "+posCart[flavor]+" boxes";main.append(title,detail);
      const right=document.createElement("div");right.className="cart-line-price";
      const price=document.createElement("strong");price.textContent=posMoney(posCart[flavor]*POS_PRICE);
      const step=document.createElement("div");step.className="cart-stepper";
      const minus=document.createElement("button");minus.type="button";minus.textContent="−";minus.setAttribute("aria-label","Remove one "+POS_NAMES[flavor]+" box");minus.dataset.cartFlavor=flavor;minus.dataset.cartDelta="-1";
      const qty=document.createElement("span");qty.textContent=posCart[flavor];
      const plus=document.createElement("button");plus.type="button";plus.textContent="+";plus.setAttribute("aria-label","Add one "+POS_NAMES[flavor]+" box");plus.dataset.cartFlavor=flavor;plus.dataset.cartDelta="1";
      step.append(minus,qty,plus);right.append(price,step);line.append(main,right);list.append(line);
    });
    const boxes=posBoxes(),total=posTotal();$("cartBoxCount").textContent=boxes+" "+(boxes===1?"box":"boxes");$("orderBoxes").textContent=boxes;$("orderPieces").textContent=(boxes*POS_PIECES)+" pcs";$("orderTotal").textContent=posMoney(total);$("checkoutTotal").textContent=posMoney(total);$("openCheckout").disabled=!boxes;
    $("confirmPayment").textContent="Confirm "+posPayment.toUpperCase()+" payment · "+posMoney(total);posUpdateChange();
  }
  function posAdd(flavor,count){
    if(!POS_NAMES[flavor]||!Number.isInteger(count)||count<1)return;
    if(posBoxes()+count>99){$("checkoutError").textContent="A sale can contain up to 99 boxes.";return;}
    posCart[flavor]=(posCart[flavor]||0)+count;posRequestId=null;$("checkoutError").textContent="";posCartRender();
  }
  function posUpdateChange(){
    const due=posTotal(),received=Number($("cashReceived").value||0),valid=Number.isSafeInteger(received)&&received>=due;
    $("changeDue").textContent=posMoney(Math.max(0,received-due));
    $("confirmPayment").disabled=posBoxes()===0||(posPayment==="cash"&&!valid);
  }
  function posSetPayment(method){
    posPayment=method;document.querySelectorAll("[data-payment]").forEach(b=>{const active=b.dataset.payment===method;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",String(active));});
    $("cashFields").hidden=method!=="cash";
    $("paymentHint").textContent=method==="cash"?"Enter the amount received from the customer.":"Confirm the "+(method==="gcash"?"GCash transfer":"card payment")+" has been received before continuing.";
    posCartRender();
  }
  function posReceipt(sale){
    $("checkoutPanel").hidden=true;$("receiptPanel").hidden=false;const root=$("receiptDetails");root.replaceChildren();
    const title=document.createElement("h4");title.textContent="HAPKEK";root.append(title);
    const subtitle=document.createElement("p");subtitle.textContent="JAPANESE CAKE · SALES RECEIPT";root.append(subtitle);
    function add(label,value,cls){const row=document.createElement("div");row.className="receipt-row "+(cls||"");const a=document.createElement("span"),b=document.createElement("strong");a.textContent=label;b.textContent=value;row.append(a,b);root.append(row);}
    add("Receipt",sale.receiptNo);add("Date",fmt(sale.createdAt));add("Cashier",sale.cashierName);root.append(document.createElement("hr"));
    sale.items.forEach(item=>add((item.flavorLabel||POS_NAMES[item.flavor])+" · "+item.boxes+" box × 15 pcs",posMoney(item.lineTotalPesos)));
    root.append(document.createElement("hr"));add("Total boxes",String(sale.boxes));add("Total pieces",String(sale.pieces));add("TOTAL",posMoney(sale.totalPesos),"receipt-total");add("Payment",sale.paymentMethod.toUpperCase());
    if(sale.paymentMethod==="cash"){add("Cash received",posMoney(sale.amountTenderedPesos));add("Change",posMoney(sale.changeDuePesos));}
    const thanks=document.createElement("p");thanks.className="receipt-thanks";thanks.textContent="Thank you for choosing HAPKEK!";root.append(thanks);
  }
  async function loadPosManagement(){
    const data=await Promise.all([api("/api/rms/pos/summary"),api("/api/rms/pos/sales?limit=15")]),summary=data[0],sales=data[1];
    $("posGross").textContent=posMoney(summary.metrics.grossPesos);$("posBoxes").textContent=summary.metrics.boxes.toLocaleString("en-PH");$("posOrders").textContent=summary.metrics.orders.toLocaleString("en-PH");$("posPieces").textContent=summary.metrics.pieces.toLocaleString("en-PH");$("posBusinessDate").textContent=summary.date+" · Asia/Manila";
    const stats=$("posFlavorSummary");stats.replaceChildren();summary.flavors.forEach(item=>{const chip=document.createElement("span");chip.className="flavor-stat";chip.textContent=item.label+": "+item.boxes+" boxes";stats.append(chip);});
    const list=$("recentSales");list.replaceChildren();if(!sales.sales.length){const p=document.createElement("p");p.className="muted";p.textContent="No sales recorded yet.";list.append(p);return;}
    sales.sales.forEach(sale=>{const row=document.createElement("article");row.className="recent-sale";const left=document.createElement("div"),right=document.createElement("div");right.className="recent-sale-right";
      const ref=document.createElement("strong"),details=document.createElement("small");ref.textContent=sale.receiptNo;details.textContent=sale.items.map(item=>item.label+" × "+item.boxes).join(" · ");left.append(ref,details);
      const amount=document.createElement("strong"),meta=document.createElement("small");amount.textContent=posMoney(sale.totalPesos);meta.textContent=sale.paymentMethod.toUpperCase()+" · "+sale.cashierName;right.append(amount,meta);row.append(left,right);list.append(row);
    });
  }
  function posReset(){
    posFlavor="bavarian";posQty=1;posCart={};posRequestId=null;
    document.querySelectorAll("[data-flavor]").forEach(b=>{const active=b.dataset.flavor===posFlavor;b.classList.toggle("is-selected",active);b.setAttribute("aria-pressed",String(active));});
    $("cashReceived").value="";$("checkoutError").textContent="";$("checkoutPanel").hidden=true;$("receiptPanel").hidden=true;posSetPayment("cash");posProductRender();posCartRender();
  }
  document.querySelectorAll("[data-flavor]").forEach(button=>button.addEventListener("click",()=>{posFlavor=button.dataset.flavor;document.querySelectorAll("[data-flavor]").forEach(b=>{const active=b===button;b.classList.toggle("is-selected",active);b.setAttribute("aria-pressed",String(active));});}));
  $("productMinus").addEventListener("click",()=>{posQty=Math.max(1,posQty-1);posProductRender();});
  $("productPlus").addEventListener("click",()=>{posQty=Math.min(99,posQty+1);posProductRender();});
  $("addToOrder").addEventListener("click",()=>{posAdd(posFlavor,posQty);posQty=1;posProductRender();});
  document.querySelectorAll("[data-quick-boxes]").forEach(b=>b.addEventListener("click",()=>posAdd(posFlavor,Number(b.dataset.quickBoxes))));
  $("cartItems").addEventListener("click",event=>{const b=event.target.closest("button[data-cart-flavor]");if(!b)return;const flavor=b.dataset.cartFlavor,delta=Number(b.dataset.cartDelta),next=(posCart[flavor]||0)+delta;if(next<=0)delete posCart[flavor];else if(posBoxes()+delta<=99)posCart[flavor]=next;posRequestId=null;posCartRender();});
  $("openCheckout").addEventListener("click",()=>{$("checkoutPanel").hidden=false;$("receiptPanel").hidden=true;$("cashReceived").value=String(posTotal());$("checkoutTotal").textContent=posMoney(posTotal());posSetPayment(posPayment);$("checkoutPanel").scrollIntoView({behavior:"smooth",block:"start"});});
  $("closeCheckout").addEventListener("click",()=>{$("checkoutPanel").hidden=true;});
  document.querySelectorAll("[data-payment]").forEach(b=>b.addEventListener("click",()=>posSetPayment(b.dataset.payment)));
  $("cashReceived").addEventListener("input",posUpdateChange);
  document.querySelectorAll("[data-cash-exact]").forEach(b=>b.addEventListener("click",()=>{$("cashReceived").value=String(posTotal());posUpdateChange();}));
  document.querySelectorAll("[data-cash-add]").forEach(b=>b.addEventListener("click",()=>{$("cashReceived").value=String(posTotal()+Number(b.dataset.cashAdd));posUpdateChange();}));
  $("checkoutForm").addEventListener("submit",async event=>{
    event.preventDefault();$("checkoutError").textContent="";const due=posTotal(),received=posPayment==="cash"?Number($("cashReceived").value):due;
    if(!posBoxes()){ $("checkoutError").textContent="Add at least one box.";return; }
    if(!Number.isSafeInteger(received)||received<due){$("checkoutError").textContent="Cash received must cover the total.";return;}
    if(!posRequestId)posRequestId=crypto.randomUUID().replace(/-/g,"");
    const items=Object.entries(posCart).filter(([,n])=>n>0).map(([flavor,boxes])=>({flavor,boxes}));
    $("confirmPayment").disabled=true;$("confirmPayment").textContent="Saving sale…";
    try{const result=await api("/api/rms/pos/checkout",{method:"POST",body:JSON.stringify({requestId:posRequestId,items,paymentMethod:posPayment,amountTenderedPesos:received})});posReceipt(result.sale);if(["owner","admin","manager"].includes(currentStaff?.role))loadPosManagement().catch(console.error);}
    catch(error){$("checkoutError").textContent=error.message||"Checkout failed. Retry to safely check the same sale request.";}
    finally{posUpdateChange();}
  });
  $("printReceipt").addEventListener("click",()=>window.print());
  $("newSale").addEventListener("click",posReset);
  $("refreshPos").addEventListener("click",()=>loadPosManagement().catch(console.error));
  posReset();

  $("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";try{const d=await api("/api/staff/login",{method:"POST",body:JSON.stringify({nickname:$("nickname").value,pin:$("pin").value})});$("pin").value="";routeSignedIn(d.staff);}catch(err){$("loginError").textContent=err.message;}});
  $("pinForm").addEventListener("submit",async e=>{e.preventDefault();$("pinError").textContent="";if($("newPin").value!==$("confirmPin").value){$("pinError").textContent="PINs do not match";return;}try{await api("/api/staff/change-pin",{method:"POST",body:JSON.stringify({pin:$("newPin").value})});$("newPin").value=$("confirmPin").value="";await session();}catch(err){$("pinError").textContent=err.message;}});
  $("userAccessForm").addEventListener("submit",async e=>{e.preventDefault();$("userAccessMessage").textContent="";try{const d=await api("/api/rms/users/temporary-pin",{method:"POST",body:JSON.stringify({nickname:$("staffNickname").value,temporaryPin:$("temporaryPin").value})});$("temporaryPin").value="";$("userAccessMessage").textContent=`Temporary access issued for ${d.nickname}. Give the PIN to the staff member securely.`;await loadUsers();}catch(err){$("userAccessMessage").textContent=err.message;}});
  $("logout").addEventListener("click",async()=>{try{await api("/api/staff/logout",{method:"POST"});}finally{currentStaff=null;show("appContent",false);show("accessPanel",false);show("loginPanel",true);}});
  $("refreshVouchers").onclick=()=>loadVouchers().catch(console.error);$("voucherStatus").onchange=()=>loadVouchers().catch(console.error);$("voucherDate").onchange=()=>loadVouchers().catch(console.error);$("refreshAudit").onclick=()=>loadAudit().catch(console.error);
  loadNicknames();session();
})();
