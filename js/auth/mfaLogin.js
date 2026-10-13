import { log } from "../logger.js";
import { getSupabaseClient } from "../api.js";
import {
  getAuthElements,
  setAuthLoading,
  clearAuthMessages,
  showAuthError,
  closeAuthModal
} from "./authModal.js";

// ─── Two-Factor Authentication Login Helpers ───

export function cancelMfaLogin() {
  var mfaForm = /** @type {HTMLElement | null} */ (document.getElementById("mfaLoginForm"));
  const els = getAuthElements();
  if (mfaForm) mfaForm.hidden = true;
  if (els.loginForm) {
    els.loginForm.hidden = false;
    setAuthLoading(els.loginForm, false);
  }
}

export async function handleMfaLoginSubmit(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  var mfaForm = /** @type {HTMLFormElement | null} */ (document.getElementById("mfaLoginForm"));
  if (!mfaForm) return;

  var fd = new FormData(mfaForm);
  var code = String(fd.get("code") || "").trim();
  if (!code || code.length !== 6) {
    showAuthError("Please enter a valid 6-digit code.");
    return;
  }

  setAuthLoading(mfaForm, true);
  clearAuthMessages();

  try {
    const factorId = window.mfaChallengeFactorId;
    if (!factorId) {
      showAuthError("Session expired. Please log in again.");
      cancelMfaLogin();
      return;
    }

    const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({
      factorId
    });
    if (challengeError) {
      showAuthError(challengeError.message);
      setAuthLoading(mfaForm, false);
      return;
    }

    const { error: verifyError } = await supabaseClient.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: code
    });

    if (verifyError) {
      showAuthError(verifyError.message);
      setAuthLoading(mfaForm, false);
      return;
    }

    log.debug("[AUTH] MFA verification successful, session upgraded to aal2");
    mfaForm.hidden = true;
    closeAuthModal();
  } catch (err) {
    console.error("[AUTH] MFA login error:", err);
    showAuthError("Failed to verify code. Please try again.");
    setAuthLoading(mfaForm, false);
  }
}

// ─── Email OTP Authentication Login Helpers ───

export function cancelEmailOtpLogin() {
  var emailForm = /** @type {HTMLElement | null} */ (document.getElementById("emailOtpLoginForm"));
  const els = getAuthElements();
  if (emailForm) emailForm.hidden = true;
  if (els.loginForm) {
    els.loginForm.hidden = false;
    setAuthLoading(els.loginForm, false);
  }
}

export async function handleEmailOtpLoginSubmit(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  var emailForm = /** @type {HTMLFormElement | null} */ (
    document.getElementById("emailOtpLoginForm")
  );
  if (!emailForm) return;

  var fd = new FormData(emailForm);
  var code = String(fd.get("code") || "").trim();
  if (!code || code.length !== 6) {
    showAuthError("Please enter a valid 6-digit code.");
    return;
  }

  setAuthLoading(emailForm, true);
  clearAuthMessages();

  try {
    const email = window.email2faAddress;
    if (!email) {
      showAuthError("Session expired. Please log in again.");
      cancelEmailOtpLogin();
      return;
    }

    const { error } = await supabaseClient.auth.verifyOtp({
      email: email,
      token: code,
      type: "email"
    });

    if (error) {
      showAuthError(error.message);
      setAuthLoading(emailForm, false);
      return;
    }

    log.debug("[AUTH] Email OTP login verification successful");
    emailForm.hidden = true;
    closeAuthModal();
  } catch (err) {
    console.error("[AUTH] Email OTP login error:", err);
    showAuthError("Failed to verify code. Please try again.");
    setAuthLoading(emailForm, false);
  }
}
