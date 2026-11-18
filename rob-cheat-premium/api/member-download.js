module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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

  res.setHeader("Cache-Control", "no-store, private, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  try {
    const upstream = await fetch(
      "https://rzbvtzeqrcfutfafaamm.supabase.co/functions/v1/member-download",
      {
        method: "POST",
        headers: {
          "Authorization": authorization,
          "apikey": apiKey,
          "Content-Type": "application/json"
        },
        body: "{}"
      }
    );

    const result = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: result?.error || "Your account is not authorised to download this release.",
        code: result?.code
      });
    }

    if (!result?.signedUrl) {
      return res.status(502).json({ error: "The download service did not return a file." });
    }

    // Keep the short-lived Storage URL server-side; never expose it to the browser.
    const signedUrl = new URL(result.signedUrl);
    if (
      signedUrl.origin !== "https://rzbvtzeqrcfutfafaamm.supabase.co" ||
      !signedUrl.pathname.startsWith("/storage/v1/object/sign/robcheat-releases/")
    ) {
      return res.status(502).json({ error: "The download service returned an unexpected file location." });
    }

    const fileResponse = await fetch(signedUrl.toString(), { cache: "no-store" });
    if (!fileResponse.ok) {
      return res.status(502).json({ error: "The private release file could not be retrieved." });
    }

    const file = Buffer.from(await fileResponse.arrayBuffer());
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="RobCheat.zip"');
    res.setHeader("Content-Length", String(file.length));
    return res.status(200).send(file);
  } catch (error) {
    return res.status(502).json({
      error: "Unable to complete the private download.",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
