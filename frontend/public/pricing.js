(() => {
  const errEl = document.getElementById("pricing-error");

  function setError(text) {
    if (!errEl) return;
    errEl.textContent = text || "";
  }

  const onboardingToken = sessionStorage.getItem("onboarding_token") || "";
  if (!onboardingToken) {
    setError("Missing onboarding session. Please start onboarding again.");
  }

  async function checkout(plan) {
    if (!onboardingToken) {
      setError("Missing onboarding session. Please start onboarding again.");
      return;
    }

    setError("");
    try {
      const res = await fetch("/api/auth/complete-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_token: onboardingToken, plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Checkout failed.");
        return;
      }
      window.location.href = "/public/awaiting-approval.html";
    } catch (e) {
      setError("Unable to reach server. Is the backend running?");
    }
  }

  document.querySelectorAll("button[data-plan]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const plan = btn.getAttribute("data-plan");
      checkout(plan);
    });
  });
})();

