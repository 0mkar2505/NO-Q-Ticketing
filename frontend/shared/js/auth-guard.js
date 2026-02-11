(() => {
  // Auth guard - redirect to login if not authenticated
  const token = localStorage.getItem("token");
  const currentPath = window.location.pathname;
  const pathBase = currentPath.startsWith("/frontend/") ? "/frontend" : "";
  const loginPath = `${pathBase}/auth/login.html`;

  if (!token) {
    window.location.href = loginPath;
    return;
  }

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));

    // Enforce role-based access
    if (/\/app\/admin(\/|$)/.test(currentPath) && payload.role !== "admin") {
      window.location.href = loginPath;
      return;
    }

    if (/\/app\/client(\/|$)/.test(currentPath) && payload.role !== "client") {
      window.location.href = loginPath;
      return;
    }

    // Store user info for shared components
    localStorage.setItem("user", JSON.stringify(payload));
  } catch (e) {
    localStorage.removeItem("token");
    window.location.href = loginPath;
  }
})();
