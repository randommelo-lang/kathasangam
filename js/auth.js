import { state, ui } from "./state.js";
import { log } from "./logger.js";
import { api, apiPatch, apiPut, adminEmail, moderatorEmails, getSupabaseClient, clearTokenCache } from "./api.js";
import { el } from "./components.js";
import { stopNotificationPolling } from "./notifications.js";

let ctx = null;
let signupEmail = "";
let recoveryEmail = "";

function getAuthElements() {
  return {
    authArea: document.getElementById("authArea"),
    authModal: document.getElementById("authModal"),
    authModalClose: document.getElementById("authModalClose"),
    loginForm: document.getElementById("loginForm"),
    signupForm: document.getElementById("signupForm"),
    signupOtpForm: document.getElementById("signupOtpForm"),
    authError: document.getElementById("authError"),
    authSuccess: document.getElementById("authSuccess"),
    signInBtn: document.getElementById("signInBtn"),
    forgotPasswordForm: document.getElementById("forgotPasswordForm"),
    forgotPasswordOtpForm: document.getElementById("forgotPasswordOtpForm"),
    resetPasswordForm: document.getElementById("resetPasswordForm"),
    forgotPasswordLink: document.getElementById("forgotPasswordLink"),
    forgotPasswordCancelBtn: document.getElementById("forgotPasswordCancelBtn"),
    forgotPasswordOtpCancelBtn: document.getElementById("forgotPasswordOtpCancelBtn"),
    resetPasswordCancelBtn: document.getElementById("resetPasswordCancelBtn")
  };
}

export function openAuthModal() {
  const els = getAuthElements();
  if (els.authModal) els.authModal.hidden = false;
  clearAuthMessages();
  if (els.loginForm) setAuthLoading(els.loginForm, false);
  if (els.signupForm) setAuthLoading(els.signupForm, false);
  switchAuthTab("login");
  document.body.style.overflow = "hidden";
}

export function closeAuthModal() {
  const els = getAuthElements();
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
  if (els.forgotPasswordOtpForm) {
    els.forgotPasswordOtpForm.reset();
    els.forgotPasswordOtpForm.hidden = true;
  }
  if (els.resetPasswordForm) {
    els.resetPasswordForm.reset();
    els.resetPasswordForm.hidden = true;
  }
  document.body.style.overflow = "";
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
  var tabsContainer = document.querySelector(".auth-tabs");
  if (tabsContainer) {
    tabsContainer.style.display = (tab === "login" || tab === "signup") ? "flex" : "none";
  }

  var tabs = document.querySelectorAll("[data-auth-tab]");
  tabs.forEach(function (t) {
    t.classList.toggle("active", t.dataset.authTab === tab);
  });
  if (els.loginForm) els.loginForm.hidden = tab !== "login";
  if (els.signupForm) els.signupForm.hidden = tab !== "signup";
  if (els.signupOtpForm) els.signupOtpForm.hidden = tab !== "signup-otp";
  if (els.forgotPasswordForm) els.forgotPasswordForm.hidden = tab !== "forgot";
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
  var btn = formEl.querySelector(".auth-submit-btn");
  if (!btn) return;
  if (loading) {
    btn.classList.add("loading");
    btn.disabled = true;
  } else {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
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
  var fd = new FormData(els.loginForm);
  var email = fd.get("email").trim();
  var password = fd.get("password");

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
        var codeInput = mfaForm.querySelector("input[name='code']");
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
      state.accessToken = result.data.session.access_token;
      var profile = null;
      try {
        profile = await api("/profile");
      } catch (profileErr) {
        console.warn("[AUTH] Failed to fetch profile to check Email 2FA preference:", profileErr);
      }

      var emailOtpEnabled = (profile && profile.preferences && profile.preferences.two_factor_email_enabled) || false;
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
          var codeInput = emailOtpForm.querySelector("input[name='code']");
          if (codeInput) {
            codeInput.value = "";
            codeInput.focus();
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
  var fd = new FormData(els.signupForm);
  var email = fd.get("email").trim();
  var password = fd.get("password");
  var confirmPassword = fd.get("confirmPassword");

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
        var setupCodeInput = els.signupOtpForm.querySelector('input[name="code"]');
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
  var code = fd.get("code").trim();

  if (!code) {
    showAuthError("Please enter the verification code.");
    return;
  }

  setAuthLoading(els.signupOtpForm, true);

  try {
    const { data, error } = await supabaseClient.auth.verifyOtp({
      email: signupEmail,
      token: code,
      type: 'signup'
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
  var fd = new FormData(els.forgotPasswordForm);
  var email = fd.get("email").trim();

  if (!email) {
    showAuthError("Please fill in email field.");
    return;
  }

  setAuthLoading(els.forgotPasswordForm, true);
  log.debug("[AUTH] Requesting password reset for:", email);

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/'
    });

    if (error) {
      console.error("[AUTH] Password reset request failed:", error.message);
      showAuthError(error.message);
      setAuthLoading(els.forgotPasswordForm, false);
      return;
    }

    recoveryEmail = email;
    els.forgotPasswordForm.reset();
    switchAuthTab("forgot-otp");
    showAuthSuccess("A 6-digit recovery code has been sent to your email!");
  } catch (err) {
    console.error("[AUTH] Unexpected error requesting password reset:", err);
    showAuthError(err.message || "An unexpected error occurred.");
  } finally {
    setAuthLoading(els.forgotPasswordForm, false);
  }
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
  var fd = new FormData(els.forgotPasswordOtpForm);
  var code = fd.get("code").trim();

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
  var fd = new FormData(els.resetPasswordForm);
  var password = fd.get("password");
  var confirmPassword = fd.get("confirmPassword");

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
    setTimeout(function() {
      closeAuthModal();
    }, 2000);
  } catch (err) {
    console.error("[AUTH] Unexpected error updating password:", err);
    showAuthError(err.message || "An unexpected error occurred.");
  } finally {
    setAuthLoading(els.resetPasswordForm, false);
  }
}

export async function handleSignOut() {
  const supabaseClient = getSupabaseClient();
  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch (err) {
      console.warn("Supabase signOut error (ignoring):", err);
    }
  }
  onAuthStateChange("SIGNED_OUT", null);
}

