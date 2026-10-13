import { log } from "./logger.js";
import { getSupabaseClient } from "./api.js";
import {
  getAuthElements,
  openAuthModal,
  closeAuthModal,
  clearAuthMessages,
  showAuthError,
  showAuthSuccess,
  switchAuthTab,
  setAuthLoading,
  handleLogin,
  handleSignup,
  handleSignupOtpSubmit,
  handleSignupOtpCancel,
  handleForgotPasswordLinkClick,
  handleForgotPasswordCancel,
  handleForgotPassword,
  handleForgotPasswordOtpCancel,
  handleForgotPasswordOtpSubmit,
  handleForgotResend,
  handleForgotSentBack,
  handleResetPassword,
  handleResetPasswordCancel
} from "./auth/authModal.js";
import {
  cancelMfaLogin,
  handleMfaLoginSubmit,
  cancelEmailOtpLogin,
  handleEmailOtpLoginSubmit
} from "./auth/mfaLogin.js";
import {
  handleMfaSetupSubmit,
  handleMfaDisableSubmit,
  openMfaSetup,
  openMfaDisable,
  handleEmailOtpSetupSubmit,
  handleEmailOtpDisableSubmit,
  openEmailOtpSetup,
  openEmailOtpDisable
} from "./auth/securitySettings.js";
import {
  getAuthEffects,
  setAuthEffects,
  handleSignOut,
  changeUserRole,
  fetchProfile,
  loadPreferences,
  autoSaveReaderPreferences,
  onAuthStateChange
} from "./auth/session.js";
import {
  accountMenuButton,
  toggleAccountMenu,
  closeAccountMenu,
  updateAuthUI
} from "./auth/accountMenu.js";

export {
  openAuthModal,
  closeAuthModal,
  clearAuthMessages,
  showAuthError,
  showAuthSuccess,
  switchAuthTab,
  setAuthLoading,
  handleLogin,
  handleSignup,
  handleSignupOtpSubmit,
  handleSignupOtpCancel,
  handleForgotPasswordLinkClick,
  handleForgotPasswordCancel,
  handleForgotPassword,
  handleForgotPasswordOtpCancel,
  handleForgotPasswordOtpSubmit,
  handleForgotResend,
  handleForgotSentBack,
  handleResetPassword,
  handleResetPasswordCancel,
  cancelMfaLogin,
  handleMfaLoginSubmit,
  cancelEmailOtpLogin,
  handleEmailOtpLoginSubmit,
  handleMfaSetupSubmit,
  handleMfaDisableSubmit,
  openMfaSetup,
  openMfaDisable,
  handleEmailOtpSetupSubmit,
  handleEmailOtpDisableSubmit,
  openEmailOtpSetup,
  openEmailOtpDisable,
  getAuthEffects,
  setAuthEffects,
  handleSignOut,
  changeUserRole,
  fetchProfile,
  loadPreferences,
  autoSaveReaderPreferences,
  onAuthStateChange,
  accountMenuButton,
  toggleAccountMenu,
  closeAccountMenu,
  updateAuthUI
};

