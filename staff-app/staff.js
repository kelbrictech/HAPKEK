(() => {
  const API=(window.HAPKEK_STAFF_API||"").replace(/\/$/,"");
  const $=id=>document.getElementById(id);
  const show=(id,on)=>$(id).hidden=!on;
  const FLAVOURS={bavarian:"Bavarian",cheese:"Cheese",ube:"Ube",choco:"Choco",strawberry:"Strawberry"};
  const UNIT_PRICE=150,PIECES_PER_BOX=15,MAX_BOXES=99;
  let currentStaff=null,scanner=null,scanBusy=false,checkoutBusy=false;
  let selectedFlavour="bavarian",selectedQty=1,cart={},paymentMethod="cash",requestId=null;
  const money=n=>"₱"+Number(n||0).toLocaleString("en-PH",{maximumFractionDigits:0});
  const boxes=()=>Object.values(cart).reduce((sum,n)=>sum+n,0);
  const total=()=>boxes()*UNIT_PRICE;
  async function api(path,options={}){
    const response=await fetch(API+path,{...options,credentials:"include",cache:"no-store",
      headers:{"Content-Type":"application/json",...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(data.error||"Request failed");error.status=response.status;error.data=data;throw error;}
    return data;
  }
  function safeResult(kind,title,message){
    const el=$("result");el.replaceChildren();el.className="result "+kind;
    const heading=document.createElement("h3");heading.textContent=title;
    const text=document.createElement("p");text.textContent=message;
    el.append(heading,text);show("result",true);
  }
  async function loadNicknames(){
    try{
      const data=await api("/api/staff/users",{method:"GET"});
      const select=$("nickname");select.replaceChildren(new Option("Select your nickname",""));
      data.users.filter(user=>user.active).forEach(user=>select.add(new Option(user.nickname,user.nickname)));
      if(!select.options.length||select.options.length===1)select.replaceChildren(new Option("No active staff accounts",""));
    }catch{$("nickname").replaceChildren(new Option("Could not load staff accounts",""));}
  }
  function showSignedIn(staff){
    currentStaff=staff;show("login",false);show("pinSetup",Boolean(staff.mustChangePin));show("app",!staff.mustChangePin);
    if(!staff.mustChangePin){
      $("staffName").textContent=staff.displayName||staff.nickname||"Cashier";
      $("businessDate").textContent=new Date().toLocaleDateString("en-PH",{timeZone:"Asia/Manila",weekday:"short",day:"numeric",month:"short",year:"numeric"})+" · Philippine time";
      switchWorkspace("pos");
      renderProduct();renderCart();
    }
  }
  async function checkSession(){
    try{const data=await api("/api/staff/me",{method:"GET"});showSignedIn(data.staff);}
    catch{currentStaff=null;show("login",true);show("pinSetup",false);show("app",false);}
  }
  $("loginForm").addEventListener("submit",async event=>{
    event.preventDefault();$("loginError").textContent="";
    try{
      const data=await api("/api/staff/login",{method:"POST",body:JSON.stringify({nickname:$("nickname").value,pin:$("pin").value})});
      $("pin").value="";showSignedIn(data.staff);
    }catch(error){$("loginError").textContent=error.message;}
  });
  $("pinForm").addEventListener("submit",async event=>{
    event.preventDefault();$("pinError").textContent="";
    if($("newPin").value!==$("confirmPin").value){$("pinError").textContent="PINs do not match.";return;}
    try{
      await api("/api/staff/change-pin",{method:"POST",body:JSON.stringify({pin:$("newPin").value})});
      $("newPin").value=$("confirmPin").value="";await checkSession();
    }catch(error){$("pinError").textContent=error.message;}
  });
  $("logout").addEventListener("click",async()=>{
    await stopScanner();try{await api("/api/staff/logout",{method:"POST"});}catch{}
    currentStaff=null;cart={};requestId=null;show("app",false);show("pinSetup",false);show("login",true);loadNicknames();
  });

  function switchWorkspace(which){
    const pos=which==="pos";
    show("posWorkspace",pos);show("voucherWorkspace",!pos);
    $("posTab").classList.toggle("active",pos);$("voucherTab").classList.toggle("active",!pos);
    $("posTab").setAttribute("aria-pressed",String(pos));$("voucherTab").setAttribute("aria-pressed",String(!pos));
    if(pos)stopScanner();
  }
  $("posTab").addEventListener("click",()=>switchWorkspace("pos"));
  $("voucherTab").addEventListener("click",()=>switchWorkspace("voucher"));

  function renderProduct(){
    $("qtyValue").textContent=String(selectedQty);
    $("addAmount").textContent=money(selectedQty*UNIT_PRICE);
    document.querySelectorAll("[data-flavor]").forEach(button=>{
      const active=button.dataset.flavor===selectedFlavour;
      button.classList.toggle("selected",active);button.setAttribute("aria-pressed",String(active));
    });
  }
  function renderCart(){
    const list=$("cartItems");list.replaceChildren();
    const chosen=Object.keys(cart).filter(flavour=>cart[flavour]>0);
    show("emptyCart",chosen.length===0);
    chosen.forEach(flavour=>{
      const line=document.createElement("article");line.className="cart-line";
      const main=document.createElement("div");main.className="cart-line-main";
      const title=document.createElement("strong");title.textContent=FLAVOURS[flavour]+" box";
      const sub=document.createElement("small");sub.textContent=PIECES_PER_BOX+" pcs · "+cart[flavour]+" box"+(cart[flavour]===1?"":"es");
      main.append(title,sub);
      const right=document.createElement("div");right.className="cart-line-right";
      const price=document.createElement("strong");price.textContent=money(cart[flavour]*UNIT_PRICE);
      const step=document.createElement("div");step.className="cart-stepper";
      const minus=document.createElement("button");minus.type="button";minus.textContent="−";minus.dataset.flavour=flavour;minus.dataset.delta="-1";minus.setAttribute("aria-label","Remove one "+FLAVOURS[flavour]+" box");
      const quantity=document.createElement("span");quantity.textContent=String(cart[flavour]);
      const plus=document.createElement("button");plus.type="button";plus.textContent="+";plus.dataset.flavour=flavour;plus.dataset.delta="1";plus.setAttribute("aria-label","Add one "+FLAVOURS[flavour]+" box");
      step.append(minus,quantity,plus);right.append(price,step);line.append(main,right);list.append(line);
    });
    const n=boxes(),due=total();
    $("boxCount").textContent=n+" box"+(n===1?"":"es");
    $("totalBoxes").textContent=String(n);$("totalPieces").textContent=String(n*PIECES_PER_BOX);$("orderTotal").textContent=money(due);
    $("checkoutTotal").textContent=money(due);
    $("checkoutOpen").disabled=n===0||checkoutBusy;
    updatePayment();
  }
  function addToCart(flavour,count){
    if(!FLAVOURS[flavour]||!Number.isInteger(count)||count<1)return;
    if(boxes()+count>MAX_BOXES){$("checkoutError").textContent="An order can contain up to 99 boxes.";return;}
    cart[flavour]=(cart[flavour]||0)+count;requestId=null;$("checkoutError").textContent="";
    renderCart();
  }
  document.querySelectorAll("[data-flavor]").forEach(button=>button.addEventListener("click",()=>{
    selectedFlavour=button.dataset.flavor;renderProduct();
  }));
  $("qtyMinus").addEventListener("click",()=>{selectedQty=Math.max(1,selectedQty-1);renderProduct();});
  $("qtyPlus").addEventListener("click",()=>{selectedQty=Math.min(MAX_BOXES-boxes(),selectedQty+1);if(selectedQty<1)selectedQty=1;renderProduct();});
  $("addItem").addEventListener("click",()=>{addToCart(selectedFlavour,selectedQty);selectedQty=1;renderProduct();});
  document.querySelectorAll("[data-quick]").forEach(button=>button.addEventListener("click",()=>addToCart(selectedFlavour,Number(button.dataset.quick))));
  $("cartItems").addEventListener("click",event=>{
    const button=event.target.closest("button[data-flavour]");if(!button)return;
    const flavour=button.dataset.flavour,delta=Number(button.dataset.delta),next=(cart[flavour]||0)+delta;
    if(next<=0)delete cart[flavour];else if(boxes()+delta<=MAX_BOXES)cart[flavour]=next;
    requestId=null;renderCart();
  });

  function setPayment(method){
    if(paymentMethod!==method)requestId=null;
    paymentMethod=method;
    document.querySelectorAll("[data-payment]").forEach(button=>{
      const active=button.dataset.payment===method;button.classList.toggle("selected",active);button.setAttribute("aria-pressed",String(active));
    });
    show("cashFields",method==="cash");show("referenceField",method!=="cash");
    $("paymentHint").textContent=method==="cash"?"Enter the cash received. Change is calculated automatically.":"Confirm the "+(method==="gcash"?"GCash transfer":"card payment")+" has been received before completing this sale.";
    updatePayment();
  }
  function updatePayment(){
    const due=total(),received=Number($("cashReceived")?.value||0),valid=paymentMethod!=="cash"||(Number.isSafeInteger(received)&&received>=due);
    $("changeDue").textContent=money(Math.max(0,received-due));
    $("confirmPayment").textContent="Confirm "+paymentMethod.toUpperCase()+" payment · "+money(due);
    $("confirmPayment").disabled=boxes()===0||!valid||checkoutBusy;
  }
  document.querySelectorAll("[data-payment]").forEach(button=>button.addEventListener("click",()=>setPayment(button.dataset.payment)));
  $("cashReceived").addEventListener("input",updatePayment);
  ["customerName","orderNotes","paymentReference"].forEach(id=>$(id).addEventListener("input",()=>{if(!checkoutBusy)requestId=null;}));
  document.querySelectorAll("[data-cash]").forEach(button=>button.addEventListener("click",()=>{
    const value=button.dataset.cash==="exact"?total():total()+Number(button.dataset.cash);
    $("cashReceived").value=String(value);updatePayment();
  }));
  $("checkoutOpen").addEventListener("click",()=>{
    if(!boxes())return;
    $("checkoutPanel").hidden=false;$("receiptPanel").hidden=true;
    $("cashReceived").value=String(total());$("checkoutTotal").textContent=money(total());
    $("checkoutError").textContent="";setPayment(paymentMethod);
    $("checkoutPanel").scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("checkoutClose").addEventListener("click",()=>show("checkoutPanel",false));
  $("checkoutForm").addEventListener("submit",async event=>{
    event.preventDefault();if(checkoutBusy||!boxes())return;
    const due=total(),received=paymentMethod==="cash"?Number($("cashReceived").value):due;
    if(!Number.isSafeInteger(received)||received<due){$("checkoutError").textContent="Cash received must be a whole-peso amount at least equal to the total.";return;}
    if(!requestId)requestId=crypto.randomUUID().replace(/-/g,"");
    const payload={
      requestId,
      items:Object.entries(cart).filter(([,qty])=>qty>0).map(([flavour,qty])=>({flavor:flavour,boxes:qty})),
      paymentMethod,
      amountTenderedPesos:received,
      customerName:$("customerName").value.trim(),
      orderNotes:$("orderNotes").value.trim(),
      paymentReference:paymentMethod==="cash"?"":$("paymentReference").value.trim()
    };
    checkoutBusy=true;updatePayment();$("checkoutError").textContent="";$("confirmPayment").textContent="Saving sale…";
    try{
      const data=await api("/api/rms/pos/checkout",{method:"POST",body:JSON.stringify(payload)});
      showReceipt(data.sale);show("checkoutPanel",false);
      $("receiptPanel").scrollIntoView({behavior:"smooth",block:"start"});
    }catch(error){$("checkoutError").textContent=error.message||"Checkout failed. Your order is still here; retry to safely check the same sale request.";}
    finally{checkoutBusy=false;updatePayment();}
  });
  function showReceipt(sale){
    const root=$("receiptDetails");root.replaceChildren();
    const heading=document.createElement("h3");heading.textContent="HAPKEK";root.append(heading);
    const sub=document.createElement("p");sub.className="receipt-sub";sub.textContent="JAPANESE CAKE · SALES RECEIPT";root.append(sub);
    const add=(label,value,cls="")=>{
      const line=document.createElement("div");line.className="receipt-row "+cls;
      const key=document.createElement("span"),val=document.createElement("strong");key.textContent=label;val.textContent=value||"—";line.append(key,val);root.append(line);
    };
    const when=new Date(sale.createdAt).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"});
    add("Receipt",sale.receiptNo);add("Date",when);add("Cashier",sale.cashierName);
    if(sale.customerName)add("Customer",sale.customerName);
    root.append(document.createElement("hr"));
    sale.items.forEach(item=>add((FLAVOURS[item.flavor]||item.flavor)+" · "+item.boxes+" box × 15 pcs",money(item.lineTotalPesos)));
    root.append(document.createElement("hr"));
    add("Boxes",String(sale.boxes));add("Pieces",String(sale.pieces));add("TOTAL",money(sale.totalPesos),"receipt-total");
    add("Payment",String(sale.paymentMethod).toUpperCase());
    if(sale.paymentMethod==="cash"){add("Cash received",money(sale.amountTenderedPesos));add("Change",money(sale.changeDuePesos));}
    if(sale.paymentReference)add("Payment reference",sale.paymentReference);
    if(sale.orderNotes){const notes=document.createElement("p");notes.className="receipt-note";notes.textContent="Order notes: "+sale.orderNotes;root.append(notes);}
    const thanks=document.createElement("p");thanks.className="receipt-sub";thanks.textContent="Thank you for choosing HAPKEK!";root.append(thanks);
    show("receiptPanel",true);
  }
  $("printReceipt").addEventListener("click",()=>window.print());
  $("newSale").addEventListener("click",()=>{
    cart={};requestId=null;selectedFlavour="bavarian";selectedQty=1;paymentMethod="cash";
    $("customerName").value="";$("orderNotes").value="";$("paymentReference").value="";$("cashReceived").value="";
    show("receiptPanel",false);show("checkoutPanel",false);$("checkoutError").textContent="";
    renderProduct();renderCart();setPayment("cash");window.scrollTo({top:0,behavior:"smooth"});
  });

  function parseVoucher(raw){
    const text=String(raw||"").trim();
    try{const parsed=JSON.parse(text);if(parsed.brand==="HAPKEK"&&parsed.voucher)return String(parsed.voucher).toUpperCase();}catch{}
    const match=text.match(/HAP-[A-HJ-NP-Z2-9]{10}/i);return match?match[0].toUpperCase():text.toUpperCase();
  }
  async function redeem(raw){
    if(scanBusy)return;scanBusy=true;
    try{
      const code=parseVoucher(raw);
      const data=await api("/api/staff/redeem",{method:"POST",body:JSON.stringify({code})});
      safeResult("good","Voucher redeemed",data.voucher.label+" · "+data.voucher.voucher_code);
      $("manualCode").value="";
    }catch(error){
      const status=error.data?.status;
      safeResult("bad",status==="already_redeemed"?"Already redeemed":error.status===404?"Voucher not found":"Could not redeem",error.message);
    }finally{
      scanBusy=false;
      if(scanner)setTimeout(()=>{if(scanner&&scanner.isScanning)scanner.resume();},1800);
    }
  }
  async function startScanner(){
    if(!window.Html5Qrcode){safeResult("bad","Scanner unavailable","The camera scanner could not load. Enter the voucher code manually.");return;}
    if(scanner){try{await scanner.stop();await scanner.clear();}catch{}scanner=null;}
    try{
      scanner=new Html5Qrcode("reader");
      await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:240,height:240}},async text=>{
        if(scanBusy)return;
        try{if(scanner?.isScanning)await scanner.pause(true);}catch{}
        await redeem(text);
      });
      show("startScan",false);show("stopScan",true);
    }catch(error){
      scanner=null;safeResult("bad","Camera unavailable",error.message+" Check camera permission and use this page over HTTPS.");
    }
  }
  async function stopScanner(){
    if(scanner){try{await scanner.stop();await scanner.clear();}catch{}scanner=null;}
    show("startScan",true);show("stopScan",false);
  }
  $("startScan").addEventListener("click",startScanner);
  $("stopScan").addEventListener("click",stopScanner);
  $("checkCode").addEventListener("click",()=>redeem($("manualCode").value));
  $("manualCode").addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();redeem(event.target.value);}});
  loadNicknames();checkSession();
})();