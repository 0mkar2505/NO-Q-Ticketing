const form = document.getElementById("registerForm");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submitBtn");
const successModalSubtextEl = document.querySelector("#successModal .modal-subtext");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Clear previous errors
  clearError(errorEl);

  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const companyInput = document.getElementById("company");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const company = companyInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  // Frontend validation
  
  // Name validation
  if (!name) {
    showError(errorEl, "Name is required");
    nameInput.focus();
    return;
  }

  // Email validation
  if (!email) {
    showError(errorEl, "Email is required");
    emailInput.focus();
    return;
  }

  if (!isValidEmail(email)) {
    showError(errorEl, "Email is invalid");
    emailInput.focus();
    return;
  }

  // Company validation
  if (!company) {
    showError(errorEl, "Company name is required");
    companyInput.focus();
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
  submitBtn.textContent = "Creating account...";
  submitBtn.disabled = true;

  try {
    // Build payload - always client role for public registration
    const payload = {
      name: name,
      email: email,
      password: password,
      role: "client",
      company_name: company
    };

    const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.register}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    const data = await res.json();

    if (!res.ok) {
      showError(errorEl, data.error || "Registration failed");
      submitBtn.textContent = originalBtnText;
      submitBtn.disabled = false;
      return;
    }

    // Registration successful - show success modal
    if (successModalSubtextEl && data.company_slug) {
      successModalSubtextEl.textContent = `Your account is ready. Your tenant slug is "${data.company_slug}". Use it on the support page.`;
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
    window.location.href = "/auth/login.html";
  });

// Password toggle functionality
const togglePasswordBtns = document.querySelectorAll(".toggle-password");

togglePasswordBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = btn.previousElementSibling;
    const isHidden = input.type === "password";

    input.type = isHidden ? "text" : "password";
    btn.textContent = isHidden ? "🙈" : "👁";
    btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  });
});
