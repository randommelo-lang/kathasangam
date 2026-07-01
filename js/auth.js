import { state, ui } from "./state.js";
import { log } from "./logger.js";
import { api, apiPatch, apiPut, adminEmail, moderatorEmails, getSupabaseClient } from "./api.js";
import { el } from "./components.js";
import { stopNotificationPolling } from "./notifications.js";

let ctx = null;

function getAuthElements() {
  return {
    authArea: document.getElementById("authArea"),
    authModal: document.getElementById("authModal"),
    authModalClose: document.getElementById("authModalClose"),
    loginForm: document.getElementById("loginForm"),
    signupForm: document.getElementById("signupForm"),
    authError: document.getElementById("authError"),
    authSuccess: document.getElementById("authSuccess"),
    signInBtn: document.getElementById("signInBtn")
  };
}

export function openAuthModal() {
  const els = getAuthElements();
  if (els.authModal) els.authModal.hidden = false;
  clearAuthMessages();
  switchAuthTab("login");
  document.body.style.overflow = "hidden";
}

export function closeAuthModal() {
  const els = getAuthElements();
  if (els.authModal) els.authModal.hidden = true;
  clearAuthMessages();
  if (els.loginForm) els.loginForm.reset();
  if (els.signupForm) els.signupForm.reset();
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
  var tabs = document.querySelectorAll("[data-auth-tab]");
  tabs.forEach(function (t) {
    t.classList.toggle("active", t.dataset.authTab === tab);
  });
  if (els.loginForm) els.loginForm.hidden = tab !== "login";
  if (els.signupForm) els.signupForm.hidden = tab !== "signup";
  clearAuthMessages();

  var title = document.getElementById("authModalTitle");
  var subtitle = document.querySelector(".auth-modal-subtitle");
  if (tab === "login") {
    if (title) title.textContent = "Welcome back";
    if (subtitle) subtitle.textContent = "Log in to your KathaSangam account";
  } else {
    if (title) title.textContent = "Create account";
    if (subtitle) subtitle.textContent = "Join KathaSangam and start your story";
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
      showAuthError(result.error.message);
      setAuthLoading(els.loginForm, false);
      return;
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
      showAuthSuccess("Account created! Check your email to confirm your account.");
      setAuthLoading(els.signupForm, false);
      els.signupForm.reset();
    } else {
      closeAuthModal();
    }
  } catch (err) {
    showAuthError("Something went wrong. Please try again.");
    setAuthLoading(els.signupForm, false);
  }
}

export async function handleSignOut() {
  const supabaseClient = getSupabaseClient();
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
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
  log.debug("[AUTH] onAuthStateChange event:", event);
  if (session && session.user) {
    log.debug("[AUTH] User logged in:", session.user.email);
    state.user = session.user;
    state.accessToken = session.access_token;
    fetchProfile().then(function () {
      updateAuthUI();
      if (ctx) return ctx.loadAll();
    }).then(function () {
      if (ctx) ctx.hydrateGenres();
      if (ctx) ctx.render();
    }).catch(function (err) {
      console.warn("Failed to refresh authenticated data:", err);
      if (ctx) ctx.render();
    });
  } else {
    log.debug("[AUTH] User logged out");
    state.user = null;
    state.accessToken = null;
    state.profile = null;
    state.role = "reader";
    state.library = [];
    state.reports = [];
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
    }
  }).catch(function (err) {
    console.error("[AUTH] Failed to get session on startup:", err.message);
    updateAuthUI();
  });
}