export async function changeUserRole(newRole) {
  if (!state.accessToken) return;
  try {
    await apiPatch("/profile/role", { role: newRole });
    state.role = newRole;
    if (state.profile) {
      state.profile.role = newRole;
    }
    updateAuthUI();
    if (ctx) ctx.render();
  } catch (e) {
    console.error("Failed to switch role:", e);
    if (e.message === "403") {
      if (ctx) ctx.notify("Permission denied: you are not authorized to switch to this role.");
    } else {
      if (ctx) ctx.notify("Failed to switch role: " + e.message);
    }
    fetchProfile().then(function() {
      updateAuthUI();
      if (ctx) ctx.render();
    });
  }
}

export async function fetchProfile() {
  try {
    log.debug("[PROFILE] Fetching profile...");
    var profile = await api("/profile");

    log.debug("[PROFILE] Profile loaded successfully:", profile);
    state.profile = profile;

    state.role = profile.role || "reader";
    loadPreferences();
  } catch (e) {
    console.error("[PROFILE] Failed to load profile:", e.message);
    state.profile = null;
    state.role = "reader";
    loadPreferences();
    if (e.status === 404 || e.status === 401) {
      log.debug("[PROFILE] Session user profile not found or unauthorized (404/401). Forcing sign out.");
      handleSignOut();
    }
  }
}

export function loadPreferences() {
  if (state.user && state.profile && state.profile.preferences) {
    var p = state.profile.preferences;
    ui.readerTheme = p.reader_theme || "light";
    ui.readerSize = p.reader_size || 19;
    ui.readerMode = p.reader_mode || "scroll";
    ui.readerFont = p.reader_font || "sans";
    ui.readerLineHeight = p.reader_line_height || "1.6";
    ui.readerWidth = p.reader_width || "800px";
  } else {
    try {
      var localPref = JSON.parse(localStorage.getItem("kathasangam_anon_preferences") || "{}");
      ui.readerTheme = localPref.reader_theme || "light";
      ui.readerSize = localPref.reader_size || 19;
      ui.readerMode = localPref.reader_mode || "scroll";
      ui.readerFont = localPref.reader_font || "sans";
      ui.readerLineHeight = localPref.reader_line_height || "1.6";
      ui.readerWidth = localPref.reader_width || "800px";
    } catch (e) {
      console.warn("Failed to load local preferences:", e);
    }
  }
}

