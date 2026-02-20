(() => {
  const BACKEND_FALLBACK_ORIGIN = "http://127.0.0.1:5000";

  function shouldFallback(res) {
    // When the frontend is served by a static server (ex: :5400), /api routes might return
    // 404/405/501 even though the backend is running elsewhere (ex: :5000).
    if (window.location.port === "5000") return false;
    return res && (res.status === 404 || res.status === 405 || res.status === 501);
  }

  async function apiFetch(path, options = {}) {
    try {
      const res = await fetch(path, options);
      if (!shouldFallback(res)) return res;
    } catch (error) {
      // Fallback when local frontend is on another port.
    }
    return fetch(`${BACKEND_FALLBACK_ORIGIN}${path}`, options);
  }

  window.NOQ = window.NOQ || {};
  window.NOQ.apiFetch = apiFetch;
  window.NOQ.BACKEND_FALLBACK_ORIGIN = BACKEND_FALLBACK_ORIGIN;
})();

