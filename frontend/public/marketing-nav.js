(() => {
  // Public marketing pages (plans/features/about/security):
  // full-width navbar at top, morph to centered pill on scroll.
  const page = document.querySelector(".mk-page");
  const isHome = Boolean(document.querySelector(".mk-home-page"));
  if (!page || isHome) return;

  const nav = document.querySelector(".navbar");
  if (!nav) return;

  const travel = 260; // px of scroll to fully "condense"

  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const lerp = (a, b, t) => a + (b - a) * t;

  function update() {
    const y = Math.max(0, window.scrollY || 0);
    const t = clamp01(y / travel);
    page.style.setProperty("--home-nav-t", String(t));

    const viewport = document.documentElement.clientWidth || window.innerWidth || 0;
    const fullW = Math.max(320, viewport);
    const pillW = Math.max(320, Math.min(1120, viewport - 56));

    const w = Math.round(lerp(fullW, pillW, t));
    const mt = Math.round(lerp(0, 12, t));
    const radius = Math.round(lerp(0, 999, t));
    const height = Math.round(lerp(74, 62, t));
    const padX = Math.round(lerp(32, 20, t));

    page.style.setProperty("--home-nav-w", `${w}px`);
    page.style.setProperty("--home-nav-mt", `${mt}px`);
    page.style.setProperty("--home-nav-r", `${radius}px`);
    page.style.setProperty("--home-nav-h", `${height}px`);
    page.style.setProperty("--home-nav-px", `${padX}px`);
  }

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
})();