var autoSavePrefTimer = null;
export function autoSaveReaderPreferences() {
  clearTimeout(autoSavePrefTimer);
  autoSavePrefTimer = setTimeout(function () {
    var emailNotif = true;
    var inAppNotif = true;
    if (state.profile && state.profile.preferences) {
      if (state.profile.preferences.email_notifications !== undefined) {
        emailNotif = state.profile.preferences.email_notifications;
      }
      if (state.profile.preferences.in_app_notifications !== undefined) {
        inAppNotif = state.profile.preferences.in_app_notifications;
      }
    }
    var prefs = {
      reader_theme: ui.readerTheme,
      reader_size: ui.readerSize,
      reader_mode: ui.readerMode,
      reader_font: ui.readerFont,
      reader_line_height: ui.readerLineHeight,
      reader_width: ui.readerWidth,
      email_notifications: emailNotif,
      in_app_notifications: inAppNotif
    };
    if (state.user && state.profile) {
      state.profile.preferences = prefs;
      apiPut("/profile", { preferences: prefs })
        .catch(function (err) {
          console.error("Failed to auto-save preferences:", err);
        });
    } else {
      try {
        localStorage.setItem("kathasangam_anon_preferences", JSON.stringify(prefs));
      } catch (e) {
        console.warn("Failed to write anon preferences to localStorage:", e);
      }
    }
  }, 500);
}

export function onAuthStateChange(event, session) {
  clearTokenCache();
  log.debug("[AUTH] onAuthStateChange event:", event);

  if (event === "PASSWORD_RECOVERY") {
    log.debug("[AUTH] Password recovery event detected. Opening reset password form.");
    openAuthModal();
    switchAuthTab("reset");
    return;
  }

  if (session && session.user) {
    if (state.user && state.user.id === session.user.id && state.profile) {
      log.debug("[AUTH] User already logged in, skipping redundant profile refresh");
      state.user = session.user;
      state.accessToken = session.access_token;
      updateAuthUI();
      window.kathasangam_loaded = true;
      return;
    }

    log.debug("[AUTH] User logged in:", session.user.email);
    state.user = session.user;
    state.accessToken = session.access_token;
    window.kathasangam_loaded = false;
    fetchProfile().then(function () {
      updateAuthUI();
      if (ctx) return ctx.loadAll();
    }).then(function () {
      if (ctx) ctx.hydrateGenres();
      if (ctx) ctx.render();
      window.kathasangam_loaded = true;
    }).catch(function (err) {
      console.warn("Failed to refresh authenticated data:", err);
      if (ctx) ctx.render();
      window.kathasangam_loaded = true;
    });
  } else {
    log.debug("[AUTH] User logged out");
    state.user = null;
    state.accessToken = null;
    state.profile = null;
    state.role = "reader";
    state.library = [];
    var repsArray = [];
    repsArray.items = repsArray;
    repsArray.total = 0;
    state.reports = repsArray;
    state.notifications = [];
    stopNotificationPolling();
    state.progress = [];
    state.bookmarks = null;
    state.bookmarkIds = null;
    state.readingLists = null;
    loadPreferences();
    updateAuthUI();
    if (ctx) ctx.render();
  }
}

function accountMenuButton(label, viewName) {
  var btn = document.createElement("button");
  btn.className = "account-menu-item";
  btn.type = "button";
  btn.dataset.action = "accountNav";
  btn.dataset.view = viewName;
  btn.textContent = label;
  return btn;
}

export function toggleAccountMenu() {
  if (ctx && ctx.closeNotificationMenu) {
    ctx.closeNotificationMenu();
  } else {
    var dropdown = document.querySelector(".notification-dropdown");
    if (dropdown) dropdown.hidden = true;
  }
  var menu = document.querySelector(".account-dropdown");
  var trigger = document.querySelector(".account-trigger");
  if (!menu) return;
  menu.hidden = !menu.hidden;
  if (trigger) trigger.setAttribute("aria-expanded", String(!menu.hidden));
}

