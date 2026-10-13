import { state } from "../state.js";
import { apiPut, getSupabaseClient } from "../api.js";

// Security settings own their DOM and auth-provider interactions. Callers supply
// only the user-facing effects they need; no application-wide context is retained.
/** @typedef {{ notify: (message: string) => void, render?: () => void }} SecurityEffects */
/** @param {SecurityEffects} effects */
export async function openMfaSetup({ notify }) {
  console.log("[DEBUG 2FA] openMfaSetup called");
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.warn("[DEBUG 2FA] supabaseClient is null in openMfaSetup");
    return;
  }

  var modal = document.getElementById("mfaSetupModal");
  if (!modal) {
    console.warn("[DEBUG 2FA] mfaSetupModal not found in openMfaSetup");
    return;
  }

  var qrContainer = document.getElementById("mfaQrContainer");
  var secretInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("mfaSecretInput")
  );
  var setupCodeInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("mfaSetupCode")
  );
  var feedback = document.getElementById("mfaSetupFeedback");
  var deepLink = /** @type {HTMLAnchorElement | null} */ (document.getElementById("mfaDeepLink"));

  if (feedback) {
    feedback.style.display = "none";
    feedback.textContent = "";
  }
  if (setupCodeInput) setupCodeInput.value = "";

  try {
    const { data, error } = await supabaseClient.auth.mfa.enroll({
      factorType: "totp",
      issuer: "KathaSangam",
      friendlyName: state.user ? state.user.email : "KathaSangam User"
    });

    if (error) {
      notify("Failed to initiate 2FA: " + error.message);
      return;
    }

    window.mfaEnrollFactorId = data.id;

    if (qrContainer) {
      qrContainer.innerHTML = data.totp.qr_code;
      var svg = qrContainer.querySelector("svg");
      if (svg) {
        svg.setAttribute("width", "160");
        svg.setAttribute("height", "160");
      }
    }

    if (secretInput) {
      secretInput.value = data.totp.secret;
    }

    if (deepLink) {
      var email = state.user ? encodeURIComponent(state.user.email) : "user";
      var issuer = encodeURIComponent("KathaSangam");
      var secret = data.totp.secret;
      var link =
        "otpauth://totp/" + issuer + ":" + email + "?secret=" + secret + "&issuer=" + issuer;
      deepLink.href = link;
    }

    modal.hidden = false;
  } catch (err) {
    console.error("MFA Setup error:", err);
    notify("Failed to setup 2FA.");
  }
}

function showMfaSetupFeedback(msg, type) {
  var feedback = document.getElementById("mfaSetupFeedback");
  if (!feedback) return;
  feedback.textContent = msg;
  feedback.className = "form-feedback " + (type || "info");
  feedback.style.display = msg ? "" : "none";
}

/** @param {SubmitEvent} e @param {SecurityEffects} effects */
export async function handleMfaSetupSubmit(
  e,
  /** @type {SecurityEffects} */ effects = { notify: () => {} }
) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  var codeInput = /** @type {HTMLInputElement | null} */ (document.getElementById("mfaSetupCode"));
  var code = codeInput ? codeInput.value.trim() : "";

  if (!code || code.length !== 6) {
    showMfaSetupFeedback("Please enter a valid 6-digit code.", "error");
    return;
  }

  const factorId = window.mfaEnrollFactorId;
  if (!factorId) {
    showMfaSetupFeedback("Session expired. Please restart setup.", "error");
    return;
  }

  showMfaSetupFeedback("Verifying...", "info");

  try {
    const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({
      factorId
    });
    if (challengeError) {
      showMfaSetupFeedback(challengeError.message, "error");
      return;
    }

    const { data: verifyData, error: verifyError } = await supabaseClient.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: code
    });

    if (verifyError) {
      showMfaSetupFeedback(verifyError.message, "error");
      return;
    }

    showMfaSetupFeedback("2FA successfully enabled!", "success");

    supabaseClient.auth.mfa.listFactors().then(function (res) {
      state.mfaFactors = (res.data && res.data.all) || [];
      if (effects.notify) effects.notify("Two-Factor Authentication enabled.");
      if (effects.render) effects.render();
    });

    setTimeout(function () {
      var modal = document.getElementById("mfaSetupModal");
      if (modal) modal.hidden = true;
    }, 1500);
  } catch (err) {
    console.error("MFA Verify error:", err);
    showMfaSetupFeedback("Verification failed. Please try again.", "error");
  }
}

