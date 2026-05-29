import { state, ui } from "./state.js?v=studio-20260528-profile-v11";
import { api, apiDelete, apiPatch, apiPost, apiPut, adminEmail, loadSupabaseConfig, moderatorEmails, supabaseClient } from "./api.js?v=studio-20260528-profile-v11";
import { getRoute, hydrateGenres as hydrateGenresModule, render as renderModule } from "./router.js?v=studio-20260528-profile-v11";
import { renderEditor as renderEditorModule, saveChapterFromEditor as saveChapterFromEditorModule } from "./editor.js?v=studio-20260528-profile-v11";
import { analyticsMetricBox, button, calculateStars, el, field, form, formatDate, formatNumber, generateChartData, iconButton, input, list, metric, progress, quickActionTile, segmentButton, select, submitButton, svgEl, textarea, unique } from "./components.js?v=studio-20260528-profile-v11";

var view = document.getElementById("view");
var pageTitle = document.getElementById("pageTitle");
var searchInput = document.getElementById("searchInput");
var genreFilter = document.getElementById("genreFilter");
var alerts = document.getElementById("alerts");

// Auth DOM elements
var authArea = document.getElementById("authArea");
var authModal = document.getElementById("authModal");
var authModalClose = document.getElementById("authModalClose");
var loginForm = document.getElementById("loginForm");
var signupForm = document.getElementById("signupForm");
var authError = document.getElementById("authError");
var authSuccess = document.getElementById("authSuccess");
var signInBtn = document.getElementById("signInBtn");

ui.currentView = getRoute();

var ctx = {
  state: state,
  ui: ui,
  view: view,
  pageTitle: pageTitle,
  genreFilter: genreFilter,
  api: api,
  apiPut: apiPut,
  notify: notify,
  render: render,
  renderDiscover: renderDiscover,
  renderLibrary: renderLibrary,
  renderReader: renderReader,
  renderStudio: renderStudio,
  renderModeration: renderModeration,
  renderEditor: renderEditor,
  renderProfileSettings: renderProfileSettings,
  getCurrentStudioStory: getCurrentStudioStory,
  canModerateRole: canModerateRole,
  unique: unique
};

// ── API helpers ──

// ── Auth Functions ──
function openAuthModal() {
  authModal.hidden = false;
  clearAuthMessages();
  switchAuthTab("login");
  document.body.style.overflow = "hidden";
}

function closeAuthModal() {
  authModal.hidden = true;
  clearAuthMessages();
  loginForm.reset();
  signupForm.reset();
  document.body.style.overflow = "";
}

// ── Story Modal Functions ──
function openStoryModal() {
  if (!state.user) {
    openAuthModal();
    notify("Please log in to create a story.");
    return;
  }
  var title = document.getElementById("storyModalTitle");
  if (title) {
    title.textContent = "Create New Story";
  }
  var subtitle = document.querySelector("#storyModal .auth-modal-subtitle");
  if (subtitle) {
    subtitle.textContent = "Start your series on KathaSangam";
  }
  var content = document.getElementById("storyModalContent");
  if (content) {
    content.innerHTML = "";
    content.appendChild(storyForm());
  }
  var storyModal = document.getElementById("storyModal");
  if (storyModal) {
    storyModal.hidden = false;
  }
  document.body.style.overflow = "hidden";
}

function openStorySettingsModal(storyId) {
  var story = state.stories.find(function (s) { return s.id === storyId; });
  if (!story) return;

  var title = document.getElementById("storyModalTitle");
  if (title) {
    title.textContent = "Story Settings";
  }
  var subtitle = document.querySelector("#storyModal .auth-modal-subtitle");
  if (subtitle) {
    subtitle.textContent = "Update your series metadata and preferences";
  }
  var content = document.getElementById("storyModalContent");
  if (content) {
    content.innerHTML = "";
    content.appendChild(storySettingsForm(story));
  }
  var storyModal = document.getElementById("storyModal");
  if (storyModal) {
    storyModal.hidden = false;
  }
  document.body.style.overflow = "hidden";
}

function closeStoryModal() {
  var storyModal = document.getElementById("storyModal");
  if (storyModal) {
    storyModal.hidden = true;
  }
  document.body.style.overflow = "";
}

function clearAuthMessages() {
  authError.hidden = true;
  authError.textContent = "";
  authSuccess.hidden = true;
  authSuccess.textContent = "";
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.hidden = false;
  authSuccess.hidden = true;
}

function showAuthSuccess(msg) {
  authSuccess.textContent = msg;
  authSuccess.hidden = false;
  authError.hidden = true;
}

function switchAuthTab(tab) {
  var tabs = document.querySelectorAll("[data-auth-tab]");
  tabs.forEach(function (t) {
    t.classList.toggle("active", t.dataset.authTab === tab);
  });
  loginForm.hidden = tab !== "login";
  signupForm.hidden = tab !== "signup";
  clearAuthMessages();

  var title = document.getElementById("authModalTitle");
  var subtitle = document.querySelector(".auth-modal-subtitle");
  if (tab === "login") {
    title.textContent = "Welcome back";
    subtitle.textContent = "Log in to your KathaSangam account";
  } else {
    title.textContent = "Create account";
    subtitle.textContent = "Join KathaSangam and start your story";
  }
}

function setAuthLoading(formEl, loading) {
  var btn = formEl.querySelector(".auth-submit-btn");
  if (loading) {
    btn.classList.add("loading");
    btn.disabled = true;
  } else {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  if (!supabaseClient) {
    showAuthError("Supabase not configured. Config could not be loaded.");
    return;
  }
  clearAuthMessages();
  var fd = new FormData(loginForm);
  var email = fd.get("email").trim();
  var password = fd.get("password");

  if (!email || !password) {
    showAuthError("Please fill in all fields.");
    return;
  }

  setAuthLoading(loginForm, true);
  console.log("[AUTH] Attempting login for:", email);

  try {
    var result = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (result.error) {
      console.error("[AUTH] Login failed:", result.error.message);
      showAuthError(result.error.message);
      setAuthLoading(loginForm, false);
      return;
    }

    console.log("[AUTH] Login successful, session received");
    // Auth state change listener will handle the rest
    closeAuthModal();
  } catch (err) {
    console.error("[AUTH] Login exception:", err.message);
    showAuthError("Something went wrong. Please try again.");
    setAuthLoading(loginForm, false);
  }
}

async function handleSignup(e) {
  e.preventDefault();
  if (!supabaseClient) {
    showAuthError("Supabase not configured. Config could not be loaded.");
    return;
  }
  clearAuthMessages();
  var fd = new FormData(signupForm);
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

  setAuthLoading(signupForm, true);

  try {
    var result = await supabaseClient.auth.signUp({
      email: email,
      password: password
    });

    if (result.error) {
      showAuthError(result.error.message);
      setAuthLoading(signupForm, false);
      return;
    }

    // Check if email confirmation is required
    if (result.data.user && !result.data.session) {
      showAuthSuccess("Account created! Check your email to confirm your account.");
      setAuthLoading(signupForm, false);
      signupForm.reset();
    } else {
      // Auto-confirmed, auth state listener handles it
      closeAuthModal();
    }
  } catch (err) {
    showAuthError("Something went wrong. Please try again.");
    setAuthLoading(signupForm, false);
  }
}

async function handleSignOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  // Auth state listener handles cleanup
}

async function changeUserRole(newRole) {
  if (!state.accessToken) return;
  try {
    await apiPatch("/profile/role", { role: newRole });
    state.role = newRole;
    if (state.profile) {
      state.profile.role = newRole;
    }
    updateAuthUI();
    render();
  } catch (e) {
    console.error("Failed to switch role:", e);
    if (e.message === "403") {
      alert("Permission Denied: You are not authorized to switch to this role.");
    } else {
      alert("Failed to switch role: " + e.message);
    }
    // Re-fetch profile to sync back the correct UI state
    fetchProfile().then(function() {
      updateAuthUI();
      render();
    });
  }
}

async function fetchProfile() {

  try {
    console.log("[PROFILE] Fetching profile with token:", state.accessToken ? `${state.accessToken.substring(0, 20)}...` : "none");
    var profile = await api("/profile");

    console.log("[PROFILE] Profile loaded successfully:", profile);
    state.profile = profile;

    state.role = profile.role || "reader";

  } catch (e) {

    console.error("[PROFILE] Failed to load profile:", e.message);
    state.profile = null;

    state.role = "reader";
  }
}

function onAuthStateChange(event, session) {
  console.log("[AUTH] onAuthStateChange event:", event);
  if (session && session.user) {
    console.log("[AUTH] User logged in:", session.user.email, "Token:", session.access_token ? `${session.access_token.substring(0, 20)}...` : "none");
    state.user = session.user;
    state.accessToken = session.access_token;
    fetchProfile().then(function () {
      updateAuthUI();
      return loadAll();
    }).then(function () {
      hydrateGenres();
      render();
    }).catch(function (err) {
      console.warn("Failed to refresh authenticated data:", err);
      render();
    });
  } else {
    console.log("[AUTH] User logged out");
    state.user = null;
    state.accessToken = null;
    state.profile = null;
    state.role = "reader";
    state.library = [];
    state.reports = [];
    state.notifications = [];
    updateAuthUI();
    render();
  }
}

