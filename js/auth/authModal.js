import { state } from "../state.js";
import { log } from "../logger.js";
import { api, getSupabaseClient, setTokenCache } from "../api.js";
import { fetchProfile } from "./session.js";

let signupEmail = "";
let recoveryEmail = "";
let previousAuthFocus = null;
let authDialogKeyHandler = null;

export function getAuthElements() {
  return {
    authArea: document.getElementById("authArea"),
    authModal: document.getElementById("authModal"),
    authModalClose: document.getElementById("authModalClose"),
    loginForm: /** @type {HTMLFormElement | null} */ (document.getElementById("loginForm")),
    signupForm: /** @type {HTMLFormElement | null} */ (document.getElementById("signupForm")),
    signupOtpForm: /** @type {HTMLFormElement | null} */ (document.getElementById("signupOtpForm")),
    authError: document.getElementById("authError"),
    authSuccess: document.getElementById("authSuccess"),
    signInBtn: /** @type {HTMLButtonElement | null} */ (document.getElementById("signInBtn")),
    forgotPasswordForm: /** @type {HTMLFormElement | null} */ (
      document.getElementById("forgotPasswordForm")
    ),
    forgotPasswordOtpForm: /** @type {HTMLFormElement | null} */ (
      document.getElementById("forgotPasswordOtpForm")
    ),
    resetPasswordForm: /** @type {HTMLFormElement | null} */ (
      document.getElementById("resetPasswordForm")
    ),
    forgotPasswordSentState: document.getElementById("forgotPasswordSentState"),
    forgotSentEmail: document.getElementById("forgotSentEmail"),
    forgotResendBtn: document.getElementById("forgotResendBtn"),
    forgotSentBackBtn: document.getElementById("forgotSentBackBtn"),
    forgotPasswordLink: document.getElementById("forgotPasswordLink"),
    forgotPasswordCancelBtn: document.getElementById("forgotPasswordCancelBtn"),
    forgotPasswordOtpCancelBtn: document.getElementById("forgotPasswordOtpCancelBtn"),
    resetPasswordCancelBtn: document.getElementById("resetPasswordCancelBtn")
  };
}

export function clearAuthMessages() {
  const els = getAuthElements();
  if (els.authError) {
    els.authError.hidden = true;
    els.authError.textContent = "";
  }
  if (els.authSuccess) {
    els.authSuccess.hidden = true;
    els.authSuccess.textContent = "";
  }
}

export function showAuthError(msg) {
  const els = getAuthElements();
  if (els.authError) {
    els.authError.textContent = msg;
    els.authError.hidden = false;
  }
  if (els.authSuccess) els.authSuccess.hidden = true;
}

export function showAuthSuccess(msg) {
  const els = getAuthElements();
  if (els.authSuccess) {
    els.authSuccess.textContent = msg;
    els.authSuccess.hidden = false;
  }
  if (els.authError) els.authError.hidden = true;
}