/** @param {SecurityEffects} effects */
export async function openMfaDisable({ notify }) {
  var modal = document.getElementById("mfaDisableModal");
  if (!modal) return;

  var codeInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("mfaDisableCode")
  );
  var feedback = document.getElementById("mfaDisableFeedback");

  if (feedback) {
    feedback.style.display = "none";
    feedback.textContent = "";
  }
  if (codeInput) codeInput.value = "";

  const totpFactor =
    state.mfaFactors &&
    state.mfaFactors.find(function (f) {
      return f.factor_type === "totp" && f.status === "verified";
    });

  if (!totpFactor) {
    notify("2FA is not enabled.");
    return;
  }

  window.mfaDisableFactorId = totpFactor.id;
  modal.hidden = false;
}

function showMfaDisableFeedback(msg, type) {
  var feedback = document.getElementById("mfaDisableFeedback");
  if (!feedback) return;
  feedback.textContent = msg;
  feedback.className = "form-feedback " + (type || "info");
  feedback.style.display = msg ? "" : "none";
}

/** @param {SubmitEvent} e @param {SecurityEffects} effects */
export async function handleMfaDisableSubmit(
  e,
  /** @type {SecurityEffects} */ effects = { notify: () => {} }
) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  var codeInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("mfaDisableCode")
  );
  var code = codeInput ? codeInput.value.trim() : "";

  if (!code || code.length !== 6) {
    showMfaDisableFeedback("Please enter a valid 6-digit code.", "error");
    return;
  }

  const factorId = window.mfaDisableFactorId;
  if (!factorId) {
    showMfaDisableFeedback("Session expired.", "error");
    return;
  }

  showMfaDisableFeedback("Verifying...", "info");

  try {
    const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({
      factorId
    });
    if (challengeError) {
      showMfaDisableFeedback(challengeError.message, "error");
      return;
    }

    const { data: verifyData, error: verifyError } = await supabaseClient.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: code
    });

    if (verifyError) {
      showMfaDisableFeedback(verifyError.message, "error");
      return;
    }

    const { error: unenrollError } = await supabaseClient.auth.mfa.unenroll({ factorId });
    if (unenrollError) {
      showMfaDisableFeedback(unenrollError.message, "error");
      return;
    }

    showMfaDisableFeedback("2FA successfully disabled.", "success");

    supabaseClient.auth.mfa.listFactors().then(function (res) {
      state.mfaFactors = (res.data && res.data.all) || [];
      if (effects.notify) effects.notify("Two-Factor Authentication disabled.");
      if (effects.render) effects.render();
    });

    setTimeout(function () {
      var modal = document.getElementById("mfaDisableModal");
      if (modal) modal.hidden = true;
    }, 1500);
  } catch (err) {
    console.error("MFA Disable error:", err);
    showMfaDisableFeedback("Verification failed. Please try again.", "error");
  }
}

// ─── Email OTP security settings ───

/** @param {SecurityEffects} effects */
export async function openEmailOtpSetup({ notify }) {
  console.log("[DEBUG EMAIL 2FA] openEmailOtpSetup called");
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.warn("[DEBUG EMAIL 2FA] supabaseClient is null in openEmailOtpSetup");
    return;
  }

  if (!state.user || !state.user.email) {
    console.warn(
      "[DEBUG EMAIL 2FA] state.user or state.user.email is missing in openEmailOtpSetup:",
      state.user
    );
    notify("Please log in to configure security settings.");
    return;
  }

  var modal = document.getElementById("emailOtpSetupModal");
  if (!modal) {
    console.warn("[DEBUG EMAIL 2FA] emailOtpSetupModal not found in openEmailOtpSetup");
    return;
  }

  var setupCodeInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("emailOtpSetupCode")
  );
  var feedback = document.getElementById("emailOtpSetupFeedback");

  if (feedback) {
    feedback.style.display = "none";
    feedback.textContent = "";
  }
  if (setupCodeInput) setupCodeInput.value = "";

  notify("Sending verification code to your email...");

  try {
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: state.user.email
    });

    if (error) {
      notify("Failed to send code: " + error.message);
      return;
    }

    modal.hidden = false;
  } catch (err) {
    console.error("Email OTP setup error:", err);
    notify("Failed to initiate Email 2FA.");
  }
}

function showEmailOtpSetupFeedback(msg, type) {
  var feedback = document.getElementById("emailOtpSetupFeedback");
  if (!feedback) return;
  feedback.textContent = msg;
  feedback.className = "form-feedback " + (type || "info");
  feedback.style.display = msg ? "" : "none";
}

