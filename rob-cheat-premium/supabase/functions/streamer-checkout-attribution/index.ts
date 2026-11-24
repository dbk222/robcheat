import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const validCode = (value: string) => /^[A-Z0-9_-]{3,24}$/.test(value);
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
};
const catalog: Record<string, { amountMinor: number; discountPercent: number }> = {
  day: { amountMinor: 200, discountPercent: 0 },
  week: { amountMinor: 500, discountPercent: 0 },
  month: { amountMinor: 1000, discountPercent: 10 },
  lifetime: { amountMinor: 2000, discountPercent: 10 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication required" }, 401);
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const body = await req.json().catch(() => ({}));
  const plan = String(body.plan ?? "");
  const pricing = catalog[plan];
  if (!pricing) return json({ error: "A valid checkout plan is required." }, 400);

  const manualCode = String(body.promo_code ?? "").trim().toUpperCase();
  const referralToken = String(body.referral_token ?? "").trim();
  let streamer: any = null;
  let attribution: any = null;
  let visitorId: string | null = null;
  let source = "none";

  if (manualCode) {
    // An explicitly entered code is authoritative. An invalid code never falls back to the saved referral.
    if (!validCode(manualCode)) return json({ error: "That promo code is not valid." }, 400);
    const { data, error } = await admin.from("streamers")
      .select("id,name,promo_code,is_active").eq("promo_code", manualCode).maybeSingle();
    if (error) return json({ error: "Unable to validate the promo code." }, 500);
    if (!data || !data.is_active) return json({ error: "That promo code is invalid or inactive." }, 400);
    streamer = data;
    source = "manual_promo_code";
  } else if (referralToken) {
    const tokenHash = await sha256(referralToken);
    const { data, error } = await admin.from("referral_attributions")
      .select("id,streamer_id,visitor_id,promo_code,expires_at,revoked_at")
      .eq("token_hash", tokenHash).is("revoked_at", null).gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) return json({ error: "Unable to validate the saved referral." }, 500);
    if (data) {
      const { data: activeStreamer, error: streamerError } = await admin.from("streamers")
        .select("id,name,promo_code,is_active").eq("id", data.streamer_id).maybeSingle();
      if (streamerError) return json({ error: "Unable to validate the saved referral." }, 500);
      if (activeStreamer?.is_active) {
        streamer = activeStreamer;
        attribution = data;
        visitorId = data.visitor_id;
        source = "referral_link";
      }
    }
  }

  if (!streamer) return json({ attributed: false, plan, promo_code: null, discount_percent: 0, discount_minor: 0 });

  const discountPercent = pricing.discountPercent;
  const discountMinor = Math.round(pricing.amountMinor * discountPercent / 100);
  const { error: eventError } = await admin.from("streamer_referral_events").insert({
    streamer_id: streamer.id, event_type: "checkout_started",
    visitor_id: visitorId, promo_code: streamer.promo_code,
    attribution_source: source, attribution_id: attribution?.id ?? null,
    metadata: { plan, user_id: authData.user.id },
  });
  if (eventError) return json({ error: "Could not record the checkout attribution." }, 500);
  if (attribution) {
    const { error: updateError } = await admin.from("referral_attributions")
      .update({ last_used_at: new Date().toISOString() }).eq("id", attribution.id);
    if (updateError) return json({ error: "Could not update referral activity." }, 500);
  }

  return json({
    attributed: true,
    streamer_id: streamer.id,
    promo_code: streamer.promo_code,
    attribution_source: source,
    visitor_id: visitorId,
    referral_attribution_id: attribution?.id ?? null,
    plan,
    discount_percent: discountPercent,
    discount_minor: discountMinor,
    currency: "EUR",
    referral_expires_at: attribution?.expires_at ?? null,
  });
});
