const form = document.getElementById("registerForm");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submitBtn");
const successModalSubtextEl = document.querySelector("#successModal .modal-subtext");

function isValidHandle(handle) {
  const value = String(handle || "").trim().toLowerCase();
  if (value.length < 3 || value.length > 32) return false;
  return /^[a-z0-9._-]+$/.test(value);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Clear previous errors
  clearError(errorEl);

  const nameInput = document.getElementById("name");
  const companyInput = document.getElementById("company");
  const industryInput = document.getElementById("industry");
  const websiteInput = document.getElementById("website");
  const companySizeInput = document.getElementById("companySize");
  const handleInput = document.getElementById("handle");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  const name = nameInput.value.trim();
  const company = companyInput.value.trim();
  const industry = (industryInput?.value || "").trim();
  const website = (websiteInput?.value || "").trim();
  const company_size = (companySizeInput?.value || "").trim();
  const handle = (handleInput?.value || "").trim().toLowerCase();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  // Frontend validation
  
  // Name validation
  if (!name) {
    showError(errorEl, "Name is required");
    nameInput.focus();
    return;
  }

  // Company validation
  if (!company) {
    showError(errorEl, "Company name is required");
    companyInput.focus();
    return;
  }

  if (!handle) {
    showError(errorEl, "NO-Q email handle is required");
    handleInput?.focus();
    return;
  }

  if (!isValidHandle(handle)) {
    showError(errorEl, "Handle must be 3-32 chars: letters, numbers, dot, underscore, hyphen");
    handleInput?.focus();
    return;
  }

  // Password validation
  if (!password) {
    showError(errorEl, "Password is required");
    passwordInput.focus();
    return;
  }

  if (!isValidPassword(password)) {
    showError(errorEl, "Password must be at least 8 characters with 1 letter and 1 number");
    passwordInput.focus();
    return;
  }

  // Confirm password validation
  if (!confirmPassword) {
    showError(errorEl, "Please confirm your password");
    confirmPasswordInput.focus();
    return;
  }

  if (!passwordsMatch(password, confirmPassword)) {
    showError(errorEl, "Passwords do not match");
    confirmPasswordInput.focus();
    return;
  }

  // Button loading state
  const originalBtnText = submitBtn.textContent;
  submitBtn.textContent = "Continuing...";
  submitBtn.disabled = true;

  try {
    // Build payload - onboarding creates a supervisor identity under @noq.com
    const payload = {
      name: name,
      password: password,
      role: "client",
      company_name: company,
      industry,
      website,
      company_size,
      handle,
    };

    const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.register}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    const data = await res.json();

    if (!res.ok) {
      showError(errorEl, data.error || "Onboarding failed");
      submitBtn.textContent = originalBtnText;
      submitBtn.disabled = false;
      return;
    }

    // Save onboarding token for pricing/checkout step.
    if (data.onboarding_token) {
      sessionStorage.setItem("onboarding_token", data.onboarding_token);
    }

    // Onboarding successful - show success modal
    if (successModalSubtextEl && data.company_slug) {
      successModalSubtextEl.textContent = `Workspace created. Next: choose a plan for "${data.company_slug}".`;
    }
    document.getElementById("successModal").classList.remove("hidden");

  } catch (err) {
    console.error("Registration error:", err);
    
    if (err.name === 'TimeoutError') {
      showError(errorEl, "Request timed out. Please try again.");
    } else if (err.name === 'TypeError' && err.message.includes('fetch')) {
      showError(errorEl, "Unable to connect to server. Please check your connection.");
    } else {
      showError(errorEl, "An unexpected error occurred. Please try again.");
    }
    
    submitBtn.textContent = originalBtnText;
    submitBtn.disabled = false;
  }
});

// Sign in button handler - redirect to login
document
  .getElementById("goToLoginBtn")
  .addEventListener("click", () => {
    const pathBase = window.location.pathname.startsWith("/frontend/") ? "/frontend" : "";
    window.location.href = `${pathBase}/public/pricing.html`;
  });

// Password toggle functionality
const togglePasswordBtns = document.querySelectorAll(".toggle-password");

togglePasswordBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = btn.previousElementSibling;
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    // Keep button text ASCII-safe to avoid encoding issues on Windows.
    btn.textContent = isHidden ? "Hide" : "Show";
    btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  });
});
211
