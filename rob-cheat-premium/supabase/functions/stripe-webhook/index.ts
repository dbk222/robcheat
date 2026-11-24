import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
const cors={"Access-Control-Allow-Origin":"https://robcheat.fun","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, stripe-signature","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const hash=async(v:string)=>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")};
const randomKey=()=>{const b=crypto.getRandomValues(new Uint8Array(12));const raw=[...b].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();return raw.match(/.{4}/g)!.join("-")};
const plans:Record<string,{amount:number;days:number|null;product:string}>={day:{amount:200,days:1,product:"prod_VcIvtkWFfVhILh"},week:{amount:500,days:7,product:"prod_VcIvgiWfVKYQTo"},month:{amount:1000,days:30,product:"prod_VcIvdkCR0bXBgv"},lifetime:{amount:2000,days:null,product:"prod_VcIvkFnVhlPuz1"}};
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 const stripeKey=Deno.env.get("STRIPE_SECRET_KEY"),whsec=Deno.env.get("STRIPE_WEBHOOK_SECRET");
 if(!stripeKey||!whsec)return json({error:"Webhook secrets not configured"},500);
 const stripe=new Stripe(stripeKey,{apiVersion:"2024-12-18.acacia"});
 const raw=await req.text(),sig=req.headers.get("stripe-signature");
 if(!sig)return json({error:"Missing signature"},400);
 let event;try{event=await stripe.webhooks.constructEventAsync(raw,sig,whsec,undefined,Stripe.createSubtleCryptoProvider())}catch{return json({error:"Invalid signature"},400)}
 if(event.type==="charge.refunded"){
  const charge=event.data.object as Stripe.Charge;
  const paymentIntentId=typeof charge.payment_intent==="string"?charge.payment_intent:charge.payment_intent?.id;
  if(!paymentIntentId)return json({received:true,refund_without_payment_intent:true});
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const {data:order,error:orderError}=await admin.from("orders")
   .select("id,provider_order_id,streamer_id,promo_code,referral_attribution_id,visitor_id,attribution_source,amount,currency")
   .eq("stripe_payment_intent",paymentIntentId).maybeSingle();
  if(orderError)return json({error:"Could not find order for refund event"},500);
  if(!order)return json({received:true,order_not_found:true});
  const refundedAmount=Math.min(Number(charge.amount_refunded||0)/100,Number(order.amount||0));
  const fullyRefunded=!!charge.refunded||Number(charge.amount_refunded||0)>=Number(charge.amount||0);
  const {error:updateError}=await admin.from("orders").update({
   refunded_amount:refundedAmount,status:fullyRefunded?"refunded":"paid"
  }).eq("id",order.id);
  if(updateError)return json({error:"Refund received but order record could not be updated"},500);
  if(order.streamer_id){
   const {error:eventError}=await admin.from("streamer_referral_events").upsert({
    streamer_id:order.streamer_id,event_type:"refund",visitor_id:order.visitor_id||null,
    promo_code:order.promo_code||null,attribution_source:order.attribution_source||"referral_link",
    attribution_id:order.referral_attribution_id||null,order_id:order.id,
    provider_session_id:order.provider_order_id,
    metadata:{refunded_amount:refundedAmount,currency:String(charge.currency||order.currency||"eur").toUpperCase(),fully_refunded:fullyRefunded}
   },{onConflict:"event_type,provider_session_id"});
   if(eventError)return json({error:"Refund was recorded but streamer refund event could not be saved"},500);
  }
  return json({received:true,refund_recorded:true,fully_refunded:fullyRefunded});
 }
 if(event.type!=="checkout.session.completed")return json({received:true});
 const s=event.data.object as Stripe.Checkout.Session;
 if(s.payment_status!=="paid")return json({received:true,unpaid:true});
 const uid=s.metadata?.supabase_user_id,plan=s.metadata?.plan,expected=plans[plan||""];
 if(!uid||!expected||s.client_reference_id!==uid||s.mode!=="payment"||s.currency!=="eur")return json({error:"Checkout metadata mismatch"},400);
 const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const streamerId=s.metadata?.streamer_id||"",promoCode=(s.metadata?.promo_code||"").trim().toUpperCase();
 const attributionId=s.metadata?.referral_attribution_id||"",visitorId=s.metadata?.visitor_id||"";
 const attributionSource=s.metadata?.attribution_source||"";
 const referralClickedAt=s.metadata?.referral_clicked_at||null,referralExpiresAt=s.metadata?.referral_expires_at||null;
 let discountPercent=0,discountMinor=0;
 if(streamerId||promoCode){
  if(!streamerId||!promoCode||!/^[A-Z0-9_-]{3,24}$/.test(promoCode))return json({error:"Incomplete or invalid referral metadata"},400);
  const {data:streamer,error:streamerError}=await admin.from("streamers")
   .select("id,promo_code,is_active").eq("id",streamerId).maybeSingle();
  if(streamerError||!streamer||!streamer.is_active||streamer.promo_code!==promoCode)return json({error:"Referral metadata could not be verified"},400);
  if(attributionSource==="referral_link"){
   if(!attributionId||!visitorId||!referralClickedAt||!referralExpiresAt)return json({error:"Saved referral metadata is incomplete"},400);
   const {data:attribution,error:attributionError}=await admin.from("referral_attributions")
    .select("id,streamer_id,visitor_id,promo_code,revoked_at")
    .eq("id",attributionId).maybeSingle();
   if(attributionError||!attribution||attribution.revoked_at||attribution.streamer_id!==streamerId||
      attribution.visitor_id!==visitorId||attribution.promo_code!==promoCode)
     return json({error:"Saved referral record could not be verified"},400);
  }else if(attributionSource!=="manual_promo_code"||attributionId||visitorId){
   return json({error:"Referral source metadata mismatch"},400);
  }
  discountPercent=(plan==="month"||plan==="lifetime")?10:0;
  discountMinor=Math.round(expected.amount*discountPercent/100);
  if(Number(s.metadata?.promo_discount_percent??0)!==discountPercent||Number(s.metadata?.promo_discount_minor??0)!==discountMinor)return json({error:"Referral discount metadata mismatch"},400);
 }else if(Number(s.metadata?.promo_discount_percent??0)!==0||Number(s.metadata?.promo_discount_minor??0)!==0||attributionId||visitorId||attributionSource){
  return json({error:"Unexpected referral metadata"},400);
 }
 const finalAmount=expected.amount-discountMinor;
 if(s.amount_total!==finalAmount)return json({error:"Checkout payment amount mismatch"},400);
 const lineItems=await stripe.checkout.sessions.listLineItems(s.id,{limit:10});
 if(lineItems.data.length!==1||lineItems.data[0].quantity!==1||lineItems.data[0].price?.unit_amount!==finalAmount||lineItems.data[0].price?.currency!=="eur")return json({error:"Checkout line item mismatch"},400);
 let key:string;
 if(plan==="day"||plan==="week"||plan==="month"){
  const api=Deno.env.get("RUN_CHEAT_API_URL"),token=Deno.env.get("STRIPE_LICENSE_TOKEN");
  if(!api||!token)return json({error:"RunCheat licensing secrets not configured"},500);
  let vr:Response;try{vr=await fetch(api.replace(/\/$/,"")+"/api/stripe/license",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify({session_id:s.id,user_id:uid,plan})})}catch{return json({error:"RunCheat VPS unavailable"},502)}
  const v=await vr.json().catch(()=>null);if(!vr.ok||!v?.ok||typeof v.key!=="string")return json({error:"RunCheat key creation failed"},502);key=v.key;
 }else{key=randomKey();}
 const kh=await hash(key),expires=expected.days===null?null:new Date(Date.now()+expected.days*86400000).toISOString();
 const {data,error}=await admin.rpc("process_paid_checkout",{p_session_id:s.id,p_user_id:uid,p_plan:plan,p_amount:finalAmount,p_currency:"eur",p_key_hash:kh,p_license_key:key,p_key_prefix:key.slice(0,12),p_expires_at:expires});
 if(error||!data?.ok)return json({error:"Paid checkout processing failed"},500);
 const {data:attributedOrder,error:attributionError}=await admin.from("orders").update({
  streamer_id:streamerId||null,promo_code:promoCode||null,promo_discount_percent:discountPercent,promo_discount_amount:discountMinor/100,
  visitor_id:visitorId||null,attribution_source:attributionSource||null,referral_attribution_id:attributionId||null,
  referral_clicked_at:referralClickedAt,referral_expires_at:referralExpiresAt,
  stripe_payment_intent:typeof s.payment_intent==="string"?s.payment_intent:(s.payment_intent as any)?.id||null
 }).eq("provider_order_id",s.id).select("id").maybeSingle();
 if(attributionError||!attributedOrder)return json({error:"Order created but referral attribution could not be saved"},500);
 if(streamerId){
  const {error:eventError}=await admin.from("streamer_referral_events").upsert({
   streamer_id:streamerId,event_type:"purchase",visitor_id:visitorId||null,promo_code:promoCode,
   attribution_source:attributionSource||"manual_promo_code",attribution_id:attributionId||null,
   order_id:attributedOrder.id,provider_session_id:s.id,
   metadata:{plan,amount_minor:finalAmount,currency:"eur"}
  },{onConflict:"event_type,provider_session_id",ignoreDuplicates:true});
  if(eventError)return json({error:"Paid order recorded but referral purchase event could not be saved"},500);
 }
 return json({received:true,duplicate:!!data.duplicate,license_id:data.license_id,streamer_attributed:!!streamerId});
});