export function closeAccountMenu() {
  var menu = document.querySelector(".account-dropdown");
  var trigger = document.querySelector(".account-trigger");
  if (menu) menu.hidden = true;
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}

export function updateAuthUI() {
  const els = getAuthElements();
  if (!els.authArea) return;
  if (state.user && state.profile) {
    var username = state.profile.username || state.user.email.split("@")[0];
    var role = (state.profile.role || "reader").toLowerCase();
    var avatarUrl = state.profile.avatar_url || "";
    var initial = username.charAt(0).toUpperCase();
    var email = state.user.email || "";

    els.authArea.innerHTML = "";

    var menu = document.createElement("div");
    menu.className = "account-menu";

    var trigger = document.createElement("button");
    trigger.className = "account-trigger";
    trigger.type = "button";
    trigger.dataset.action = "accountToggle";
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");

    var triggerAvatar = document.createElement("span");
    triggerAvatar.className = "auth-avatar";
    if (avatarUrl) {
      triggerAvatar.style.backgroundImage = "url('" + avatarUrl + "')";
      triggerAvatar.style.backgroundSize = "cover";
      triggerAvatar.style.backgroundPosition = "center";
      triggerAvatar.textContent = "";
    } else {
      triggerAvatar.textContent = initial;
    }

    var triggerName = document.createElement("span");
    triggerName.className = "auth-username";
    triggerName.textContent = username;

    var triggerChevron = document.createElement("span");
    triggerChevron.className = "account-chevron";
    triggerChevron.textContent = "▼";

    trigger.appendChild(triggerAvatar);
    trigger.appendChild(triggerName);
    trigger.appendChild(triggerChevron);

    var dropdown = document.createElement("div");
    dropdown.className = "account-dropdown";
    dropdown.hidden = true;

    var header = document.createElement("div");
    header.className = "account-dropdown-header";

    var headerAvatar = document.createElement("div");
    headerAvatar.className = "profile-avatar-sm";
    if (avatarUrl) {
      headerAvatar.style.backgroundImage = "url('" + avatarUrl + "')";
      headerAvatar.style.backgroundSize = "cover";
      headerAvatar.style.backgroundPosition = "center";
    } else {
      headerAvatar.textContent = initial;
    }

    var headerInfo = document.createElement("div");
    headerInfo.className = "account-dropdown-info";
    headerInfo.appendChild(el("strong", null, username));
    headerInfo.appendChild(el("span", null, email));

    header.appendChild(headerAvatar);
    header.appendChild(headerInfo);
    dropdown.appendChild(header);

    var badgeRow = el("div", "account-role-row");
    var badgeLabel = el("span", "account-role-label", "Role:");
    var badge = document.createElement("select");
    badge.className = "auth-role-badge-select";
    badge.dataset.role = role.toLowerCase();
    badge.title = "Click to change your role (Developer Switcher)";

    var userEmail = email.toLowerCase();
    var allRoles = ["reader", "author", "moderator", "admin"];
    var roles = allRoles.filter(function (r) {
      if (r === "reader" || r === "author") return true;
      if (r === "admin") {
        return userEmail === adminEmail.toLowerCase() || role === "admin";
      }
      if (r === "moderator") {
        return moderatorEmails.includes(userEmail) || userEmail === adminEmail.toLowerCase() || role === "moderator";
      }
      return false;
    });

    roles.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      opt.selected = (r === role);
      badge.appendChild(opt);
    });

    badge.addEventListener("change", function (e) {
      changeUserRole(e.target.value);
    });

    badgeRow.appendChild(badgeLabel);
    badgeRow.appendChild(badge);
    dropdown.appendChild(badgeRow);

    var divider = document.createElement("div");
    divider.className = "account-dropdown-divider";
    dropdown.appendChild(divider);

    dropdown.appendChild(accountMenuButton("Profile", "profile"));
    dropdown.appendChild(accountMenuButton("Settings", "settings"));
    dropdown.appendChild(accountMenuButton("Library", "library"));
    dropdown.appendChild(accountMenuButton("Author Studio", "studio"));
    dropdown.appendChild(accountMenuButton("Messages", "messages"));

    var divider2 = document.createElement("div");
    divider2.className = "account-dropdown-divider";
    dropdown.appendChild(divider2);

    var signOutBtn = document.createElement("button");
    signOutBtn.className = "account-menu-item danger";
    signOutBtn.type = "button";
    signOutBtn.dataset.action = "accountSignOut";
    signOutBtn.textContent = "Sign Out";

    dropdown.appendChild(signOutBtn);

    menu.appendChild(trigger);
    menu.appendChild(dropdown);
    els.authArea.appendChild(menu);
  } else if (state.user) {
    var email = state.user.email || "";
    var initial = email.charAt(0).toUpperCase();
    var username = email.split("@")[0];

    els.authArea.innerHTML = "";

    var menu = document.createElement("div");
    menu.className = "account-menu";

    var trigger = document.createElement("button");
    trigger.className = "account-trigger";
    trigger.type = "button";
    trigger.dataset.action = "accountToggle";
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");

    var triggerAvatar = document.createElement("span");
    triggerAvatar.className = "auth-avatar";
    triggerAvatar.textContent = initial;

    var triggerName = document.createElement("span");
    triggerName.className = "auth-username";
    triggerName.textContent = username;

    var triggerChevron = document.createElement("span");
    triggerChevron.className = "account-chevron";
    triggerChevron.textContent = "▼";

    trigger.appendChild(triggerAvatar);
    trigger.appendChild(triggerName);
    trigger.appendChild(triggerChevron);

    var dropdown = document.createElement("div");
    dropdown.className = "account-dropdown";
    dropdown.hidden = true;

    var header = document.createElement("div");
    header.className = "account-dropdown-header";

    var headerAvatar = document.createElement("div");
    headerAvatar.className = "profile-avatar-sm";
    headerAvatar.textContent = initial;

    var headerInfo = document.createElement("div");
    headerInfo.className = "account-dropdown-info";
    headerInfo.appendChild(el("strong", null, username));
    headerInfo.appendChild(el("span", null, email));

    header.appendChild(headerAvatar);
    header.appendChild(headerInfo);
    dropdown.appendChild(header);

    var divider = document.createElement("div");
    divider.className = "account-dropdown-divider";
    dropdown.appendChild(divider);

    dropdown.appendChild(accountMenuButton("Profile", "profile"));
    dropdown.appendChild(accountMenuButton("Settings", "settings"));
    dropdown.appendChild(accountMenuButton("Library", "library"));
    dropdown.appendChild(accountMenuButton("Author Studio", "studio"));

    var divider2 = document.createElement("div");
    divider2.className = "account-dropdown-divider";
    dropdown.appendChild(divider2);

    var signOutBtn = document.createElement("button");
    signOutBtn.className = "account-menu-item danger";
    signOutBtn.type = "button";
    signOutBtn.dataset.action = "accountSignOut";
    signOutBtn.textContent = "Sign Out";

    dropdown.appendChild(signOutBtn);

    menu.appendChild(trigger);
    menu.appendChild(dropdown);
    els.authArea.appendChild(menu);
  } else {
    els.authArea.innerHTML = "";
    var btn = document.createElement("button");
    btn.id = "signInBtn";
    btn.className = "btn primary auth-signin-btn";
    btn.type = "button";
    btn.textContent = "Log In";
    btn.addEventListener("click", openAuthModal);
    els.authArea.appendChild(btn);
  }
}