function updateAuthUI() {
  if (state.user && state.profile) {
    var username = state.profile.username || state.user.email.split("@")[0];
    var role = (state.profile.role || "reader").toLowerCase();
    var avatarUrl = state.profile.avatar_url || "";
    var initial = username.charAt(0).toUpperCase();
    var email = state.user.email || "";

    authArea.innerHTML = "";

    // ── Dropdown Container ──
    var menu = document.createElement("div");
    menu.className = "account-menu";

    // ── Trigger Button ──
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

    // ── Dropdown List ──
    var dropdown = document.createElement("div");
    dropdown.className = "account-dropdown";
    dropdown.hidden = true;

    // Header Card inside dropdown
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

    // Role switcher inside dropdown header
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

    // Dropdown Items
    dropdown.appendChild(accountMenuButton("Profile", "profile"));
    dropdown.appendChild(accountMenuButton("Settings", "settings"));
    dropdown.appendChild(accountMenuButton("Library", "library"));
    dropdown.appendChild(accountMenuButton("Author Studio", "studio"));

    var divider2 = document.createElement("div");
    divider2.className = "account-dropdown-divider";
    dropdown.appendChild(divider2);

    // Sign Out Button
    var signOutBtn = document.createElement("button");
    signOutBtn.className = "account-menu-item danger";
    signOutBtn.type = "button";
    signOutBtn.dataset.action = "accountSignOut";
    signOutBtn.textContent = "Sign Out";

    dropdown.appendChild(signOutBtn);

    menu.appendChild(trigger);
    menu.appendChild(dropdown);
    authArea.appendChild(menu);
  } else if (state.user) {
    // User logged in but profile not yet loaded
    var email = state.user.email || "";
    var initial = email.charAt(0).toUpperCase();
    var username = email.split("@")[0];

    authArea.innerHTML = "";

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
    authArea.appendChild(menu);
  } else {
    // Logged out
    authArea.innerHTML = "";
    var btn = document.createElement("button");
    btn.id = "signInBtn";
    btn.className = "btn primary auth-signin-btn";
    btn.type = "button";
    btn.textContent = "Log In";
    btn.addEventListener("click", openAuthModal);
    authArea.appendChild(btn);
  }
}

// ── Account Dropdown Helpers ──
function accountMenuButton(label, viewName) {
  var btn = document.createElement("button");
  btn.className = "account-menu-item";
  btn.type = "button";
  btn.dataset.action = "accountNav";
  btn.dataset.view = viewName;
  btn.textContent = label;
  return btn;
}

function toggleAccountMenu() {
  var menu = document.querySelector(".account-dropdown");
  var trigger = document.querySelector(".account-trigger");
  if (!menu) return;
  menu.hidden = !menu.hidden;
  if (trigger) trigger.setAttribute("aria-expanded", String(!menu.hidden));
}

function closeAccountMenu() {
  var menu = document.querySelector(".account-dropdown");
  var trigger = document.querySelector(".account-trigger");
  if (menu) menu.hidden = true;
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}

// ── Bootstrap ──
async function bootstrap() {
  bindGlobalEvents();
  bindAuthEvents();
  await loadSupabaseConfig();
  initAuth();
  loadAll().then(function () {
    hydrateGenres();
    render();
  }).catch(function (err) {
    console.warn("loadAll failed:", err);
    render();
  });
}

function initAuth() {
  if (!supabaseClient) {
    console.warn("[AUTH] Supabase not initialized - auth disabled");
    updateAuthUI();
    return;
  }

  console.log("[AUTH] Initializing auth listeners...");

  // Listen for auth state changes
  supabaseClient.auth.onAuthStateChange(function (event, session) {
    console.log("[AUTH] State change event:", event, "Session:", !!session);
    onAuthStateChange(event, session);
  });

  // Check for existing session
  supabaseClient.auth.getSession().then(function (result) {
    var session = result && result.data ? result.data.session : null;
    console.log("[AUTH] Checking existing session on startup - found:", !!session);
    if (session) {
      console.log("[AUTH] Existing session found, user:", session.user ? session.user.email : "unknown");
      onAuthStateChange("INITIAL_SESSION", session);
    } else {
      console.log("[AUTH] No existing session on startup");
      updateAuthUI();
    }
  }).catch(function (err) {
    console.error("[AUTH] Failed to get session on startup:", err.message);
    updateAuthUI();
  });
}

function loadAll() {
  var isAuthenticated = !!(state.user || state.accessToken);
  var canLoadReports = isAuthenticated && canModerateRole();
  return Promise.all([
    api("/stories").catch(function () { return []; }),
    isAuthenticated ? api("/library/ids").catch(function () { return []; }) : Promise.resolve([]),
    canLoadReports ? api("/reports").catch(function () { return []; }) : Promise.resolve([]),
    isAuthenticated ? api("/notifications").catch(function () { return []; }) : Promise.resolve([]),
    api("/stats").catch(function () { return { published: 0, views: 0, followers: 0, open_reports: 0 }; })
  ]).then(function (results) {
    state.stories = results[0];
    state.library = results[1];
    state.reports = results[2];
    state.notifications = results[3];
    state.stats = results[4];
    if (state.stories.length && !ui.currentStoryId) ui.currentStoryId = state.stories[0].id;
  });
}

bootstrap();

// ── Events ──
function bindGlobalEvents() {
  window.addEventListener("hashchange", function () { ui.currentView = getRoute(); render(); });
  searchInput.addEventListener("input", function () {
    if (ui.currentView !== "discover") { ui.currentView = "discover"; window.location.hash = "discover"; }
    render();
  });
  genreFilter.addEventListener("change", render);
  view.addEventListener("click", handleViewClick);
  view.addEventListener("input", handleViewInput);
  document.addEventListener("submit", handleViewSubmit);
}

function bindAuthEvents() {
  // Use event delegation on authArea for clicks (survives DOM replacement)
  authArea.addEventListener("click", function (e) {
    var target = e.target.closest("#signInBtn");
    if (target) {
      openAuthModal();
      return;
    }

    var trigger = e.target.closest("[data-action='accountToggle']");
    if (trigger) {
      toggleAccountMenu();
      return;
    }

    var nav = e.target.closest("[data-action='accountNav']");
    if (nav) {
      closeAccountMenu();
      ui.currentView = nav.dataset.view;
      window.location.hash = nav.dataset.view;
      render();
      return;
    }

    var signOut = e.target.closest("[data-action='accountSignOut']");
    if (signOut) {
      closeAccountMenu();
      handleSignOut();
    }
  });

  // Modal close button — use event delegation on the modal backdrop
  authModal.addEventListener("click", function (e) {
    // Close button
    if (e.target.closest("#authModalClose")) {
      closeAuthModal();
      return;
    }
    // Tab switching
    var tab = e.target.closest("[data-auth-tab]");
    if (tab) {
      switchAuthTab(tab.dataset.authTab);
      return;
    }
    // Backdrop click (click on the backdrop itself, not the modal content)
    if (e.target === authModal) {
      closeAuthModal();
    }
  });

  // Story Modal close/backdrop clicks
  var storyModal = document.getElementById("storyModal");
  if (storyModal) {
    storyModal.addEventListener("click", function (e) {
      if (e.target.closest("#storyModalClose") || e.target === storyModal) {
        closeStoryModal();
      }
    });
  }

  // Escape key to close
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !authModal.hidden) closeAuthModal();
    if (e.key === "Escape" && storyModal && !storyModal.hidden) closeStoryModal();
    if (e.key === "Escape") closeAccountMenu();

    // Reader keyboard shortcuts
    if (window.location.hash === "#reader" || window.location.hash === "reader") {
      var active = document.activeElement;
      if (active && (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.contentEditable === "true"
      )) {
        return;
      }

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      }

      var story = getCurrentStory();
      var isComic = story.type === "Chitrānk";
      if (e.key === "ArrowLeft") {
        if (isComic && ui.readerMode === "pages") {
          e.preventDefault();
          moveComicPage(-1);
        } else if (!isComic && ui.readerMode === "pages") {
          e.preventDefault();
          moveTextPage(-1);
        }
      } else if (e.key === "ArrowRight") {
        if (isComic && ui.readerMode === "pages") {
          e.preventDefault();
          moveComicPage(1);
        } else if (!isComic && ui.readerMode === "pages") {
          e.preventDefault();
          moveTextPage(1);
        }
      }
    }
  });

  // Click outside dropdown to close it
  document.addEventListener("click", function (e) {
    if (!authArea.contains(e.target)) closeAccountMenu();
  });

  // Form submissions
  loginForm.addEventListener("submit", handleLogin);
  signupForm.addEventListener("submit", handleSignup);
}

