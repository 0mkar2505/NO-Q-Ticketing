(() => {
  const root = document.getElementById("security-accordion");
  if (!root) return;

  const buttons = Array.from(root.querySelectorAll(".mk-acc"));
  const panels = Array.from(root.querySelectorAll(".mk-acc-panel"));

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
})();

