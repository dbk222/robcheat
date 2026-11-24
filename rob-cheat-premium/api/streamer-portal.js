module.exports = async function handler(req, res) {
  if (process.env.VERCEL_ENV !== "preview") return res.status(404).json({ error: "Preview-only route." });
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const authorization = req.headers.authorization;
  const base = process.env.STREAMER_STAGING_SUPABASE_URL;
  const apiKey = process.env.STREAMER_STAGING_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !apiKey) return res.status(503).json({ error: "Streamer staging is not configured." });
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ error: "An authenticated staging session is required." });
  }
  try {
    const upstream = await fetch(base.replace(/\/$/, "") + "/functions/v1/streamer-portal", {
      method: "GET",
      headers: { Authorization: authorization, apikey: apiKey },
    });
    const body = await upstream.text();
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "no-store, private");
    return res.status(upstream.status).send(body);
  } catch (error) {
    return res.status(502).json({ error: "Unable to reach streamer portal service.", details: error instanceof Error ? error.message : "Unknown error" });
  }
};
