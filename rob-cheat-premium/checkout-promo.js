let pendingCheckoutPlan=null;
window.checkout=async function(name,displayPrice,planOverride){
 const plans={Daily:"day",Weekly:"week",Monthly:"month",Lifetime:"lifetime"};
 const plan=planOverride||plans[name];if(!plan)return toast("Unknown plan.");
 const {data:{session},error}=await sb.auth.getSession();
 if(error||!session){location.href="account.html?next=checkout&plan="+encodeURIComponent(plan);return}
 pendingCheckoutPlan=plan;
 document.getElementById("mt").textContent="Streamer promo code";
 document.getElementById("mp").textContent="Optional. Enter a creator code to support your streamer. Valid codes are tracked on every plan; 10% off applies to Monthly and Lifetime only.";
 document.getElementById("mb").innerHTML='<label style="display:grid;gap:8px;margin:15px 0;color:#cbbcd4;font-size:11px">Promo code (optional)<input id="promoInput" maxlength="24" autocomplete="off" placeholder="Enter code, e.g. SCHIOPU" style="width:100%;padding:12px;border-radius:8px;background:#09070d;border:1px solid #43324d;color:#fff;font:13px Inter"></label><div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn primary" type="button" onclick="continueCheckout(false)">Continue to Stripe ↗</button><button class="btn ghost" type="button" onclick="continueCheckout(true)">Continue without a code</button></div><p id="promoMessage" style="min-height:18px;font-size:10px;color:#f5cf88;margin:10px 0 0"></p>';
 document.getElementById("modal").classList.add("open");
};
window.continueCheckout=async function(skipCode=false){
 const promoCode=skipCode?"":(document.getElementById("promoInput")?.value||"").trim().toUpperCase();
 const message=document.getElementById("promoMessage");
 const planButtons=[...document.querySelectorAll("#plans button")],modalButtons=[...document.querySelectorAll("#mb button")];
 planButtons.forEach(b=>b.disabled=true);modalButtons.forEach(b=>b.disabled=true);
 if(message)message.textContent="Connecting securely to Stripe…";
 try{
  const {data:{session},error}=await sb.auth.getSession();if(error||!session)throw new Error("Your session expired. Please sign in again.");
  const productionHosts=new Set(["robcheat.fun","www.robcheat.fun","robcheat.vercel.app","robcheat-antarrobert-2659.vercel.app","robcheat-git-main-antarrobert-2659.vercel.app"]);
  if(!productionHosts.has(location.hostname)){
   if(message)message.innerHTML='Staging preview: real Stripe payments are disabled. <a href="/streamer-test-checkout.html" style="color:#9beac1;text-decoration:underline">Open the staging checkout test</a> to test attribution.';
   planButtons.forEach(b=>b.disabled=false);
   modalButtons.forEach(b=>b.disabled=false);
   return;
  }
  const response=await fetch("https://rzbvtzeqrcfutfafaamm.supabase.co/functions/v1/create-checkout",{method:"POST",headers:{"Content-Type":"application/json","apikey":"sb_publishable_C1Mv75fwRb3bA9gx6JqN7w_2c2CyJvF","Authorization":"Bearer "+session.access_token},body:JSON.stringify({plan:pendingCheckoutPlan,promo_code:promoCode})});
  const data=await response.json();if(!response.ok||!data.url)throw new Error(data.error||data.message||"Checkout could not be created.");
  if(data.promo?.discount_percent)toast("Code "+data.promo.code+" applied — 10% discount.");
  else if(data.promo?.code)toast("Code "+data.promo.code+" recorded. This plan is not eligible for a discount.");
  location.href=data.url;
 }catch(err){if(message)message.textContent=err.message||"Checkout connection failed.";planButtons.forEach(b=>b.disabled=false);modalButtons.forEach(b=>b.disabled=false)}
};
