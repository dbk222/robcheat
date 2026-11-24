(() => {
  const run = async () => {
    const rawRef = new URLSearchParams(location.search).get("ref");
    if (!rawRef) return;
    const promoCode = rawRef.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,24}$/.test(promoCode)) return;

    // Preserve the referred code immediately. The checkout can use it as a
    // safe discount fallback if the attribution token request is still pending.
    localStorage.setItem("robcheat_referral_code", promoCode);
    localStorage.removeItem("robcheat_referral_token");
    localStorage.removeItem("robcheat_referral_expires_at");

    let visitorId = localStorage.getItem("robcheat_referral_visitor");
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      localStorage.setItem("robcheat_referral_visitor", visitorId);
    }

    const response = await fetch("/api/referral-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        promo_code: promoCode,
        visitor_id: visitorId,
        source: document.referrer ? "referral_link" : "direct",
        page_path: location.pathname
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.referral_token) {
      console.warn("ROB CHEAT referral attribution could not be saved:", data.error || response.status);
      return;
    }

    localStorage.setItem("robcheat_referral_token", data.referral_token);
    localStorage.setItem("robcheat_referral_code", data.streamer.promo_code);
    localStorage.setItem("robcheat_referral_expires_at", data.expires_at);
    localStorage.setItem("robcheat_referral_visitor", data.visitor_id);
    window.dispatchEvent(new CustomEvent("robcheat:referral-captured", { detail: data.streamer }));
  };
  run().catch((error) => console.warn("ROB CHEAT referral tracking error:", error));
})();
