(() => {
  const API = (window.HAPKEK_STAFF_API || "").replace(/\/$/, "");
  const $ = id => document.getElementById(id);
  let scanner = null, busy = false;
  const show = (id, yes) => $(id).hidden = !yes;
  async function api(path, options={}) {
    const r = await fetch(API + path, { ...options, credentials:"include", cache:"no-store",
      headers: { "Content-Type":"application/json", ...(options.headers||{}) } });
    const data = await r.json().catch(()=>({}));
    if (!r.ok) { const e = new Error(data.error || "Request failed"); e.status=r.status; e.data=data; throw e; }
    return data;
  }
  function result(kind,title,body) {
    const el=$("result"); el.className="result "+kind; el.innerHTML="";
    const h=document.createElement("h2"); h.textContent=title; el.append(h);
    const p=document.createElement("p"); p.textContent=body; el.append(p); show("result",true);
  }
  async function loadNicknames(){
    try{const d=await api("/api/staff/users",{method:"GET"});const select=$("nickname");select.replaceChildren(new Option("Select your nickname",""));d.users.forEach(u=>select.add(new Option(u.nickname,u.nickname)));}
    catch{$("nickname").replaceChildren(new Option("Could not load users",""));}
  }
  function routeSignedIn(staff){show("login",false);show("pinSetup",Boolean(staff.mustChangePin));show("desk",!staff.mustChangePin);if(!staff.mustChangePin)$ ("staffName").textContent="Signed in as "+staff.displayName;}
  async function session() {
    try { const d=await api("/api/staff/me",{method:"GET"}); routeSignedIn(d.staff); }
    catch { show("login",true);show("pinSetup",false);show("desk",false); }
  }
  $("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();$("loginError").textContent="";
    try { const d=await api("/api/staff/login",{method:"POST",body:JSON.stringify({nickname:$("nickname").value,pin:$("pin").value})});
      $("pin").value="";routeSignedIn(d.staff);
    } catch(err){$("loginError").textContent=err.message;}
  });
  $("pinForm").addEventListener("submit",async e=>{e.preventDefault();$("pinError").textContent="";if($("newPin").value!==$("confirmPin").value){$("pinError").textContent="PINs do not match";return;}try{await api("/api/staff/change-pin",{method:"POST",body:JSON.stringify({pin:$("newPin").value})});$("newPin").value=$("confirmPin").value="";await session();}catch(err){$("pinError").textContent=err.message;}});
  $("logout").onclick=async()=>{try{await api("/api/staff/logout",{method:"POST"});}finally{stopScanner();show("desk",false);show("login",true);}};
  function parseCode(raw) {
    const text=String(raw||"").trim();
    try { const obj=JSON.parse(text); if(obj.brand==="HAPKEK" && obj.voucher) return String(obj.voucher).toUpperCase(); } catch {}
    const m=text.match(/HAP-[A-HJ-NP-Z2-9]{10}/i); return m?m[0].toUpperCase():text.toUpperCase();
  }
  async function redeem(raw) {
    if(busy)return;busy=true;
    try {
      const code=parseCode(raw);
      const d=await api("/api/staff/redeem",{method:"POST",body:JSON.stringify({code})});
      result("good","Voucher redeemed",d.voucher.label+" · "+d.voucher.voucher_code);
      if(scanner) setTimeout(()=>{if(scanner) scanner.resume();},1800);
    } catch(e) {
      const status=e.data?.status;
      result("bad",status==="already_redeemed"?"Already redeemed":e.status===404?"Voucher not found":"Could not validate",e.message);
      if(scanner) setTimeout(()=>{if(scanner) scanner.resume();},2200);
    } finally {busy=false;}
  }
  async function startScanner() {
    if(!window.Html5Qrcode){result("bad","Scanner unavailable","QR scanning library did not load. Use manual code entry.");return;}
    try {
      scanner = new Html5Qrcode("reader");
      await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:240,height:240}},async text=>{
        if(busy)return; await scanner.pause(true); await redeem(text);
      });
      show("startScan",false);show("stopScan",true);
    } catch(e){result("bad","Camera unavailable",e.message+" Check camera permission and use HTTPS.");}
  }
  async function stopScanner(){if(scanner){try{await scanner.stop();await scanner.clear();}catch{}scanner=null;}show("startScan",true);show("stopScan",false);}
  $("startScan").onclick=startScanner;$("stopScan").onclick=stopScanner;
  $("checkCode").onclick=()=>redeem($("manualCode").value);
  $("manualCode").addEventListener("keydown",e=>{if(e.key==="Enter")redeem(e.target.value);});
  $("scanTab").onclick=()=>{show("scanPanel",true);show("manualPanel",false);$("scanTab").className="active";$("manualTab").className="secondary";};
  $("manualTab").onclick=()=>{stopScanner();show("scanPanel",false);show("manualPanel",true);$("manualTab").className="active";$("scanTab").className="secondary";};
  loadNicknames();session();
})();