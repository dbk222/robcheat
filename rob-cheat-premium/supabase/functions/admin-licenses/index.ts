import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const allowedOrigins = new Set(["https://robcheat.fun","https://www.robcheat.fun","https://robcheat.vercel.app"]);
const corsFor=(origin:string|null)=>({"Access-Control-Allow-Origin":origin&&allowedOrigins.has(origin)?origin:"https://robcheat.fun","Vary":"Origin","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"});
const json=(b:unknown,s=200,origin:string|null=null)=>new Response(JSON.stringify(b),{status:s,headers:{...corsFor(origin),"Content-Type":"application/json"}});
const hash=async(v:string)=>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")};
const randomKey=()=>{const b=crypto.getRandomValues(new Uint8Array(12));const raw=[...b].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();return raw.match(/.{4}/g)!.join("-")};
const legacyDays:Record<string,number>={day:1,week:7,month:30,year:365,lifetime:365000};
const legacyKeyFormat=(v:string)=>typeof v==="string"&&v.length===29&&v.split("-").length===6&&v.split("-").every(p=>p.length===4&&/^[A-Z0-9]+$/.test(p));
const issuedAtFor=(license:any)=>{const days=legacyDays[license.plan]??365000;if(license.expires_at&&days<365000)return Math.floor(new Date(license.expires_at).getTime()/1000)-days*86400;const d=new Date(license.created_at||Date.now());return Math.floor(d.getTime()/1000)};
const uuid=(v:any)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const maxDevices=(v:any)=>Number.isInteger(v)&&v>=1&&v<=10;
const dateValue=(v:any)=>{if(v===null)return null;if(typeof v!=="string"||!v.trim())return undefined;const d=new Date(v);return Number.isNaN(d.getTime())?undefined:d.toISOString()};
Deno.serve(async req=>{
 const origin=req.headers.get("Origin");
 if(origin&&!allowedOrigins.has(origin))return json({error:"Origin not allowed"},403,origin);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:corsFor(origin)});
 if(req.method!=="POST")return json({error:"POST required"},405,origin);
 const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const admin=createClient(url,key,{auth:{persistSession:false}});
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return json({error:"Auth required"},401,origin);
 const {data:{user},error:ue}=await admin.auth.getUser(token);if(ue||!user)return json({error:"Invalid session"},401,origin);
 const {data:profile}=await admin.from("profiles").select("role").eq("id",user.id).maybeSingle();if(profile?.role!=="admin")return json({error:"Admin only"},403,origin);
 let body:any;try{body=await req.json()}catch{return json({error:"Invalid JSON"},400,origin)}
 const action=body.action;
 if(action==="find_user"){const email=String(body.email||"").trim().toLowerCase();if(!email||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"Valid email required"},400,origin);const {data,error}=await admin.from("profiles").select("id,email").ilike("email",email).limit(2);if(error)return json({error:"User lookup failed"},500,origin);if(!data?.length)return json({error:"Account not found"},404,origin);if(data.length!==1)return json({error:"Email is ambiguous"},409,origin);return json({user:data[0]},200,origin)}
 if(action==="orders"){const {data:rows,error}=await admin.from("orders").select("id,user_id,provider,provider_order_id,amount,currency,product_code,plan,status,license_id,created_at,paid_at").order("created_at",{ascending:false}).limit(500);if(error)return json({error:"Orders query failed"},500,origin);const ids=[...new Set((rows||[]).map(x=>x.user_id).filter(Boolean))];const {data:profiles}=ids.length?await admin.from("profiles").select("id,email").in("id",ids):{data:[]};const emails=new Map((profiles||[]).map(p=>[p.id,p.email]));return json({orders:(rows||[]).map(o=>({...o,email:emails.get(o.user_id)||null}))},200,origin)}
 if(action==="create"){
  const plan=body.plan||"lifetime";
  if(!Object.prototype.hasOwnProperty.call(legacyDays,plan))return json({error:"Invalid plan"},400,origin);
  if(body.owner_id!==null&&body.owner_id!==undefined&&!uuid(body.owner_id))return json({error:"Invalid owner_id"},400,origin);
  if(body.max_devices!==undefined&&!maxDevices(body.max_devices))return json({error:"max_devices must be an integer from 1 to 10"},400,origin);
  const exp=body.expires_at===undefined?null:dateValue(body.expires_at);
  if(body.expires_at!==undefined&&exp===undefined)return json({error:"Invalid expires_at"},400,origin);
  const notes=body.notes==null?null:String(body.notes).trim();
  if(notes&&notes.length>500)return json({error:"Notes too long (max 500)"},400,origin);
  let legacyOwner=user.id;
  if(body.owner_id){
   const {data:ownerProfile,error:ownerError}=await admin.from("profiles").select("id").eq("id",body.owner_id).maybeSingle();
   if(ownerError||!ownerProfile)return json({error:"Target account not found"},404,origin);
   legacyOwner=ownerProfile.id;
  }
  let keyValue:string;
  let createdLegacyRow=false;
  if(plan==="lifetime"){
   let inserted=false;
   for(let attempt=0;attempt<5&&!inserted;attempt++){
    keyValue=randomKey();
    const {error:keyError}=await admin.from("keys").insert({
     key_str:keyValue,days:legacyDays.lifetime,issued_at:Math.floor(Date.now()/1000),
     owner:legacyOwner,note:notes||"Admin panel lifetime license",revoked:false
    });
    if(!keyError){inserted=true;createdLegacyRow=true;}
    else if(keyError.code!=="23505")return json({error:"Could not register lifetime key with the desktop validator",details:keyError.message},500,origin);
   }
   if(!inserted)return json({error:"Could not generate a unique lifetime key. Please retry."},500,origin);
  }else{
   const base=Deno.env.get("VPS_ADMIN_URL"),adminToken=Deno.env.get("VPS_ADMIN_TOKEN");
   if(!base||!adminToken)return json({error:"VPS admin secrets missing"},500,origin);
   const apiBase=base.endsWith("/")?base.slice(0,-1):base;
   let vr:Response;
   try{
    vr=await fetch(apiBase+"/api/admin/gen",{method:"POST",headers:{"Authorization":"Bearer "+adminToken,"Content-Type":"application/json"},body:JSON.stringify({days:legacyDays[plan],count:1,owner:legacyOwner,note:notes||"Admin panel"})});
   }catch(e){return json({error:"VPS key generation request failed",details:e instanceof Error?e.message:"Unknown error"},502,origin)}
   if(!vr.ok){const msg=await vr.text();return json({error:"VPS key generation failed",details:msg.slice(0,300)},502,origin)}
   const vd=await vr.json().catch(()=>null);
   keyValue=vd?.keys?.[0];
   if(!legacyKeyFormat(keyValue))return json({error:"VPS returned a key in an unsupported format. No license was created."},502,origin);
   const {data:legacy,error:lookupError}=await admin.from("keys").select("key_str,revoked").eq("key_str",keyValue).maybeSingle();
   if(lookupError)return json({error:"Could not verify generated key in the desktop key registry",details:lookupError.message},500,origin);
   if(legacy?.revoked)return json({error:"VPS returned a revoked key. No license was created."},409,origin);
   if(legacy){
    const {error:ownerError}=await admin.from("keys").update({owner:legacyOwner,days:legacyDays[plan]}).eq("key_str",keyValue);
    if(ownerError)return json({error:"Could not sync generated key ownership",details:ownerError.message},500,origin);
   }else{
    const {error:insertError}=await admin.from("keys").insert({key_str:keyValue,days:legacyDays[plan],issued_at:Math.floor(Date.now()/1000),owner:legacyOwner,note:notes||"Admin panel",revoked:false});
    if(insertError)return json({error:"Generated key was not registered with the desktop validator",details:insertError.message},500,origin);
    createdLegacyRow=true;
   }
  }
  const key_hash=await hash(keyValue),key_prefix=keyValue.slice(0,12);
  const {data,error}=await admin.from("licenses").insert({key_hash,license_key:keyValue,key_prefix,plan,status:"available",owner_id:body.owner_id||null,expires_at:exp,max_devices:body.max_devices??1,notes,created_by:user.id}).select("id,key_prefix,plan,status,expires_at,max_devices,created_at").single();
  if(error){
   if(createdLegacyRow)await admin.from("keys").delete().eq("key_str",keyValue);
   else await admin.from("keys").update({revoked:true}).eq("key_str",keyValue);
   return json({error:"License creation failed; the generated key was disabled",details:error.message},500,origin);
  }
  return json({license:data,license_key:keyValue,legacy_key_registered:true},200,origin);
 }
 if(action==="list"){
  const limit=Math.min(100,Math.max(1,Number(body.limit)||50));
  const offset=Math.max(0,Number(body.offset)||0);
  const {data,error,count}=await admin.from("licenses").select("id,key_prefix,license_key,plan,status,owner_id,expires_at,max_devices,notes,created_at,updated_at",{count:"exact"}).order("created_at",{ascending:false}).range(offset,offset+limit-1);
  if(error)return json({error:"List failed",details:error.message},500,origin);
  const ids=[...new Set((data||[]).map(x=>x.owner_id).filter(Boolean))];
  const {data:profiles,error:profileError}=ids.length?await admin.from("profiles").select("id,email").in("id",ids):{data:[],error:null};
  if(profileError)return json({error:"Could not load license owners",details:profileError.message},500,origin);
  const emails=new Map((profiles||[]).map(p=>[p.id,p.email]));
  const keyValues=(data||[]).map(x=>x.license_key).filter(Boolean);
  const {data:keyRows,error:keyError}=keyValues.length?await admin.from("keys").select("key_str,activated_at,revoked,hwid,issued_at,days").in("key_str",keyValues):{data:[],error:null};
  if(keyError)return json({error:"Could not load desktop key status",details:keyError.message},500,origin);
  const licenseIds=(data||[]).map(x=>x.id);
  const {data:deviceRows,error:deviceError}=licenseIds.length?await admin.from("hwid_devices").select("license_id").in("license_id",licenseIds).is("revoked_at",null):{data:[],error:null};
  if(deviceError)return json({error:"Could not load registered devices",details:deviceError.message},500,origin);
  const keyMap=new Map((keyRows||[]).map(k=>[k.key_str,k]));
  const deviceCounts=new Map();
  for(const d of deviceRows||[])deviceCounts.set(d.license_id,(deviceCounts.get(d.license_id)||0)+1);
  const nowSeconds=Math.floor(Date.now()/1000);
  const licenses=(data||[]).map(x=>{
    const k=keyMap.get(x.license_key);
    const legacyBound=typeof k?.hwid==="string"&&k.hwid.trim().length>0;
    const device_count=Math.max(deviceCounts.get(x.id)||0,legacyBound?1:0);
    const explicitExpiry=x.expires_at?Math.floor(new Date(x.expires_at).getTime()/1000):null;
    const legacyExpiry=x.plan!=="lifetime"&&k?.issued_at!=null&&k?.days!=null?Number(k.issued_at)+Number(k.days)*86400:null;
    const expirySeconds=explicitExpiry??legacyExpiry;
    const isExpired=expirySeconds!==null&&Number.isFinite(expirySeconds)&&expirySeconds<=nowSeconds;
    let effective_status=x.status;
    if(x.status==="revoked")effective_status="revoked";
    else if(x.status==="expired"||isExpired)effective_status="expired";
    else if(x.status==="suspended")effective_status="suspended";
    else if(k?.revoked)effective_status="revoked";
    else if(k?.activated_at)effective_status="active";
    return {...x,owner_email:emails.get(x.owner_id)||null,vps_activated_at:k?.activated_at||null,device_count,effective_status};
  });
  return json({licenses,count:count||0,limit,offset},200,origin);
}
 if(action==="set_status"){
  if(!uuid(body.id))return json({error:"Valid id required"},400,origin);
  const requested=body.status;
  if(!["suspended","active"].includes(requested))return json({error:"Status must be suspended or active."},400,origin);
  const {data:lic,error:licenseError}=await admin.from("licenses").select("id,license_key,plan,status,expires_at").eq("id",body.id).maybeSingle();
  if(licenseError||!lic)return json({error:"License not found"},404,origin);
  if(lic.status==="revoked"||lic.status==="expired")return json({error:"A revoked or expired license cannot be changed."},409,origin);
  if(requested==="suspended"&&lic.status==="suspended")return json({error:"This license is already suspended."},409,origin);
  if(requested==="active"&&lic.status!=="suspended")return json({error:"Only a suspended license can be reactivated."},409,origin);
  if(!lic.license_key)return json({error:"This license has no linked desktop key; status was not changed."},409,origin);
  const {data:key,error:keyLookupError}=await admin.from("keys").select("key_str,revoked,activated_at,issued_at,days").eq("key_str",lic.license_key).maybeSingle();
  if(keyLookupError)return json({error:"Could not inspect the desktop key registry",details:keyLookupError.message},500,origin);
  if(!key)return json({error:"The desktop key record was not found; status was not changed."},404,origin);
  const expirySeconds=lic.expires_at?Math.floor(new Date(lic.expires_at).getTime()/1000):(lic.plan!=="lifetime"&&key.issued_at!=null&&key.days!=null?Number(key.issued_at)+Number(key.days)*86400:null);
  if(expirySeconds!==null&&Number.isFinite(expirySeconds)&&expirySeconds<=Math.floor(Date.now()/1000)){
    await admin.from("licenses").update({status:"expired"}).eq("id",lic.id);
    return json({error:"This license has expired and cannot be suspended or reactivated.",status:"expired"},409,origin);
  }
  let nextLicenseStatus=requested;
  let event=requested==="suspended"?"suspend":"unsuspend";
  let restoreStatus:string|null=null;
  if(requested==="active"){
    const {data:lastSuspend,error:suspendLookupError}=await admin.from("license_activations").select("metadata").eq("license_id",lic.id).eq("event","suspend").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(suspendLookupError)return json({error:"Could not read the previous license status",details:suspendLookupError.message},500,origin);
    const previous=lastSuspend?.metadata?.previous_status;
    restoreStatus=previous==="active"||previous==="available"?previous:(key.activated_at?"active":"available");
    nextLicenseStatus=restoreStatus;
  }
  const previousRevoked=Boolean(key.revoked);
  const nextRevoked=requested==="suspended";
  const {error:keyUpdateError}=await admin.from("keys").update({revoked:nextRevoked}).eq("key_str",key.key_str);
  if(keyUpdateError)return json({error:"Could not update the desktop key status",details:keyUpdateError.message},500,origin);
  const {data:updated,error:updateError}=await admin.from("licenses").update({status:nextLicenseStatus}).eq("id",lic.id).select("id,status").single();
  if(updateError){
    await admin.from("keys").update({revoked:previousRevoked}).eq("key_str",key.key_str);
    return json({error:"License status update failed; desktop key status was rolled back",details:updateError.message},500,origin);
  }
  const {error:logError}=await admin.from("license_activations").insert({license_id:lic.id,user_id:user.id,event,metadata:{admin_status_change:true,previous_status:lic.status,new_status:nextLicenseStatus,desktop_key_revoked:nextRevoked}});
  if(logError){
    await admin.from("licenses").update({status:lic.status}).eq("id",lic.id);
    await admin.from("keys").update({revoked:previousRevoked}).eq("key_str",key.key_str);
    return json({error:"Status audit failed; license and desktop key were rolled back",details:logError.message},500,origin);
  }
  return json({ok:true,status:updated.status,desktop_key_synced:true,restored_previous_status:restoreStatus},200,origin);
 }
 if(action==="revoke"){
  if(!uuid(body.id))return json({error:"Valid id required"},400,origin);
  const {data:lic,error:findError}=await admin.from("licenses").select("id,license_key,status").eq("id",body.id).maybeSingle();
  if(findError||!lic)return json({error:"License not found"},404,origin);
  if(!lic.license_key)return json({error:"This license has no linked desktop key and cannot be safely revoked."},409,origin);
  const {data:legacy,error:keyLookupError}=await admin.from("keys").select("key_str,revoked").eq("key_str",lic.license_key).maybeSingle();
  if(keyLookupError)return json({error:"Could not inspect the desktop key registry",details:keyLookupError.message},500,origin);
  if(!legacy)return json({error:"The desktop key record was not found; the license was not changed."},404,origin);
  if(lic.status==="revoked"&&legacy.revoked)return json({ok:true,already_revoked:true,key_revoked:true},200,origin);
  const {error:keyError}=await admin.from("keys").update({revoked:true}).eq("key_str",lic.license_key);
  if(keyError)return json({error:"Could not revoke the desktop key",details:keyError.message},500,origin);
  const {error:updateError}=await admin.from("licenses").update({status:"revoked"}).eq("id",body.id);
  if(updateError){
    await admin.from("keys").update({revoked:legacy.revoked}).eq("key_str",lic.license_key);
    return json({error:"License revocation failed; desktop key state was rolled back",details:updateError.message},500,origin);
  }
  if(lic.status!=="revoked"){
    const {error:logError}=await admin.from("license_activations").insert({license_id:body.id,user_id:user.id,event:"revoke",metadata:{admin_revoke:true,previous_status:lic.status}});
    if(logError){
      await admin.from("licenses").update({status:lic.status}).eq("id",body.id);
      await admin.from("keys").update({revoked:legacy.revoked}).eq("key_str",lic.license_key);
      return json({error:"Revocation audit failed; license and desktop key were rolled back",details:logError.message},500,origin);
    }
  }
  return json({ok:true,key_revoked:true,already_revoked:false},200,origin);
}
 if(action==="update"){
  if(!uuid(body.id))return json({error:"Valid id required"},400,origin);
  const patch:any={};
  if(body.status!==undefined)return json({error:"Use the dedicated Suspend/Activate action or Revoke action to change license status."},400,origin);
  for(const f of ["expires_at","max_devices","owner_id","notes"])if(body[f]!==undefined)patch[f]=body[f];
  if(!Object.keys(patch).length)return json({error:"No fields to update"},400,origin);
  if(patch.status&&!["available","active","suspended","revoked","expired"].includes(patch.status))return json({error:"Invalid status"},400,origin);
  if(patch.max_devices!==undefined&&!maxDevices(patch.max_devices))return json({error:"max_devices must be an integer from 1 to 10"},400,origin);
  if(patch.owner_id!==null&&patch.owner_id!==undefined&&!uuid(patch.owner_id))return json({error:"Invalid owner_id"},400,origin);
  if(patch.expires_at!==undefined){const d=dateValue(patch.expires_at);if(d===undefined)return json({error:"Invalid expires_at"},400,origin);patch.expires_at=d}
  if(patch.notes!==undefined){patch.notes=patch.notes==null?null:String(patch.notes).trim();if(patch.notes&&patch.notes.length>500)return json({error:"Notes too long (max 500)"},400,origin)}
  const {data:existing,error:existingError}=await admin.from("licenses").select("id,license_key,plan,owner_id,status,created_at,expires_at,notes").eq("id",body.id).maybeSingle();
  if(existingError||!existing)return json({error:"License not found"},404,origin);
  const ownerChanging=Object.prototype.hasOwnProperty.call(patch,"owner_id");
  let keyRegenerated=false,legacyInserted=false,legacyChanged=false,previousLegacyOwner:any=null,newKey:string|undefined;
  if(ownerChanging){
   const targetOwner=patch.owner_id||null;
   if(targetOwner){
    const {data:ownerProfile,error:ownerError}=await admin.from("profiles").select("id").eq("id",targetOwner).maybeSingle();
    if(ownerError||!ownerProfile)return json({error:"Target account not found"},404,origin);
   }
   const {data:legacy,error:keyLookupError}=await admin.from("keys").select("key_str,owner,revoked").eq("key_str",existing.license_key).maybeSingle();
   if(keyLookupError)return json({error:"Could not inspect the desktop key registry",details:keyLookupError.message},500,origin);
   if(legacy?.revoked)return json({error:"This desktop key is revoked. Generate a replacement license before assigning it."},409,origin);
   if(legacy){
    previousLegacyOwner=legacy.owner;
    const {error:keyUpdateError}=await admin.from("keys").update({owner:targetOwner}).eq("key_str",existing.license_key);
    if(keyUpdateError)return json({error:"Could not sync license ownership to the desktop key registry",details:keyUpdateError.message},500,origin);
    legacyChanged=true;
   }else{
    keyRegenerated=true;
    let inserted=false;
    for(let attempt=0;attempt<5&&!inserted;attempt++){
     newKey=randomKey();
     const {error:keyInsertError}=await admin.from("keys").insert({
      key_str:newKey,days:legacyDays[existing.plan]??legacyDays.lifetime,
      issued_at:issuedAtFor(existing),owner:targetOwner,
      note:existing.notes||"Legacy key reissued during account assignment",revoked:false
     });
     if(!keyInsertError){inserted=true;legacyInserted=true;}
     else if(keyInsertError.code!=="23505")return json({error:"Could not create a desktop-compatible key for this license",details:keyInsertError.message},500,origin);
    }
    if(!inserted)return json({error:"Could not generate a unique replacement key. Please retry."},500,origin);
    patch.license_key=newKey;
    patch.key_hash=await hash(newKey);
    patch.key_prefix=newKey.slice(0,12);
   }
  }
  const {data,error}=await admin.from("licenses").update(patch).eq("id",body.id).select("id,key_prefix,plan,status,owner_id,expires_at,max_devices,notes,updated_at").single();
  if(error){
   if(legacyInserted&&newKey)await admin.from("keys").delete().eq("key_str",newKey);
   else if(legacyChanged)await admin.from("keys").update({owner:previousLegacyOwner}).eq("key_str",existing.license_key);
   return json({error:"Update failed; legacy key ownership was rolled back",details:error.message},400,origin);
  }
  return json({license:data,legacy_key_synced:ownerChanging,key_regenerated:keyRegenerated},200,origin);
 }
 if(action==="reset_hwid"){
  if(!uuid(body.id))return json({error:"Valid id required"},400,origin);
  const {data:license,error:licenseError}=await admin.from("licenses").select("id,license_key,status,plan,expires_at").eq("id",body.id).maybeSingle();
  if(licenseError||!license)return json({error:"License not found"},404,origin);
  if(["revoked","suspended","expired"].includes(license.status))return json({error:"Cannot reset HWID for a suspended, revoked, or expired license."},409,origin);
  if(!license.license_key)return json({error:"This license has no linked desktop key, so its HWID binding cannot be released."},409,origin);
  const {data:legacyKey,error:keyLookupError}=await admin.from("keys").select("key_str,hwid,activated_at,revoked,issued_at,days").eq("key_str",license.license_key).maybeSingle();
  if(keyLookupError)return json({error:"Could not inspect the desktop key registry",details:keyLookupError.message},500,origin);
  if(!legacyKey)return json({error:"The desktop key record was not found; no HWID was reset."},404,origin);
  const expirySeconds=license.expires_at?Math.floor(new Date(license.expires_at).getTime()/1000):(license.plan!=="lifetime"&&legacyKey.issued_at!=null&&legacyKey.days!=null?Number(legacyKey.issued_at)+Number(legacyKey.days)*86400:null);
  if(expirySeconds!==null&&Number.isFinite(expirySeconds)&&expirySeconds<=Math.floor(Date.now()/1000)){
    await admin.from("licenses").update({status:"expired"}).eq("id",body.id);
    return json({error:"This license has expired; HWID reset is not available.",status:"expired"},409,origin);
  }
  if(legacyKey.revoked)return json({error:"This desktop key is revoked and cannot be reactivated."},409,origin);
  const {data:activeDevices,error:deviceLookupError}=await admin.from("hwid_devices").select("id").eq("license_id",body.id).is("revoked_at",null);
  if(deviceLookupError)return json({error:"Could not inspect registered devices",details:deviceLookupError.message},500,origin);
  const {error:deviceError}=await admin.from("hwid_devices").update({revoked_at:new Date().toISOString()}).eq("license_id",body.id).is("revoked_at",null);
  if(deviceError)return json({error:"Could not release the registered device",details:deviceError.message},500,origin);
  const {error:keyResetError}=await admin.from("keys").update({hwid:null,activated_at:null}).eq("key_str",license.license_key).eq("revoked",false);
  if(keyResetError)return json({error:"Could not clear the desktop key HWID binding",details:keyResetError.message},500,origin);
  const {error:logError}=await admin.from("license_activations").insert({license_id:body.id,user_id:user.id,event:"deactivate",metadata:{admin_hwid_reset:true,legacy_hwid_cleared:Boolean(legacyKey.hwid),activation_timestamp_cleared:legacyKey.activated_at!==null,released_device_count:(activeDevices||[]).length}});
  if(logError)return json({error:"HWID was released, but the audit log failed",details:logError.message},500,origin);
  return json({ok:true,legacy_hwid_cleared:Boolean(legacyKey.hwid),released_device_count:(activeDevices||[]).length,new_device_can_activate:true},200,origin);
}
 if(action==="activations"){
  if(!uuid(body.id))return json({error:"Valid id required"},400,origin);
  const {data:license,error:licenseError}=await admin.from("licenses").select("id,license_key").eq("id",body.id).maybeSingle();
  if(licenseError||!license)return json({error:"License not found"},404,origin);
  const {data:activations,error}=await admin.from("license_activations").select("id,user_id,event,created_at,metadata").eq("license_id",body.id).order("created_at",{ascending:false}).limit(100);
  if(error)return json({error:"History failed",details:error.message},500,origin);
  const {data:devices,error:deviceError}=await admin.from("hwid_devices").select("device_label,first_seen_at,last_seen_at,revoked_at").eq("license_id",body.id).order("first_seen_at",{ascending:false}).limit(20);
  if(deviceError)return json({error:"Device history failed",details:deviceError.message},500,origin);
  let legacy=null;
  if(license.license_key){
    const {data:key,error:keyError}=await admin.from("keys").select("created_at,issued_at,activated_at,last_seen,hwid,revoked,days").eq("key_str",license.license_key).maybeSingle();
    if(keyError)return json({error:"Desktop key history failed",details:keyError.message},500,origin);
    if(key)legacy={created_at:key.created_at,issued_at:key.issued_at,activated_at:key.activated_at,last_seen:key.last_seen,hwid_bound:typeof key.hwid==="string"&&key.hwid.trim().length>0,revoked:Boolean(key.revoked),days:key.days};
  }
  return json({activations:activations||[],devices:devices||[],legacy},200,origin);
}
 return json({error:"Unknown action"},400,origin);
});