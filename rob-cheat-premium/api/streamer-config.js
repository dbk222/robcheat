module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const isPreview = process.env.VERCEL_ENV === "preview";
  const url = isPreview
    ? process.env.STREAMER_STAGING_SUPABASE_URL
    : "https://rzbvtzeqrcfutfafaamm.supabase.co";
  const key = isPreview
    ? process.env.STREAMER_STAGING_SUPABASE_PUBLISHABLE_KEY
    : "sb_publishable_C1Mv75fwRb3bA9gx6JqN7w_2c2CyJvF";
  if (!url || !key) return res.status(503).json({ error: "Streamer environment is not configured." });
  res.setHeader("Cache-Control", "no-store, private");
  return res.status(200).json({ supabaseUrl: url, publishableKey: key });
};
