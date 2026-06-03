/**
 * Smooth page transitions for same-origin links
 */

// Ensure every page that includes this script gets the fade-in animation.
// App pages get the same class from /shared/js/load-shared.js.
try {
  document.body.classList.add("page-transition");
} catch (_) {}

// Use event delegation so links added dynamically still work.
document.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (!link) return;
  if (e.defaultPrevented) return;
  if (link.hasAttribute("download")) return;
  if (link.target && link.target !== "_self") return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const hrefAttr = (link.getAttribute("href") || "").trim();
  if (!hrefAttr || hrefAttr === "#" || hrefAttr.startsWith("#")) return;
  if (link.dataset && link.dataset.noTransition === "true") return;

  let url;
  try {
    url = new URL(link.href, window.location.href);
  } catch (_) {
    return;
  }

  if (url.origin !== window.location.origin) return;
  if (url.href === window.location.href) return;

  e.preventDefault();
  document.body.classList.add("is-leaving");
  document.body.style.opacity = "0";
  document.body.style.transition = "opacity 280ms cubic-bezier(0.22, 1, 0.36, 1)";

  setTimeout(() => {
    window.location.href = url.href;
  }, 280);
});