// ── Profile & Settings ──
function renderProfileSettings() {
  var params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  var targetUsername = params.get("username");

  if (targetUsername) {
    state.publicProfiles = state.publicProfiles || {};
    var cached = state.publicProfiles[targetUsername];
    if (!cached) {
      var loadingEl = el("div", "empty", "Loading profile...");
      view.appendChild(loadingEl);
      api("/profiles/" + encodeURIComponent(targetUsername))
        .then(function (profile) {
          state.publicProfiles[targetUsername] = profile;
          render();
        })
        .catch(function (err) {
          console.error("Error loading public profile:", err);
          loadingEl.textContent = "Profile not found or failed to load.";
        });
      return;
    }

    var username = cached.username;
    var role = (cached.role || "reader").toLowerCase();
    var avatarUrl = cached.avatar_url || "";
    var bio = cached.bio || "";
    var initial = username.charAt(0).toUpperCase();

    var avatarEl = el("div", "profile-avatar-lg");
    if (avatarUrl) {
      avatarEl.style.backgroundImage = "url('" + avatarUrl + "')";
    } else {
      avatarEl.textContent = initial;
    }

    var headerCard = el("section", "profile-header-card", [
      avatarEl,
      el("div", "profile-header-info", [
        el("h2", "profile-display-name", username),
        el("span", "auth-role-badge profile-role-badge " + role, role.charAt(0).toUpperCase() + role.slice(1))
      ])
    ]);
    view.appendChild(headerCard);

    var bioBlock = el("section", "profile-bio-card", [
      el("h3", "profile-section-title", "About " + username),
      el("p", "profile-bio-text", bio || "This user hasn't written a bio yet.")
    ]);
    view.appendChild(bioBlock);

    var authorStories = state.stories.filter(function (s) {
      return s.author === username;
    });

    var statsRow = el("div", "profile-stats-row", [
      el("div", "profile-stat", [el("strong", null, String(authorStories.length)), el("span", null, "Stories")]),
      el("div", "profile-stat", [el("strong", null, formatNumber(authorStories.reduce(function (sum, s) { return sum + (s.views || 0); }, 0))), el("span", null, "Total Reads")]),
      el("div", "profile-stat", [el("strong", null, formatNumber(authorStories.reduce(function (sum, s) { return sum + (s.followers || 0); }, 0))), el("span", null, "Followers")])
    ]);
    view.appendChild(statsRow);

    if (authorStories.length) {
      view.appendChild(el("h3", "profile-section-title", "Stories by " + username));
      var grid = el("section", "story-grid");
      authorStories.forEach(function (story) { grid.appendChild(storyCard(story, { manage: false })); });
      view.appendChild(grid);
    }
    return;
  }

  if (!state.user || !state.profile) {
    view.appendChild(el("div", "empty", "Please log in to view your profile."));
    return;
  }

  var username = state.profile.username || state.user.email.split("@")[0];
  var email = state.user.email || "";
  var role = (state.profile.role || "reader").toLowerCase();
  var avatarUrl = state.profile.avatar_url || "";
  var initial = username.charAt(0).toUpperCase();
  var isSettings = ui.currentView === "settings";

  // Profile Header Card
  var avatarEl = el("div", "profile-avatar-lg");
  if (avatarUrl) {
    avatarEl.style.backgroundImage = "url('" + avatarUrl + "')";
  } else {
    avatarEl.textContent = initial;
  }

  var headerCard = el("section", "profile-header-card", [
    avatarEl,
    el("div", "profile-header-info", [
      el("h2", "profile-display-name", username),
      el("p", "profile-email", email),
      el("span", "auth-role-badge profile-role-badge " + role, role.charAt(0).toUpperCase() + role.slice(1))
    ])
  ]);
  view.appendChild(headerCard);

  // Tabs
  var tabs = el("div", "profile-tabs", [
    button("Profile", isSettings ? "profile-tab" : "profile-tab active", { action: "profileTab", value: "profile" }),
    button("Settings", isSettings ? "profile-tab active" : "profile-tab", { action: "profileTab", value: "settings" })
  ]);
  view.appendChild(tabs);

  if (!isSettings) {
    // Profile View
    var userStories = state.stories.filter(function (s) {
      return state.user && s.author_id === state.user.id;
    });

    var statsRow = el("div", "profile-stats-row", [
      el("div", "profile-stat", [el("strong", null, String(userStories.length)), el("span", null, "Stories")]),
      el("div", "profile-stat", [el("strong", null, formatNumber(userStories.reduce(function (sum, s) { return sum + (s.views || 0); }, 0))), el("span", null, "Total Reads")]),
      el("div", "profile-stat", [el("strong", null, formatNumber(userStories.reduce(function (sum, s) { return sum + (s.followers || 0); }, 0))), el("span", null, "Followers")]),
      el("div", "profile-stat", [el("strong", null, String(state.library.length)), el("span", null, "Following")])
    ]);
    view.appendChild(statsRow);

    if (userStories.length) {
      view.appendChild(el("h3", "profile-section-title", "Your Stories"));
      var grid = el("section", "story-grid");
      userStories.forEach(function (story) { grid.appendChild(storyCard(story, { manage: true })); });
      view.appendChild(grid);
    }
  } else {
    // Settings View
    var uInput = input("text", username, { name: "username", placeholder: "Your username" });
    var uHint = el("p", "username-hint", "");
    uInput.addEventListener("input", function (e) {
      var val = e.target.value.trim();
      if (!val) {
        uHint.textContent = "";
        uHint.className = "username-hint";
        return;
      }
      if (val === (state.profile ? state.profile.username : "")) {
        uHint.textContent = "Your current username";
        uHint.className = "username-hint available";
        return;
      }
      uHint.textContent = "Checking...";
      uHint.className = "username-hint checking";
      
      clearTimeout(uInput.timer);
      uInput.timer = setTimeout(function () {
        api("/profiles/check-username/" + encodeURIComponent(val))
          .then(function (res) {
            if (e.target.value.trim() !== val) return;
            if (res.available) {
              uHint.textContent = "Username is available";
              uHint.className = "username-hint available";
            } else {
              uHint.textContent = "Username is already taken";
              uHint.className = "username-hint taken";
            }
          })
          .catch(function () {
            if (e.target.value.trim() !== val) return;
            uHint.textContent = "Error checking username";
            uHint.className = "username-hint taken";
          });
      }, 500);
    });

    var bioTextarea = textarea("bio", state.profile.bio || "");
    bioTextarea.className = "settings-bio-textarea";
    bioTextarea.placeholder = "Write a short bio about yourself...";

    var settingsPanel = el("section", "profile-settings-panel", [
      el("h3", "profile-section-title", "Account Settings"),

      el("div", "settings-group", [
        el("label", "settings-label", "Username"),
        el("div", "settings-field-row", [
          uInput,
          button("Update", "btn primary btn-sm", { action: "updateUsername" })
        ]),
        uHint
      ]),

      el("div", "settings-group", [
        el("label", "settings-label", "Email"),
        el("div", "settings-field-row", [
          input("text", email, { name: "email", disabled: "true", placeholder: "Email address" })
        ]),
        el("p", "settings-hint", "Email changes are managed through your authentication provider.")
      ]),

      el("div", "settings-group", [
        el("label", "settings-label", "Avatar URL"),
        el("div", "settings-field-row", [
          input("text", avatarUrl, { name: "avatar_url", placeholder: "https://example.com/avatar.jpg" }),
          button("Update", "btn primary btn-sm", { action: "updateAvatar" })
        ]),
        el("p", "settings-hint", "Paste a URL to an image to use as your avatar.")
      ]),

      el("div", "settings-group", [
        el("label", "settings-label", "Bio"),
        el("div", "settings-field-row", [
          bioTextarea
        ]),
        el("div", "settings-field-row", [
          button("Update Bio", "btn primary btn-sm", { action: "updateBio" })
        ]),
        el("p", "settings-hint", "Tell other readers and authors about yourself.")
      ]),

      el("div", "settings-group settings-danger-zone", [
        el("h4", null, "Danger Zone"),
        el("p", "settings-hint", "Once you delete your account, there is no going back."),
        button("Delete Account", "btn danger", { action: "deleteAccount" })
      ])
    ]);
    view.appendChild(settingsPanel);
  }
}

function hydrateGenres() { hydrateGenresModule(ctx); }

function render() { renderModule(ctx); }

// ── Discover ──
function renderDiscover() {
  var stories = filteredStories();
  var featured = state.stories.slice(0, 3);

  // Hero Carousel
  var carousel = el("section", "hero-carousel");
  var track = el("div", "carousel-track");
  featured.forEach(function (story) {
    var slide = el("div", "carousel-slide");
    var coverVal = story.cover;
    if (coverVal && !coverVal.startsWith("url") && !coverVal.startsWith("linear-gradient") && !coverVal.startsWith("radial-gradient")) {
      coverVal = "url('" + coverVal + "')";
    }
    var bg = el("div", "cover-bg"); bg.style.background = coverVal; slide.appendChild(bg);
    slide.appendChild(el("p", "carousel-eyebrow", story.genre + " · " + story.type));
    slide.appendChild(el("h2", "carousel-title", story.title));
    slide.appendChild(el("p", "carousel-desc", story.description));
    var carouselMeta = el("div", "carousel-meta");
    var authorLink = el("a", "story-author-link", story.author);
    authorLink.href = "#profile?username=" + encodeURIComponent(story.author);
    carouselMeta.appendChild(authorLink);
    carouselMeta.appendChild(document.createTextNode(" · " + formatNumber(story.views) + " reads · " + formatNumber(story.followers) + " followers"));
    slide.appendChild(carouselMeta);
    slide.appendChild(el("div", "button-row", [
      button("Read now", "btn primary", { action: "openStory", id: story.id }),
      button(state.library.indexOf(story.id) === -1 ? "Follow" : "Following", "btn", { action: "follow", id: story.id })
    ]));
    track.appendChild(slide);
  });
  carousel.appendChild(track);
  var dots = el("div", "carousel-dots");
  featured.forEach(function (_, i) {
    var dot = el("button", "carousel-dot" + (i === 0 ? " active" : "")); dot.dataset.action = "carouselDot"; dot.dataset.index = String(i); dots.appendChild(dot);
  });
  carousel.appendChild(dots);
  var prev = el("button", "carousel-arrow prev", "‹"); prev.dataset.action = "carouselPrev";
  var next = el("button", "carousel-arrow next", "›"); next.dataset.action = "carouselNext";
  carousel.appendChild(prev); carousel.appendChild(next);
  view.appendChild(carousel);
  startCarouselAuto();

  // Stats — use cached state.stats from loadAll() instead of fetching per-render
  var s = state.stats || {};
  view.appendChild(el("div", "stats-row", [
    metric("Published", s.published || countPublished()), metric("Total reads", formatNumber(s.views || totalViews())),
    metric("Followers", formatNumber(s.followers || totalFollowers())), metric("Open reports", s.open_reports || countOpenReports())
  ]));

  // Filter toolbar
  view.appendChild(el("div", "toolbar", [
    el("div", "segmented", [segmentButton("All", "all", ui.filterType), segmentButton("Web Novel", "Web Novel", ui.filterType), segmentButton("Chitrānk", "Chitrānk", ui.filterType)]),
    el("div", "mini-meta", stories.length + " results")
  ]));

  // Story grid
  var grid = el("section", "story-grid"); grid.id = "storyGrid";
  stories.forEach(function (story) { grid.appendChild(storyCard(story)); });
  view.appendChild(stories.length ? grid : el("div", "empty", "No stories match the current search."));
}

