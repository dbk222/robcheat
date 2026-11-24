module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const authorization = req.headers.authorization;
  const isPreview = process.env.VERCEL_ENV === "preview";
  const base = isPreview ? process.env.STREAMER_STAGING_SUPABASE_URL : "https://rzbvtzeqrcfutfafaamm.supabase.co";
  const apiKey = isPreview ? process.env.STREAMER_STAGING_SUPABASE_PUBLISHABLE_KEY : "sb_publishable_C1Mv75fwRb3bA9gx6JqN7w_2c2CyJvF";
  if (!base || !apiKey) return res.status(503).json({ error: "Streamer environment is not configured." });
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ error: "An authenticated streamer session is required." });
  }
  try {
    const upstream = await fetch(base.replace(/\/$/, "") + "/functions/v1/streamer-portal", {
      method: "GET", headers: { Authorization: authorization, apikey: apiKey },
    });
    const responseText = await upstream.text();
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "no-store, private");
    return res.status(upstream.status).send(responseText);
  } catch (error) {
    return res.status(502).json({ error: "Unable to reach streamer portal service.", details: error instanceof Error ? error.message : "Unknown error" });
  }
};
