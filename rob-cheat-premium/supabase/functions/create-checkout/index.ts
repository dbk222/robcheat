import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins=["https://www.robcheat.fun","https://robcheat.fun","https://robcheat.vercel.app"];
const corsFor=(origin:string|null)=>({
  "Access-Control-Allow-Origin":allowedOrigins.includes(origin||"")?origin!:"https://www.robcheat.fun",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin",
});
const json=(x:unknown,s=200,origin:string|null=null)=>new Response(JSON.stringify(x),{
  status:s,headers:{...corsFor(origin),"Content-Type":"application/json","Cache-Control":"no-store"},
});
const hash=async(value:string)=>{
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
};
const catalog={
  day:{price:200,product:"prod_VcIvtkWFfVhILh",label:"1 Day License"},
  week:{price:500,product:"prod_VcIvgiWfVKYQTo",label:"1 Week License"},
  month:{price:1000,product:"prod_VcIvdkCR0bXBgv",label:"1 Month License"},
  lifetime:{price:2000,product:"prod_VcIvkFnVhlPuz1",label:"Lifetime License"},
};

Deno.serve(async req=>{
  const origin=req.headers.get("Origin"),cors=corsFor(origin);
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"POST required"},405,origin);

  try{
    const auth=req.headers.get("Authorization");
    if(!auth)return json({error:"Sign in required"},401,origin);
    const sb=createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {global:{headers:{Authorization:auth}}},
    );
    const {data:{user},error:authError}=await sb.auth.getUser();
    if(authError||!user)return json({error:"Invalid session"},401,origin);

    const body=await req.json().catch(()=>({}));
    const plan=String(body.plan||"");
    const pricing=catalog[plan as keyof typeof catalog];
    if(!pricing)return json({error:"Invalid plan"},400,origin);

    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const manualCode=String(body.promo_code||"").trim().toUpperCase();
    const referralToken=String(body.referral_token||"").trim();

    let streamer:{id:string;promo_code:string}|null=null;
    let attribution:{id:string;visitor_id:string;expires_at:string;created_at:string}|null=null;
    let attributionSource:string|null=null;

    if(manualCode){
      if(!/^[A-Z0-9_-]{3,24}$/.test(manualCode))return json({error:"That promo code is not valid."},400,origin);
      const {data,error}=await admin.from("streamers")
        .select("id,promo_code,is_active").eq("promo_code",manualCode).maybeSingle();
      if(error)return json({error:"Unable to validate the promo code."},500,origin);
      if(!data||!data.is_active)return json({error:"That promo code is invalid or inactive."},400,origin);
      streamer={id:data.id,promo_code:data.promo_code};
      attributionSource="manual_promo_code";
    }else if(referralToken){
      const tokenHash=await hash(referralToken);
      const {data:record,error}=await admin.from("referral_attributions")
        .select("id,streamer_id,visitor_id,promo_code,created_at,expires_at,revoked_at")
        .eq("token_hash",tokenHash).is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
      if(error)return json({error:"Unable to validate saved checkout attribution."},500,origin);
      if(record){
        const {data:activeStreamer,error:streamerError}=await admin.from("streamers")
          .select("id,promo_code,is_active").eq("id",record.streamer_id).maybeSingle();
        if(streamerError)return json({error:"Unable to validate saved checkout attribution."},500,origin);
        if(activeStreamer?.is_active&&activeStreamer.promo_code===record.promo_code){
          streamer={id:activeStreamer.id,promo_code:activeStreamer.promo_code};
          attribution={id:record.id,visitor_id:record.visitor_id,expires_at:record.expires_at,created_at:record.created_at};
          attributionSource="referral_link";
        }
      }
    }

    const discountPercent=streamer&&(plan==="month"||plan==="lifetime")?10:0;
    const discountMinor=Math.round(pricing.price*discountPercent/100);
    const finalAmount=pricing.price-discountMinor;
    const metadata:Record<string,string>={supabase_user_id:user.id,plan,product_id:pricing.product};
    if(streamer){
      metadata.streamer_id=streamer.id;
      metadata.promo_code=streamer.promo_code;
      metadata.promo_discount_percent=String(discountPercent);
      metadata.promo_discount_minor=String(discountMinor);
      metadata.attribution_source=attributionSource||"manual_promo_code";
      if(attribution){
        metadata.visitor_id=attribution.visitor_id;
        metadata.referral_attribution_id=attribution.id;
        metadata.referral_clicked_at=attribution.created_at;
        metadata.referral_expires_at=attribution.expires_at;
      }
    }

    const stripe=new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!,{apiVersion:"2024-12-18.acacia"});
    const session=await stripe.checkout.sessions.create({
      mode:"payment",
      success_url:"https://www.robcheat.fun/dashboard.html?checkout=success",
      cancel_url:"https://www.robcheat.fun/#plans",
      client_reference_id:user.id,
      customer_email:user.email,
      metadata,
      managed_payments:{enabled:false},
      line_items:[{price_data:{
        currency:"eur",unit_amount:finalAmount,
        product_data:{name:"ROB CHEAT — "+pricing.label,metadata:{product_id:pricing.product,plan}},
      },quantity:1}],
    });

    if(streamer){
      const eventResult=await admin.from("streamer_referral_events").insert({
        streamer_id:streamer.id,event_type:"checkout_started",
        visitor_id:attribution?.visitor_id||null,promo_code:streamer.promo_code,
        attribution_source:attributionSource||"manual_promo_code",
        attribution_id:attribution?.id||null,provider_session_id:session.id,
        metadata:{plan,user_id:user.id,discount_percent:discountPercent},
      });
      if(eventResult.error)console.error("streamer checkout event write failed",eventResult.error.message);
      if(attribution){
        const updateResult=await admin.from("referral_attributions")
          .update({last_used_at:new Date().toISOString()}).eq("id",attribution.id);
        if(updateResult.error)console.error("referral last_used_at update failed",updateResult.error.message);
      }
    }

    return json({url:session.url,discount_applied:discountPercent>0},200,origin);
  }catch(error){
    console.error("create-checkout error:",error instanceof Error?error.message:error);
    return json({error:error instanceof Error?error.message:"Checkout could not be created."},500,origin);
  }
});
