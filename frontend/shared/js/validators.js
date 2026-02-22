/**
 * Shared validation utilities for auth forms
 */

function _asString(value) {
  return String(value == null ? "" : value);
}

/**
 * Validate email format
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(_asString(email).trim());
}

/**
 * Validate company name
 * Letters + spaces + basic punctuation. No digits.
 * @param {string} companyName
 * @returns {boolean}
 */
function isValidCompanyName(companyName) {
  const v = _asString(companyName).trim();
  if (v.length < 2 || v.length > 80) return false;
  if (/\d/.test(v)) return false;
  // Letters (unicode), spaces, and a small set of punctuation commonly used in legal names.
  return /^[\p{L}\s.'&,-]+$/u.test(v);
}

/**
 * Validate person name
 * @param {string} name
 * @returns {boolean}
 */
function isValidPersonName(name) {
  const v = _asString(name).trim();
  if (v.length < 2 || v.length > 60) return false;
  return /^[\p{L}\s.'-]+$/u.test(v);
}

/**
 * Validate NO-Q email handle (before @noq.com)
 * @param {string} handle
 * @returns {boolean}
 */
function isValidNoqHandle(handle) {
  const v = _asString(handle).trim().toLowerCase();
  if (v.length < 3 || v.length > 32) return false;
  return /^[a-z0-9._-]+$/.test(v);
}

/**
 * Validate password requirements
 * Minimum 8 characters, at least 1 lowercase, 1 uppercase, 1 number, 1 symbol
 * @param {string} password
 * @returns {boolean}
 */
function isValidPassword(password) {
  const v = _asString(password);
  if (v.length < 8 || v.length > 128) return false;
  if (!/[a-z]/.test(v)) return false;
  if (!/[A-Z]/.test(v)) return false;
  if (!/\d/.test(v)) return false;
  if (!/[^A-Za-z0-9]/.test(v)) return false;
  return true;
}

/**
 * Check if password matches confirmation
 * @param {string} password
 * @param {string} confirmPassword
 * @returns {boolean}
 */
function passwordsMatch(password, confirmPassword) {
  return _asString(password) === _asString(confirmPassword);
}

/**
 * Show error message in element
 * @param {HTMLElement} element
 * @param {string} message
 */
function showError(element, message) {
  element.textContent = message;
  element.style.display = 'block';
}

/**
 * Clear error message
 * @param {HTMLElement} element
 */
function clearError(element) {
  element.textContent = '';
  element.style.display = 'none';
}
