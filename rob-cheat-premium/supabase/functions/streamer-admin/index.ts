import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const cleanCode = (value: unknown) => String(value ?? "").trim().toUpperCase();
const validCode = (value: string) => /^[A-Z0-9_-]{3,24}$/.test(value);
const password = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(30));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "") + "aA7!";
};
const catalog: Record<string, { amount: number; discount: number }> = {
  day: { amount: 2, discount: 0 },
  week: { amount: 5, discount: 0 },
  month: { amount: 10, discount: 10 },
  lifetime: { amount: 20, discount: 10 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication required" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Invalid session" }, 401);
  const { data: profile, error: profileError } = await admin
    .from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (profileError || profile?.role !== "admin") return json({ error: "Admin only" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "list");

  try {
    if (action === "list") {
      const { data: streamers, error } = await admin
        .from("streamers")
        .select("id,name,promo_code,user_id,is_active,created_at,updated_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = streamers ?? [];
      const ids = rows.map((row) => row.id);
      const userIds = rows.map((row) => row.user_id).filter(Boolean);
      const emailById = new Map<string, string>();
      if (userIds.length) {
        const { data: profiles, error: profilesError } = await admin
          .from("profiles").select("id,email").in("id", userIds);
        if (profilesError) throw profilesError;
        for (const item of profiles ?? []) emailById.set(item.id, item.email ?? "");
      }

      let paidOrders: any[] = [];
      let events: any[] = [];
      if (ids.length) {
        const { data: orderRows, error: orderError } = await admin
          .from("orders")
          .select("id,streamer_id,plan,amount,refunded_amount,currency,status,paid_at,created_at,promo_code,promo_discount_amount,promo_discount_percent,provider_order_id")
          .in("streamer_id", ids).eq("status", "paid")
          .order("paid_at", { ascending: false }).limit(5000);
        if (orderError) throw orderError;
        paidOrders = orderRows ?? [];
        const since = new Date(Date.now() - 30 * 86400000).toISOString();
        const { data: eventRows, error: eventError } = await admin
          .from("streamer_referral_events")
          .select("streamer_id,event_type,created_at")
          .in("streamer_id", ids).gte("created_at", since)
          .order("created_at", { ascending: false }).limit(10000);
        if (eventError) throw eventError;
        events = eventRows ?? [];
      }

      const stats = new Map<string, any>();
      for (const streamer of rows) stats.set(streamer.id, {
        clicks: 0, checkouts: 0, paid_orders: 0, revenue_by_currency: {}, discounts: 0, last_sale_at: null,
      });
      for (const event of events) {
        const item = stats.get(event.streamer_id);
        if (!item) continue;
        if (event.event_type === "click") item.clicks++;
        if (event.event_type === "checkout_started") item.checkouts++;
      }
      for (const order of paidOrders) {
        const item = stats.get(order.streamer_id);
        if (!item) continue;
        item.paid_orders++;
        const currency = String(order.currency || "EUR").toUpperCase();
        item.revenue_by_currency[currency] = Number(item.revenue_by_currency[currency] || 0) + Math.max(0, Number(order.amount || 0) - Number(order.refunded_amount || 0));
        item.discounts += Number(order.promo_discount_amount || 0);
        if (!item.last_sale_at) item.last_sale_at = order.paid_at || order.created_at;
      }

      const enriched = rows.map((streamer) => ({
        ...streamer,
        account_email: streamer.user_id ? (emailById.get(streamer.user_id) || null) : null,
        ...(stats.get(streamer.id) ?? {}),
      }));
      const recent = paidOrders.slice(0, 100).map((order) => ({
        streamer_id: order.streamer_id, plan: order.plan,
        amount: Math.max(0, Number(order.amount || 0) - Number(order.refunded_amount || 0)),
        refunded_amount: Number(order.refunded_amount || 0),
        currency: order.currency, paid_at: order.paid_at, promo_code: order.promo_code,
        promo_discount_amount: order.promo_discount_amount, provider_order_id: order.provider_order_id,
      }));
      return json({ streamers: enriched, recent_orders: recent, paid_orders_count: paidOrders.length });
    }

    if (action === "create") {
      const name = String(body.name ?? "").trim();
      const promo_code = cleanCode(body.promo_code);
      if (name.length < 2 || name.length > 64) return json({ error: "Streamer name must be 2–64 characters." }, 400);
      if (!validCode(promo_code)) return json({ error: "Promo code must be 3–24 characters: A–Z, 0–9, - or _." }, 400);
      const { data, error } = await admin.from("streamers")
        .insert({ name, promo_code, is_active: true })
        .select("id,name,promo_code,user_id,is_active,created_at,updated_at").single();
      if (error?.code === "23505") return json({ error: "Promo code already exists." }, 409);
      if (error) throw error;
      return json({ streamer: data }, 201);
    }

    if (action === "update") {
      const id = String(body.id ?? "");
      if (!id) return json({ error: "Streamer ID is required." }, 400);
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = String(body.name ?? "").trim();
        if (name.length < 2 || name.length > 64) return json({ error: "Streamer name must be 2–64 characters." }, 400);
        patch.name = name;
      }
      if (body.promo_code !== undefined) {
        const promo_code = cleanCode(body.promo_code);
        if (!validCode(promo_code)) return json({ error: "Invalid promo code." }, 400);
        patch.promo_code = promo_code;
      }
      if (body.is_active !== undefined) patch.is_active = !!body.is_active;
      if (!Object.keys(patch).length) return json({ error: "No changes supplied." }, 400);
      patch.updated_at = new Date().toISOString();
      const { data, error } = await admin.from("streamers").update(patch).eq("id", id)
        .select("id,name,promo_code,user_id,is_active,created_at,updated_at").maybeSingle();
      if (error?.code === "23505") return json({ error: "Promo code already belongs to another streamer." }, 409);
      if (error) throw error;
      if (!data) return json({ error: "Streamer not found." }, 404);
      return json({ streamer: data });
    }

    if (action === "create_account") {
      const streamerId = String(body.streamer_id ?? "");
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!streamerId) return json({ error: "Streamer ID is required." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: "Enter a valid account email." }, 400);

      const { data: streamer, error: streamerError } = await admin
        .from("streamers").select("id,name,user_id").eq("id", streamerId).maybeSingle();
      if (streamerError) throw streamerError;
      if (!streamer) return json({ error: "Streamer not found." }, 404);
      if (streamer.user_id) return json({ error: "This streamer already has a linked account." }, 409);

      let existingUser: any = null;
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        existingUser = (data.users ?? []).find((user) => (user.email ?? "").toLowerCase() === email) ?? null;
        if (existingUser || (data.users ?? []).length < 1000) break;
      }

      let userId: string;
      let temporaryPassword: string | null = null;
      let createdAccount = false;
      if (existingUser) {
        const { data: existingProfile, error: existingProfileError } = await admin.from("profiles")
          .select("role").eq("id", existingUser.id).maybeSingle();
        if (existingProfileError) throw existingProfileError;
        if (existingProfile?.role === "admin") return json({ error: "Administrator accounts cannot be linked as streamer accounts." }, 409);
        userId = existingUser.id;
        const { error: profileUpsertError } = await admin.from("profiles").upsert(
          { id: userId, email, display_name: streamer.name, role: "customer" },
          { onConflict: "id", ignoreDuplicates: true },
        );
        if (profileUpsertError) throw profileUpsertError;
      } else {
        temporaryPassword = password();
        const { data, error } = await admin.auth.admin.createUser({
          email, password: temporaryPassword, email_confirm: true,
          user_metadata: { display_name: streamer.name },
        });
        if (error || !data.user) throw error ?? new Error("Could not create Auth user.");
        userId = data.user.id;
        createdAccount = true;
        const { error: profileInsertError } = await admin.from("profiles").upsert({
          id: userId, email, display_name: streamer.name, role: "customer",
        }, { onConflict: "id", ignoreDuplicates: true });
        if (profileInsertError) {
          await admin.auth.admin.deleteUser(userId);
          throw profileInsertError;
        }
      }

      const { data: linked, error: linkError } = await admin.from("streamers")
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq("id", streamerId).is("user_id", null)
        .select("id,name,promo_code,user_id,is_active").maybeSingle();
      if (linkError || !linked) {
        if (createdAccount) {
          await admin.from("profiles").delete().eq("id", userId);
          await admin.auth.admin.deleteUser(userId);
        }
        if (linkError?.code === "23505") return json({ error: "This account is already linked to another streamer." }, 409);
        if (linkError) throw linkError;
        return json({ error: "Could not link the account. Refresh and try again." }, 409);
      }
      return json({ streamer: linked, account_created: createdAccount, temporary_password: temporaryPassword });
    }

    if (action === "create_all_accounts") {
      const { data: streamers, error: streamerListError } = await admin.from("streamers")
        .select("id,name,promo_code,user_id").order("created_at", { ascending: true });
      if (streamerListError) throw streamerListError;

      const { data: existingUsers, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) throw usersError;
      const userByEmail = new Map((existingUsers.users ?? []).map((user) => [(user.email ?? "").toLowerCase(), user]));
      const usedUserIds = new Set((streamers ?? []).map((item) => item.user_id).filter(Boolean));
      const credentials: Array<{name:string;promo_code:string;login_email:string;temporary_password:string}> = [];
      const alreadyLinked: Array<{name:string;promo_code:string;login_email:string|null}> = [];
      const failed: Array<{name:string;promo_code:string;reason:string}> = [];

      for (const streamer of streamers ?? []) {
        if (streamer.user_id) {
          const { data: existingProfile } = await admin.from("profiles").select("email").eq("id", streamer.user_id).maybeSingle();
          alreadyLinked.push({ name: streamer.name, promo_code: streamer.promo_code, login_email: existingProfile?.email ?? null });
          continue;
        }

        // Generated login aliases are unique per streamer and are not mailboxes.
        const loginEmail = "streamer." + streamer.promo_code.toLowerCase() + "@accounts.robcheat.fun";
        let user = userByEmail.get(loginEmail);
        let tempPassword: string | null = null;
        let createdUser = false;

        try {
          if (user) {
            const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
            if (profile?.role === "admin" || usedUserIds.has(user.id)) {
              failed.push({ name: streamer.name, promo_code: streamer.promo_code, reason: "Generated login alias is already linked or reserved." });
              continue;
            }
          } else {
            tempPassword = password();
            const { data, error } = await admin.auth.admin.createUser({
              email: loginEmail, password: tempPassword, email_confirm: true,
              user_metadata: { display_name: streamer.name, account_type: "streamer" },
            });
            if (error || !data.user) throw error ?? new Error("Could not create Auth account.");
            user = data.user;
            createdUser = true;
            userByEmail.set(loginEmail, user);
          }

          const { error: profileError } = await admin.from("profiles").upsert({
            id: user.id, email: loginEmail, display_name: streamer.name, role: "customer",
          }, { onConflict: "id", ignoreDuplicates: true });
          if (profileError) throw profileError;

          const { data: linked, error: linkError } = await admin.from("streamers").update({
            user_id: user.id, updated_at: new Date().toISOString(),
          }).eq("id", streamer.id).is("user_id", null).select("id").maybeSingle();
          if (linkError || !linked) throw linkError ?? new Error("Could not link the new Auth account.");

          usedUserIds.add(user.id);
          if (tempPassword) {
            credentials.push({ name: streamer.name, promo_code: streamer.promo_code, login_email: loginEmail, temporary_password: tempPassword });
          } else {
            alreadyLinked.push({ name: streamer.name, promo_code: streamer.promo_code, login_email: loginEmail });
          }
        } catch (error) {
          if (createdUser && user?.id) {
            await admin.auth.admin.deleteUser(user.id);
            userByEmail.delete(loginEmail);
          }
          failed.push({
            name: streamer.name, promo_code: streamer.promo_code,
            reason: error instanceof Error ? error.message : "Could not create streamer account.",
          });
        }
      }

      return json({
        created: credentials.length,
        already_linked: alreadyLinked,
        failed,
        credentials,
        login_alias_domain: "accounts.robcheat.fun",
        note: "Generated login aliases are credentials only, not monitored email inboxes. Password resets are handled from the admin panel.",
      });
    }

    if (action === "reset_password") {
      const streamerId = String(body.streamer_id ?? "");
      const { data: streamer, error } = await admin.from("streamers")
        .select("id,user_id").eq("id", streamerId).maybeSingle();
      if (error) throw error;
      if (!streamer?.user_id) return json({ error: "No account is linked to this streamer." }, 404);
      const temporaryPassword = password();
      const { error: updateError } = await admin.auth.admin.updateUserById(streamer.user_id, { password: temporaryPassword });
      if (updateError) throw updateError;
      return json({ ok: true, temporary_password: temporaryPassword });
    }

    if (action === "unlink_account") {
      const streamerId = String(body.streamer_id ?? "");
      const { data, error } = await admin.from("streamers").update({
        user_id: null, updated_at: new Date().toISOString(),
      }).eq("id", streamerId).select("id,name,promo_code,user_id,is_active").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Streamer not found." }, 404);
      return json({ streamer: data });
    }

    if (action === "record_test_purchase") {
      const streamerId = String(body.streamer_id ?? "");
      const plan = String(body.plan ?? "");
      const item = catalog[plan];
      if (!item) return json({ error: "Choose a valid test plan." }, 400);
      const { data: streamer, error } = await admin.from("streamers")
        .select("id,promo_code,is_active").eq("id", streamerId).maybeSingle();
      if (error) throw error;
      if (!streamer || !streamer.is_active) return json({ error: "Streamer is unavailable." }, 404);
      const discountAmount = Number((item.amount * item.discount / 100).toFixed(2));
      const finalAmount = Number((item.amount - discountAmount).toFixed(2));
      const orderId = crypto.randomUUID();
      const { data: order, error: orderError } = await admin.from("orders").insert({
        provider: "staging_test",
        provider_order_id: "STAGE4-" + orderId,
        amount: finalAmount, currency: "EUR", product_code: "robcheat",
        plan, status: "paid", paid_at: new Date().toISOString(),
        streamer_id: streamer.id, promo_code: streamer.promo_code,
        promo_discount_percent: item.discount, promo_discount_amount: discountAmount,
        attribution_source: "staging_test",
      }).select("id,streamer_id,plan,amount,currency,status,paid_at,promo_code,promo_discount_amount").single();
      if (orderError) throw orderError;
      const { error: eventError } = await admin.from("streamer_referral_events").insert({
        streamer_id: streamer.id, event_type: "purchase", promo_code: streamer.promo_code,
        attribution_source: "staging_test", order_id: order.id,
        metadata: { staging_test: true, plan },
      });
      if (eventError) throw eventError;
      return json({ test_order: order });
    }

    return json({ error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("streamer-admin", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected streamer admin error." }, 500);
  }
});
