/**
 * Smooth page transitions for same-origin links
 */

// Ensure every page that includes this script gets the fade-in animation.
// App pages get the same class from /shared/js/load-shared.js.
try {
  document.body.classList.add("page-transition");
} catch (_) {}

document.querySelectorAll("a").forEach(link => {
  if (link.href && link.origin === location.origin) {
    link.addEventListener("click", e => {
      // Skip if link has nohref="#" or is a download
      if (link.getAttribute("href") === "#" || link.download) return;
      
      e.preventDefault();
      document.body.style.opacity = "0";
      document.body.style.transition = "opacity 260ms cubic-bezier(0.22, 1, 0.36, 1)";
      
      setTimeout(() => {
        window.location = link.href;
      }, 260);
    });
  }
});
