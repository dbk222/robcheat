import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store, private" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json({ error: "GET required" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication required" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

  const { data: streamer, error } = await admin.from("streamers")
    .select("id,name,promo_code,is_active,created_at")
    .eq("user_id", authData.user.id).maybeSingle();
  if (error) return json({ error: "Could not load streamer account." }, 500);
  if (!streamer || !streamer.is_active) return json({ error: "No active streamer account is linked to this login." }, 403);

  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: events, error: eventsError }, { data: orders, error: ordersError }] = await Promise.all([
    admin.from("streamer_referral_events")
      .select("event_type,created_at").eq("streamer_id", streamer.id).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(5000),
    admin.from("orders")
      .select("id,plan,amount,currency,status,paid_at,created_at,promo_code,promo_discount_amount")
      .eq("streamer_id", streamer.id).eq("status", "paid")
      .order("paid_at", { ascending: false }).limit(100),
  ]);
  if (eventsError || ordersError) return json({ error: "Could not load your referral activity." }, 500);

  const eventRows = events ?? [];
  const orderRows = orders ?? [];
  const clicks = eventRows.filter((event) => event.event_type === "click").length;
  const checkouts = eventRows.filter((event) => event.event_type === "checkout_started").length;
  const revenue: Record<string, number> = {};
  let discounts = 0;
  for (const order of orderRows) {
    const currency = String(order.currency || "EUR").toUpperCase();
    revenue[currency] = Number(revenue[currency] || 0) + Number(order.amount || 0);
    discounts += Number(order.promo_discount_amount || 0);
  }
  const daily = new Map<string, { clicks: number; checkouts: number; purchases: number }>();
  const dayKey = (value: string) => new Date(value).toISOString().slice(0, 10);
  for (const event of eventRows) {
    const key = dayKey(event.created_at);
    const row = daily.get(key) ?? { clicks: 0, checkouts: 0, purchases: 0 };
    if (event.event_type === "click") row.clicks++;
    if (event.event_type === "checkout_started") row.checkouts++;
    daily.set(key, row);
  }
  for (const order of orderRows) {
    const stamp = order.paid_at || order.created_at;
    const key = dayKey(stamp);
    const row = daily.get(key) ?? { clicks: 0, checkouts: 0, purchases: 0 };
    row.purchases++;
    daily.set(key, row);
  }
  const recentOrders = orderRows.slice(0, 25).map((order) => ({
    plan: order.plan, amount: order.amount, currency: order.currency,
    paid_at: order.paid_at, promo_code: order.promo_code,
    discount: order.promo_discount_amount,
  }));

  return json({
    streamer: { name: streamer.name, promo_code: streamer.promo_code, joined_at: streamer.created_at },
    period_days: 30,
    stats: {
      clicks, checkouts, paid_orders: orderRows.length,
      revenue_by_currency: revenue, discount_total: discounts,
      conversion_rate: clicks > 0 ? Number((orderRows.length / clicks * 100).toFixed(2)) : 0,
    },
    daily: [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, value]) => ({ date, ...value })),
    recent_orders: recentOrders,
  });
});
