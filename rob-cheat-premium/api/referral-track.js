module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const isPreview = process.env.VERCEL_ENV === "preview";
  const base = isPreview ? process.env.STREAMER_STAGING_SUPABASE_URL : "https://rzbvtzeqrcfutfafaamm.supabase.co";
  const apiKey = isPreview ? process.env.STREAMER_STAGING_SUPABASE_PUBLISHABLE_KEY : "sb_publishable_C1Mv75fwRb3bA9gx6JqN7w_2c2CyJvF";
  if (!base || !apiKey) return res.status(503).json({ error: "Referral tracking environment is not configured." });
  try {
    const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    const upstream = await fetch(base.replace(/\/$/, "") + "/functions/v1/referral-track", {
      method: "POST", headers: { "Content-Type": "application/json", apikey: apiKey }, body: payload,
    });
    const responseText = await upstream.text();
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "no-store");
    return res.status(upstream.status).send(responseText);
  } catch (error) {
    return res.status(502).json({ error: "Unable to reach referral tracking service.", details: error instanceof Error ? error.message : "Unknown error" });
  }
};