export function switchAuthTab(tab) {
  const els = getAuthElements();
  var tabsContainer = /** @type {HTMLElement | null} */ (document.querySelector(".auth-tabs"));
  if (tabsContainer) {
    tabsContainer.style.display = tab === "login" || tab === "signup" ? "flex" : "none";
  }

  var tabs = document.querySelectorAll("[data-auth-tab]");
  tabs.forEach(function (t) {
    var tabEl = /** @type {HTMLElement} */ (t);
    tabEl.classList.toggle("active", tabEl.dataset.authTab === tab);
  });
  if (els.loginForm) els.loginForm.hidden = tab !== "login";
  if (els.signupForm) els.signupForm.hidden = tab !== "signup";
  if (els.signupOtpForm) els.signupOtpForm.hidden = tab !== "signup-otp";
  if (els.forgotPasswordForm) els.forgotPasswordForm.hidden = tab !== "forgot";
  if (els.forgotPasswordSentState) els.forgotPasswordSentState.hidden = true;
  if (els.forgotPasswordOtpForm) els.forgotPasswordOtpForm.hidden = tab !== "forgot-otp";
  if (els.resetPasswordForm) els.resetPasswordForm.hidden = tab !== "reset";

  var mfaLoginForm = document.getElementById("mfaLoginForm");
  if (mfaLoginForm) mfaLoginForm.hidden = true;
  var emailOtpLoginForm = document.getElementById("emailOtpLoginForm");
  if (emailOtpLoginForm) emailOtpLoginForm.hidden = true;
  clearAuthMessages();

  var title = document.getElementById("authModalTitle");
  var subtitle = document.querySelector(".auth-modal-subtitle");
  if (tab === "login") {
    if (title) title.textContent = "Welcome back";
    if (subtitle) subtitle.textContent = "Log in to your KathaSangam account";
  } else if (tab === "signup") {
    if (title) title.textContent = "Create account";
    if (subtitle) subtitle.textContent = "Join KathaSangam and start your story";
  } else if (tab === "forgot") {
    if (title) title.textContent = "Forgot Password";
    if (subtitle) subtitle.textContent = "Recover access to your account";
  } else if (tab === "forgot-otp") {
    if (title) title.textContent = "Verify Recovery Code";
    if (subtitle) subtitle.textContent = "Confirm code to reset your password";
  } else if (tab === "reset") {
    if (title) title.textContent = "Reset Password";
    if (subtitle) subtitle.textContent = "Choose a new password for your account";
  }
}

