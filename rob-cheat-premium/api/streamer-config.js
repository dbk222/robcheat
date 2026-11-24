module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  // This config is deliberately available only to Preview deployments.
  // Production must continue using the existing ROB CHEAT Supabase project.
  if (process.env.VERCEL_ENV !== "preview") {
    return res.status(404).json({ error: "Preview-only route." });
  }
  const url = process.env.STREAMER_STAGING_SUPABASE_URL;
  const key = process.env.STREAMER_STAGING_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return res.status(503).json({ error: "Streamer staging environment is not configured for this Preview branch." });
  }
  res.setHeader("Cache-Control", "no-store, private");
  return res.status(200).json({ supabaseUrl: url, publishableKey: key });
};
