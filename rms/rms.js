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
  const signInFields=[$("nickname"),$("pin")];
  const signInAnnouncer=document.createElement("div");
  signInAnnouncer.className="visually-hidden";
  signInAnnouncer.setAttribute("aria-live","polite");
  document.body.append(signInAnnouncer);
  let signInAnnouncementTimer=null;
  function syncSignInField(field,announce=false){
    if(!signInFields.includes(field))return;
    const invalid=field.matches(":user-invalid");
    const wasInvalid=field.getAttribute("aria-invalid")==="true";
    field.setAttribute("aria-invalid",invalid?"true":"false");
    const errorId=field.dataset.error;
    const descriptions=(field.getAttribute("aria-describedby")||"").split(/\s+/).filter(id=>id&&id!==errorId);
    if(invalid&&errorId)descriptions.push(errorId);
    if(descriptions.length)field.setAttribute("aria-describedby",descriptions.join(" "));
    else field.removeAttribute("aria-describedby");
    if(invalid&&announce&&!wasInvalid){
      clearTimeout(signInAnnouncementTimer);
      signInAnnouncer.textContent="";
      const label=field.labels?.[0]?.textContent?.trim()||"Field";
      const message=$(errorId)?.textContent?.trim()||"Check this field.";
      signInAnnouncementTimer=setTimeout(()=>{signInAnnouncer.textContent=label+": "+message;},500);
    }else if(!invalid&&wasInvalid){
      clearTimeout(signInAnnouncementTimer);
      signInAnnouncer.textContent="";
    }
  }
  signInFields.forEach(field=>field.setAttribute("aria-invalid","false"));
  document.addEventListener("blur",event=>syncSignInField(event.target,true),true);
  document.addEventListener("input",event=>syncSignInField(event.target),true);
  document.addEventListener("change",event=>syncSignInField(event.target,true),true);
  document.addEventListener("invalid",event=>syncSignInField(event.target),true);

  async function loadNicknames(){
    const select=$("nickname");
    try{
      const data=await api("/api/staff/users");
      const activeUsers=(data.users||[]).filter(user=>user.active);
      const placeholder=new Option(activeUsers.length?"Choose your staff account":"No active staff accounts","",true,true);
      placeholder.disabled=true;
      select.replaceChildren(placeholder);
      activeUsers.forEach(user=>select.add(new Option(user.nickname,user.nickname)));
      select.disabled=activeUsers.length===0;
    }catch{
      const placeholder=new Option("Could not load staff accounts","",true,true);
      placeholder.disabled=true;
      select.replaceChildren(placeholder);
      select.disabled=true;
    }
  }
  function routeSignedIn(staff){
    currentStaff=staff;
    $("userName").textContent=staff.displayName||staff.nickname||"Staff";
    $("userRole").textContent=staff.role||"staff";
    show("loginPanel",false);show("pinSetupPanel",Boolean(staff.mustChangePin));show("accessPanel",false);
    document.body.classList.toggle("auth-landing",Boolean(staff.mustChangePin));
    if(staff.mustChangePin){show("appContent",false);return;}
    show("appContent",true);
    const role=String(staff.role||"staff").toLowerCase();
    const canManage=role==="admin";
    document.querySelectorAll(".admin-only,.admin-nav").forEach(el=>{el.hidden=!canManage;});
    show("users",role==="admin"&&String(staff.username||"").toLowerCase()==="ana");
    show("posManagement",canManage);
    $("dateLine").textContent="Point of sale and voucher tools · Philippine time";
    refresh();
  }
  async function loadUsers(){const d=await api("/api/rms/users");const body=$("userRows");body.replaceChildren();d.users.forEach(u=>row(body,[u.nickname,u.role,u.active?"Active":"Pending",u.mustChangePin?"Temporary PIN required":"Set"]));}
  async function loadOverview(){const d=await api("/api/rms/overview");$("dateLine").textContent=`Business date: ${d.date} · Philippine time`;$("plays").textContent=d.metrics.playsToday.toLocaleString();$("issued").textContent=d.metrics.vouchersIssuedToday.toLocaleString();$("redeemed").textContent=d.metrics.vouchersRedeemedToday.toLocaleString();$("outstanding").textContent=d.metrics.outstandingToday.toLocaleString();
    const body=$("prizeRows");body.replaceChildren();d.prizes.forEach(p=>{const remaining=Math.max(0,Number(p.daily_limit)-Number(p.issued_today));const state=!p.active?"Inactive":remaining===0?"Sold out":"Available";row(body,[p.label,p.daily_limit, p.issued_today,remaining,state]);});
  }
  async function loadVouchers(){const params=new URLSearchParams({limit:"100",status:$("voucherStatus").value});if($("voucherDate").value)params.set("date",$("voucherDate").value);const d=await api("/api/rms/vouchers?"+params);const body=$("voucherRows");body.replaceChildren();if(!d.vouchers.length){row(body,["No matching vouchers","","","","",""]);return;}d.vouchers.forEach(v=>{const status=document.createElement("span");status.className="status"+(v.redeemed_at?" used":"");status.textContent=v.redeemed_at?"REDEEMED":"ISSUED";row(body,[v.voucher_code,v.label,v.player_id,fmt(v.created_at),status,v.redeemed_by||"—"]);});}
  async function loadAudit(){const d=await api("/api/rms/audit");const body=$("auditRows");body.replaceChildren();if(!d.events.length){row(body,["No audit events yet","","","",""]);return;}d.events.forEach(a=>{let details="";try{details=JSON.stringify(JSON.parse(a.details_json));}catch{}row(body,[fmt(a.created_at),a.display_name||a.username||"System",a.action,a.entity_type+" "+(a.entity_id||""),details]);});}
  async function refresh(){try{if(["admin"].includes(currentStaff?.role)){await Promise.all([loadOverview(),loadVouchers(),loadAudit(),loadPosManagement(),...(currentStaff?.role==="admin"&&String(currentStaff?.username||"").toLowerCase()==="ana"?[loadUsers()]:[])]);}}catch(e){if(e.status===401){currentStaff=null;document.body.classList.add("auth-landing");show("appContent",false);show("loginPanel",true);show("pinSetupPanel",false);}else console.error(e);}}
  function clearIssuedTemporaryPin(){const panel=$("issuedTemporaryPin"),pin=$("issuedPin"),copy=$("copyIssuedPin");if(panel)panel.hidden=true;if(pin)pin.textContent="••••";if(copy)copy.textContent="Copy PIN";}
  async function session(){try{const d=await api("/api/staff/me");routeSignedIn(d.staff);}catch{clearIssuedTemporaryPin();document.body.classList.add("auth-landing");show("loginPanel",true);show("pinSetupPanel",false);show("appContent",false);show("accessPanel",false);}}

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
    if(posPayment!==method)posRequestId=null;
    posPayment=method;document.querySelectorAll("[data-payment]").forEach(b=>{const active=b.dataset.payment===method;b.classList.toggle("selected",active);b.setAttribute("aria-pressed",String(active));});
    $("cashFields").hidden=method!=="cash";$("referenceField").hidden=method==="cash";
    $("paymentHint").textContent=method==="cash"?"Enter the amount received from the customer.":"Confirm the "+(method==="gcash"?"GCash transfer":"card payment")+" has been received before continuing.";
    posCartRender();
  }
  function posReceipt(sale){
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
    posFlavor="bavarian";posQty=1;posCart={};posRequestId=null;
    document.querySelectorAll("[data-flavor]").forEach(b=>{const active=b.dataset.flavor===posFlavor;b.classList.toggle("is-selected",active);b.setAttribute("aria-pressed",String(active));});
    $("cashReceived").value="";$("customerName").value="";$("orderNotes").value="";$("paymentReference").value="";$("checkoutError").textContent="";$("checkoutPanel").hidden=true;$("receiptPanel").hidden=true;posSetPayment("cash");posProductRender();posCartRender();
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

  $("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();
    $("loginError").textContent="";
    $("pin").removeAttribute("aria-describedby");
    $("pin").setAttribute("aria-invalid","false");
    try{
      const data=await api("/api/staff/login",{method:"POST",body:JSON.stringify({nickname:$("nickname").value,pin:$("pin").value})});
      $("pin").value="";
      $("togglePin").textContent="Show PIN";
      $("togglePin").setAttribute("aria-pressed","false");
      $("pin").type="password";
      routeSignedIn(data.staff);
    }catch(error){
      $("loginError").textContent=error.message;
      $("pin").setAttribute("aria-invalid","true");
      $("pin").setAttribute("aria-describedby","loginError");
      $("pin").focus();
    }
  });
  $("pin").addEventListener("input",()=>{
    if($("loginError").textContent){
      $("loginError").textContent="";
      $("pin").removeAttribute("aria-describedby");
      $("pin").setAttribute("aria-invalid","false");
    }
  });
  $("togglePin").addEventListener("click",()=>{
    const input=$("pin"),button=$("togglePin");
    const reveal=input.type==="password";
    input.type=reveal?"text":"password";
    button.textContent=reveal?"Hide PIN":"Show PIN";
    button.setAttribute("aria-pressed",String(reveal));
    input.focus();
  });
  $("pinForm").addEventListener("submit",async e=>{e.preventDefault();$("pinError").textContent="";if($("newPin").value!==$("confirmPin").value){$("pinError").textContent="PINs do not match";return;}try{await api("/api/staff/change-pin",{method:"POST",body:JSON.stringify({pin:$("newPin").value})});$("newPin").value=$("confirmPin").value="";await session();}catch(err){$("pinError").textContent=err.message;}});
  $("userAccessForm").addEventListener("submit",async e=>{
    e.preventDefault();
    $("userAccessMessage").textContent="";
    $("issuedTemporaryPin").hidden=true;
    $("issuedPin").textContent="••••";
    $("issueAnmerPin").disabled=true;
    try{
      const d=await api("/api/rms/users/temporary-pin",{method:"POST",body:JSON.stringify({nickname:"Anmer"})});
      $("issuedPin").textContent=d.temporaryPin;
      $("issuedTemporaryPin").hidden=false;
      $("userAccessMessage").textContent="Anmer's temporary PIN has been generated. Only Ana can see it here; pass it directly to him.";
      await loadUsers();
    }catch(err){$("userAccessMessage").textContent=err.message;}
    finally{$("issueAnmerPin").disabled=false;}
  });
  $("copyIssuedPin").addEventListener("click",async()=>{
    const pin=$("issuedPin").textContent;
    try{await navigator.clipboard.writeText(pin);$("copyIssuedPin").textContent="Copied";}catch{$("copyIssuedPin").textContent="Select PIN to copy";}
  });
  $("logout").addEventListener("click",async()=>{await stopScanner();try{await api("/api/staff/logout",{method:"POST"});}finally{clearIssuedTemporaryPin();currentStaff=null;document.body.classList.add("auth-landing");show("appContent",false);show("accessPanel",false);show("pinSetupPanel",false);show("loginPanel",true);}});
  $("refreshVouchers").onclick=()=>loadVouchers().catch(console.error);$("voucherStatus").onchange=()=>loadVouchers().catch(console.error);$("voucherDate").onchange=()=>loadVouchers().catch(console.error);$("refreshAudit").onclick=()=>loadAudit().catch(console.error);
  loadNicknames();session();
})();
