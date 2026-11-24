(() => {
  const productionHosts = new Set([
    "robcheat.fun",
    "www.robcheat.fun",
    "robcheat.vercel.app",
    "robcheat-antarrobert-2659.vercel.app",
    "robcheat-git-main-antarrobert-2659.vercel.app"
  ]);
  if (productionHosts.has(location.hostname)) return;

  const run = async () => {
    // The route exists only on the isolated Stage 4 Preview deployment.
    const configResponse = await fetch("/api/streamer-config", { cache: "no-store" });
    if (!configResponse.ok) return;
    const ref = new URLSearchParams(location.search).get("ref");
    if (!ref) return;

    let visitorId = localStorage.getItem("robcheat_referral_visitor");
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem("robcheat_referral_visitor", visitorId);
    }
    const response = await fetch("/api/referral-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        promo_code: ref,
        visitor_id: visitorId,
        source: document.referrer ? "referral_link" : "direct",
        page_path: location.pathname
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.referral_token) return;

    localStorage.setItem("robcheat_referral_token", data.referral_token);
    localStorage.setItem("robcheat_referral_code", data.streamer.promo_code);
    localStorage.setItem("robcheat_referral_expires_at", data.expires_at);
    localStorage.setItem("robcheat_referral_visitor", data.visitor_id);
    window.dispatchEvent(new CustomEvent("robcheat:referral-captured", { detail: data.streamer }));
  };
  run().catch(() => {});
})();
