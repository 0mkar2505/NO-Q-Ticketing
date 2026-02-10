const form = document.getElementById("loginForm");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Clear previous errors
  clearError(errorEl);

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const email = emailInput.value;
  const password = passwordInput.value;

  // Frontend validation
  if (!email.trim()) {
    showError(errorEl, "Email is required");
    emailInput.focus();
    return;
  }

  if (!isValidEmail(email)) {
    showError(errorEl, "Invalid email format");
    emailInput.focus();
    return;
  }

  if (!password) {
    showError(errorEl, "Password is required");
    passwordInput.focus();
    return;
  }

  // Button loading state
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = "Signing in...";
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.login}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    const data = await res.json();

    if (!res.ok) {
      showError(errorEl, data.error || "Invalid email or password");
      submitBtn.textContent = originalBtnText;
      submitBtn.disabled = false;
      return;
    }

    // Save JWT
    localStorage.setItem("token", data.token);

    // Decode payload
    const payload = JSON.parse(atob(data.token.split(".")[1]));

    // Redirect by role
    if (payload.role === "admin") {
      window.location.href = "../app/admin/dashboard.html";
    } else {
      window.location.href = "../app/client/dashboard.html";
    }

  } catch (err) {
    console.error("Login error:", err);
    
    if (err.name === 'TimeoutError') {
      showError(errorEl, "Request timed out. Please try again.");
    } else if (err.name === 'TypeError' && err.message.includes('fetch')) {
      showError(errorEl, "Unable to connect to server. Is the backend running on port 5000?");
    } else {
      showError(errorEl, "An unexpected error occurred. Please try again.");
    }
    
    submitBtn.textContent = originalBtnText;
    submitBtn.disabled = false;
  }
});

// Password toggle functionality
const togglePasswordBtn = document.querySelector(".toggle-password");
const passwordInput = document.querySelector("#password");

if (togglePasswordBtn && passwordInput) {
  togglePasswordBtn.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";

    passwordInput.type = isHidden ? "text" : "password";
    togglePasswordBtn.textContent = isHidden ? "🙈" : "👁";
    togglePasswordBtn.setAttribute(
      "aria-label",
      isHidden ? "Hide password" : "Show password"
    );
  });
}
