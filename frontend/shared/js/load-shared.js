(() => {
  function navigateWithFade(path, duration = 420) {
    document.body.classList.add("is-leaving");
    document.body.style.transition = `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    document.body.style.opacity = "0";
    setTimeout(() => {
      window.location.href = path;
    }, duration);
  }

  // Enable consistent page-enter animation (CSS: body.page-transition).
  document.body.classList.add("page-transition");
  // App pages load a fixed navbar; reserve space so content doesn't slide under it.
  document.body.classList.add("has-fixed-navbar");

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
    // Sidebar collapse (persisted across app pages).
    const SIDEBAR_KEY = "noq_sidebar_collapsed";
    const sidebarRoot = document.getElementById("sidebar");
    const collapseBtn = sidebarRoot ? sidebarRoot.querySelector(".sidebar-collapse-btn") : null;

    function applySidebarState(collapsed) {
      document.body.classList.toggle("sidebar-collapsed", collapsed);
      if (collapseBtn) {
        collapseBtn.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
        collapseBtn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
      }
    }

    // Add tooltips so icon-only mode is still usable.
    document.querySelectorAll(".sidebar-nav a").forEach((a) => {
      const txt = a.querySelector(".sb-txt");
      const label = txt ? String(txt.textContent || "").trim() : "";
      if (label && !a.getAttribute("title")) a.setAttribute("title", label);
    });

    const initialCollapsed = localStorage.getItem(SIDEBAR_KEY) === "1";
    applySidebarState(initialCollapsed);
    if (collapseBtn) {
      collapseBtn.addEventListener("click", () => {
        const next = !document.body.classList.contains("sidebar-collapsed");
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
        applySidebarState(next);
      });
    }

    document.querySelectorAll(".sidebar-nav a").forEach((link) => {
      const resolvedPath = new URL(link.getAttribute("href"), window.location.href).pathname;
      if (resolvedPath === currentPath) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    // Set user label in navbar (prefer name over email).
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const userEmailEl = document.getElementById("userEmail");
    if (userEmailEl) {
      const label = String(user.name || "").trim() || String(user.email || "").trim() || "";
      userEmailEl.textContent = label;
    }

    // Role-based UX: hide navigation links (backend also enforces this).
    const companyRole = String(user.company_role || "").toLowerCase();
    const isAgent = companyRole === "agent";
    const isSupervisor = companyRole === "supervisor";
    if (isAgent && !isAdmin) {
      const supervisorOnlyHrefs = new Set([
        "./analytics.html",
        "./branding.html",
        "./configs.html",
        "./members.html",
      ]);
      document.querySelectorAll(".sidebar-nav a").forEach((a) => {
        const href = (a.getAttribute("href") || "").trim();
        if (supervisorOnlyHrefs.has(href)) {
          a.style.display = "none";
        }
      });
    }

    if (isSupervisor && !isAdmin) {
      // Supervisors manage, agents operate. Manual ticket creation is agent-only.
      const agentOnly = new Set([
        "./create-ticket.html",
      ]);
      document.querySelectorAll(".sidebar-nav a").forEach((a) => {
        const href = (a.getAttribute("href") || "").trim();
        if (agentOnly.has(href)) {
          a.style.display = "none";
        }
      });
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
