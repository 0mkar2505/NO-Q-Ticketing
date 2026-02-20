(() => {
  function navigateWithFade(path, duration = 180) {
    document.body.style.transition = `opacity ${duration}ms ease`;
    document.body.style.opacity = "0";
    setTimeout(() => {
      window.location.href = path;
    }, duration);
  }

  // Enable consistent page-enter animation (CSS: body.page-transition).
  document.body.classList.add("page-transition");

  async function loadHTML(id, path) {
    const res = await fetch(path);
    const html = await res.text();
    document.getElementById(id).innerHTML = html;
  }

  const currentPath = window.location.pathname;
  const pathBase = currentPath.startsWith("/frontend/") ? "/frontend" : "";
  const isAdmin = /\/app\/admin(\/|$)/.test(currentPath);

  function toAppPath(relativePath) {
    return `${pathBase}${relativePath}`;
  }

  // Load navbar and appropriate sidebar
  loadHTML("navbar", toAppPath("/app/shared/navbar.html"));
  loadHTML("sidebar", isAdmin ? toAppPath("/app/shared/sidebar-admin.html") : toAppPath("/app/shared/sidebar-client.html"));

  // Set active sidebar link after sidebar is loaded
  setTimeout(() => {
    document.querySelectorAll(".sidebar-nav a").forEach((link) => {
      const resolvedPath = new URL(link.getAttribute("href"), window.location.href).pathname;
      if (resolvedPath === currentPath) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    // Set user email in navbar
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const userEmailEl = document.getElementById("userEmail");
    if (userEmailEl && user.email) {
      userEmailEl.textContent = user.email;
    }
  }, 100);

  // Logout handler
  document.addEventListener("click", (e) => {
    const logoutBtn = e.target.closest("#logoutBtn");
    if (logoutBtn) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigateWithFade(toAppPath("/public/index.html"));
    }
  });

  // Smooth transitions for in-app links (sidebar, navbar, etc.).
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;
    if (link.hasAttribute("download")) return;
    if (link.target && link.target !== "_self") return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const href = link.getAttribute("href") || "";
    if (!href || href === "#" || href.startsWith("#")) return;
    if (link.dataset && link.dataset.noTransition === "true") return;

    try {
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      navigateWithFade(url.href);
    } catch (err) {
      // Ignore malformed href.
    }
  });
})();
