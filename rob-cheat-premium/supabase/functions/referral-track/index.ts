import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const validCode = (value: string) => /^[A-Z0-9_-]{3,24}$/.test(value);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
};
const createToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const body = await req.json().catch(() => ({}));
  const promoCode = String(body.promo_code ?? "").trim().toUpperCase();
  if (!validCode(promoCode)) return json({ error: "A valid promo code is required." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: streamer, error } = await admin.from("streamers").select("id,name,promo_code,is_active").eq("promo_code", promoCode).maybeSingle();
  if (error) return json({ error: "Could not validate this referral link." }, 500);
  if (!streamer || !streamer.is_active) return json({ error: "This referral code is inactive or invalid." }, 404);

  const suppliedVisitor = String(body.visitor_id ?? "");
  const visitorId = uuidPattern.test(suppliedVisitor) ? suppliedVisitor : crypto.randomUUID();
  const source = String(body.source ?? "direct").slice(0, 80);
  const pagePath = String(body.page_path ?? "/").slice(0, 200);
  const rawToken = createToken();
  const tokenHash = await sha256(rawToken);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 30 * 86400000);

  const { data: attribution, error: attributionError } = await admin.from("referral_attributions").insert({
    token_hash: tokenHash, streamer_id: streamer.id, visitor_id: visitorId,
    promo_code: streamer.promo_code, source, page_path,
    created_at: createdAt.toISOString(), expires_at: expiresAt.toISOString(),
  }).select("id").single();
  if (attributionError) return json({ error: "Could not save referral attribution." }, 500);

  const { error: eventError } = await admin.from("streamer_referral_events").insert({
    streamer_id: streamer.id, event_type: "click", visitor_id: visitorId,
    promo_code: streamer.promo_code, attribution_source: "referral_link",
    attribution_id: attribution.id, metadata: { source, page_path },
  });
  if (eventError) {
    await admin.from("referral_attributions").delete().eq("id", attribution.id);
    return json({ error: "Could not record the referral click." }, 500);
  }
  return json({ ok: true, streamer: { name: streamer.name, promo_code: streamer.promo_code }, visitor_id: visitorId,
    referral_token: rawToken, expires_at: expiresAt.toISOString(), attribution_window_days: 30 });
});