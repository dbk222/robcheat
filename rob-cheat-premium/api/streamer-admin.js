module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ error: "An authenticated session is required." });
  }

  const isPreview = process.env.VERCEL_ENV === "preview";
  const base = isPreview
    ? process.env.STREAMER_STAGING_SUPABASE_URL
    : "https://rzbvtzeqrcfutfafaamm.supabase.co";
  const apiKey = isPreview
    ? process.env.STREAMER_STAGING_SUPABASE_PUBLISHABLE_KEY
    : req.headers.apikey;

  if (!base || typeof apiKey !== "string" || !apiKey.trim()) {
    return res.status(503).json({
      error: isPreview
        ? "Streamer staging is not configured for this Preview branch."
        : "The production streamer service is not configured.",
    });
  }

  try {
    const parsedBody = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
    const upstream = await fetch(
      base.replace(/\/$/, "") + "/functions/v1/streamer-admin",
      {
        method: "POST",
        headers: {
          "Authorization": authorization,
          "apikey": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsedBody),
      },
    );
    const responseText = await upstream.text();
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "no-store, private");
    return res.status(upstream.status).send(responseText);
  } catch (error) {
    return res.status(502).json({
      error: "Unable to reach streamer management service.",
      details: error instanceof Error ? error.message : "Unknown upstream error",
    });
  }
};
