module.exports = async function handler(req, res) {
  if (process.env.VERCEL_ENV !== "preview") return res.status(404).json({ error: "Preview-only route." });
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const base = process.env.STREAMER_STAGING_SUPABASE_URL;
  const apiKey = process.env.STREAMER_STAGING_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !apiKey) return res.status(503).json({ error: "Streamer staging is not configured." });
  try {
    const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    const upstream = await fetch(base.replace(/\/$/, "") + "/functions/v1/referral-track", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: payload,
    });
    const body = await upstream.text();
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "no-store");
    return res.status(upstream.status).send(body);
  } catch (error) {
    return res.status(502).json({ error: "Unable to reach referral tracking service.", details: error instanceof Error ? error.message : "Unknown error" });
  }
};