var carouselIndex = 0, carouselTimer = null;
function startCarouselAuto() { clearInterval(carouselTimer); carouselTimer = setInterval(function () { moveCarousel(1); }, 5000); }
function moveCarousel(dir) {
  var t = document.querySelector(".carousel-track"); if (!t) return;
  carouselIndex = (carouselIndex + dir + t.children.length) % t.children.length; applyCarouselPosition();
}
function goToSlide(i) { carouselIndex = i; applyCarouselPosition(); startCarouselAuto(); }
function applyCarouselPosition() {
  var t = document.querySelector(".carousel-track"); if (!t) return;
  t.style.transform = "translateX(-" + (carouselIndex * 100) + "%)";
  document.querySelectorAll(".carousel-dot").forEach(function (d, j) { d.classList.toggle("active", j === carouselIndex); });
}

// ── Library ──
function renderLibrary() {
  var libraryStories = state.stories.filter(function (s) { return state.library.indexOf(s.id) !== -1; });
  view.appendChild(el("div", "layout-two", [
    el("section", null, [
      el("div", "toolbar", [el("h2", null, "Reading list"), el("div", "mini-meta", libraryStories.length + " followed")]),
      libraryStories.length ? storyGrid(libraryStories) : el("div", "empty", "Follow a story to add it to your library.")
    ]),
    el("aside", null, [
      el("section", "panel", [el("h2", null, "Notifications"), list(state.notifications, "activity-list", function (n) { return el("li", "activity-item", n); })]),
      el("section", "panel", [el("h2", null, "Progress"), list(libraryStories, "activity-list", function (s) {
        return el("li", "activity-item", [el("strong", null, s.title), progress(s.progress), el("span", "mini-meta", s.progress + "% read")]);
      })])
    ])
  ]));
}