export function initAuthModule(context) {
  ctx = context;

  const els = getAuthElements();
  if (els.loginForm) els.loginForm.addEventListener("submit", handleLogin);
  if (els.signupForm) els.signupForm.addEventListener("submit", handleSignup);
  if (els.signupOtpForm) els.signupOtpForm.addEventListener("submit", handleSignupOtpSubmit);
  var signupOtpCancel = document.getElementById("signupOtpCancelBtn");
  if (signupOtpCancel) signupOtpCancel.addEventListener("click", handleSignupOtpCancel);

  if (els.forgotPasswordLink) els.forgotPasswordLink.addEventListener("click", handleForgotPasswordLinkClick);
  if (els.forgotPasswordForm) els.forgotPasswordForm.addEventListener("submit", handleForgotPassword);
  if (els.forgotPasswordCancelBtn) els.forgotPasswordCancelBtn.addEventListener("click", handleForgotPasswordCancel);
  if (els.forgotPasswordOtpForm) els.forgotPasswordOtpForm.addEventListener("submit", handleForgotPasswordOtpSubmit);
  if (els.forgotPasswordOtpCancelBtn) els.forgotPasswordOtpCancelBtn.addEventListener("click", handleForgotPasswordOtpCancel);
  if (els.resetPasswordForm) els.resetPasswordForm.addEventListener("submit", handleResetPassword);
  if (els.resetPasswordCancelBtn) els.resetPasswordCancelBtn.addEventListener("click", handleResetPasswordCancel);

  // 2FA login form submission and cancel handlers
  var mfaLoginForm = document.getElementById("mfaLoginForm");
  var mfaLoginCancel = document.getElementById("mfaLoginCancelBtn");
  if (mfaLoginForm) mfaLoginForm.addEventListener("submit", handleMfaLoginSubmit);
  if (mfaLoginCancel) mfaLoginCancel.addEventListener("click", cancelMfaLogin);

  // 2FA Setup Modal cancel handlers
  var setupModal = document.getElementById("mfaSetupModal");
  var setupClose = document.getElementById("mfaSetupClose");
  var setupCancel = document.getElementById("mfaSetupCancelBtn");
  if (setupClose) setupClose.addEventListener("click", function() { setupModal.hidden = true; });
  if (setupCancel) setupCancel.addEventListener("click", function() { setupModal.hidden = true; });

  var setupForm = document.getElementById("mfaSetupForm");
  if (setupForm) setupForm.addEventListener("submit", handleMfaSetupSubmit);

  // 2FA Disable Modal cancel handlers
  var disableModal = document.getElementById("mfaDisableModal");
  var disableClose = document.getElementById("mfaDisableClose");
  var disableCancel = document.getElementById("mfaDisableCancelBtn");
  if (disableClose) disableClose.addEventListener("click", function() { disableModal.hidden = true; });
  if (disableCancel) disableCancel.addEventListener("click", function() { disableModal.hidden = true; });

  var disableForm = document.getElementById("mfaDisableForm");
  if (disableForm) disableForm.addEventListener("submit", handleMfaDisableSubmit);

  // Copy Setup Key button
  var copyBtn = document.getElementById("mfaCopyKeyBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", function() {
      var secretInput = document.getElementById("mfaSecretInput");
      if (secretInput) {
        secretInput.select();
        navigator.clipboard.writeText(secretInput.value).then(function() {
          copyBtn.textContent = "Copied!";
          setTimeout(function() { copyBtn.textContent = "Copy"; }, 2000);
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
  var emailOtpSetupModal = document.getElementById("emailOtpSetupModal");
  var emailOtpSetupClose = document.getElementById("emailOtpSetupClose");
  var emailOtpSetupCancel = document.getElementById("emailOtpSetupCancelBtn");
  if (emailOtpSetupClose) emailOtpSetupClose.addEventListener("click", function() { emailOtpSetupModal.hidden = true; });
  if (emailOtpSetupCancel) emailOtpSetupCancel.addEventListener("click", function() { emailOtpSetupModal.hidden = true; });

  var emailOtpSetupForm = document.getElementById("emailOtpSetupForm");
  if (emailOtpSetupForm) emailOtpSetupForm.addEventListener("submit", handleEmailOtpSetupSubmit);

  // Email OTP Disable Modal cancel handlers
  var emailOtpDisableModal = document.getElementById("emailOtpDisableModal");
  var emailOtpDisableClose = document.getElementById("emailOtpDisableClose");
  var emailOtpDisableCancel = document.getElementById("emailOtpDisableCancelBtn");
  if (emailOtpDisableClose) emailOtpDisableClose.addEventListener("click", function() { emailOtpDisableModal.hidden = true; });
  if (emailOtpDisableCancel) emailOtpDisableCancel.addEventListener("click", function() { emailOtpDisableModal.hidden = true; });

  var emailOtpDisableForm = document.getElementById("emailOtpDisableForm");
  if (emailOtpDisableForm) emailOtpDisableForm.addEventListener("submit", handleEmailOtpDisableSubmit);

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

  supabaseClient.auth.getSession().then(function (result) {
    var session = result && result.data ? result.data.session : null;
    log.debug("[AUTH] Checking existing session on startup - found:", !!session);
    if (session) {
      log.debug("[AUTH] Existing session found, user:", session.user ? session.user.email : "unknown");
      onAuthStateChange("INITIAL_SESSION", session);
    } else {
      log.debug("[AUTH] No existing session on startup");
      updateAuthUI();
      window.kathasangam_loaded = true;
    }
  }).catch(function (err) {
    console.error("[AUTH] Failed to get session on startup:", err.message);
    updateAuthUI();
    window.kathasangam_loaded = true;
  });
}

// ─── Two-Factor Authentication Helpers ───

export function cancelMfaLogin() {
  var mfaForm = document.getElementById("mfaLoginForm");
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

  var mfaForm = document.getElementById("mfaLoginForm");
  if (!mfaForm) return;

  var fd = new FormData(mfaForm);
  var code = fd.get("code").trim();
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

    const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({ factorId });
    if (challengeError) {
      showAuthError(challengeError.message);
      setAuthLoading(mfaForm, false);
      return;
    }

    const { data: verifyData, error: verifyError } = await supabaseClient.auth.mfa.verify({
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

export async function openMfaSetup(ctxInstance) {
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
  var secretInput = document.getElementById("mfaSecretInput");
  var setupCodeInput = document.getElementById("mfaSetupCode");
  var feedback = document.getElementById("mfaSetupFeedback");
  var deepLink = document.getElementById("mfaDeepLink");

  if (feedback) {
    feedback.style.display = "none";
    feedback.textContent = "";
  }
  if (setupCodeInput) setupCodeInput.value = "";

  try {
    const { data, error } = await supabaseClient.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'KathaSangam',
      friendlyName: state.user ? state.user.email : 'KathaSangam User'
    });

    if (error) {
      ctxInstance.notify("Failed to initiate 2FA: " + error.message);
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
      var link = "otpauth://totp/" + issuer + ":" + email + "?secret=" + secret + "&issuer=" + issuer;
      deepLink.href = link;
    }

    modal.hidden = false;
  } catch (err) {
    console.error("MFA Setup error:", err);
    ctxInstance.notify("Failed to setup 2FA.");
  }
}

function showMfaSetupFeedback(msg, type) {
  var feedback = document.getElementById("mfaSetupFeedback");
  if (!feedback) return;
  feedback.textContent = msg;
  feedback.className = "form-feedback " + (type || "info");
  feedback.style.display = msg ? "" : "none";
}

export async function handleMfaSetupSubmit(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  var codeInput = document.getElementById("mfaSetupCode");
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
    const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({ factorId });
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
      if (ctx) {
        ctx.notify("Two-Factor Authentication enabled.");
        ctx.render();
      }
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

export async function openMfaDisable(ctxInstance) {
  var modal = document.getElementById("mfaDisableModal");
  if (!modal) return;

  var codeInput = document.getElementById("mfaDisableCode");
  var feedback = document.getElementById("mfaDisableFeedback");

  if (feedback) {
    feedback.style.display = "none";
    feedback.textContent = "";
  }
  if (codeInput) codeInput.value = "";

  const totpFactor = state.mfaFactors && state.mfaFactors.find(function (f) {
    return f.factor_type === "totp" && f.status === "verified";
  });

  if (!totpFactor) {
    ctxInstance.notify("2FA is not enabled.");
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

export async function handleMfaDisableSubmit(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  var codeInput = document.getElementById("mfaDisableCode");
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
    const { data: challengeData, error: challengeError } = await supabaseClient.auth.mfa.challenge({ factorId });
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
      if (ctx) {
        ctx.notify("Two-Factor Authentication disabled.");
        ctx.render();
      }
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

// ─── Email OTP Authentication Helpers ───

export function cancelEmailOtpLogin() {
  var emailForm = document.getElementById("emailOtpLoginForm");
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

  var emailForm = document.getElementById("emailOtpLoginForm");
  if (!emailForm) return;

  var fd = new FormData(emailForm);
  var code = fd.get("code").trim();
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

    const { data, error } = await supabaseClient.auth.verifyOtp({
      email: email,
      token: code,
      type: 'email'
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

export async function openEmailOtpSetup(ctxInstance) {
  console.log("[DEBUG EMAIL 2FA] openEmailOtpSetup called");
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) {
    console.warn("[DEBUG EMAIL 2FA] supabaseClient is null in openEmailOtpSetup");
    return;
  }

  if (!state.user || !state.user.email) {
    console.warn("[DEBUG EMAIL 2FA] state.user or state.user.email is missing in openEmailOtpSetup:", state.user);
    ctxInstance.notify("Please log in to configure security settings.");
    return;
  }

  var modal = document.getElementById("emailOtpSetupModal");
  if (!modal) {
    console.warn("[DEBUG EMAIL 2FA] emailOtpSetupModal not found in openEmailOtpSetup");
    return;
  }

  var setupCodeInput = document.getElementById("emailOtpSetupCode");
  var feedback = document.getElementById("emailOtpSetupFeedback");

  if (feedback) {
    feedback.style.display = "none";
    feedback.textContent = "";
  }
  if (setupCodeInput) setupCodeInput.value = "";

  ctxInstance.notify("Sending verification code to your email...");

  try {
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: state.user.email
    });

    if (error) {
      ctxInstance.notify("Failed to send code: " + error.message);
      return;
    }

    modal.hidden = false;
  } catch (err) {
    console.error("Email OTP setup error:", err);
    ctxInstance.notify("Failed to initiate Email 2FA.");
  }
}

function showEmailOtpSetupFeedback(msg, type) {
  var feedback = document.getElementById("emailOtpSetupFeedback");
  if (!feedback) return;
  feedback.textContent = msg;
  feedback.className = "form-feedback " + (type || "info");
  feedback.style.display = msg ? "" : "none";
}

export async function handleEmailOtpSetupSubmit(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  var codeInput = document.getElementById("emailOtpSetupCode");
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
      type: 'email'
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

    if (ctx) {
      ctx.notify("Email 2FA enabled.");
      ctx.render();
    }

    setTimeout(function () {
      var modal = document.getElementById("emailOtpSetupModal");
      if (modal) modal.hidden = true;
    }, 1500);

  } catch (err) {
    console.error("Email OTP setup verification error:", err);
    showEmailOtpSetupFeedback("Verification failed. Please try again.", "error");
  }
}

export async function openEmailOtpDisable(ctxInstance) {
  if (!state.user || !state.user.email) {
    ctxInstance.notify("Session expired.");
    return;
  }

  var modal = document.getElementById("emailOtpDisableModal");
  if (!modal) return;

  var codeInput = document.getElementById("emailOtpDisableCode");
  var feedback = document.getElementById("emailOtpDisableFeedback");

  if (feedback) {
    feedback.style.display = "none";
    feedback.textContent = "";
  }
  if (codeInput) codeInput.value = "";

  ctxInstance.notify("Sending verification code to your email...");

  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  try {
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: state.user.email
    });

    if (error) {
      ctxInstance.notify("Failed to send code: " + error.message);
      return;
    }

    modal.hidden = false;
  } catch (err) {
    console.error("Email OTP disable error:", err);
    ctxInstance.notify("Failed to send code. Please try again.");
  }
}

function showEmailOtpDisableFeedback(msg, type) {
  var feedback = document.getElementById("emailOtpDisableFeedback");
  if (!feedback) return;
  feedback.textContent = msg;
  feedback.className = "form-feedback " + (type || "info");
  feedback.style.display = msg ? "" : "none";
}

export async function handleEmailOtpDisableSubmit(e) {
  e.preventDefault();
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;

  var codeInput = document.getElementById("emailOtpDisableCode");
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
      type: 'email'
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

    if (ctx) {
      ctx.notify("Email 2FA disabled.");
      ctx.render();
    }

    setTimeout(function () {
      var modal = document.getElementById("emailOtpDisableModal");
      if (modal) modal.hidden = true;
    }, 1500);

  } catch (err) {
    console.error("Email OTP Disable error:", err);
    showEmailOtpDisableFeedback("Verification failed. Please try again.", "error");
  }
}
