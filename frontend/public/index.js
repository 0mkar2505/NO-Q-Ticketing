(() => {
  // Home navbar scroll animation (home landing page only).
  const page = document.querySelector(".mk-home-page");
  const isHome = Boolean(page);
  const nav = document.querySelector(".navbar");
  if (isHome && nav) {
    const travel = 260; // px of scroll to fully "condense"

    const clamp01 = (n) => Math.max(0, Math.min(1, n));
    const lerp = (a, b, t) => a + (b - a) * t;

    function update() {
      const y = Math.max(0, window.scrollY || 0);
      const t = clamp01(y / travel);
      page.style.setProperty("--home-nav-t", String(t));

      // Compute the pill's pixel geometry so t=0 is truly edge-to-edge,
      // and t=1 is a centered "pill" capped at a reasonable max width.
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

      // Keep a class for pointer-events + any "hard" state changes.
      nav.classList.toggle("navbar--condensed", t > 0.55);
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
  }

  // FAQ accordion (same behavior as security page).
  const faqRoot = document.getElementById("home-faq");
  if (faqRoot) {
    const buttons = Array.from(faqRoot.querySelectorAll(".mk-acc"));
    const panels = Array.from(faqRoot.querySelectorAll(".mk-acc-panel"));

    function closeAll() {
      buttons.forEach((b) => b.setAttribute("aria-expanded", "false"));
      panels.forEach((p) => p.classList.remove("mk-acc-panel--open"));
    }

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.nextElementSibling;
        if (!panel || !panel.classList.contains("mk-acc-panel")) return;

        const isOpen = panel.classList.contains("mk-acc-panel--open");
        closeAll();
        if (!isOpen) {
          btn.setAttribute("aria-expanded", "true");
          panel.classList.add("mk-acc-panel--open");
        }
      });
    });
  }

  // Feature cascade carousel (landing page only).
  const cascade = document.getElementById("mkFeatureCascade");
  if (cascade) {
    const viewport = cascade.querySelector(".mk-cascade-viewport");
    const track = cascade.querySelector(".mk-cascade-track");
    const cards = Array.from(cascade.querySelectorAll(".mk-cascade-track .mk-card"));
    const prevBtn = cascade.querySelector(".mk-cascade-btn--prev");
    const nextBtn = cascade.querySelector(".mk-cascade-btn--next");

    if (viewport && track && cards.length) {
      let activeIndex = 0;

      function updateButtons() {
        if (prevBtn) prevBtn.disabled = activeIndex <= 0;
        if (nextBtn) nextBtn.disabled = activeIndex >= cards.length - 1;
      }

      function applyTransform(animate = true) {
        const w = viewport.clientWidth || 0;
        track.style.transition = animate ? "transform 520ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
        track.style.transform = `translateX(${-activeIndex * w}px)`;
      }

      function setActive(index, { animate = true } = {}) {
        activeIndex = Math.max(0, Math.min(cards.length - 1, index));
        cards.forEach((c, i) => c.classList.toggle("is-active", i === activeIndex));
        applyTransform(animate);
        updateButtons();
      }

      function prev() { setActive(activeIndex - 1); }
      function next() { setActive(activeIndex + 1); }

      prevBtn?.addEventListener("click", (e) => { e.preventDefault(); prev(); });
      nextBtn?.addEventListener("click", (e) => { e.preventDefault(); next(); });

      // Keyboard control when focused.
      // Keep movement explicit via the arrow buttons (avoid accidental navigation).

      // Initial state: show the first card centered.
      requestAnimationFrame(() => setActive(0, { animate: false }));
      window.addEventListener("resize", () => applyTransform(false), { passive: true });
    }
  }

  // "How it works" scroll highlight + sticky status text.
  const steps = Array.from(document.querySelectorAll(".mk-step[data-step]"));
  const statusEl = document.getElementById("mkFlowStatus");
  if (!steps.length || !statusEl || typeof IntersectionObserver === "undefined") return;

  const stepStatus = {
    1: "Step 1: collecting details",
    2: "Step 2: structuring the ticket",
    3: "Step 3: agent response loop",
  };

  function setActive(stepNum) {
    steps.forEach((el) => el.classList.toggle("is-active", el.dataset.step === String(stepNum)));
    statusEl.textContent = stepStatus[stepNum] || "";
  }

  const io = new IntersectionObserver(
    (entries) => {
      // Pick the most visible step.
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0))[0];
      if (!visible || !visible.target) return;
      const n = Number(visible.target.getAttribute("data-step"));
      if (Number.isFinite(n)) setActive(n);
    },
    { root: null, threshold: [0.25, 0.45, 0.65] }
  );

  steps.forEach((s) => io.observe(s));
})();
