(() => {
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
    if (e.target.id === "logoutBtn") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = toAppPath("/auth/login.html");
    }
  });
})();
