module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const authorization = req.headers.authorization, apiKey = req.headers.apikey;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ") || typeof apiKey !== "string" || !apiKey.trim()) return res.status(401).json({ error: "An authenticated session is required." });
  try {
    const parsedBody = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
    if (process.env.VERCEL_ENV === "preview" && parsedBody?.action === "save") return res.status(403).json({ error: "Profit split settings are read-only in preview. Use the production admin panel after this release is approved." });
    const upstream = await fetch("https://rzbvtzeqrcfutfafaamm.supabase.co/functions/v1/finance-split-admin", { method:"POST", headers:{ Authorization:authorization, apikey:apiKey, "Content-Type":"application/json" }, body:JSON.stringify(parsedBody) });
    const responseText = await upstream.text();
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json"); res.setHeader("Cache-Control","no-store, private");
    return res.status(upstream.status).send(responseText);
  } catch (error) { return res.status(502).json({ error:"Unable to reach profit split service.", details:error instanceof Error?error.message:"Unknown upstream error" }); }
};