// ── Reader ──
function renderReader() {
  var story = getCurrentStory(); var chapter = getCurrentChapter(story); var isComic = story.type === "Chitrānk";
  var controls = [
    el("div", "segmented", [segmentButton("Scroll", "scroll", ui.readerMode, "readerMode"), segmentButton(isComic ? "Page flip" : "Pages", "pages", ui.readerMode, "readerMode")])
  ];
  if (isComic && ui.readerMode === "pages") controls.push(comicPager(chapter));
  if (!isComic && ui.readerMode === "pages" && chapter.content) {
    var textPages = paginateText(chapter.content);
    clampTextPage(textPages);
    controls.push(textPager(textPages));
  }
  if (!isComic) controls.push(el("label", "mini-meta", ["Text size", input("range", ui.readerSize, { min: "16", max: "26", action: "fontSize" })]));
  controls.push(progress(story.progress));
  view.appendChild(el("div", "reader-frame", [
    el("div", "reader-toolbar", [
      el("div", null, [
        el("h2", null, story.title),
        el("div", "mini-meta", [
          (function () {
            var a = el("a", "story-author-link", story.author);
            a.href = "#profile?username=" + encodeURIComponent(story.author);
            return a;
          })(),
          " / " + chapter.title + " / " + chapter.access,
          chapter.status === "scheduled" ? " Scheduled " + formatDate(chapter.scheduledAt) : ""
        ])
      ]),
      el("div", "button-row", [
        button("Prev", "btn", { action: "chapter", step: "-1" }),
        button("Next", "btn", { action: "chapter", step: "1" }),
        button(ui.readerTheme === "dark" ? "Light" : "Dark", "btn", { action: "theme" }),
        button(document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen", "btn", { action: "toggleFullscreen" }),
        state.user ? button("Report Content", "btn danger", { action: "reportContent", storyId: story.id, chapterId: chapter.id }) : null
      ].filter(Boolean))
    ]),
    el("div", "reader-toolbar", controls),
    readerContent(story, chapter)
  ]));
    view.appendChild(el("div", "layout-two", [
      el("section", "panel", [el("h2", null, "Chapters"), list(story.chapters, "chapter-list", function (item, i) {
        return el("li", "chapter-item", [el("strong", null, item.title), el("span", "mini-meta", (i + 1) + " / " + item.status + " / " + item.access), button("Open", "btn", { action: "openChapter", index: String(i) })]);
      })]),
      el("aside", "panel", [el("h2", null, "Comments"),
        chapter.comments.length ? list(chapter.comments, "activity-list", function (c) {
          var canDelete = (state.user && c.user_id === state.user.id) || ["moderator", "admin"].indexOf(state.role) !== -1;
          var canReport = state.user && c.user_id !== state.user.id;
          return el("li", "activity-item", [
            el("div", "comment-header", [
              (function () {
                var a = el("a", "story-author-link", c.user);
                a.style.fontWeight = "bold";
                a.href = "#profile?username=" + encodeURIComponent(c.user);
                return a;
              })(),
              el("div", "button-row", [
                canReport ? button("Report", "btn text-btn btn-sm", { action: "reportComment", id: c.id }) : null,
                canDelete ? button("Delete", "btn danger btn-sm", { action: "deleteComment", id: c.id }) : null
              ].filter(Boolean))
            ]),
            el("span", null, c.text)
          ]);
        }) : el("div", "empty", "No comments yet."),
        commentForm()
      ])
    ]));
}

function readerContent(story, chapter) {
  var cn = "reader-content " + (ui.readerTheme === "dark" ? "dark" : "");
  var container = el("article", cn); container.style.setProperty("--reader-size", ui.readerSize + "px");
  if (story.type === "Chitrānk" && chapter.pages) {
    if (ui.readerMode === "pages") return comicFlipContent(chapter);
    container.appendChild(el("div", "comic-pages", chapter.pages.map(function (p) {
      var pg = el("figure", "comic-page"); pg.style.setProperty("--page-bg", p.bg); pg.dataset.label = p.label; return pg;
    })));
    return container;
  }
  if (chapter.content) {
    if (ui.readerMode === "pages") {
      var pages = paginateText(chapter.content);
      clampTextPage(pages);
      var activePage = pages[ui.currentTextPageIndex] || [];
      activePage.forEach(function (pObj) {
        var p = el("p", null, pObj.text);
        p.style.textAlign = pObj.align;
        container.appendChild(p);
      });
      return container;
    }
    chapter.content.forEach(function (para) {
      var align = "left";
      var cleanText = para;
      if (para.startsWith("[center]")) {
        align = "center";
        cleanText = para.substring(8);
      } else if (para.startsWith("[right]")) {
        align = "right";
        cleanText = para.substring(7);
      } else if (para.startsWith("[left]")) {
        align = "left";
        cleanText = para.substring(6);
      }
      var p = el("p", null, cleanText);
      p.style.textAlign = align;
      container.appendChild(p);
    });
  }
  return container;
}

function comicFlipContent(chapter) {
  var pages = chapter.pages || [];
  clampComicPage(pages);
  var current = pages[ui.currentComicPageIndex];
  var container = el("article", "reader-content comic-reader flip-mode" + (ui.readerTheme === "dark" ? " dark" : ""));
  if (!current) return container;
  var page = el("figure", "comic-page comic-page-current");
  page.style.setProperty("--page-bg", current.bg);
  page.dataset.label = current.label;
  page.dataset.page = (ui.currentComicPageIndex + 1) + " / " + pages.length;
  container.appendChild(el("div", "comic-flip-stage", [
    comicNavButton("Previous page", "prev", -1, ui.currentComicPageIndex === 0),
    page,
    comicNavButton("Next page", "next", 1, ui.currentComicPageIndex >= pages.length - 1)
  ]));
  return container;
}

function comicPager(chapter) {
  var pages = chapter.pages || [];
  clampComicPage(pages);
  return el("div", "comic-pager", [
    button("Prev page", "btn", { action: "comicPage", step: "-1" }, ui.currentComicPageIndex === 0),
    el("span", "mini-meta", pages.length ? (ui.currentComicPageIndex + 1) + " / " + pages.length : "0 / 0"),
    button("Next page", "btn", { action: "comicPage", step: "1" }, ui.currentComicPageIndex >= pages.length - 1)
  ]);
}

function textPager(pages) {
  return el("div", "comic-pager text-pager", [
    button("Prev page", "btn", { action: "textPage", step: "-1" }, ui.currentTextPageIndex === 0),
    el("span", "mini-meta", pages.length ? (ui.currentTextPageIndex + 1) + " / " + pages.length : "0 / 0"),
    button("Next page", "btn", { action: "textPage", step: "1" }, ui.currentTextPageIndex >= pages.length - 1)
  ]);
}

function comicNavButton(label, direction, step, disabled) {
  var b = button(direction === "prev" ? "‹" : "›", "comic-nav " + direction, { action: "comicPage", step: String(step) }, disabled);
  b.setAttribute("aria-label", label);
  return b;
}

// ── Studio ──
function renderStudio() {
  var userStories = state.stories.filter(function (s) {
    return state.user && s.author_id === state.user.id;
  });
  var active = userStories.find(function (s) { return s.id === ui.currentStoryId; }) || userStories[0];

  if (active && active.id && ui.currentStoryId !== active.id) {
    ui.currentStoryId = active.id;
  }

  // 1. Studio Header Toolbar
  var headerBtn = iconButton("New Story", "btn primary orange-glow-btn", { action: "openStoryModal" }, "icon-plus");
  
  // Dropdown to switch stories if they have multiple
  var storySelector = null;
  if (userStories.length > 1 && active) {
    storySelector = el("select", "auth-role-badge-select");
    storySelector.style.marginLeft = "16px";
    storySelector.style.padding = "6px 12px";
    storySelector.style.fontSize = "0.9rem";
    storySelector.style.border = "1px solid rgba(255,255,255,0.15)";
    storySelector.style.borderRadius = "4px";
    storySelector.style.backgroundColor = "rgba(25,25,25,0.8)";
    storySelector.style.color = "var(--text)";
    
    userStories.forEach(function (s) {
      var opt = el("option", null, s.title);
      opt.value = s.id;
      opt.selected = (s.id === active.id);
      storySelector.appendChild(opt);
    });
    
    storySelector.addEventListener("change", function (e) {
      ui.currentStoryId = e.target.value;
      render();
    });
  }

  var headerTitleArea = el("div", null, [
    el("div", null, [
      el("h2", null, "Studio Overview"),
      el("p", null, "Manage your series, outline chapters, and track metrics")
    ])
  ]);
  if (storySelector) {
    headerTitleArea.appendChild(el("div", { style: "margin-top: 10px; display: flex; align-items: center;" }, [
      el("span", { style: "font-size: 0.85rem; color: var(--text-muted);" }, "Active Series:"),
      storySelector
    ]));
  }

  var headerToolbar = el("div", "studio-header-toolbar", [
    headerTitleArea,
    headerBtn
  ]);

  // 2. Middle Column Components
  var middleColumnChildren = [];
  middleColumnChildren.push(headerToolbar);

  if (active) {
    // Active Story Card
    var coverEl = el("div", "studio-active-cover");
    if (active.cover) {
      var isUrlOrGradient = active.cover.startsWith("url") || active.cover.startsWith("linear-gradient") || active.cover.startsWith("radial-gradient");
      coverEl.style.backgroundImage = isUrlOrGradient ? active.cover : "url('" + active.cover + "')";
    } else {
      coverEl.style.background = "linear-gradient(135deg, #333, #111)";
    }

    var activeCard = el("div", "studio-story-active-card", [
      coverEl,
      el("div", "studio-active-details", [
        el("span", "studio-active-badge", active.type),
        el("div", "studio-active-title-row", [
          el("h3", null, active.title),
          el("span", "studio-status-ongoing", active.status || "Ongoing")
        ]),
        el("div", "studio-active-subtitle", "By " + active.author + " · " + (active.genre || "General")),
        el("p", "studio-active-synopsis", active.description || "No description provided."),
        
        // Stats Row: Views, Likes, Followers, Stars
        el("div", "studio-stats-row", [
          el("div", "studio-stat-item", [
            el("span", "icon icon-eye"),
            el("div", "studio-stat-val", [
              el("strong", null, formatNumber(active.views)),
              el("span", null, "Views")
            ])
          ]),
          el("div", "studio-stat-item", [
            el("span", "icon icon-heart"),
            el("div", "studio-stat-val", [
              el("strong", null, formatNumber(active.likes)),
              el("span", null, "Likes")
            ])
          ]),
          el("div", "studio-stat-item", [
            el("span", "icon icon-users"),
            el("div", "studio-stat-val", [
              el("strong", null, formatNumber(active.followers)),
              el("span", null, "Followers")
            ])
          ]),
          el("div", "studio-stat-item", [
            el("span", "icon icon-star"),
            el("div", "studio-stat-val", [
              el("strong", null, calculateStars(active)),
              el("span", null, "Stars")
            ])
          ])
        ]),

        // Progress Bar
        (function() {
          var progressVal = active.progress;
          if (!progressVal && active.chapters) {
            progressVal = active.status === "completed" ? 100 : Math.min(95, active.chapters.length * 10);
          }
          if (!progressVal) progressVal = 0;
          return el("div", "studio-progress-container", [
            el("div", "studio-progress-header", [
              el("span", null, "Story Completion Progress"),
              el("span", null, progressVal + "%")
            ]),
            el("div", "studio-progress-bar-bg", [
              (function() {
                var fill = el("div", "studio-progress-bar-fill");
                fill.style.width = progressVal + "%";
                return fill;
              })()
            ])
          ]);
        })(),

        el("div", "studio-btn-row", [
          iconButton("Continue Writing", "btn primary orange-glow-btn", { action: "continueWriting" }, "icon-pencil"),
          iconButton("Edit Settings", "btn", { action: "editStorySettings", id: active.id }, "icon-gear"),
          iconButton("View Story", "btn", { action: "openStory", id: active.id }, "icon-book"),
          iconButton("", "btn danger", { action: "deleteStory", id: active.id }, "icon-trash")
        ])
      ])
    ]);

    middleColumnChildren.push(activeCard);

    // Timeline / Chapter Plan
    var timelineItems = [];
    if (active.chapters && active.chapters.length) {
      timelineItems = active.chapters.map(function (ch, i) {
        var isCurrent = (ui.currentChapterIndex === i);
        var itemClass = "timeline-item" + (isCurrent ? " active-chapter" : "");
        var statusClass = "badge-status " + (ch.status === "published" ? "published" : "draft");
        
        return el("li", itemClass, [
          el("div", "timeline-badge", String(i + 1)),
          el("div", "timeline-details", [
            el("strong", null, ch.title),
            el("span", null, "Updated " + (ch.updated_at ? formatDate(ch.updated_at) : "recently") + " · " + (ch.access || "Free"))
          ]),
          el("div", "timeline-actions", [
            el("span", "timeline-words", (ch.words || "0") + " words"),
            el("span", statusClass, ch.status),
            iconButton("", "btn btn-sm", { action: "editChapter", id: ch.id }, "icon-edit"),
            iconButton("", "btn btn-sm", { action: "openChapter", index: String(i) }, "icon-book"),
            iconButton("", "btn btn-sm danger", { action: "deleteChapter", id: ch.id }, "icon-trash")
          ])
        ]);
      });
    }

    var chapterPlanPanel = el("section", "panel", [
      el("div", "toolbar", [
        el("h2", null, "Chapter Plan Timeline"),
        iconButton("New Chapter", "btn btn-sm primary", { action: "newChapter" }, "icon-plus")
      ]),
      timelineItems.length ? el("ul", "timeline-list", timelineItems) : el("div", "empty", "No chapters found. Click 'New Chapter' to begin writing!")
    ]);

    middleColumnChildren.push(chapterPlanPanel);
  } else {
    // Welcome placeholder card for first story
    var welcomeCard = el("section", "panel", [
      el("h3", { style: "font-size: 1.4rem; margin-bottom: 8px;" }, "Welcome to Author Studio!"),
      el("p", { style: "color: var(--text-muted); margin-bottom: 16px;" }, "Create your first story to unlock the chapter workspace, analytics tracking, and layout features."),
      iconButton("Create a Story Now", "btn primary orange-glow-btn", { action: "openStoryModal" }, "icon-plus")
    ]);
    middleColumnChildren.push(welcomeCard);
  }

  // Always render stories grid at bottom if they have stories
  if (userStories.length) {
    var storiesPanel = el("section", "panel", [
      el("h2", null, "My Stories"),
      storyGrid(userStories, { manage: true })
    ]);
    middleColumnChildren.push(storiesPanel);
  }

  // 3. Right Column Components
  var rightColumnChildren = [];

  if (active) {
    // SVG Chart Container construction
    var chartGradientId = "studioChartGrad-" + Math.random().toString(36).substring(2, 9);
    
    var gradient = svgEl("linearGradient", { id: chartGradientId, x1: "0", y1: "0", x2: "0", y2: "1" }, [
      svgEl("stop", { offset: "0%", "stop-color": "#f36b15", "stop-opacity": "0.4" }),
      svgEl("stop", { offset: "100%", "stop-color": "#f36b15", "stop-opacity": "0" })
    ]);
    
    var defs = svgEl("defs", null, [gradient]);
    
    var ptsData = generateChartData(active);
    var lineD = "M " + ptsData.map(function(p) { return p.x + " " + p.y; }).join(" L ");
    var areaD = lineD + " L 300 100 L 0 100 Z";

    var areaPath = svgEl("path", {
      d: areaD,
      fill: "url(#" + chartGradientId + ")",
      stroke: "none"
    });
    
    var linePath = svgEl("path", {
      d: lineD,
      fill: "none",
      stroke: "#f36b15",
      "stroke-width": "3",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });

    var grid1 = svgEl("line", { x1: "0", y1: "25", x2: "300", y2: "25", stroke: "rgba(255,255,255,0.05)", "stroke-dasharray": "4 4" });
    var grid2 = svgEl("line", { x1: "0", y1: "50", x2: "300", y2: "50", stroke: "rgba(255,255,255,0.05)", "stroke-dasharray": "4 4" });
    var grid3 = svgEl("line", { x1: "0", y1: "75", x2: "300", y2: "75", stroke: "rgba(255,255,255,0.05)", "stroke-dasharray": "4 4" });

    var pts = ptsData.map(function (pt) {
      return svgEl("circle", {
        cx: String(pt.x),
        cy: String(pt.y),
        r: "4",
        fill: "#111",
        stroke: "#f36b15",
        "stroke-width": "2"
      });
    });

    var chartSvg = svgEl("svg", {
      viewBox: "0 0 300 100",
      class: "svg-chart"
    }, [defs, grid1, grid2, grid3, areaPath, linePath].concat(pts));

    var chartContainer = el("div", "svg-chart-container", [chartSvg]);

    // Dynamic Trends calculation based on story stats
    var viewsTrend = active.views > 0 ? "+" + (active.views % 13 + 2.5).toFixed(1) + "%" : "0.0%";
    var likesTrend = active.likes > 0 ? "+" + (active.likes % 9 + 1.1).toFixed(1) + "%" : "0.0%";
    var followersTrend = active.followers > 0 ? "+" + (active.followers % 6 + 0.7).toFixed(1) + "%" : "0.0%";
    var starsVal = calculateStars(active);
    var starsTrend = starsVal === "5.0" ? "Max score" : "Stable";

    // Analytics Overview Card with SVG Chart
    var analyticsPanel = el("section", "panel", [
      el("h2", null, "Analytics Overview"),
      
      // 2x2 grid of metric boxes
      el("div", "analytics-grid", [
        analyticsMetricBox("Views", formatNumber(active.views), viewsTrend, true),
        analyticsMetricBox("Likes", formatNumber(active.likes), likesTrend, true),
        analyticsMetricBox("Followers", formatNumber(active.followers), followersTrend, true),
        analyticsMetricBox("Stars", starsVal, starsTrend, true)
      ]),
      
      chartContainer
    ]);
    rightColumnChildren.push(analyticsPanel);
  }

  // Quick Actions Panel
  var actionsGrid = [
    quickActionTile("icon-pencil", "New Chapter", "newChapter"),
    quickActionTile("icon-document", "Quick Draft", "quickDraft"),
    quickActionTile("icon-book", "Story Notes", "storyNotes"),
    quickActionTile("icon-image", "Upload Cover", "uploadCover")
  ];
  if (active && active.cover && !active.cover.startsWith("linear-gradient") && !active.cover.startsWith("radial-gradient")) {
    actionsGrid.push(quickActionTile("icon-trash", "Delete Cover", "deleteCover"));
  }

  var quickActionsPanel = el("section", "panel", [
    el("h2", null, "Quick Actions"),
    el("div", "quick-actions-grid", actionsGrid)
  ]);
  rightColumnChildren.push(quickActionsPanel);

  // 4. Assemble main layout
  var gridLayout = el("div", "studio-grid-layout", [
    el("div", "studio-main", middleColumnChildren),
    el("div", "studio-aside", rightColumnChildren)
  ]);

  view.appendChild(gridLayout);
}

function renderEditor() { renderEditorModule(ctx); }

function saveChapterFromEditor(status) { saveChapterFromEditorModule(ctx, status); }

// ── Moderation ──
function renderModeration() {
  var canMod = canModerateRole();
  view.appendChild(el("div", "layout-two", [
    el("section", "panel", [
      el("div", "toolbar", [el("h2", null, "Review queue"), el("div", "mini-meta", canMod ? "Role has queue access" : "Switch role to moderate")]),
      state.reports.length ? list(state.reports, "report-list", function (r) {
        return el("li", "report-item", [el("strong", null, r.target), el("span", "mini-meta", r.reason + " / " + r.severity + " / " + r.status),
          el("div", "button-row", [button("Resolve", "btn success", { action: "resolveReport", id: r.id }, !canMod || r.status !== "open"), button("Escalate", "btn warn", { action: "escalateReport", id: r.id }, !canMod || r.status !== "open")])]);
      }) : el("div", "empty", "No reports in queue.")
    ]),
    el("aside", null, [
      el("section", "panel", [el("h2", null, "Guidelines"), list(["No harassment, hate, doxxing, or threats.", "No piracy, plagiarism, or unauthorized uploads.", "Sensitive content must be tagged before publication.", "Moderation actions are logged for appeal review."], "activity-list", function (t) { return el("li", "activity-item", t); })]),
      el("section", "panel", [el("h2", null, "Content controls"), el("div", "button-row", [button("Run text scan", "btn", { action: "scan" }), button("Export queue", "btn", { action: "exportQueue" })])])
    ])
  ]));
}

// ── Forms ──
function storyForm() {
  return form("storyForm", [
    field("Title", input("text", "", { name: "title", placeholder: "New series title", required: "true" })),
    field("Type", select("type", [["Web Novel", "Web Novel"], ["Chitrānk", "Chitrānk"]])),
    field("Genre", input("text", "", { name: "genre", placeholder: "Fantasy", required: "true" })),
    field("Synopsis", textarea("description", "A new serialized story begins here.")),
    submitButton("Create", "btn primary orange-glow-btn")
  ]);
}
function storySettingsForm(story) {
  var tagsString = (story.tags || []).join(", ");
  return form("storySettingsForm", [
    (function () {
      var hidden = el("input");
      hidden.type = "hidden";
      hidden.name = "id";
      hidden.value = story.id;
      return hidden;
    })(),
    field("Title", input("text", story.title, { name: "title", placeholder: "Series title", required: "true" })),
    field("Genre", input("text", story.genre, { name: "genre", placeholder: "Fantasy", required: "true" })),
    field("Language", input("text", story.language || "English", { name: "language", placeholder: "English", required: "true" })),
    field("License", select("license", [
      ["Creator-owned", "Creator-owned"],
      ["Creative Commons BY", "Creative Commons BY"],
      ["Creative Commons BY-NC", "Creative Commons BY-NC"],
      ["Public Domain", "Public Domain"]
    ], story.license || "Creator-owned")),
    field("Status", select("status", [
      ["draft", "Draft / Unpublished"],
      ["ongoing", "Ongoing / Active"],
      ["completed", "Completed"],
      ["on_hold", "On Hold"],
      ["cancelled", "Cancelled"]
    ], story.status || "draft")),
    field("Tags (comma separated)", input("text", tagsString, { name: "tags", placeholder: "fantasy, magic, adventure" })),
    field("Synopsis", textarea("description", story.description || "")),
    submitButton("Save Changes", "btn primary orange-glow-btn")
  ]);
}
function commentForm() {
  if (!state.user) {
    return el("div", "comment-login-prompt", [
      el("p", null, "Please log in to post a comment."),
      button("Log In", "btn primary", { action: "loginToComment" })
    ]);
  }
  return form("commentForm", [field("Add comment", textarea("comment", "")), submitButton("Post comment", "btn primary")]);
}

function toggleFullscreen() {
  var frame = document.querySelector(".reader-frame");
  if (!frame) return;
  if (!document.fullscreenElement) {
    frame.requestFullscreen().catch(function (err) {
      console.error("Error attempting to enable fullscreen:", err);
    });
  } else {
    document.exitFullscreen();
  }
}

document.addEventListener("fullscreenchange", function () {
  var btn = document.querySelector('[data-action="toggleFullscreen"]');
  if (btn) {
    btn.textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
  }
});

// ── Click handler ──
function handleViewClick(e) {
  var target = e.target.closest("[data-action]"); if (!target) return;
  var action = target.dataset.action;
  if (action === "go") window.location.hash = target.dataset.view;
  if (action === "loginToComment") { openAuthModal(); }
  if (action === "filter") { ui.filterType = target.dataset.value; render(); }
  if (action === "readerMode") { ui.readerMode = target.dataset.value; ui.currentComicPageIndex = 0; ui.currentTextPageIndex = 0; render(); }
  if (action === "openStory") { ui.currentStoryId = target.dataset.id; ui.currentChapterIndex = 0; ui.currentComicPageIndex = 0; ui.currentTextPageIndex = 0; window.location.hash = "reader"; }
  if (action === "follow") {
    apiPost("/library/follow", { story_id: target.dataset.id }).then(function (r) {
      notify(r.message); return api("/library/ids");
    }).then(function (ids) { state.library = ids; render(); });
  }
  if (action === "tip") {
    apiPost("/stories/" + target.dataset.id + "/tip", { amount: 5 }).then(function (r) {
      notify(r.message); return api("/stories");
    }).then(function (s) { state.stories = s; render(); });
  }
  if (action === "chapter") { moveChapter(Number(target.dataset.step)); }
  if (action === "comicPage") { moveComicPage(Number(target.dataset.step)); }
  if (action === "textPage") { moveTextPage(Number(target.dataset.step)); }
  if (action === "toggleFullscreen") { toggleFullscreen(); }
  if (action === "theme") { ui.readerTheme = ui.readerTheme === "dark" ? "light" : "dark"; render(); }
  if (action === "openChapter") { ui.currentChapterIndex = Number(target.dataset.index); ui.currentComicPageIndex = 0; ui.currentTextPageIndex = 0; window.location.hash = "reader"; render(); }
  if (action === "manageStory") {
    ui.currentStoryId = target.dataset.id;
    ui.currentView = "studio";
    window.location.hash = "studio";
    render();
  }
  if (action === "openStoryModal") {
    openStoryModal();
  }
  if (action === "editStorySettings") {
    openStorySettingsModal(target.dataset.id);
  }
  if (action === "quickDraft") {
    notify("Quick Draft feature is currently in prototype mode.");
  }
  if (action === "storyNotes") {
    notify("Story Notes feature is currently in prototype mode.");
  }
  if (action === "uploadCover") {
    var story = getCurrentStudioStory();
    if (!story || !story.id) {
      notify("Please select or create a story first.");
      return;
    }
    
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      
      notify("Uploading cover image...");
      
      var fd = new FormData();
      fd.append("file", file);
      
      api("/upload/image", {
        method: "POST",
        body: fd
      }).then(function(resp) {
        if (!resp || !resp.url) throw new Error("Upload failed");
        // Save cover to story
        return apiPut("/stories/" + story.id, { cover: resp.url });
      }).then(function() {
        return api("/stories");
      }).then(function(s) {
        state.stories = s;
        notify("Cover image updated successfully!");
        render();
      }).catch(function(err) {
        console.error(err);
        if (err.message === "413") {
          notify("Upload failed: File is too large (max 5MB).");
        } else if (err.message === "415") {
          notify("Upload failed: Invalid format. Only PNG, JPG, WEBP, and GIF allowed.");
        } else {
          notify("Failed to upload cover: " + err.message);
        }
      });
    };
    fileInput.click();
  }
  if (action === "deleteCover") {
    var story = getCurrentStudioStory();
    if (!story || !story.id) {
      notify("Please select or create a story first.");
      return;
    }
    if (!confirm("Are you sure you want to remove the cover image and reset to default?")) {
      return;
    }
    notify("Removing cover image...");
    apiPut("/stories/" + story.id, { cover: "" })
      .then(function() {
        return api("/stories");
      })
      .then(function(s) {
        state.stories = s;
        notify("Cover image removed.");
        render();
      })
      .catch(function(err) {
        console.error(err);
        notify("Failed to remove cover: " + err.message);
      });
  }
  if (action === "newChapter") {
    var story = getCurrentStudioStory();
    if (!story || !story.id) {
      notify("Please create a story first before adding chapters.");
      return;
    }
    var num = story.chapters.length + 1;
    apiPost("/stories/" + story.id + "/chapters", { title: "Draft Chapter " + num }).then(function () {
      return api("/stories");
    }).then(function (s) { state.stories = s; notify("Draft chapter created."); render(); });
  }
  if (action === "editChapter") {
    ui.editingChapterId = target.dataset.id;
    ui.currentView = "editor";
    window.location.hash = "editor";
    render();
  }
  if (action === "continueWriting") {
    var story = getCurrentStudioStory();
    if (!story || !story.id) {
      notify("Please create a story first before adding chapters.");
      return;
    }
    if (story.chapters && story.chapters.length) {
      var lastCh = story.chapters[story.chapters.length - 1];
      ui.editingChapterId = lastCh.id;
      ui.currentView = "editor";
      window.location.hash = "editor";
      render();
    } else {
      apiPost("/stories/" + story.id + "/chapters", { title: "Draft Chapter 1" }).then(function () {
        return api("/stories");
      }).then(function (s) {
        state.stories = s;
        var updatedStory = getCurrentStudioStory();
        if (updatedStory && updatedStory.chapters.length) {
          var newCh = updatedStory.chapters[updatedStory.chapters.length - 1];
          ui.editingChapterId = newCh.id;
          ui.currentView = "editor";
          window.location.hash = "editor";
        }
        notify("Draft chapter created.");
        render();
      });
    }
  }
  if (action === "saveChapterDraft") {
    saveChapterFromEditor("draft");
  }
  if (action === "publishChapter") {
    saveChapterFromEditor("published");
  }
  if (action === "cancelEditChapter") {
    var titleEl = document.querySelector(".editor-title-input");
    var contentEl = document.querySelector(".editor-textarea");
    var story = getCurrentStudioStory();
    var chapter = null;
    if (story) {
      chapter = story.chapters.find(function(ch) { return ch.id === ui.editingChapterId; });
    }
    
    var hasChanges = false;
    if (titleEl && contentEl && chapter) {
      var originalText = "";
      if (chapter.content && chapter.content.length) {
        originalText = chapter.content.join("\n\n");
      }
      if (titleEl.value !== chapter.title || contentEl.value !== originalText) {
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      if (!window.confirm("You have unsaved changes. Are you sure you want to discard them?")) {
        return;
      }
    }
    localStorage.removeItem("kathasangam_draft_" + ui.editingChapterId);
    ui.currentView = "studio";
    window.location.hash = "studio";
    render();
  }
  if (action === "toggleChapterStatus") {
    var chapterId = target.dataset.id;
    apiPatch("/chapters/" + chapterId + "/status").then(function (r) {
      notify(r.title + " is now " + r.status + "."); return api("/stories");
    }).then(function (s) { state.stories = s; render(); });
  }
  if (action === "deleteChapter") {
    var doomedId = target.dataset.id;
    if (!window.confirm("Are you sure you want to delete this chapter? This cannot be undone.")) return;
    // Optimistic UI: remove chapter from state immediately
    var backupStories = JSON.parse(JSON.stringify(state.stories));
    state.stories.forEach(function (s) {
      s.chapters = s.chapters.filter(function (ch) { return ch.id !== doomedId; });
    });
    ui.currentChapterIndex = 0;
    notify("Chapter deleted.");
    render();
    // Background sync
    apiDelete("/chapters/" + doomedId).then(function () {
      return api("/stories");
    }).then(function (s) {
      state.stories = s;
      render();
    }).catch(function (err) {
      console.error("Failed to delete chapter:", err);
      state.stories = backupStories;
      notify("Failed to delete chapter. Restored.");
      render();
    });
  }
  if (action === "deleteStory") {
    var doomed = state.stories.find(function (s) { return s.id === target.dataset.id; });
    if (!doomed || !canDeleteStory(doomed)) return;
    if (!window.confirm("Delete \"" + doomed.title + "\" and all of its chapters? This cannot be undone.")) return;
    // Optimistic UI: remove story from state immediately
    var backupStories = state.stories.slice();
    var backupLibrary = state.library.slice();
    state.stories = state.stories.filter(function (s) { return s.id !== doomed.id; });
    state.library = state.library.filter(function (id) { return id !== doomed.id; });
    if (ui.currentStoryId === doomed.id) {
      ui.currentStoryId = state.stories[0] ? state.stories[0].id : "";
      ui.currentChapterIndex = 0;
    }
    hydrateGenres();
    notify("Story deleted.");
    render();
    // Background sync
    apiDelete("/stories/" + doomed.id).then(function () {
      return Promise.all([api("/stories"), api("/library/ids")]);
    }).then(function (results) {
      state.stories = results[0];
      state.library = results[1];
      hydrateGenres();
      render();
    }).catch(function (err) {
      console.error("Failed to delete story:", err);
      state.stories = backupStories;
      state.library = backupLibrary;
      hydrateGenres();
      notify("Failed to delete story. Restored.");
      render();
    });
  }
  if (action === "deleteComment") {
    if (!window.confirm("Are you sure you want to delete this comment?")) return;
    var commentId = target.dataset.id;
    // Optimistic UI: remove comment from state immediately
    var backupStories = JSON.parse(JSON.stringify(state.stories));
    state.stories.forEach(function (s) {
      s.chapters.forEach(function (ch) {
        ch.comments = ch.comments.filter(function (c) { return c.id !== commentId; });
      });
    });
    notify("Comment deleted.");
    render();
    // Background sync
    apiDelete("/comments/" + commentId).then(function () {
      return api("/stories");
    }).then(function (s) { state.stories = s; render(); }).catch(function (err) {
      console.error("Failed to delete comment:", err);
      state.stories = backupStories;
      notify("Failed to delete comment. Restored.");
      render();
    });
  }
  if (action === "resolveReport" || action === "escalateReport") {
    var newStatus = action === "resolveReport" ? "resolved" : "escalated";
    apiPatch("/reports/" + target.dataset.id, { status: newStatus }).then(function (r) {
      notify(r.message); return api("/reports");
    }).then(function (reps) { state.reports = reps; render(); });
  }
  if (action === "scan") notify("Text scan completed. No blocked terms found.");
  if (action === "exportQueue") notify("Queue export prepared in memory for this prototype.");
  if (action === "profileTab") { ui.currentView = target.dataset.value; window.location.hash = target.dataset.value; render(); }
  if (action === "updateUsername") {
    var row = target.closest(".settings-field-row");
    var input = row ? row.querySelector("input[name='username']") : null;
    var newUsername = input ? input.value.trim() : "";
    if (!newUsername) {
      notify("Username cannot be empty.");
      return;
    }
    apiPut("/profile", { username: newUsername }).then(function () {
      notify("Username updated successfully.");
      if (state.profile) state.profile.username = newUsername;
      render();
    }).catch(function (err) {
      console.error(err);
      if (err.message === "409") {
        notify("Username is already taken.");
      } else {
        notify("Failed to update username.");
      }
    });
  }
  if (action === "updateAvatar") {
    var row = target.closest(".settings-field-row");
    var input = row ? row.querySelector("input[name='avatar_url']") : null;
    var newAvatarUrl = input ? input.value.trim() : "";
    apiPut("/profile", { avatar_url: newAvatarUrl }).then(function () {
      notify("Avatar URL updated successfully.");
      if (state.profile) state.profile.avatar_url = newAvatarUrl;
      render();
    }).catch(function (err) {
      console.error(err);
      notify("Failed to update avatar.");
    });
  }
  if (action === "updateBio") {
    var panel = target.closest(".profile-settings-panel");
    var textarea = panel ? panel.querySelector("textarea[name='bio']") : null;
    var newBio = textarea ? textarea.value.trim() : "";
    apiPut("/profile", { bio: newBio }).then(function () {
      notify("Bio updated successfully.");
      if (state.profile) state.profile.bio = newBio;
      render();
    }).catch(function (err) {
      console.error(err);
      notify("Failed to update bio.");
    });
  }
  if (action === "deleteAccount") {
    if (!window.confirm("ARE YOU SURE you want to delete your account? This will permanently delete your profile, stories, comments, and all related data. This action is irreversible!")) return;
    apiDelete("/profile").then(function () {
      notify("Account deleted successfully.");
      handleSignOut();
    }).catch(function (err) {
      console.error(err);
      notify("Failed to delete account.");
    });
  }
  if (action === "reportContent") {
    var storyId = target.dataset.storyId;
    var chapterId = target.dataset.chapterId;
    var option = window.prompt("Type 'story' to report the story, or 'chapter' to report the current chapter:");
    if (!option) return;
    option = option.trim().toLowerCase();
    if (option !== "story" && option !== "chapter") {
      notify("Invalid option. Please type 'story' or 'chapter'.");
      return;
    }
    var reason = window.prompt("Please enter the reason for reporting this " + option + ":");
    if (!reason || !reason.trim()) {
      notify("Reporting requires a reason.");
      return;
    }
    var targetId = option === "story" ? storyId : chapterId;
    apiPost("/reports", {
      target_type: option,
      target_id: targetId,
      reason: reason.trim()
    }).then(function () {
      notify("Report submitted successfully.");
    }).catch(function (err) {
      console.error(err);
      notify("Failed to submit report. Please log in.");
    });
  }
  if (action === "reportComment") {
    var commentId = target.dataset.id;
    var reason = window.prompt("Please enter the reason for reporting this comment:");
    if (!reason || !reason.trim()) {
      notify("Reporting requires a reason.");
      return;
    }
    apiPost("/reports", {
      target_type: "comment",
      target_id: commentId,
      reason: reason.trim()
    }).then(function () {
      notify("Report submitted successfully.");
    }).catch(function (err) {
      console.error(err);
      notify("Failed to submit report. Please log in.");
    });
  }
  if (action === "carouselPrev") { moveCarousel(-1); startCarouselAuto(); }
  if (action === "carouselNext") { moveCarousel(1); startCarouselAuto(); }
  if (action === "carouselDot") goToSlide(Number(target.dataset.index));
}

function handleViewInput(e) {
  if (e.target.dataset.action === "fontSize") {
    ui.readerSize = Number(e.target.value);
    var c = view.querySelector(".reader-content"); if (c) c.style.setProperty("--reader-size", ui.readerSize + "px");
  }
}

function handleViewSubmit(e) {
  e.preventDefault();
  if (e.target.dataset.form === "storyForm") {
    var fd = new FormData(e.target);
    apiPost("/stories", { title: fd.get("title"), type: fd.get("type"), genre: fd.get("genre"), description: fd.get("description") }).then(function (resp) {
      ui.currentStoryId = resp.id; ui.currentChapterIndex = 0;
      return api("/stories");
    }).then(function (s) { state.stories = s; hydrateGenres(); notify("Story created."); closeStoryModal(); render(); });
  }
  if (e.target.dataset.form === "storySettingsForm") {
    var fd = new FormData(e.target);
    var storyId = fd.get("id");
    var tags = fd.get("tags").split(",").map(function (t) { return t.trim(); }).filter(Boolean);

    apiPut("/stories/" + storyId, {
      title: fd.get("title"),
      genre: fd.get("genre"),
      description: fd.get("description"),
      status: fd.get("status"),
      language: fd.get("language"),
      license: fd.get("license"),
      tags: tags
    }).then(function (resp) {
      notify("Story metadata updated.");
      closeStoryModal();
      return api("/stories");
    }).then(function (s) {
      state.stories = s;
      hydrateGenres();
      render();
    }).catch(function (err) {
      console.error(err);
      notify("Failed to update story metadata.");
    });
  }
  if (e.target.dataset.form === "commentForm") {
    var comment = new FormData(e.target).get("comment").trim(); if (!comment) return;
    var story = getCurrentStory();
    var chapter = getCurrentChapter(story);
    if (!chapter || !chapter.id) {
      notify("No chapter selected.");
      return;
    }
    apiPost("/chapters/" + story.id + "/" + chapter.sort_order + "/comments", { user: "You", text: comment }).then(function () {
      return api("/stories");
    }).then(function (s) { state.stories = s; notify("Comment posted."); render(); }).catch(function (err) {
      console.error("Failed to post comment:", err);
      notify("Failed to post comment. Please log in.");
    });
  }
}

// ── Data helpers ──
function filteredStories() {
  var query = searchInput.value.trim().toLowerCase();
  var genre = genreFilter.value;
  return state.stories.filter(function (s) {
    var hay = [s.title, s.author, s.genre, s.description].concat(s.tags).join(" ").toLowerCase();
    return (!query || hay.indexOf(query) !== -1) && (genre === "all" || s.genre === genre) && (ui.filterType === "all" || s.type === ui.filterType);
  });
}
function getCurrentStory() { return state.stories.find(function (s) { return s.id === ui.currentStoryId; }) || state.stories[0] || { id: "", title: "", author: "", type: "Web Novel", chapters: [], tags: [], description: "", cover: "", genre: "", language: "", license: "", status: "", followers: 0, views: 0, likes: 0, earnings: 0, progress: 0 }; }
function getCurrentStudioStory() {
  var userStories = state.stories.filter(function (s) {
    return state.user && s.author_id === state.user.id;
  });
  return userStories.find(function (s) { return s.id === ui.currentStoryId; }) || userStories[0] || { id: "", title: "", author: "", type: "Web Novel", chapters: [], tags: [], description: "", cover: "", genre: "", language: "", license: "", status: "", followers: 0, views: 0, likes: 0, earnings: 0, progress: 0 };
}
function getCurrentChapter(story) {
  if (!story.chapters || !story.chapters.length) return { title: "", status: "", access: "", words: 0, reads: 0, likes: 0, content: [], comments: [] };
  if (ui.currentChapterIndex >= story.chapters.length) ui.currentChapterIndex = 0;
  return story.chapters[ui.currentChapterIndex];
}
function moveChapter(step) { var s = getCurrentStory(); ui.currentChapterIndex = Math.max(0, Math.min(s.chapters.length - 1, ui.currentChapterIndex + step)); ui.currentComicPageIndex = 0; ui.currentTextPageIndex = 0; render(); }
function moveComicPage(step) { var pages = getCurrentChapter(getCurrentStory()).pages || []; ui.currentComicPageIndex = Math.max(0, Math.min(pages.length - 1, ui.currentComicPageIndex + step)); render(); }
function clampComicPage(pages) { if (!pages.length) ui.currentComicPageIndex = 0; else ui.currentComicPageIndex = Math.max(0, Math.min(pages.length - 1, ui.currentComicPageIndex)); }
function paginateText(content) {
  if (!content || !content.length) return [[{ text: "", align: "left" }]];
  var pages = [];
  var currentPage = [];
  var currentWordCount = 0;
  content.forEach(function (para) {
    var align = "left";
    var cleanText = para;
    if (para.startsWith("[center]")) {
      align = "center";
      cleanText = para.substring(8);
    } else if (para.startsWith("[right]")) {
      align = "right";
      cleanText = para.substring(7);
    } else if (para.startsWith("[left]")) {
      align = "left";
      cleanText = para.substring(6);
    }
    var words = cleanText.trim().split(/\s+/).filter(Boolean);
    var wordCount = words.length;
    if (wordCount === 0) {
      if (currentPage.length === 0) {
        currentPage.push({ text: "", align: align });
      }
      return;
    }
    if (currentWordCount + wordCount > 150 && currentWordCount > 0) {
      pages.push(currentPage);
      currentPage = [];
      currentWordCount = 0;
    }
    if (words.length > 150) {
      var remainingWords = words;
      while (remainingWords.length > 0) {
        var limit = 150 - currentWordCount;
        var chunk = remainingWords.slice(0, limit);
        currentPage.push({ text: chunk.join(" "), align: align });
        currentWordCount += chunk.length;
        remainingWords = remainingWords.slice(limit);
        if (currentWordCount >= 150 || remainingWords.length > 0) {
          pages.push(currentPage);
          currentPage = [];
          currentWordCount = 0;
        }
      }
    } else {
      currentPage.push({ text: cleanText, align: align });
      currentWordCount += wordCount;
    }
  });
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }
  if (pages.length === 0) {
    pages.push([{ text: "", align: "left" }]);
  }
  return pages;
}
function moveTextPage(step) {
  var s = getCurrentStory();
  var chapter = getCurrentChapter(s);
  var pages = paginateText(chapter.content || []);
  ui.currentTextPageIndex = Math.max(0, Math.min(pages.length - 1, ui.currentTextPageIndex + step));
  render();
}
function clampTextPage(pages) {
  if (!pages.length) ui.currentTextPageIndex = 0;
  else ui.currentTextPageIndex = Math.max(0, Math.min(pages.length - 1, ui.currentTextPageIndex));
}
function countPublished() { return state.stories.filter(function (s) { return s.status === "published"; }).length; }
function totalViews() { return state.stories.reduce(function (a, s) { return a + s.views; }, 0); }
function totalFollowers() { return state.stories.reduce(function (a, s) { return a + s.followers; }, 0); }
function countOpenReports() { return state.reports.filter(function (r) { return r.status === "open"; }).length; }