export function setAuthLoading(formEl, loading) {
  var btn = /** @type {HTMLButtonElement | null} */ (formEl.querySelector(".auth-submit-btn"));
  if (!btn) return;
  if (loading) {
    btn.classList.add("loading");
    btn.disabled = true;
  } else {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

export function openAuthModal() {
  const els = getAuthElements();
  previousAuthFocus = document.activeElement;
  if (els.authModal) els.authModal.hidden = false;
  clearAuthMessages();
  if (els.loginForm) setAuthLoading(els.loginForm, false);
  if (els.signupForm) setAuthLoading(els.signupForm, false);
  switchAuthTab("login");
  document.body.style.overflow = "hidden";
  var dialog = /** @type {HTMLElement | null} */ (
    els.authModal && els.authModal.querySelector('[role="dialog"]')
  );
  if (dialog) {
    authDialogKeyHandler = function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAuthModal();
        return;
      }
      if (event.key !== "Tab") return;
      var focusable = Array.from(
        dialog.querySelectorAll(
          'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter(function (node) {
        var elNode = /** @type {HTMLElement} */ (node);
        return !elNode.hidden && elNode.getClientRects().length;
      });
      if (!focusable.length) return;
      var first = /** @type {HTMLElement} */ (focusable[0]),
        last = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", authDialogKeyHandler);
    var initial = /** @type {HTMLElement | null} */ (
      dialog.querySelector('#loginEmail, input:not([type="hidden"]), button')
    );
    if (initial) initial.focus();
  }
}

export function closeAuthModal() {
  const els = getAuthElements();
  if (authDialogKeyHandler) document.removeEventListener("keydown", authDialogKeyHandler);
  authDialogKeyHandler = null;
  if (els.authModal) els.authModal.hidden = true;
  clearAuthMessages();
  if (els.loginForm) els.loginForm.reset();
  if (els.signupForm) els.signupForm.reset();
  if (els.signupOtpForm) {
    els.signupOtpForm.reset();
    els.signupOtpForm.hidden = true;
  }
  if (els.forgotPasswordForm) {
    els.forgotPasswordForm.reset();
    els.forgotPasswordForm.hidden = true;
  }
  if (els.forgotPasswordSentState) {
    els.forgotPasswordSentState.hidden = true;
  }
  if (els.forgotPasswordOtpForm) {
    els.forgotPasswordOtpForm.reset();
    els.forgotPasswordOtpForm.hidden = true;
  }
  if (els.resetPasswordForm) {
    els.resetPasswordForm.reset();
    els.resetPasswordForm.hidden = true;
  }
  document.body.style.overflow = "";
  if (previousAuthFocus && typeof previousAuthFocus.focus === "function") previousAuthFocus.focus();
  previousAuthFocus = null;
}

export async function handleLogin(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    showAuthError("Supabase not configured. Config could not be loaded.");
    return;
  }
  clearAuthMessages();
  const els = getAuthElements();
  if (!els.loginForm) return;
  var fd = new FormData(els.loginForm);
  var email = String(fd.get("email") || "").trim();
  var password = String(fd.get("password") || "");

  if (!email || !password) {
    showAuthError("Please fill in all fields.");
    return;
  }

  setAuthLoading(els.loginForm, true);
  log.debug("[AUTH] Attempting login for:", email);

  try {
    var result = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (result.error) {
      console.error("[AUTH] Login failed:", result.error.message);
      var msg = result.error.message;
      if (msg === "Email not confirmed") {
        msg = "Please confirm your email address. Check your inbox for the confirmation link.";
      }
      showAuthError(msg);
      setAuthLoading(els.loginForm, false);
      return;
    }

    // Check if the user has enrolled and verified TOTP factors
    var user = result.data.user;
    var factors = (user && user.factors) || [];
    var verifiedTotpFactor = factors.find(function (f) {
      return f.factor_type === "totp" && f.status === "verified";
    });

    if (verifiedTotpFactor) {
      log.debug("[AUTH] MFA TOTP factor detected. Initiating 2FA challenge.");
      window.mfaChallengeFactorId = verifiedTotpFactor.id;

      // Hide standard login/signup forms, show MFA challenge form
      if (els.loginForm) els.loginForm.hidden = true;
      if (els.signupForm) els.signupForm.hidden = true;
      var mfaForm = document.getElementById("mfaLoginForm");
      if (mfaForm) {
        mfaForm.hidden = false;
        var codeInput = /** @type {HTMLInputElement | null} */ (
          mfaForm.querySelector("input[name='code']")
        );
        if (codeInput) {
          codeInput.value = "";
          codeInput.focus();
        }
      }
      setAuthLoading(els.loginForm, false);
      return;
    }

    // Check if user has Email OTP 2FA enabled in their profile preferences
    if (result.data.session) {
      setTokenCache(result.data.session.access_token);
      var profile = null;
      try {
        profile = await fetchProfile();
      } catch (profileErr) {
        console.warn("[AUTH] Failed to fetch profile to check Email 2FA preference:", profileErr);
      }

      var emailOtpEnabled =
        (profile && profile.preferences && profile.preferences.two_factor_email_enabled) || false;
      if (emailOtpEnabled) {
        log.debug("[AUTH] Email OTP 2FA enabled. Initiating Email OTP challenge.");
        window.email2faAddress = email;

        // Sign out from the password session immediately
        await supabaseClient.auth.signOut();

        // Send the 6-digit OTP code to the email address
        const { error: otpError } = await supabaseClient.auth.signInWithOtp({ email: email });
        if (otpError) {
          showAuthError(otpError.message);
          setAuthLoading(els.loginForm, false);
          return;
        }

        // Transition form views
        if (els.loginForm) els.loginForm.hidden = true;
        if (els.signupForm) els.signupForm.hidden = true;
        var emailOtpForm = document.getElementById("emailOtpLoginForm");
        if (emailOtpForm) {
          emailOtpForm.hidden = false;
          var emailCodeInput = /** @type {HTMLInputElement | null} */ (
            emailOtpForm.querySelector("input[name='code']")
          );
          if (emailCodeInput) {
            emailCodeInput.value = "";
            emailCodeInput.focus();
          }
        }
        setAuthLoading(els.loginForm, false);
        return;
      }
    }

    log.debug("[AUTH] Login successful, session received");
    closeAuthModal();
  } catch (err) {
    console.error("[AUTH] Login exception:", err.message);
    showAuthError("Something went wrong. Please try again.");
    setAuthLoading(els.loginForm, false);
  }
}

