(() => {
  const API=(window.HAPKEK_RMS_API||"").replace(/\/$/,"");
  const $=id=>document.getElementById(id);
  const show=(id,on)=>$(id).hidden=!on;
  let currentStaff=null,scanner=null,scanBusy=false;
  async function api(path,options={}){
    const r=await fetch(API+path,{...options,credentials:"include",cache:"no-store",headers:{"Content-Type":"application/json",...(options.headers||{})}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error(data.error||"Request failed");e.status=r.status;e.data=data;throw e;}return data;
  }
  function cell(text){const td=document.createElement("td");td.textContent=text==null?"—":String(text);return td;}
  function row(parent,values){const tr=document.createElement("tr");values.forEach(v=>tr.append(v instanceof Node?v:cell(v)));parent.append(tr);}
  function fmt(value){if(!value)return "—";return new Date(value).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"});}
  function showLogin(message=""){currentStaff=null;show("appContent",false);show("pinSetupPanel",false);show("loginPanel",true);document.body.classList.add("auth-landing");$("mainHeader").hidden=true;$("loginError").textContent=message;$("loginPin").value="";}
  function routeSignedIn(staff){
    currentStaff=staff;$("mainHeader").hidden=false;$("userName").textContent=staff.displayName||staff.nickname||"Staff";$("userRole").textContent=(staff.role||"staff").toUpperCase();
    show("loginPanel",false);show("pinSetupPanel",Boolean(staff.mustChangePin));show("accessPanel",false);document.body.classList.toggle("auth-landing",Boolean(staff.mustChangePin));
    if(staff.mustChangePin){show("appContent",false);$("pinChangeError").textContent="";return;}
    show("appContent",true);const canManage=String(staff.role||"staff").toLowerCase()==="admin";document.querySelectorAll(".admin-only,.admin-nav").forEach(el=>{el.hidden=!canManage;});show("posManagement",canManage);$("dateLine").textContent="Point of sale and voucher tools · Philippine time";refresh();
  }
  $("loginForm").addEventListener("submit",async e=>{e.preventDefault();$("loginError").textContent="";try{const d=await api("/api/staff/login",{method:"POST",body:JSON.stringify({nickname:$("loginNickname").value,pin:$("loginPin").value})});routeSignedIn(d.staff);}catch(x){$("loginError").textContent=x.message||"Sign-in failed."; }});
  document.querySelectorAll("[data-reveal]").forEach(button=>button.addEventListener("click",()=>{const field=$(button.dataset.reveal),visible=field.type==="password";field.type=visible?"text":"password";button.innerHTML=visible?"<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8\"/><path d=\"M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1 0 2-.2 2.9-.5\"/></svg>":"<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>";button.setAttribute("aria-label",visible?"Hide PIN":"Show PIN");button.setAttribute("aria-pressed",String(visible));field.focus();}));
  ["newPin","confirmPin","loginPin"].forEach(id=>$(id).addEventListener("input",()=>{const field=$(id);field.setCustomValidity("");field.removeAttribute("aria-invalid");if(id==="newPin"||id==="confirmPin")$("pinChangeError").textContent="";else $("loginError").textContent="";}));
  $("pinChangeForm").addEventListener("submit",async e=>{e.preventDefault();$("pinChangeError").textContent="";const p=$("newPin").value,confirm=$("confirmPin").value;if(!/^[0-9]{4}$/.test(p)){$("pinChangeError").textContent="Use exactly 4 digits (0–9).";$("newPin").setAttribute("aria-invalid","true");$("newPin").focus();return;}if(!/^[0-9]{4}$/.test(confirm)){$("pinChangeError").textContent="Confirmation must contain exactly 4 digits (0–9).";$("confirmPin").setAttribute("aria-invalid","true");$("confirmPin").focus();return;}if(p!==confirm){$("pinChangeError").textContent="The PIN entries do not match.";$("confirmPin").setAttribute("aria-invalid","true");$("confirmPin").focus();return;}try{await api("/api/staff/change-pin",{method:"POST",body:JSON.stringify({pin:p})});const d=await api("/api/staff/me");routeSignedIn(d.staff);}catch(x){$("pinChangeError").textContent=x.message||"Could not save PIN."; }});
  $("logoutButton").addEventListener("click",async()=>{try{await api("/api/staff/logout",{method:"POST"});}catch{}showLogin();});
  async function loadOverview(){const d=await api("/api/rms/overview");$("dateLine").textContent=`Business date: ${d.date} · Philippine time`;$("plays").textContent=d.metrics.playsToday.toLocaleString();$("issued").textContent=d.metrics.vouchersIssuedToday.toLocaleString();$("redeemed").textContent=d.metrics.vouchersRedeemedToday.toLocaleString();$("outstanding").textContent=d.metrics.outstandingToday.toLocaleString();
    const body=$("prizeRows");body.replaceChildren();d.prizes.forEach(p=>{const remaining=Math.max(0,Number(p.daily_limit)-Number(p.issued_today));const state=!p.active?"Inactive":remaining===0?"Sold out":"Available";row(body,[p.label,p.daily_limit, p.issued_today,remaining,state]);});
  }
  async function loadVouchers(){const params=new URLSearchParams({limit:"100",status:$("voucherStatus").value});if($("voucherDate").value)params.set("date",$("voucherDate").value);const d=await api("/api/rms/vouchers?"+params);const body=$("voucherRows");body.replaceChildren();if(!d.vouchers.length){row(body,["No matching vouchers","","","","",""]);return;}d.vouchers.forEach(v=>{const status=document.createElement("span");status.className="status"+(v.redeemed_at?" used":"");status.textContent=v.redeemed_at?"REDEEMED":"ISSUED";row(body,[v.voucher_code,v.label,v.player_id,fmt(v.created_at),status,v.redeemed_by||"—"]);});}
  async function loadAudit(){const d=await api("/api/rms/audit");const body=$("auditRows");body.replaceChildren();if(!d.events.length){row(body,["No audit events yet","","","",""]);return;}d.events.forEach(a=>{let details="";try{details=JSON.stringify(JSON.parse(a.details_json));}catch{}row(body,[fmt(a.created_at),a.display_name||a.username||"System",a.action,a.entity_type+" "+(a.entity_id||""),details]);});}
  async function refresh(){try{if(currentStaff?.role==="admin")await Promise.all([loadOverview(),loadVouchers(),loadAudit(),loadPosManagement()]);}catch(e){if(e.status===401)showLogin("Your session expired. Sign in again.");else console.error(e);}}
  function clearIssuedTemporaryPin(){const panel=$("issuedTemporaryPin"),pin=$("issuedPin"),copy=$("copyIssuedPin");if(panel)panel.hidden=true;if(pin)pin.textContent="••••";if(copy)copy.textContent="Copy PIN";}
  async function session(){try{const d=await api("/api/staff/me");routeSignedIn(d.staff);}catch{showLogin();}}

  function safeResult(kind,title,message){
    const el=$("result");el.replaceChildren();el.className="scan-result "+kind;
    const heading=document.createElement("h3"),detail=document.createElement("p");
    heading.textContent=title;detail.textContent=message;el.append(heading,detail);show("result",true);
  }
  function parseVoucher(raw){
    const text=String(raw||"").trim();
    try{const parsed=JSON.parse(text);if(parsed.brand==="HAPKEK"&&parsed.voucher)return String(parsed.voucher).toUpperCase();}catch{}
    const match=text.match(/HAP-[A-HJ-NP-Z2-9]{10}/i);
    return match?match[0].toUpperCase():text.toUpperCase();
  }
  async function redeem(raw){
    if(scanBusy)return;
    const code=parseVoucher(raw);
    if(!code){safeResult("bad","Voucher code required","Scan a QR code or enter a voucher code.");return;}
    scanBusy=true;
    try{
      const data=await api("/api/staff/redeem",{method:"POST",body:JSON.stringify({code})});
      safeResult("good","Voucher redeemed",data.voucher.label+" · "+data.voucher.voucher_code);
      $("manualCode").value="";
    }catch(error){
      const status=error.data?.status;
      safeResult("bad",status==="already_redeemed"?"Already redeemed":error.status===404?"Voucher not found":"Could not redeem",error.message);
    }finally{
      scanBusy=false;
      if(scanner){try{await scanner.resume();}catch{}}
    }
  }
  async function startScanner(){
    if(!window.Html5Qrcode){safeResult("bad","Scanner unavailable","The camera library did not load. Enter the voucher code manually.");return;}
    if(scanner)await stopScanner();
    try{
      scanner=new Html5Qrcode("reader");
      await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:240,height:240}},async decodedText=>{
        if(scanBusy)return;
        try{await scanner.pause(true);}catch{}
        await redeem(decodedText);
      });
      show("startScan",false);show("stopScan",true);
    }catch(error){scanner=null;safeResult("bad","Camera unavailable",error.message+" Check camera permission and use RMS over HTTPS.");}
  }
  async function stopScanner(){
    if(scanner){try{await scanner.stop();await scanner.clear();}catch{}scanner=null;}
    if($("startScan"))show("startScan",true);
    if($("stopScan"))show("stopScan",false);
  }
  $("startScan").addEventListener("click",startScanner);
  $("stopScan").addEventListener("click",stopScanner);
  $("checkCode").addEventListener("click",()=>redeem($("manualCode").value));
  $("manualCode").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();redeem(event.target.value);}});
  document.querySelectorAll(".nav").forEach(link=>link.addEventListener("click",()=>{if(link.id!=="scanNav")stopScanner();}));

  const POS_NAMES={bavarian:"Bavarian",cheese:"Cheese",ube:"Ube",choco:"Choco",strawberry:"Strawberry",mixed:"Mixed"};
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
    if(posPayment!==method)posRequestId=null;
    posPayment=method;document.querySelectorAll("[data-payment]").forEach(b=>{const active=b.dataset.payment===method;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",String(active));});
    $("cashFields").hidden=method!=="cash";$("referenceField").hidden=method==="cash";
    $("paymentHint").textContent=method==="cash"?"Enter the amount received from the customer.":"Confirm the "+(method==="gcash"?"GCash transfer":"card payment")+" has been received before continuing.";
    posCartRender();
  }
  function posReceipt(sale){
    $("pos").classList.add("has-receipt");
    $("checkoutPanel").hidden=true;$("receiptPanel").hidden=false;const root=$("receiptDetails");root.replaceChildren();
    const title=document.createElement("h4");title.textContent="HAPKEK";root.append(title);
    const subtitle=document.createElement("p");subtitle.textContent="JAPANESE CAKE · SALES RECEIPT";root.append(subtitle);
    function add(label,value,cls){const row=document.createElement("div");row.className="receipt-row "+(cls||"");const a=document.createElement("span"),b=document.createElement("strong");a.textContent=label;b.textContent=value;row.append(a,b);root.append(row);}
    add("Receipt",sale.receiptNo);add("Date",fmt(sale.createdAt));add("Cashier",sale.cashierName);if(sale.customerName)add("Customer",sale.customerName);root.append(document.createElement("hr"));
    sale.items.forEach(item=>add((item.flavorLabel||POS_NAMES[item.flavor])+" · "+item.boxes+" box × 15 pcs",posMoney(item.lineTotalPesos)));
    root.append(document.createElement("hr"));add("Total boxes",String(sale.boxes));add("Total pieces",String(sale.pieces));add("TOTAL",posMoney(sale.totalPesos),"receipt-total");add("Payment",sale.paymentMethod.toUpperCase());
    if(sale.paymentMethod==="cash"){add("Cash received",posMoney(sale.amountTenderedPesos));add("Change",posMoney(sale.changeDuePesos));}
    if(sale.paymentReference)add("Payment reference",sale.paymentReference);
    if(sale.orderNotes){const note=document.createElement("p");note.className="receipt-note";note.textContent="Order notes: "+sale.orderNotes;root.append(note);}
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
    $("pos").classList.remove("has-receipt");
    posFlavor="bavarian";posQty=1;posCart={};posRequestId=null;
    document.querySelectorAll("[data-flavor]").forEach(b=>{const active=b.dataset.flavor===posFlavor;b.classList.toggle("is-selected",active);b.setAttribute("aria-pressed",String(active));});
    $("cashReceived").value="";$("customerName").value="";$("orderNotes").value="";$("paymentReference").value="";$("checkoutError").textContent="";$("checkoutPanel").hidden=true;$("receiptPanel").hidden=true;posSetPayment("cash");posProductRender();posCartRender();
  }
  document.querySelectorAll("[data-flavor]").forEach(button=>button.addEventListener("click",()=>{posFlavor=button.dataset.flavor;document.querySelectorAll("[data-flavor]").forEach(b=>{const active=b===button;b.classList.toggle("is-selected",active);b.setAttribute("aria-pressed",String(active));});}));
  $("productMinus").addEventListener("click",()=>{posQty=Math.max(1,posQty-1);posProductRender();});
  $("productPlus").addEventListener("click",()=>{posQty=Math.min(99,posQty+1);posProductRender();});
  $("addToOrder").addEventListener("click",()=>{posAdd(posFlavor,posQty);posQty=1;posProductRender();});
  document.querySelectorAll("[data-quick-boxes]").forEach(b=>b.addEventListener("click",()=>posAdd(posFlavor,Number(b.dataset.quickBoxes))));
  $("cartDrawerToggle").addEventListener("click",()=>{const details=$("cartDrawerDetails"),expanded=$("cartDrawerToggle").getAttribute("aria-expanded")==="true";details.hidden=expanded;$("cartDrawerToggle").setAttribute("aria-expanded",String(!expanded));$("cartDrawerToggle").textContent=expanded?"View order":"Hide order";$("pos").classList.toggle("cart-expanded",!expanded);});
  $("cartItems").addEventListener("click",event=>{const b=event.target.closest("button[data-cart-flavor]");if(!b)return;const flavor=b.dataset.cartFlavor,delta=Number(b.dataset.cartDelta),next=(posCart[flavor]||0)+delta;if(next<=0)delete posCart[flavor];else if(posBoxes()+delta<=99)posCart[flavor]=next;posRequestId=null;posCartRender();});
  $("openCheckout").addEventListener("click",()=>{$("checkoutPanel").hidden=false;$("receiptPanel").hidden=true;$("cashReceived").value=String(posTotal());$("checkoutTotal").textContent=posMoney(posTotal());posSetPayment(posPayment);});
  $("closeCheckout").addEventListener("click",()=>{$("checkoutPanel").hidden=true;});
  document.querySelectorAll("[data-payment]").forEach(b=>b.addEventListener("click",()=>posSetPayment(b.dataset.payment)));
  $("cashReceived").addEventListener("input",posUpdateChange);
  ["customerName","orderNotes","paymentReference"].forEach(id=>$(id).addEventListener("input",()=>{posRequestId=null;}));
  document.querySelectorAll("[data-cash-exact]").forEach(b=>b.addEventListener("click",()=>{$("cashReceived").value=String(posTotal());posUpdateChange();}));
  document.querySelectorAll("[data-cash-add]").forEach(b=>b.addEventListener("click",()=>{$("cashReceived").value=String(posTotal()+Number(b.dataset.cashAdd));posUpdateChange();}));
  $("checkoutForm").addEventListener("submit",async event=>{
    event.preventDefault();$("checkoutError").textContent="";const due=posTotal(),received=posPayment==="cash"?Number($("cashReceived").value):due;
    if(!posBoxes()){ $("checkoutError").textContent="Add at least one box.";return; }
    if(!Number.isSafeInteger(received)||received<due){$("checkoutError").textContent="Cash received must cover the total.";return;}
    if(!posRequestId)posRequestId=crypto.randomUUID().replace(/-/g,"");
    const items=Object.entries(posCart).filter(([,n])=>n>0).map(([flavor,boxes])=>({flavor,boxes}));
    $("confirmPayment").disabled=true;$("confirmPayment").textContent="Saving sale…";
    try{const result=await api("/api/rms/pos/checkout",{method:"POST",body:JSON.stringify({requestId:posRequestId,items,paymentMethod:posPayment,amountTenderedPesos:received,customerName:$("customerName").value.trim(),orderNotes:$("orderNotes").value.trim(),paymentReference:posPayment==="cash"?"":$("paymentReference").value.trim()})});posReceipt(result.sale);if(["admin"].includes(currentStaff?.role))loadPosManagement().catch(console.error);}
    catch(error){$("checkoutError").textContent=error.message||"Checkout failed. Retry to safely check the same sale request.";}
    finally{posUpdateChange();}
  });
  $("printReceipt").addEventListener("click",()=>window.print());
  $("newSale").addEventListener("click",posReset);
  $("refreshPos").addEventListener("click",()=>loadPosManagement().catch(console.error));
  posReset();

  $("refreshVouchers").onclick=()=>loadVouchers().catch(console.error);$("voucherStatus").onchange=()=>loadVouchers().catch(console.error);$("voucherDate").onchange=()=>loadVouchers().catch(console.error);$("refreshAudit").onclick=()=>loadAudit().catch(console.error);

  // Top-level workspace navigation: one task surface at a time.
  const viewTitles={pos:"Point of sale",scan:"Voucher scanner",overview:"Overview",vouchers:"Voucher ledger",campaign:"Daily campaign stock",audit:"Audit history"};
  const viewIds=["pos","scan","overview","vouchers","campaign","audit"];
  function activateView(id){
    if(!viewIds.includes(id))id="pos";
    if(["overview","vouchers","campaign","audit"].includes(id)&&currentStaff?.role!=="admin")id="pos";
    const target=$(id);if(!target)return;
    viewIds.forEach(view=>{const el=$(view);if(el)el.classList.toggle("is-active",view===id);});
    document.querySelectorAll(".nav[data-view]").forEach(link=>{const active=link.dataset.view===id;link.classList.toggle("active",active);if(active)link.setAttribute("aria-current","page");else link.removeAttribute("aria-current");});
    $("mainHeader").querySelector("h1").textContent=viewTitles[id]||"HAPKEK RMS";
    document.body.classList.remove("menu-open");
    $("menuToggle").setAttribute("aria-expanded","false");
    $("menuToggle").setAttribute("aria-label","Open navigation");
    $("drawerBackdrop").hidden=true;
    if(id!=="scan")stopScanner();
    if(id==="scan"&&currentStaff){} 
    history.replaceState(null,"","#"+id);
  }
  function setMenu(open){
    document.body.classList.toggle("menu-open",open);
    $("menuToggle").setAttribute("aria-expanded",String(open));
    $("menuToggle").setAttribute("aria-label",open?"Close navigation":"Open navigation");
    $("drawerBackdrop").hidden=!open;
    if(open){const first=$("sidebar").querySelector(".nav:not([hidden])");if(first)first.focus();}
  }
  $("menuToggle").addEventListener("click",()=>setMenu(!document.body.classList.contains("menu-open")));
  $("drawerBackdrop").addEventListener("click",()=>setMenu(false));
  document.querySelectorAll(".nav[data-view]").forEach(link=>link.addEventListener("click",event=>{event.preventDefault();activateView(link.dataset.view);}));
  document.addEventListener("keydown",event=>{
    if(!document.body.classList.contains("menu-open"))return;
    if(event.key==="Escape"){$("menuToggle").focus();setMenu(false);return;}
    if(event.key==="Tab"){
      const focusable=Array.from($("sidebar").querySelectorAll('a[href]:not([hidden]),button:not([hidden])')).filter(el=>el.offsetParent!==null);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  viewIds.forEach(id=>{const el=$(id);if(el)el.classList.add("workspace-view");});
  const initialView=location.hash.slice(1);
  activateView(viewIds.includes(initialView)?initialView:"pos");

  // POS is a three-stage counter flow; cart and totals remain visible throughout.
  const posScreen=$("pos");
  posScreen.dataset.posStage="1";
  // Keep checkout in the active POS workspace column, not below the viewport.\n  $("pos").querySelector(".pos-product-area").append($("checkoutPanel"));\n  $("overview").append($("posManagement"));\n  const flow=document.createElement("div");flow.className="rms-flow";flow.setAttribute("aria-label","Sale progress");
  flow.innerHTML='<span class="rms-flow-step active" data-flow-step="1"><b>1</b> Build order</span><i class="rms-flow-line"></i><span class="rms-flow-step" data-flow-step="2"><b>2</b> Details</span><i class="rms-flow-line"></i><span class="rms-flow-step" data-flow-step="3"><b>3</b> Payment</span>';
  $("pos").querySelector(".pos-heading").after(flow);
  const actions=document.createElement("div");actions.className="flow-actions";actions.innerHTML='<p class="flow-hint" id="flowHint">Choose flavors and add boxes to the order.</p><button type="button" class="outline" id="flowBack" hidden>Back</button><button type="button" class="primary" id="flowNext">Continue to details →</button>';
  $("pos").append(actions);
  function setPosStage(stage){
    const next=Math.max(1,Math.min(3,stage));posScreen.dataset.posStage=String(next);
    document.querySelectorAll("[data-flow-step]").forEach(el=>{const n=Number(el.dataset.flowStep);el.classList.toggle("active",n===next);el.classList.toggle("done",n<next);});
    $("flowBack").hidden=next===1;
    $("flowNext").hidden=next===3;
    $("flowNext").textContent=next===1?"Continue to details →":"Continue to payment →";
    $("flowHint").textContent=next===1?"Choose flavors and add boxes to the order.":next===2?"Customer name and notes are optional.":"Review the order summary, then confirm payment.";
    if(next===3){$("checkoutPanel").hidden=false;$("receiptPanel").hidden=true;$("cashReceived").value=String(posTotal());posSetPayment(posPayment);posCartRender();}
    else $("checkoutPanel").hidden=true;
  }
  $("flowNext").addEventListener("click",()=>{
    const stage=Number(posScreen.dataset.posStage);
    if(stage===1){if(!posBoxes()){$("flowHint").textContent="Add at least one box before continuing.";return;}setPosStage(2);}
    else if(stage===2){setPosStage(3);}
  });
  $("flowBack").addEventListener("click",()=>setPosStage(Number(posScreen.dataset.posStage)-1));
  $("openCheckout").addEventListener("click",()=>setPosStage(3));
  $("closeCheckout").addEventListener("click",()=>setPosStage(2));
  $("newSale").addEventListener("click",()=>{setPosStage(1);activateView("pos");});
  setPosStage(1);
  session();
})();