function storyGrid(stories, options) {
  var g = el("section", "story-grid");
  stories.forEach(function (s) {
    g.appendChild(storyCard(s, options));
  });
  return g;
}

function storyCard(story, options) {
  options = options || {};
  var tpl = document.getElementById("storyCardTemplate");
  var card = tpl.content.firstElementChild.cloneNode(true);
  var coverVal = story.cover;
  if (coverVal && !coverVal.startsWith("url") && !coverVal.startsWith("linear-gradient") && !coverVal.startsWith("radial-gradient")) {
    coverVal = "url('" + coverVal + "')";
  }
  card.querySelector(".cover-art").style.setProperty("--cover", coverVal);
  card.querySelector(".cover-badge").textContent = story.type;

  var openButton = card.querySelector(".cover-button");
  openButton.dataset.action = options.manage ? "manageStory" : "openStory";
  openButton.dataset.id = story.id;
  openButton.setAttribute("aria-label", (options.manage ? "Manage " : "Open ") + story.title);

  var metaContainer = card.querySelector(".story-meta");
  metaContainer.innerHTML = "";
  metaContainer.appendChild(document.createTextNode(story.genre + " / "));
  var authorLink = el("a", "story-author-link", story.author);
  authorLink.href = "#profile?username=" + encodeURIComponent(story.author);
  metaContainer.appendChild(authorLink);
  metaContainer.appendChild(document.createTextNode(" / " + formatNumber(story.views) + " reads"));
  card.querySelector("h2").textContent = story.title;
  card.querySelector("p").textContent = story.description;

  var tags = card.querySelector(".tag-row");
  story.tags.forEach(function (t) {
    tags.appendChild(el("span", "tag", t));
  });

  var actions = card.querySelector(".story-actions");
  if (options.manage) {
    actions.appendChild(iconButton("Manage", "btn success", { action: "manageStory", id: story.id }, "icon-gear"));
    actions.appendChild(iconButton("Read", "btn", { action: "openStory", id: story.id }, "icon-book"));
    actions.appendChild(iconButton("Delete", "btn danger", { action: "deleteStory", id: story.id }, "icon-trash", !canDeleteStory(story)));
  } else {
    actions.appendChild(button("Read", "btn primary", { action: "openStory", id: story.id }));
    actions.appendChild(button(state.library.indexOf(story.id) === -1 ? "Follow" : "Following", "btn", { action: "follow", id: story.id }));
    actions.appendChild(button("Tip", "btn", { action: "tip", id: story.id }));
  }

  return card;
}

function canDeleteStory(story) {
  if (state.role === "admin") return true;
  if (state.role === "author") {
    if (story.author === "You") return true;
    if (state.user && story.author_id === state.user.id) return true;
    var currentUsername = state.profile ? state.profile.username : "";
    return !!(currentUsername && story.author === currentUsername);
  }
  return false;
}

function canModerateRole() {
  return ["moderator", "admin"].indexOf(state.role) !== -1;
}

function notify(message) { alerts.innerHTML = ""; alerts.appendChild(el("div", "toast", message)); clearTimeout(notify.timer); notify.timer = setTimeout(function () { alerts.innerHTML = ""; }, 2800); }