export async function handleSignup(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    showAuthError("Supabase not configured. Config could not be loaded.");
    return;
  }
  clearAuthMessages();
  const els = getAuthElements();
  if (!els.signupForm) return;
  var fd = new FormData(els.signupForm);
  var email = String(fd.get("email") || "").trim();
  var password = String(fd.get("password") || "");
  var confirmPassword = String(fd.get("confirmPassword") || "");

  if (!email || !password || !confirmPassword) {
    showAuthError("Please fill in all fields.");
    return;
  }

  if (password !== confirmPassword) {
    showAuthError("Passwords do not match.");
    return;
  }

  if (password.length < 6) {
    showAuthError("Password must be at least 6 characters.");
    return;
  }

  setAuthLoading(els.signupForm, true);

  try {
    var result = await supabaseClient.auth.signUp({
      email: email,
      password: password
    });

    if (result.error) {
      showAuthError(result.error.message);
      setAuthLoading(els.signupForm, false);
      return;
    }

    if (result.data.user && !result.data.session) {
      signupEmail = email;
      els.signupForm.hidden = true;
      if (els.signupOtpForm) {
        els.signupOtpForm.hidden = false;
        var setupCodeInput = /** @type {HTMLInputElement | null} */ (
          els.signupOtpForm.querySelector('input[name="code"]')
        );
        if (setupCodeInput) setupCodeInput.value = "";
      }
      setAuthLoading(els.signupForm, false);
      showAuthSuccess("A 6-digit verification code has been sent to your email.");

      var title = document.getElementById("authModalTitle");
      var subtitle = document.querySelector(".auth-modal-subtitle");
      if (title) title.textContent = "Verify Account";
      if (subtitle) subtitle.textContent = "Confirm your email address";
    } else {
      closeAuthModal();
    }
  } catch (err) {
    showAuthError("Something went wrong. Please try again.");
    setAuthLoading(els.signupForm, false);
  }
}

export async function handleSignupOtpSubmit(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  clearAuthMessages();
  const els = getAuthElements();
  if (!els.signupOtpForm) return;

  var fd = new FormData(els.signupOtpForm);
  var code = String(fd.get("code") || "").trim();

  if (!code) {
    showAuthError("Please enter the verification code.");
    return;
  }

  setAuthLoading(els.signupOtpForm, true);

  try {
    const { error } = await supabaseClient.auth.verifyOtp({
      email: signupEmail,
      token: code,
      type: "signup"
    });

    if (error) {
      showAuthError("Verification failed: " + error.message);
      setAuthLoading(els.signupOtpForm, false);
      return;
    }

    showAuthSuccess("Email verified successfully! Logging you in...");
    setTimeout(function () {
      closeAuthModal();
    }, 1500);
  } catch (err) {
    showAuthError("Something went wrong. Please try again.");
    setAuthLoading(els.signupOtpForm, false);
  }
}

export function handleSignupOtpCancel() {
  const els = getAuthElements();
  if (els.signupOtpForm) els.signupOtpForm.hidden = true;
  switchAuthTab("signup");
}

export function handleForgotPasswordLinkClick(e) {
  e.preventDefault();
  switchAuthTab("forgot");
}

export function handleForgotPasswordCancel() {
  switchAuthTab("login");
}

export function handleResetPasswordCancel() {
  closeAuthModal();
}

export async function handleForgotPassword(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    showAuthError("Supabase not configured. Config could not be loaded.");
    return;
  }
  clearAuthMessages();
  const els = getAuthElements();
  if (!els.forgotPasswordForm) return;
  var fd = new FormData(els.forgotPasswordForm);
  var email = String(fd.get("email") || "").trim();

  if (!email) {
    showAuthError("Please fill in email field.");
    return;
  }

  setAuthLoading(els.forgotPasswordForm, true);
  log.debug("[AUTH] Requesting password reset link for:", email);

  try {
    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });

    if (error) {
      console.error("[AUTH] Password reset request failed:", error.message);
      showAuthError(error.message);
      setAuthLoading(els.forgotPasswordForm, false);
      return;
    }

    recoveryEmail = email;
    els.forgotPasswordForm.reset();
    els.forgotPasswordForm.hidden = true;

    if (els.forgotSentEmail) {
      els.forgotSentEmail.textContent = email;
    }
    if (els.forgotPasswordSentState) {
      els.forgotPasswordSentState.hidden = false;
    }

    var title = document.getElementById("authModalTitle");
    var subtitle = document.querySelector(".auth-modal-subtitle");
    if (title) title.textContent = "Check Your Email";
    if (subtitle) subtitle.textContent = "We've sent you a password reset link";
  } catch (err) {
    console.error("[AUTH] Unexpected error requesting password reset:", err);
    showAuthError(err.message || "An unexpected error occurred.");
  } finally {
    setAuthLoading(els.forgotPasswordForm, false);
  }
}