export function initAuthModule(context) {
  setAuthEffects({
    render: context.render,
    notify: context.notify,
    loadAll: context.loadAll,
    hydrateGenres: context.hydrateGenres,
    closeNotificationMenu: context.closeNotificationMenu
  });

  const els = getAuthElements();
  if (els.loginForm) els.loginForm.addEventListener("submit", handleLogin);
  if (els.signupForm) els.signupForm.addEventListener("submit", handleSignup);
  if (els.signupOtpForm) els.signupOtpForm.addEventListener("submit", handleSignupOtpSubmit);
  var signupOtpCancel = document.getElementById("signupOtpCancelBtn");
  if (signupOtpCancel) signupOtpCancel.addEventListener("click", handleSignupOtpCancel);

  if (els.forgotPasswordLink)
    els.forgotPasswordLink.addEventListener("click", handleForgotPasswordLinkClick);
  if (els.forgotPasswordForm)
    els.forgotPasswordForm.addEventListener("submit", handleForgotPassword);
  if (els.forgotPasswordCancelBtn)
    els.forgotPasswordCancelBtn.addEventListener("click", handleForgotPasswordCancel);
  if (els.forgotResendBtn) els.forgotResendBtn.addEventListener("click", handleForgotResend);
  if (els.forgotSentBackBtn) els.forgotSentBackBtn.addEventListener("click", handleForgotSentBack);
  if (els.forgotPasswordOtpForm)
    els.forgotPasswordOtpForm.addEventListener("submit", handleForgotPasswordOtpSubmit);
  if (els.forgotPasswordOtpCancelBtn)
    els.forgotPasswordOtpCancelBtn.addEventListener("click", handleForgotPasswordOtpCancel);
  if (els.resetPasswordForm) els.resetPasswordForm.addEventListener("submit", handleResetPassword);
  if (els.resetPasswordCancelBtn)
    els.resetPasswordCancelBtn.addEventListener("click", handleResetPasswordCancel);

  // Check for recovery deep-link in URL hash
  if (
    window.location.hash.includes("reset-password") ||
    window.location.hash.includes("type=recovery")
  ) {
    openAuthModal();
    switchAuthTab("reset");
  }

  // 2FA login form submission and cancel handlers
  var mfaLoginForm = document.getElementById("mfaLoginForm");
  var mfaLoginCancel = document.getElementById("mfaLoginCancelBtn");
  if (mfaLoginForm) mfaLoginForm.addEventListener("submit", handleMfaLoginSubmit);
  if (mfaLoginCancel) mfaLoginCancel.addEventListener("click", cancelMfaLogin);

  // 2FA Setup Modal cancel handlers
  var setupModal = /** @type {HTMLElement | null} */ (document.getElementById("mfaSetupModal"));
  var setupClose = document.getElementById("mfaSetupClose");
  var setupCancel = document.getElementById("mfaSetupCancelBtn");
  if (setupClose && setupModal)
    setupClose.addEventListener("click", function () {
      setupModal.hidden = true;
    });
  if (setupCancel && setupModal)
    setupCancel.addEventListener("click", function () {
      setupModal.hidden = true;
    });

  var setupForm = /** @type {HTMLFormElement | null} */ (document.getElementById("mfaSetupForm"));
  if (setupForm)
    setupForm.addEventListener("submit", function (event) {
      const effects = /** @type {any} */ (getAuthEffects());
      handleMfaSetupSubmit(event, { notify: effects.notify, render: effects.render });
    });

  // 2FA Disable Modal cancel handlers
  var disableModal = /** @type {HTMLElement | null} */ (document.getElementById("mfaDisableModal"));
  var disableClose = document.getElementById("mfaDisableClose");
  var disableCancel = document.getElementById("mfaDisableCancelBtn");
  if (disableClose && disableModal)
    disableClose.addEventListener("click", function () {
      disableModal.hidden = true;
    });
  if (disableCancel && disableModal)
    disableCancel.addEventListener("click", function () {
      disableModal.hidden = true;
    });

  var disableForm = /** @type {HTMLFormElement | null} */ (
    document.getElementById("mfaDisableForm")
  );
  if (disableForm)
    disableForm.addEventListener("submit", function (event) {
      const effects = /** @type {any} */ (getAuthEffects());
      handleMfaDisableSubmit(event, { notify: effects.notify, render: effects.render });
    });

  // Copy Setup Key button
  var copyBtn = document.getElementById("mfaCopyKeyBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var secretInput = /** @type {HTMLInputElement | null} */ (
        document.getElementById("mfaSecretInput")
      );
      if (secretInput) {
        secretInput.select();
        navigator.clipboard.writeText(secretInput.value).then(function () {
          copyBtn.textContent = "Copied!";
          setTimeout(function () {
            copyBtn.textContent = "Copy";
          }, 2000);
        });
      }
    });
  }

  // Email OTP login form submission and cancel handlers
  var emailOtpLoginForm = document.getElementById("emailOtpLoginForm");
  var emailOtpLoginCancel = document.getElementById("emailOtpLoginCancelBtn");
  if (emailOtpLoginForm) emailOtpLoginForm.addEventListener("submit", handleEmailOtpLoginSubmit);
  if (emailOtpLoginCancel) emailOtpLoginCancel.addEventListener("click", cancelEmailOtpLogin);

  // Email OTP Setup Modal cancel handlers
  var emailOtpSetupModal = /** @type {HTMLElement | null} */ (
    document.getElementById("emailOtpSetupModal")
  );
  var emailOtpSetupClose = document.getElementById("emailOtpSetupClose");
  var emailOtpSetupCancel = document.getElementById("emailOtpSetupCancelBtn");
  if (emailOtpSetupClose && emailOtpSetupModal)
    emailOtpSetupClose.addEventListener("click", function () {
      emailOtpSetupModal.hidden = true;
    });
  if (emailOtpSetupCancel && emailOtpSetupModal)
    emailOtpSetupCancel.addEventListener("click", function () {
      emailOtpSetupModal.hidden = true;
    });

  var emailOtpSetupForm = /** @type {HTMLFormElement | null} */ (
    document.getElementById("emailOtpSetupForm")
  );
  if (emailOtpSetupForm)
    emailOtpSetupForm.addEventListener("submit", function (event) {
      const effects = /** @type {any} */ (getAuthEffects());
      handleEmailOtpSetupSubmit(event, { notify: effects.notify, render: effects.render });
    });

  // Email OTP Disable Modal cancel handlers
  var emailOtpDisableModal = /** @type {HTMLElement | null} */ (
    document.getElementById("emailOtpDisableModal")
  );
  var emailOtpDisableClose = document.getElementById("emailOtpDisableClose");
  var emailOtpDisableCancel = document.getElementById("emailOtpDisableCancelBtn");
  if (emailOtpDisableClose && emailOtpDisableModal)
    emailOtpDisableClose.addEventListener("click", function () {
      emailOtpDisableModal.hidden = true;
    });
  if (emailOtpDisableCancel && emailOtpDisableModal)
    emailOtpDisableCancel.addEventListener("click", function () {
      emailOtpDisableModal.hidden = true;
    });

  var emailOtpDisableForm = /** @type {HTMLFormElement | null} */ (
    document.getElementById("emailOtpDisableForm")
  );
  if (emailOtpDisableForm)
    emailOtpDisableForm.addEventListener("submit", function (event) {
      const effects = /** @type {any} */ (getAuthEffects());
      handleEmailOtpDisableSubmit(event, { notify: effects.notify, render: effects.render });
    });

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.warn("[AUTH] Supabase not initialized - auth disabled");
    updateAuthUI();
    return;
  }

  // Enable sign in button once client is ready
  if (els.signInBtn) {
    els.signInBtn.disabled = false;
  }

  log.debug("[AUTH] Initializing auth listeners...");

  supabaseClient.auth.onAuthStateChange(function (event, session) {
    log.debug("[AUTH] State change event:", event, "Session:", !!session);
    onAuthStateChange(event, session);
  });

  supabaseClient.auth
    .getSession()
    .then(function (result) {
      var session = result && result.data ? result.data.session : null;
      log.debug("[AUTH] Checking existing session on startup - found:", !!session);
      if (session) {
        log.debug(
          "[AUTH] Existing session found, user:",
          session.user ? session.user.email : "unknown"
        );
        onAuthStateChange("INITIAL_SESSION", session);
      } else {
        log.debug("[AUTH] No existing session on startup");
        updateAuthUI();
        window.kathasangam_loaded = true;
      }
    })
    .catch(function (err) {
      console.error("[AUTH] Failed to get session on startup:", err.message);
      updateAuthUI();
      window.kathasangam_loaded = true;
    });
}
