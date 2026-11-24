let streamerData=[],streamerOrders=[],splitData=null,financeSettings=null,withdrawalData=[],splitCurrentRange='30';
const streamerFn='/api/streamer-admin',financeFn='/api/finance-split';
async function streamerApi(action,body={}) {
 const r=await fetch(streamerFn,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token,"apikey":"sb_publishable_C1Mv75fwRb3bA9gx6JqN7w_2c2CyJvF"},body:JSON.stringify({action,...body})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(d.error||"Streamer request failed");
 return d;
}
const streamerMoney=(v,currency="EUR")=>new Intl.NumberFormat("en-IE",{style:"currency",currency:(currency||"EUR").toUpperCase()}).format(Number(v||0));
const streamerDate=v=>v?new Date(v).toLocaleString():"—";
const streamerPortalUrl=()=>location.origin+"/streamer.html";
const streamerReferralUrl=s=>location.origin+"/?ref="+encodeURIComponent(s.promo_code);
function streamerRevenueText(revenue){
 const entries=Object.entries(revenue||{});
 return entries.length?entries.map(([currency,value])=>streamerMoney(value,currency)).join(" · "):"—";
}
async function loadStreamers(){
 const notice=document.getElementById("streamerNotice");
 try{
  const d=await streamerApi("list");streamerData=d.streamers||[];streamerOrders=d.recent_orders||[];renderStreamers();
  if(notice){notice.className="notice";notice.textContent="Loaded "+streamerData.length+" streamer profiles, "+streamerData.filter(s=>s.user_id).length+" linked portal accounts and "+(d.paid_orders_count||0)+" paid referred orders."}
 }catch(e){
  if(notice){notice.className="notice error";notice.textContent="Could not load streamer data: "+e.message}
  document.getElementById("streamerRows").innerHTML='<tr><td colspan="10">'+esc(e.message)+'</td></tr>';
 }
}
function renderStreamers(){
 const totalOrders=streamerData.reduce((n,s)=>n+Number(s.paid_orders||0),0);
 const totalClicks=streamerData.reduce((n,s)=>n+Number(s.clicks||0),0);
 const totalCheckouts=streamerData.reduce((n,s)=>n+Number(s.checkouts||0),0);
 const linked=streamerData.filter(s=>s.user_id).length;
 const totalRevenue={};
 for(const s of streamerData)for(const [currency,value] of Object.entries(s.revenue_by_currency||{}))totalRevenue[currency]=Number(totalRevenue[currency]||0)+Number(value||0);
 document.getElementById("streamerCount").textContent=streamerData.length.toLocaleString();
 document.getElementById("streamerAccounts").textContent=linked.toLocaleString();
 document.getElementById("streamerClicks").textContent=totalClicks.toLocaleString();
 document.getElementById("streamerCheckouts").textContent=totalCheckouts.toLocaleString();
 document.getElementById("streamerOrders").textContent=totalOrders.toLocaleString();
 document.getElementById("streamerRevenue").textContent=streamerRevenueText(totalRevenue);
 const byId=new Map(streamerData.map(s=>[s.id,s]));
 document.getElementById("streamerRows").innerHTML=streamerData.map(s=>{
  const account=s.account_email
    ?'<strong>'+esc(s.account_email)+'</strong><div class="notice">Linked</div>'
    :'<span class="notice">Not created</span>';
  const accountAction=s.user_id
    ?'<button class="mini" data-streamer-action="reset" data-id="'+esc(s.id)+'">Reset password</button><button class="mini" data-streamer-action="unlink" data-id="'+esc(s.id)+'">Unlink</button>'
    :'<button class="mini" data-streamer-action="account" data-id="'+esc(s.id)+'">Create account</button>';
  return '<tr><td><strong>'+esc(s.name)+'</strong></td>'+
   '<td><code>'+esc(s.promo_code)+'</code><button class="mini" data-streamer-action="copy-code" data-id="'+esc(s.id)+'">Copy</button></td>'+
   '<td>'+account+'</td>'+
   '<td>'+Number(s.clicks||0).toLocaleString()+'</td>'+
   '<td>'+Number(s.checkouts||0).toLocaleString()+'</td>'+
   '<td>'+Number(s.paid_orders||0).toLocaleString()+'</td>'+
   '<td>'+esc(streamerRevenueText(s.revenue_by_currency))+'</td>'+
   '<td><span class="pill '+(s.is_active?'':'warn')+'">'+(s.is_active?'Active':'Paused')+'</span></td>'+
   '<td><button class="mini" data-streamer-action="copy-link" data-id="'+esc(s.id)+'">Copy link</button><div class="notice"><a href="'+esc(streamerReferralUrl(s))+'" target="_blank" rel="noopener">Open</a></div></td>'+
   '<td><div class="actions">'+accountAction+
    '<button class="mini" data-streamer-action="edit" data-id="'+esc(s.id)+'">Edit</button>'+
    '<button class="mini" data-streamer-action="toggle" data-id="'+esc(s.id)+'" data-active="'+(!s.is_active)+'">'+(s.is_active?'Pause':'Activate')+'</button></div></td></tr>';
 }).join("")||'<tr><td colspan="10">No streamers yet. Add the first streamer above.</td></tr>';
 document.getElementById("streamerOrderRows").innerHTML=streamerOrders.map(o=>{
  const st=byId.get(o.streamer_id);
  return '<tr><td>'+esc(streamerDate(o.paid_at||o.created_at))+'</td><td>'+esc(st?.name||"Streamer")+'</td><td><code>'+esc(o.promo_code||st?.promo_code||"—")+'</code></td><td>'+esc(o.plan)+'</td><td>'+streamerMoney(o.amount,o.currency)+'</td><td>'+Number(o.promo_discount_percent||0)+'% · '+streamerMoney(o.promo_discount_amount,o.currency)+'</td><td><code>'+esc(String(o.provider_order_id||"").slice(0,18))+'</code></td></tr>';
 }).join("")||'<tr><td colspan="7">No referred purchases yet. Referral links are ready for internal testing.</td></tr>';
}
function showStreamerCredentials(title,email,password){
 const box=document.getElementById("streamerCredentials");
 if(!box){alert(title+"\nLogin: "+email+"\nTemporary password: "+password);return}
 box.classList.remove("hidden");box.className="notice";
 box.innerHTML='<strong>'+esc(title)+'</strong><br>Login: <code>'+esc(email)+'</code><br>Temporary password: <code id="streamerTempPassword">'+esc(password)+'</code> <button class="mini" id="copyStreamerPassword">Copy password</button><br><span class="notice">Save these details now. The temporary password is only returned once.</span>';
 document.getElementById("copyStreamerPassword").onclick=async()=>{await navigator.clipboard.writeText(password);document.getElementById("copyStreamerPassword").textContent="Copied"};
}
document.getElementById("streamerForm").onsubmit=async e=>{
 e.preventDefault();const name=document.getElementById("streamerName").value.trim(),promo_code=document.getElementById("streamerCode").value.trim().toUpperCase();
 try{await streamerApi("create",{name,promo_code});document.getElementById("streamerForm").reset();msg("Streamer and unique referral code created.",false,"streamerNotice");await loadStreamers()}
 catch(err){msg(err.message,true,"streamerNotice")}
};
document.getElementById("streamerRows").addEventListener("click",async e=>{
 const b=e.target.closest("button[data-streamer-action]");if(!b)return;
 const st=streamerData.find(x=>x.id===b.dataset.id);if(!st)return;
 b.disabled=true;
 try{
  const action=b.dataset.streamerAction;
  if(action==="copy-code"){await navigator.clipboard.writeText(st.promo_code);msg("Copied "+st.promo_code+".",false,"streamerNotice");return}
  if(action==="copy-link"){await navigator.clipboard.writeText(streamerReferralUrl(st));msg("Referral link copied.",false,"streamerNotice");return}
  if(action==="toggle"){await streamerApi("update",{id:st.id,is_active:b.dataset.active==="true"});await loadStreamers();return}
  if(action==="edit"){
   const name=prompt("Streamer display name:",st.name);if(name===null)return;
   const promo_code=prompt("Referral code:",st.promo_code);if(promo_code===null)return;
   await streamerApi("update",{id:st.id,name,promo_code});await loadStreamers();return;
  }
  if(action==="account"){
   const email=prompt("Email address for "+st.name+"'s streamer portal account:");if(!email)return;
   const result=await streamerApi("create_account",{streamer_id:st.id,email:email.trim().toLowerCase()});
   if(result.temporary_password)showStreamerCredentials("Streamer portal account created",email,result.temporary_password);
   else msg("Existing account linked to "+st.name+".",false,"streamerNotice");
   await loadStreamers();return;
  }
  if(action==="reset"){
   if(!confirm("Generate a new temporary password for "+st.name+"?"))return;
   const result=await streamerApi("reset_password",{streamer_id:st.id});
   showStreamerCredentials("Streamer password reset",st.account_email,result.temporary_password);return;
  }
  if(action==="unlink"){
   if(!confirm("Unlink the portal account for "+st.name+"? The Auth account itself will not be deleted."))return;
   await streamerApi("unlink_account",{streamer_id:st.id});await loadStreamers();return;
  }
 }catch(err){msg(err.message,true,"streamerNotice")}
 finally{b.disabled=false}
});
document.getElementById("streamerRefresh").onclick=loadStreamers;
document.getElementById("streamerExport").onclick=()=>{
 const headers=["Date","Streamer","Promo code","Plan","Paid amount","Currency","Discount percent","Discount amount","Stripe checkout"];
 const byId=new Map(streamerData.map(st=>[st.id,st]));
 const rows=[headers,...streamerOrders.map(o=>[o.paid_at||o.created_at,byId.get(o.streamer_id)?.name||"",o.promo_code,o.plan,o.amount,o.currency,o.promo_discount_percent,o.promo_discount_amount,o.provider_order_id])];
 const csv=rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\n");
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="robcheat-streamer-referrals.csv";a.click();URL.revokeObjectURL(a.href);
};
let streamerCredentialRows=[];
function renderStreamerCredentials(result){
 const box=document.getElementById("streamerCredentials");
 if(!box)return;
 streamerCredentialRows=result.credentials||[];
 box.classList.remove("hidden");
 box.className="notice";
 const failed=(result.failed||[]).length,linked=(result.already_linked||[]).length,created=streamerCredentialRows.length;
 box.innerHTML='<strong>Streamer account provisioning complete</strong><br>Created: '+created+
  ' · Already linked: '+linked+' · Failed: '+failed+
  '<br><span class="notice">Login aliases are not monitored inboxes. Temporary passwords are shown only in this result and are not saved. Use the Admin Panel to reset a password later.</span>'+
  '<div class="actions" style="margin-top:12px"><button class="btn primary" id="downloadStreamerCredentials" type="button" '+(created?'':'disabled')+'>Download login credentials CSV</button><button class="btn" id="hideStreamerCredentials" type="button">Hide credentials</button></div>'+
  (created?'<div class="tablewrap"><table style="min-width:680px"><thead><tr><th>Streamer</th><th>Promo code</th><th>Login alias</th><th>Temporary password</th></tr></thead><tbody>'+
   streamerCredentialRows.map(row=>'<tr><td>'+esc(row.name)+'</td><td><code>'+esc(row.promo_code)+'</code></td><td><code>'+esc(row.login_email)+'</code></td><td><code>'+esc(row.temporary_password)+'</code></td></tr>').join('')+
   '</tbody></table></div>':'');
 document.getElementById("downloadStreamerCredentials").onclick=()=>{
  const rows=[["Streamer","Promo code","Login alias","Temporary password"],...streamerCredentialRows.map(x=>[x.name,x.promo_code,x.login_email,x.temporary_password])];
  const csv=rows.map(row=>row.map(value=>'"'+String(value??"").replace(/"/g,'""')+'"').join(",")).join("\\n");
  const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));link.download="robcheat-streamer-credentials.csv";link.click();URL.revokeObjectURL(link.href);
 };
 document.getElementById("hideStreamerCredentials").onclick=()=>{box.classList.add("hidden");box.textContent="";streamerCredentialRows=[]};
}
document.getElementById("streamerCreateAllAccounts").onclick=async()=>{
 if(!confirm("Create portal login accounts for every streamer without a linked account? Each account gets a generated login alias and a one-time temporary password. The aliases are not monitored email inboxes. Continue?"))return;
 const button=document.getElementById("streamerCreateAllAccounts");button.disabled=true;
 msg("Creating streamer login accounts…",false,"streamerNotice");
 try{
  const result=await streamerApi("create_all_accounts");
  renderStreamerCredentials(result);
  await loadStreamers();
  msg("Account setup finished. Download and securely save the credentials CSV.",false,"streamerNotice");
 }catch(error){msg(error.message,true,"streamerNotice")}
 finally{button.disabled=false}
};
async function loadFinanceSettings(){
 try{
  const r=await fetch(financeFn,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token,"apikey":"sb_publishable_C1Mv75fwRb3bA9gx6JqN7w_2c2CyJvF"},body:JSON.stringify({action:"get"})});
  const d=await r.json();if(!r.ok)throw Error(d.error||"Unable to load finance workspace");
  financeSettings=d.workspace;
  if(!financeSettings?.id)throw Error("Finance workspace is not configured.");
 }catch(e){financeSettings=null;msg(e.message,true,"splitNotice")}
}
function setSplitRange(range){
 splitCurrentRange=String(range);
 const now=new Date(),to=localISODate(now);
 document.getElementById("splitTo").value=to;
 if(range==="all"){document.getElementById("splitFrom").value="";loadProfitSplit(true);return}
 const days=range==="today"?1:Number(range);
 const from=new Date(now);from.setDate(from.getDate()-(days-1));
 document.getElementById("splitFrom").value=localISODate(from);
 loadProfitSplit(false);
}
async function loadProfitSplit(allTime=false){
 try{
  const from=document.getElementById("splitFrom").value,to=document.getElementById("splitTo").value;
  if(!to)throw Error("Choose an end date.");
  if(!allTime&&(!from||from>to))throw Error("Choose a valid date range.");
  document.getElementById("splitRows").innerHTML='<tr><td colspan="4">Loading Stripe activity…</td></tr>';
  const r=await fetch(stripeFn,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token,"apikey":"sb_publishable_C1Mv75fwRb3bA9gx6JqN7w_2c2CyJvF"},body:JSON.stringify({startDate:from,endDate:to,allTime:!!allTime})});
  const d=await r.json();if(!r.ok)throw Error(d.error||"Stripe data unavailable");
  splitData=d;
  await loadWithdrawals();
  renderProfitSplit();
 }catch(e){
  document.getElementById("splitRows").innerHTML='<tr><td colspan="4">'+esc(e.message)+'</td></tr>';
  msg("Could not calculate the split: "+e.message,true,"splitNotice");
 }
}
function splitCurrency(){return String(splitData?.currency||"EUR").toUpperCase()}
function splitMoney(cents,currency){
 const c=(currency||splitCurrency())==="MULTI"?"EUR":(currency||splitCurrency());
 return new Intl.NumberFormat("en-IE",{style:"currency",currency:c}).format(Number(cents||0)/100);
}
function splitValues(net){
 const nemilosu=Math.round(Number(net||0)/2);
 return {nemilosu,poker:Number(net||0)-nemilosu};
}
function periodWithdrawalRows(){
 if(!splitData)return [];
 const start=splitData.start_date||null,end=splitData.end_date||null;
 return withdrawalData.filter(w=>(!start||w.withdrawal_date>=start)&&(!end||w.withdrawal_date<=end));
}
function withdrawalTotalMinor(partnerKey,currency){
 return periodWithdrawalRows().filter(w=>w.partner_key===partnerKey&&w.currency===currency)
  .reduce((sum,w)=>sum+Math.round(Number(w.amount||0)*100),0);
}
function updateWithdrawalFormState(){
 const currency=splitCurrency(),multi=currency==="MULTI",ready=!!financeSettings?.id&&!!splitData&&!multi;
 const label=document.getElementById("withdrawalCurrency");
 const amount=document.getElementById("withdrawalAmount");
 const save=document.getElementById("withdrawalSave");
 const date=document.getElementById("withdrawalDate");
 if(label)label.textContent=multi?"Multiple currencies":currency;
 if(amount)amount.disabled=!ready;
 if(save)save.disabled=!ready;
 if(date)date.disabled=!financeSettings?.id;
 const note=document.getElementById("withdrawalCurrencyNote");
 if(note)note.textContent=multi
  ?"The selected Stripe range contains multiple currencies. Withdrawals are paused because the dashboard does not convert currencies."
  :(!financeSettings?.id?"Finance workspace is unavailable.":"Amounts are recorded in "+currency+". This records a withdrawal only; it does not send a bank or Stripe payout.");
 if(date&&!date.value)date.value=localISODate(new Date());
}
async function loadWithdrawals(){
 if(!financeSettings?.id){
  document.getElementById("withdrawalRows").innerHTML='<tr><td colspan="5">Finance workspace is unavailable.</td></tr>';
  updateWithdrawalFormState();return false;
 }
 try{
  let all=[],offset=0,batch=1000;
  while(true){
   const {data,error}=await sb.from("profit_split_withdrawals")
    .select("id,partner_key,amount,currency,withdrawal_date,description,created_at")
    .eq("workspace_id",financeSettings.id)
    .order("withdrawal_date",{ascending:false})
    .order("created_at",{ascending:false})
    .range(offset,offset+batch-1);
   if(error)throw error;
   const rows=data||[];all.push(...rows);
   if(rows.length<batch)break;
   offset+=batch;
  }
  withdrawalData=all;
  renderWithdrawals();
  return true;
 }catch(e){
  document.getElementById("withdrawalRows").innerHTML='<tr><td colspan="5">'+esc(e.message||"Unable to load withdrawals.")+'</td></tr>';
  msg("Could not load withdrawals: "+(e.message||"Unknown error"),true,"splitNotice");
  updateWithdrawalFormState();
  return false;
 }
}
function renderWithdrawals(){
 const body=document.getElementById("withdrawalRows");
 if(!body)return;
 body.innerHTML=withdrawalData.map(w=>{
  const partner=w.partner_key==="nemilosu"?"Nemilosu":"Poker";
  const date=new Date(w.withdrawal_date+"T12:00:00").toLocaleDateString("ro-RO");
  return '<tr><td>'+esc(date)+'</td><td><strong>'+partner+'</strong></td><td>'+streamerMoney(w.amount,w.currency)+'</td><td>'+esc(w.description||"—")+'</td><td><button class="mini" type="button" data-withdrawal-delete="'+esc(w.id)+'">Delete</button></td></tr>';
 }).join("")||'<tr><td colspan="5">No withdrawals recorded yet.</td></tr>';
 updateWithdrawalFormState();
}
function renderProfitSplit(){
 if(!splitData)return;
 const totals=splitData.totals||{gross:0,net:0},shares=splitValues(totals.net),currency=splitCurrency(),multi=currency==="MULTI";
 const nemilosuWithdrawn=multi?0:withdrawalTotalMinor("nemilosu",currency);
 const pokerWithdrawn=multi?0:withdrawalTotalMinor("poker",currency);
 document.getElementById("splitGross").textContent=multi?"Multiple currencies":splitMoney(totals.gross,currency);
 document.getElementById("splitNet").textContent=multi?"Multiple currencies":splitMoney(totals.net,currency);
 document.getElementById("nemilosuShare").textContent=multi?"—":splitMoney(shares.nemilosu,currency);
 document.getElementById("nemilosuWithdrawn").textContent=multi?"—":splitMoney(nemilosuWithdrawn*1,currency);
 document.getElementById("nemilosuRemaining").textContent=multi?"—":splitMoney(shares.nemilosu-nemilosuWithdrawn,currency);
 document.getElementById("pokerShare").textContent=multi?"—":splitMoney(shares.poker,currency);
 document.getElementById("pokerWithdrawn").textContent=multi?"—":splitMoney(pokerWithdrawn*1,currency);
 document.getElementById("pokerRemaining").textContent=multi?"—":splitMoney(shares.poker-pokerWithdrawn,currency);
 const rows=splitData.daily||[];
 document.getElementById("splitRows").innerHTML=rows.slice().reverse().map(x=>{
  const parts=splitValues(x.net);
  return '<tr><td>'+x.date+'</td><td>'+ (multi?"—":splitMoney(x.net,currency))+'</td><td>'+ (multi?"—":splitMoney(parts.nemilosu,currency))+'</td><td>'+ (multi?"—":splitMoney(parts.poker,currency))+'</td></tr>';
 }).join("")||'<tr><td colspan="4">No Stripe activity in this period.</td></tr>';
 const periodLabel=splitData.all_time?"All time":splitData.start_date+" – "+splitData.end_date;
 document.getElementById("splitBasis").textContent="Period: "+periodLabel+". Stripe net is split equally: 50% Nemilosu and 50% Poker. Each partner's remaining balance is their allocation less only their own withdrawals dated within the selected period. "+(splitData.truncated?"Stripe API pagination limit reached; totals may be incomplete. ":"")+(multi?" Multiple currencies are present and are not converted into a common currency.":" Net values include Stripe fees and refunds.");
 updateWithdrawalFormState();
}
document.querySelectorAll(".split-range").forEach(b=>b.onclick=()=>setSplitRange(b.dataset.range));
document.getElementById("splitApply").onclick=()=>loadProfitSplit(false);
document.getElementById("splitRefresh").onclick=()=>loadProfitSplit(splitCurrentRange==="all");
document.getElementById("withdrawalForm").onsubmit=async e=>{
 e.preventDefault();
 const button=document.getElementById("withdrawalSave");
 try{
  const currency=splitCurrency(),amount=Number(document.getElementById("withdrawalAmount").value);
  if(!financeSettings?.id)throw Error("Finance workspace is unavailable.");
  if(!splitData)throw Error("Load the Stripe figures first.");
  if(currency==="MULTI")throw Error("Choose a Stripe date range with a single currency before recording a withdrawal.");
  if(!Number.isFinite(amount)||amount<=0)throw Error("Enter a valid withdrawal amount greater than zero.");
  const partner_key=document.getElementById("withdrawalPartner").value;
  if(!["nemilosu","poker"].includes(partner_key))throw Error("Choose Nemilosu or Poker.");
  const withdrawal_date=document.getElementById("withdrawalDate").value||localISODate(new Date());
  const description=document.getElementById("withdrawalDescription").value.trim();
  button.disabled=true;
  const {error}=await sb.from("profit_split_withdrawals").insert({
   workspace_id:financeSettings.id,partner_key,amount,currency,withdrawal_date,
   description:description||null,created_by:session.user.id
  });
  if(error)throw error;
  document.getElementById("withdrawalAmount").value="";
  document.getElementById("withdrawalDescription").value="";
  document.getElementById("withdrawalDate").value=localISODate(new Date());
  await loadWithdrawals();
  renderProfitSplit();
  msg("Withdrawal recorded for "+(partner_key==="nemilosu"?"Nemilosu":"Poker")+".",false,"splitNotice");
 }catch(e){msg(e.message||"Could not record withdrawal.",true,"splitNotice")}
 finally{button.disabled=false;updateWithdrawalFormState()}
};
document.getElementById("withdrawalRows").addEventListener("click",async e=>{
 const button=e.target.closest("button[data-withdrawal-delete]");
 if(!button)return;
 const item=withdrawalData.find(w=>w.id===button.dataset.withdrawalDelete);
 if(!item)return;
 const partner=item.partner_key==="nemilosu"?"Nemilosu":"Poker";
 if(!confirm("Delete the "+partner+" withdrawal of "+streamerMoney(item.amount,item.currency)+"?"))return;
 button.disabled=true;
 try{
  const {error}=await sb.from("profit_split_withdrawals").delete().eq("id",item.id).eq("workspace_id",financeSettings.id);
  if(error)throw error;
  await loadWithdrawals();renderProfitSplit();
  msg("Withdrawal deleted.",false,"splitNotice");
 }catch(e){msg(e.message||"Could not delete withdrawal.",true,"splitNotice")}
});
document.getElementById("splitExport").onclick=()=>{
 if(!splitData)return;
 const multi=splitCurrency()==="MULTI";
 const rows=[
  ["Date","Currency","Stripe net proceeds","Nemilosu allocation","Poker allocation"],
  ...(splitData.daily||[]).map(x=>{const p=splitValues(x.net);return [x.date,splitData.currency||"EUR",multi?"":(Number(x.net||0)/100).toFixed(2),multi?"":(Number(p.nemilosu||0)/100).toFixed(2),multi?"":(Number(p.poker||0)/100).toFixed(2)]}),
  [],
  ["Withdrawal history for selected period"],
  ["Date","Partner","Amount","Currency","Description"],
  ...periodWithdrawalRows().map(w=>[w.withdrawal_date,w.partner_key==="nemilosu"?"Nemilosu":"Poker",w.amount,w.currency,w.description||""])
 ];
 const csv=rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\n");
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="robcheat-profit-split.csv";a.click();URL.revokeObjectURL(a.href);
};
