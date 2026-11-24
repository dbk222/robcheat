window.checkout=async function(name,displayPrice,planOverride){
 const plans={Daily:"day",Weekly:"week",Monthly:"month",Lifetime:"lifetime"};
 const plan=planOverride||plans[name];if(!plan)return toast("Unknown plan.");
 const {data:{session},error}=await sb.auth.getSession();
 if(error||!session){location.href="account.html?next=checkout&plan="+encodeURIComponent(plan);return}
 const buttons=[...document.querySelectorAll("#plans button")];buttons.forEach(b=>b.disabled=true);
 try{
  const referralToken=localStorage.getItem("robcheat_referral_token")||"";
  if(location.hostname.endsWith("vercel.app") && !location.hostname.includes("robcheat.fun")){
   const response=await fetch("/api/streamer-attribution",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({plan,promo_code:"",referral_token:referralToken})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Checkout preview is unavailable.");
   toast("Checkout preview only — no payment was processed.");
   return;
  }
  const response=await fetch("https://rzbvtzeqrcfutfafaamm.supabase.co/functions/v1/create-checkout",{
   method:"POST",headers:{"Content-Type":"application/json","apikey":"sb_publishable_C1Mv75fwRb3bA9gx6JqN7w_2c2CyJvF","Authorization":"Bearer "+session.access_token},
   body:JSON.stringify({plan,referral_token:referralToken})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.url)throw new Error(data.error||data.message||"Checkout could not be created.");
  location.href=data.url;
 }catch(err){toast(err.message||"Checkout connection failed.");buttons.forEach(b=>b.disabled=false)}
};