export async function handleForgotResend() {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    showAuthError("Supabase not configured. Config could not be loaded.");
    return;
  }
  if (!recoveryEmail) {
    switchAuthTab("forgot");
    return;
  }
  clearAuthMessages();
  const resendBtn = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("forgotResendBtn")
  );
  if (resendBtn) {
    resendBtn.disabled = true;
    resendBtn.textContent = "Sending...";
  }
  try {
    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(recoveryEmail, {
      redirectTo: redirectUrl
    });

    if (error) {
      console.error("[AUTH] Resend reset link failed:", error.message);
      showAuthError(error.message);
    } else {
      showAuthSuccess("A new password reset link has been sent to your email!");
    }
  } catch (err) {
    console.error("[AUTH] Unexpected error resending reset link:", err);
    showAuthError(err.message || "Failed to resend reset link.");
  } finally {
    if (resendBtn) {
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend Reset Link";
    }
  }
}

export function handleForgotSentBack() {
  switchAuthTab("login");
}

export function handleForgotPasswordOtpCancel() {
  switchAuthTab("forgot");
}

export async function handleForgotPasswordOtpSubmit(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    showAuthError("Supabase not configured. Config could not be loaded.");
    return;
  }
  clearAuthMessages();
  const els = getAuthElements();
  if (!els.forgotPasswordOtpForm) return;
  var fd = new FormData(els.forgotPasswordOtpForm);
  var code = String(fd.get("code") || "").trim();

  if (!code) {
    showAuthError("Please enter the recovery code.");
    return;
  }

  setAuthLoading(els.forgotPasswordOtpForm, true);
  log.debug("[AUTH] Verifying recovery OTP for:", recoveryEmail);

  try {
    const { error } = await supabaseClient.auth.verifyOtp({
      email: recoveryEmail,
      token: code,
      type: "recovery"
    });

    if (error) {
      console.error("[AUTH] Recovery verification failed:", error.message);
      showAuthError(error.message);
      setAuthLoading(els.forgotPasswordOtpForm, false);
      return;
    }

    els.forgotPasswordOtpForm.reset();
    switchAuthTab("reset");
    showAuthSuccess("Code verified successfully! Please enter your new password below.");
  } catch (err) {
    console.error("[AUTH] Unexpected error verifying recovery code:", err);
    showAuthError(err.message || "An unexpected error occurred.");
  } finally {
    setAuthLoading(els.forgotPasswordOtpForm, false);
  }
}

export async function handleResetPassword(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    showAuthError("Supabase not configured. Config could not be loaded.");
    return;
  }
  clearAuthMessages();
  const els = getAuthElements();
  if (!els.resetPasswordForm) return;
  var fd = new FormData(els.resetPasswordForm);
  var password = String(fd.get("password") || "");
  var confirmPassword = String(fd.get("confirmPassword") || "");

  if (!password || !confirmPassword) {
    showAuthError("Please fill in all fields.");
    return;
  }

  if (password !== confirmPassword) {
    showAuthError("Passwords do not match.");
    return;
  }

  setAuthLoading(els.resetPasswordForm, true);
  log.debug("[AUTH] Resetting user password");

  try {
    const { error } = await supabaseClient.auth.updateUser({
      password: password
    });

    if (error) {
      console.error("[AUTH] Password update failed:", error.message);
      showAuthError(error.message);
      setAuthLoading(els.resetPasswordForm, false);
      return;
    }

    showAuthSuccess("Password updated successfully! You can now close this modal.");
    els.resetPasswordForm.reset();
    setTimeout(function () {
      closeAuthModal();
    }, 2000);
  } catch (err) {
    console.error("[AUTH] Unexpected error updating password:", err);
    showAuthError(err.message || "An unexpected error occurred.");
  } finally {
    setAuthLoading(els.resetPasswordForm, false);
  }
}