/** @param {SubmitEvent} e @param {SecurityEffects} effects */
export async function handleEmailOtpSetupSubmit(
  e,
  /** @type {SecurityEffects} */ effects = { notify: () => {} }
) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  var codeInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("emailOtpSetupCode")
  );
  var code = codeInput ? codeInput.value.trim() : "";

  if (!code || code.length !== 6) {
    showEmailOtpSetupFeedback("Please enter a valid 6-digit code.", "error");
    return;
  }

  showEmailOtpSetupFeedback("Verifying...", "info");

  try {
    const { data, error } = await supabaseClient.auth.verifyOtp({
      email: state.user.email,
      token: code,
      type: "email"
    });

    if (error) {
      showEmailOtpSetupFeedback(error.message, "error");
      return;
    }

    showEmailOtpSetupFeedback("Code verified successfully! Saving preference...", "info");

    var prefs = (state.profile && state.profile.preferences) || {};
    prefs.two_factor_email_enabled = true;

    await apiPut("/profile", { preferences: prefs });

    showEmailOtpSetupFeedback("Email 2FA successfully enabled!", "success");

    if (state.profile) {
      state.profile.preferences = prefs;
    }

    if (effects.notify) effects.notify("Email 2FA enabled.");
    if (effects.render) effects.render();

    setTimeout(function () {
      var modal = document.getElementById("emailOtpSetupModal");
      if (modal) modal.hidden = true;
    }, 1500);
  } catch (err) {
    console.error("Email OTP setup verification error:", err);
    showEmailOtpSetupFeedback("Verification failed. Please try again.", "error");
  }
}

/** @param {SecurityEffects} effects */
export async function openEmailOtpDisable({ notify }) {
  if (!state.user || !state.user.email) {
    notify("Session expired.");
    return;
  }

  var modal = document.getElementById("emailOtpDisableModal");
  if (!modal) return;

  var codeInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("emailOtpDisableCode")
  );
  var feedback = document.getElementById("emailOtpDisableFeedback");

  if (feedback) {
    feedback.style.display = "none";
    feedback.textContent = "";
  }
  if (codeInput) codeInput.value = "";

  notify("Sending verification code to your email...");

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: state.user.email
    });

    if (error) {
      notify("Failed to send code: " + error.message);
      return;
    }

    modal.hidden = false;
  } catch (err) {
    console.error("Email OTP disable error:", err);
    notify("Failed to send code. Please try again.");
  }
}

function showEmailOtpDisableFeedback(msg, type) {
  var feedback = document.getElementById("emailOtpDisableFeedback");
  if (!feedback) return;
  feedback.textContent = msg;
  feedback.className = "form-feedback " + (type || "info");
  feedback.style.display = msg ? "" : "none";
}

/** @param {SubmitEvent} e @param {SecurityEffects} effects */
export async function handleEmailOtpDisableSubmit(
  e,
  /** @type {SecurityEffects} */ effects = { notify: () => {} }
) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  var codeInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById("emailOtpDisableCode")
  );
  var code = codeInput ? codeInput.value.trim() : "";

  if (!code || code.length !== 6) {
    showEmailOtpDisableFeedback("Please enter a valid 6-digit code.", "error");
    return;
  }

  showEmailOtpDisableFeedback("Verifying...", "info");

  try {
    const { error } = await supabaseClient.auth.verifyOtp({
      email: state.user.email,
      token: code,
      type: "email"
    });

    if (error) {
      showEmailOtpDisableFeedback(error.message, "error");
      return;
    }

    showEmailOtpDisableFeedback("Code verified! Disabling Email 2FA...", "info");

    var prefs = (state.profile && state.profile.preferences) || {};
    prefs.two_factor_email_enabled = false;

    await apiPut("/profile", { preferences: prefs });

    showEmailOtpDisableFeedback("Email 2FA successfully disabled.", "success");

    if (state.profile) {
      state.profile.preferences = prefs;
    }

    if (effects.notify) effects.notify("Email 2FA disabled.");
    if (effects.render) effects.render();

    setTimeout(function () {
      var modal = document.getElementById("emailOtpDisableModal");
      if (modal) modal.hidden = true;
    }, 1500);
  } catch (err) {
    console.error("Email OTP Disable error:", err);
    showEmailOtpDisableFeedback("Verification failed. Please try again.", "error");
  }
}
