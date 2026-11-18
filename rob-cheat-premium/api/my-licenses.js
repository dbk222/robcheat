module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authorization = req.headers.authorization;
  const apiKey = req.headers.apikey;
  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ") ||
    typeof apiKey !== "string" ||
    !apiKey.trim()
  ) {
    return res.status(401).json({ error: "An authenticated session is required." });
  }

  try {
    const upstream = await fetch(
      "https://rzbvtzeqrcfutfafaamm.supabase.co/functions/v1/my-licenses",
      {
        method: "GET",
        headers: {
          "Authorization": authorization,
          "apikey": apiKey
        }
      }
    );

    const responseText = await upstream.text();
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "no-store, private");
    return res.status(upstream.status).send(responseText);
  } catch (error) {
    return res.status(502).json({
      error: "Unable to reach the account service.",
      details: error instanceof Error ? error.message : "Unknown upstream error"
    });
  }
};
