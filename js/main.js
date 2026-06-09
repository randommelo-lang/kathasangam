import { state, ui } from "./state.js?v=comic-fit-20260609-v27";
import { api, apiDelete, apiPatch, apiPost, apiPut, adminEmail, loadSupabaseConfig, moderatorEmails, supabaseClient } from "./api.js?v=comic-fit-20260609-v27";
import { getRoute, hydrateGenres as hydrateGenresModule, render as renderModule } from "./router.js?v=comic-fit-20260609-v27";
import { renderEditor as renderEditorModule, saveChapterFromEditor as saveChapterFromEditorModule } from "./editor.js?v=comic-fit-20260609-v27";
import { analyticsMetricBox, button, calculateStars, el, field, form, formatDate, formatNumber, generateChartData, iconButton, input, list, metric, progress, quickActionTile, segmentButton, select, showConfirm, submitButton, svgEl, textarea, unique } from "./components.js?v=comic-fit-20260609-v27";

// Import view modules
import { renderDiscover } from "./views/discover.js?v=comic-fit-20260609-v27";
import { renderLibrary } from "./views/library.js?v=comic-fit-20260609-v27";
import { renderReader } from "./views/reader.js?v=comic-fit-20260609-v27";
import { renderStudio } from "./views/studio.js?v=comic-fit-20260609-v27";
import { renderModeration } from "./views/moderation.js?v=comic-fit-20260609-v27";
import { renderStoryDetails } from "./views/story.js?v=comic-fit-20260609-v27";
import { renderMessages } from "./views/messages.js?v=comic-fit-20260609-v27";
import { canDeleteStory, storyCard, storyGrid } from "./views/shared.js?v=comic-fit-20260609-v27";

// Import controller modules
import { handleDiscoverClick } from "./controllers/discoverController.js?v=comic-fit-20260609-v27";
import { handleLibraryClick } from "./controllers/libraryController.js?v=comic-fit-20260609-v27";
import { handleReaderClick, handleReaderInput, handleReaderSubmit } from "./controllers/readerController.js?v=comic-fit-20260609-v27";
import { handleStudioClick, handleStudioSubmit } from "./controllers/studioController.js?v=comic-fit-20260609-v27";
import { handleModerationClick } from "./controllers/moderationController.js?v=comic-fit-20260609-v27";
import { handleProfileClick } from "./controllers/profileController.js?v=comic-fit-20260609-v27";
import { handleCommunityClick, handleCommunitySubmit } from "./controllers/communityController.js?v=comic-fit-20260609-v27";

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
window.showConfirm = showConfirm;


var ctx = {
  state: state,
  ui: ui,
  view: view,
  pageTitle: pageTitle,
  genreFilter: genreFilter,
  api: api,
  apiDelete: apiDelete,
  apiPatch: apiPatch,
  apiPost: apiPost,
  apiPut: apiPut,
  notify: notify,
  render: render,
  renderDiscover: renderDiscover,
  renderLibrary: renderLibrary,
  renderReader: renderReader,
  renderStudio: renderStudio,
  renderModeration: renderModeration,
  renderStoryDetails: renderStoryDetails,
  renderMessages: renderMessages,
  renderEditor: renderEditor,
  renderProfileSettings: renderProfileSettings,
  getCurrentStudioStory: getCurrentStudioStory,
  canModerateRole: canModerateRole,
  unique: unique,
  
  // Helpers
  getCurrentStory: getCurrentStory,
  getCurrentChapter: getCurrentChapter,
  getStoryReadingProgress: getStoryReadingProgress,
  calculateStoryProgressPercent: calculateStoryProgressPercent,
  calculateActiveReaderProgress: calculateActiveReaderProgress,
  paginateText: paginateText,
  filteredStories: filteredStories,
  canDeleteStory: canDeleteStory,
  openStoryModal: openStoryModal,
  openStorySettingsModal: openStorySettingsModal,
  closeStoryModal: closeStoryModal,
  openAuthModal: openAuthModal,
  closeAuthModal: closeAuthModal,
  syncCurrentProgress: syncCurrentProgress,
  updateHeroNotificationUI: updateHeroNotificationUI,
  autoSaveReaderPreferences: autoSaveReaderPreferences,
  moveChapter: moveChapter,
  moveComicPage: moveComicPage,
  moveTextPage: moveTextPage,
  clampComicPage: clampComicPage,
  clampTextPage: clampTextPage,
  toggleFullscreen: toggleFullscreen,
  handleSignOut: handleSignOut,
  hydrateGenres: hydrateGenres
};

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

    if (result.data.user && !result.data.session) {
      showAuthSuccess("Account created! Check your email to confirm your account.");
      setAuthLoading(signupForm, false);
      signupForm.reset();
    } else {
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
    loadPreferences();
  } catch (e) {
    console.error("[PROFILE] Failed to load profile:", e.message);
    state.profile = null;
    state.role = "reader";
    loadPreferences();
  }
}

function loadPreferences() {
  if (state.user && state.profile && state.profile.preferences) {
    var p = state.profile.preferences;
    ui.readerTheme = p.reader_theme || "light";
    ui.readerSize = p.reader_size || 19;
    ui.readerMode = p.reader_mode || "scroll";
  } else {
    try {
      var localPref = JSON.parse(localStorage.getItem("kathasangam_anon_preferences") || "{}");
      ui.readerTheme = localPref.reader_theme || "light";
      ui.readerSize = localPref.reader_size || 19;
      ui.readerMode = localPref.reader_mode || "scroll";
    } catch (e) {
      console.warn("Failed to load local preferences:", e);
    }
  }
}

var autoSavePrefTimer = null;
function autoSaveReaderPreferences() {
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

function onAuthStateChange(event, session) {
  console.log("[AUTH] onAuthStateChange event:", event);
  if (session && session.user) {
    console.log("[AUTH] User logged in:", session.user.email);
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
    state.progress = [];
    state.bookmarks = null;
    state.bookmarkIds = null;
    state.readingLists = null;
    loadPreferences();
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
    authArea.appendChild(menu);
  } else if (state.user) {
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

function updateHeroNotificationUI() {
  var area = document.getElementById("heroNotificationArea");
  if (!area) return;
  area.innerHTML = "";

  if (state.user && state.profile) {
    var menu = el("div");
    menu.className = "notification-menu";
    menu.style.position = "relative";
    menu.style.display = "inline-block";

    var trigger = el("button", {
      type: "button",
      title: "View Notifications",
      style: "display: inline-flex; align-items: center; justify-content: center; position: relative; color: var(--text); padding: 8px; cursor: pointer; background: none; border: none; border-radius: 8px; transition: background 0.2s ease;"
    });
    trigger.className = "hero-bell-btn";

    var bellIcon = el("span", "icon icon-bell");
    bellIcon.style.width = "20px";
    bellIcon.style.height = "20px";
    trigger.appendChild(bellIcon);

    if (state.notifications && state.notifications.length > 0) {
      var badge = el("span", "hero-bell-badge");
      trigger.appendChild(badge);
    }

    var dropdown = el("div", "notification-dropdown");
    dropdown.hidden = true;

    var headerChildren = [document.createTextNode("Notifications")];
    if (state.notifications && state.notifications.length > 0) {
      var clearAllBtn = el("button", {
        style: "background: none; border: none; color: var(--accent); font-size: 0.8rem; cursor: pointer; padding: 0; margin-left: auto;"
      }, "Clear All");
      clearAllBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        apiDelete("/notifications").then(function () {
          state.notifications = [];
          updateHeroNotificationUI();
          if (ui.currentView === "library") {
            render();
          }
        }).catch(function (err) {
          console.error("Failed to clear notifications:", err);
        });
      });
      headerChildren.push(clearAllBtn);
    }

    dropdown.appendChild(el("div", {
      class: "notification-header",
      style: "display: flex; align-items: center;"
    }, headerChildren));

    if (!state.notifications || state.notifications.length === 0) {
      dropdown.appendChild(el("div", "notification-empty", "No new notifications"));
    } else {
      var notifList = el("ul", { style: "list-style: none; padding: 0; margin: 0;" });
      state.notifications.forEach(function (n) {
        var liAttrs = { class: "notification-item" };
        var itemContent = [
          el("div", { style: "display: flex; align-items: start; gap: 10px;" }, [
            el("span", { class: "icon icon-bell", style: "color: var(--accent); flex-shrink: 0; margin-top: 2px;" }),
            el("span", null, n.message || "")
          ])
        ];

        var li = el("li", liAttrs, itemContent);

        li.addEventListener("click", function (e) {
          e.stopPropagation();
          closeNotificationMenu();
          
          apiDelete("/notifications/" + n.id).then(function () {
            state.notifications = state.notifications.filter(function (notif) { return notif.id !== n.id; });
            updateHeroNotificationUI();
            if (ui.currentView === "library") {
              render();
            }
          }).catch(function (err) {
            console.error("Failed to delete notification:", err);
          });

          if (n.story_id && n.chapter_sort_order !== null && n.chapter_sort_order !== undefined) {
            var story = state.stories.find(function (s) { return s.id === n.story_id; });
            if (story && story.chapters) {
              var foundIdx = story.chapters.findIndex(function (c) { return c.sort_order === n.chapter_sort_order; });
              if (foundIdx !== -1) {
                ui.currentStoryId = n.story_id;
                ui.currentChapterIndex = foundIdx;
                ui.currentComicPageIndex = 0;
                ui.currentTextPageIndex = 0;
                window.location.hash = "reader";
                render();
                syncCurrentProgress();
              } else {
                notify("Could not find the specific chapter in this story.");
              }
            } else {
              notify("Story not found.");
            }
          } else {
            window.location.hash = "library";
          }
        });

        notifList.appendChild(li);
      });
      dropdown.appendChild(notifList);
    }

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var isHidden = dropdown.hidden;
      closeAccountMenu();
      dropdown.hidden = !isHidden;
    });

    menu.appendChild(trigger);
    menu.appendChild(dropdown);
    area.appendChild(menu);
  }
}

function closeNotificationMenu() {
  var dropdown = document.querySelector(".notification-dropdown");
  if (dropdown) dropdown.hidden = true;
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

function toggleAccountMenu() {
  closeNotificationMenu();
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

function startNotificationPolling() {
  setInterval(function () {
    if (state.user || state.accessToken) {
      api("/notifications").then(function (notifs) {
        var hasChanges = false;
        if (!state.notifications || notifs.length !== state.notifications.length) {
          hasChanges = true;
        } else {
          for (var i = 0; i < notifs.length; i++) {
            if (notifs[i].id !== state.notifications[i].id) {
              hasChanges = true;
              break;
            }
          }
        }
        
        if (hasChanges) {
          state.notifications = notifs;
          updateHeroNotificationUI();
          if (ui.currentView === "library") {
            render();
          }
        }
      }).catch(function (err) {
        console.warn("Failed to poll notifications:", err);
      });
    }
  }, 15000);
}

// ── Bootstrap ──
async function bootstrap() {
  bindGlobalEvents();
  bindAuthEvents();
  loadPreferences();
  await loadSupabaseConfig();
  initAuth();
  loadAll().then(function () {
    hydrateGenres();
    render();
    startNotificationPolling();
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

  supabaseClient.auth.onAuthStateChange(function (event, session) {
    console.log("[AUTH] State change event:", event, "Session:", !!session);
    onAuthStateChange(event, session);
  });

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
    api("/stats").catch(function () { return { published: 0, views: 0, followers: 0, open_reports: 0 }; }),
    isAuthenticated ? api("/progress").catch(function () { return []; }) : Promise.resolve([])
  ]).then(function (results) {
    state.stories = results[0];
    state.library = results[1];
    state.reports = results[2];
    state.notifications = results[3];
    state.stats = results[4];
    state.progress = results[5] || [];
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

  authModal.addEventListener("click", function (e) {
    if (e.target.closest("#authModalClose")) {
      closeAuthModal();
      return;
    }
    var tab = e.target.closest("[data-auth-tab]");
    if (tab) {
      switchAuthTab(tab.dataset.authTab);
      return;
    }
    if (e.target === authModal) {
      closeAuthModal();
    }
  });

  var storyModal = document.getElementById("storyModal");
  if (storyModal) {
    storyModal.addEventListener("click", function (e) {
      if (e.target.closest("#storyModalClose") || e.target === storyModal) {
        closeStoryModal();
      }
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !authModal.hidden) closeAuthModal();
    if (e.key === "Escape" && storyModal && !storyModal.hidden) closeStoryModal();
    if (e.key === "Escape") {
      closeAccountMenu();
      closeNotificationMenu();
    }

    if (window.location.hash === "#reader" || window.location.hash === "reader") {
      var activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.contentEditable === "true"
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

  document.addEventListener("click", function (e) {
    if (!authArea.contains(e.target)) closeAccountMenu();
    var notifArea = document.getElementById("heroNotificationArea");
    if (notifArea && !notifArea.contains(e.target)) closeNotificationMenu();
  });

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

    var followBtn = null;
    var messageBtn = null;

    if (state.user && cached.id !== state.user.id) {
      var isFollowingUser = cached.is_following;
      followBtn = el("button", {
        class: "btn" + (isFollowingUser ? " active" : " primary"),
        style: "display: flex; align-items: center; gap: 6px;"
      }, isFollowingUser ? "Following" : "Follow");

      followBtn.addEventListener("click", function () {
        apiPost("/follow/user/" + cached.id)
          .then(function (res) {
            cached.is_following = res.followed;
            if (res.followed) {
              cached.followers_count = (cached.followers_count || 0) + 1;
              notify("Followed " + username);
            } else {
              cached.followers_count = Math.max(0, (cached.followers_count || 0) - 1);
              notify("Unfollowed " + username);
            }
            render();
          })
          .catch(function (err) {
            console.error("Follow failed:", err);
            notify("Error following user: " + (err.message || err));
          });
      });

      messageBtn = el("button", {
        class: "btn secondary",
        style: "display: flex; align-items: center; gap: 6px;"
      }, [
        el("span", "icon icon-pencil"),
        "Message"
      ]);
      messageBtn.addEventListener("click", function () {
        ui.activeConversationUserId = cached.id;
        ui.activeConversationUser = cached;
        window.location.hash = "messages";
      });
    }

    var headerCardChildren = [
      avatarEl,
      el("div", "profile-header-info", [
        el("h2", "profile-display-name", username),
        el("span", "auth-role-badge profile-role-badge " + role, role.charAt(0).toUpperCase() + role.slice(1)),
        el("div", { class: "profile-header-social-stats", style: "margin-top: 8px; font-size: 0.85rem; color: var(--text-muted);" }, [
          el("span", null, formatNumber(cached.followers_count || 0) + " Followers"),
          " · ",
          el("span", null, formatNumber(cached.following_count || 0) + " Following")
        ])
      ])
    ];

    if (followBtn || messageBtn) {
      var actionsContainer = el("div", {
        style: "margin-left: auto; display: flex; gap: 8px; align-items: center;"
      });
      if (followBtn) actionsContainer.appendChild(followBtn);
      if (messageBtn) actionsContainer.appendChild(messageBtn);
      headerCardChildren.push(actionsContainer);
    }

    var headerCard = el("section", "profile-header-card", headerCardChildren);
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
      el("div", "profile-stat", [el("strong", null, formatNumber(authorStories.reduce(function (sum, s) { return sum + (s.views || 0); }, 0))), el("span", null, "Total Reads")])
    ]);
    view.appendChild(statsRow);

    if (authorStories.length) {
      view.appendChild(el("h3", "profile-section-title", "Stories by " + username));
      var grid = el("section", "story-grid");
      authorStories.forEach(function (story) {
        grid.appendChild(storyCard(ctx, story, { manage: false }));
      });
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
      el("span", "auth-role-badge profile-role-badge " + role, role.charAt(0).toUpperCase() + role.slice(1)),
      el("div", { class: "profile-header-social-stats", style: "margin-top: 8px; font-size: 0.85rem; color: var(--text-muted);" }, [
        el("span", null, formatNumber(state.profile.followers_count || 0) + " Followers"),
        " · ",
        el("span", null, formatNumber(state.profile.following_count || 0) + " Following")
      ])
    ])
  ]);
  view.appendChild(headerCard);

  var tabs = el("div", "profile-tabs", [
    button("Profile", isSettings ? "profile-tab" : "profile-tab active", { action: "profileTab", value: "profile" }),
    button("Settings", isSettings ? "profile-tab active" : "profile-tab", { action: "profileTab", value: "settings" })
  ]);
  view.appendChild(tabs);

  if (!isSettings) {
    var userStories = state.stories.filter(function (s) {
      return state.user && s.author_id === state.user.id;
    });

    var statsRow = el("div", "profile-stats-row", [
      el("div", "profile-stat", [el("strong", null, String(userStories.length)), el("span", null, "Stories")]),
      el("div", "profile-stat", [el("strong", null, formatNumber(userStories.reduce(function (sum, s) { return sum + (s.views || 0); }, 0))), el("span", null, "Total Reads")])
    ]);
    view.appendChild(statsRow);

    if (userStories.length) {
      view.appendChild(el("h3", "profile-section-title", "Your Stories"));
      var grid = el("section", "story-grid");
      userStories.forEach(function (story) {
        grid.appendChild(storyCard(ctx, story, { manage: true }));
      });
      view.appendChild(grid);
    }
  } else {
    var defaultTheme = (state.profile && state.profile.preferences && state.profile.preferences.reader_theme) || "light";
    var defaultMode = (state.profile && state.profile.preferences && state.profile.preferences.reader_mode) || "scroll";
    var defaultSize = (state.profile && state.profile.preferences && state.profile.preferences.reader_size) || 19;
    var defaultEmail = (state.profile && state.profile.preferences && state.profile.preferences.email_notifications !== undefined) ? state.profile.preferences.email_notifications : true;
    var defaultInApp = (state.profile && state.profile.preferences && state.profile.preferences.in_app_notifications !== undefined) ? state.profile.preferences.in_app_notifications : true;

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

      el("div", "settings-group", [
        el("h4", { style: "display: flex; align-items: center; gap: 8px; margin-bottom: 16px;" }, [
          el("span", "icon icon-bell"),
          document.createTextNode("Reading & Notifications")
        ]),
        el("div", "settings-field-row-wrap", [
          el("div", "settings-field-col", [
            el("label", "settings-label", "Default Theme"),
            select("reader_theme", [["light", "Light"], ["dark", "Dark"]], defaultTheme)
          ]),
          el("div", "settings-field-col", [
            el("label", "settings-label", "Default Reading Mode"),
            select("reader_mode", [["scroll", "Scroll"], ["pages", "Pages / Page Flip"]], defaultMode)
          ]),
          el("div", "settings-field-col", [
            el("label", "settings-label", "Default Font Size (px)"),
            input("number", defaultSize, { name: "reader_size", min: "16", max: "26" })
          ])
        ]),
        el("div", "settings-checkboxes", [
          el("label", "checkbox-label", [
            input("checkbox", null, Object.assign({ name: "email_notifications" }, defaultEmail ? { checked: "checked" } : {})),
            document.createTextNode(" Receive email notifications for new chapters")
          ]),
          el("label", "checkbox-label", [
            input("checkbox", null, Object.assign({ name: "in_app_notifications" }, defaultInApp ? { checked: "checked" } : {})),
            document.createTextNode(" Receive in-app notifications")
          ])
        ]),
        el("div", "settings-field-row", [
          button("Update Preferences", "btn primary btn-sm", { action: "updatePreferences" })
        ])
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

function render() {
  updateHeroNotificationUI();
  renderModule(ctx);
}

// ── Forms ──
function storyForm() {
  return form("storyForm", [
    field("Title", input("text", "", { name: "title", placeholder: "New series title", required: "true" })),
    field("Type", select("type", [["Web Novel", "Web Novel"], ["Chitrānk", "Chitrānk"]])),
    field("Genre (comma separated)", input("text", "", { name: "genre", placeholder: "e.g. Fantasy, Romance", required: "true" })),
    field("Synopsis", textarea("description", "A new serialized story begins here.")),
    submitButton("Create", "btn primary orange-glow-btn")
  ]);
}

function storySettingsForm(story) {
  return form("storySettingsForm", [
    (function () {
      var hidden = el("input");
      hidden.type = "hidden";
      hidden.name = "id";
      hidden.value = story.id;
      return hidden;
    })(),
    field("Title", input("text", story.title, { name: "title", placeholder: "Series title", required: "true" })),
    field("Genre (comma separated)", input("text", story.genre, { name: "genre", placeholder: "e.g. Fantasy, Romance", required: "true" })),
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
    field("Synopsis", textarea("description", story.description || "")),
    submitButton("Save Changes", "btn primary orange-glow-btn")
  ]);
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
  var target = e.target.closest("[data-action]");
  if (!target) return;
  var action = target.dataset.action;

  if (action === "go") {
    window.location.hash = target.dataset.view;
    return;
  }

  // Delegate actions to specific controllers
  if (handleDiscoverClick(ctx, action, target, e)) return;
  if (handleLibraryClick(ctx, action, target, e)) return;
  if (handleReaderClick(ctx, action, target, e)) return;
  if (handleStudioClick(ctx, action, target, e)) return;
  if (handleModerationClick(ctx, action, target, e)) return;
  if (handleProfileClick(ctx, action, target, e)) return;
  if (handleCommunityClick(ctx, action, target, e)) return;
}

function handleViewInput(e) {
  var action = e.target.dataset.action;
  if (!action) return;
  if (handleReaderInput(ctx, action, e.target, e)) return;
}

function handleViewSubmit(e) {
  e.preventDefault();
  var formName = e.target.dataset.form;
  if (!formName) return;
  if (handleReaderSubmit(ctx, formName, e.target, e)) return;
  if (handleStudioSubmit(ctx, formName, e.target, e)) return;
  if (handleCommunitySubmit(ctx, formName, e.target, e)) return;
}

function renderEditor() { renderEditorModule(ctx); }

function filteredStories() {
  var query = searchInput.value.trim().toLowerCase();
  var genre = genreFilter.value;
  var results = state.stories.filter(function (s) {
    var hay = [s.title, s.author, s.genre, s.description].join(" ").toLowerCase();
    var matchesSearch = !query || hay.indexOf(query) !== -1;
    var matchesGenre = genre === "all" || (s.genre && s.genre.split(",").map(function (g) { return g.trim().toLowerCase(); }).indexOf(genre.toLowerCase()) !== -1);
    var matchesType = ui.filterType === "all" || s.type === ui.filterType;
    var matchesStatus = !ui.filterStatus || ui.filterStatus === "all" || (s.status && s.status.toLowerCase() === ui.filterStatus.toLowerCase());
    var matchesLanguage = !ui.filterLanguage || ui.filterLanguage === "all" || (s.language && s.language.toLowerCase() === ui.filterLanguage.toLowerCase());
    return matchesSearch && matchesGenre && matchesType && matchesStatus && matchesLanguage;
  });

  if (ui.filterSort === "newest") {
    results.sort(function (a, b) {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  } else if (ui.filterSort === "reads") {
    results.sort(function (a, b) {
      return (b.views || 0) - (a.views || 0);
    });
  } else if (ui.filterSort === "likes") {
    results.sort(function (a, b) {
      return (b.likes || 0) - (a.likes || 0);
    });
  } else if (ui.filterSort === "rating") {
    results.sort(function (a, b) {
      return parseFloat(calculateStars(b)) - parseFloat(calculateStars(a));
    });
  }

  return results;
}

function getCurrentStory() {
  return state.stories.find(function (s) { return s.id === ui.currentStoryId; }) || state.stories[0] || { id: "", title: "", author: "", type: "Web Novel", chapters: [], tags: [], description: "", cover: "", genre: "", language: "", license: "", status: "", followers: 0, views: 0, likes: 0, earnings: 0, progress: 0 };
}

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

function moveChapter(step) {
  var s = getCurrentStory();
  ui.currentChapterIndex = Math.max(0, Math.min(s.chapters.length - 1, ui.currentChapterIndex + step));
  ui.currentComicPageIndex = 0;
  ui.currentTextPageIndex = 0;
  render();
  syncCurrentProgress();
}

function moveComicPage(step) {
  var pages = getCurrentChapter(getCurrentStory()).pages || [];
  var actualStep = step;
  if (ui.readerMode === "pages" && Math.abs(step) === 1) {
    actualStep = step * 2;
  }
  ui.currentComicPageIndex = Math.max(0, Math.min(pages.length - 1, ui.currentComicPageIndex + actualStep));
  if (ui.readerMode === "pages" && ui.currentComicPageIndex % 2 !== 0) {
    ui.currentComicPageIndex = Math.max(0, ui.currentComicPageIndex - 1);
  }
  render();
  syncCurrentProgress();
}

function clampComicPage(pages) {
  if (!pages.length) ui.currentComicPageIndex = 0;
  else {
    ui.currentComicPageIndex = Math.max(0, Math.min(pages.length - 1, ui.currentComicPageIndex));
    if (ui.readerMode === "pages" && ui.currentComicPageIndex % 2 !== 0) {
      ui.currentComicPageIndex = Math.max(0, ui.currentComicPageIndex - 1);
    }
  }
}

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
  syncCurrentProgress();
}

function clampTextPage(pages) {
  if (!pages.length) ui.currentTextPageIndex = 0;
  else ui.currentTextPageIndex = Math.max(0, Math.min(pages.length - 1, ui.currentTextPageIndex));
}

function canModerateRole() {
  return ["moderator", "admin"].indexOf(state.role) !== -1;
}

// ── Reading Progress Helpers ──
function getStoryReadingProgress(storyId) {
  var prog = null;
  if (state.user && state.progress) {
    prog = state.progress.find(function (p) { return p.story_id === storyId; });
  } else {
    try {
      var anonProg = JSON.parse(localStorage.getItem("kathasangam_anon_progress") || "{}");
      prog = anonProg[storyId];
    } catch (e) {}
  }
  return prog;
}

function saveReadingProgress(storyId, chapterId, pageIndex) {
  if (state.user) {
    apiPost("/progress", {
      story_id: storyId,
      chapter_id: chapterId,
      page_index: pageIndex
    }).then(function () {
      if (!state.progress) state.progress = [];
      var existing = state.progress.find(function (p) { return p.story_id === storyId; });
      if (existing) {
        existing.chapter_id = chapterId;
        existing.page_index = pageIndex;
        existing.updated_at = new Date().toISOString();
      } else {
        state.progress.push({
          story_id: storyId,
          chapter_id: chapterId,
          page_index: pageIndex,
          updated_at: new Date().toISOString()
        });
      }
    }).catch(function (err) {
      console.warn("Failed to update remote progress:", err);
    });
  } else {
    try {
      var anonProg = JSON.parse(localStorage.getItem("kathasangam_anon_progress") || "{}");
      anonProg[storyId] = {
        chapter_id: chapterId,
        page_index: pageIndex,
        updated_at: new Date().toISOString()
      };
      localStorage.setItem("kathasangam_anon_progress", JSON.stringify(anonProg));
    } catch (e) {
      console.warn("Failed to save anonymous progress:", e);
    }
  }
}

function syncCurrentProgress() {
  var story = getCurrentStory();
  if (!story || !story.id) return;
  var chapter = getCurrentChapter(story);
  if (!chapter || !chapter.id) return;

  var pageIndex = 0;
  if (story.type === "Chitrānk") {
    if (ui.readerMode === "pages") {
      pageIndex = ui.currentComicPageIndex;
    }
  } else {
    if (ui.readerMode === "pages") {
      pageIndex = ui.currentTextPageIndex;
    }
  }
  saveReadingProgress(story.id, chapter.id, pageIndex);
}

function calculateStoryProgressPercent(story) {
  if (!story.chapters || !story.chapters.length) return 0;
  var progressData = getStoryReadingProgress(story.id);
  if (!progressData) return 0;
  var chIdx = story.chapters.findIndex(function (c) { return c.id === progressData.chapter_id; });
  if (chIdx === -1) return 0;

  var totalChapters = story.chapters.length;
  var pageProgress = 0;
  var chapter = story.chapters[chIdx];
  if (chapter) {
    var pageIdx = progressData.page_index || 0;
    if (story.type === "Chitrānk" && chapter.pages && chapter.pages.length) {
      pageProgress = (pageIdx + 1) / chapter.pages.length;
    } else if (chapter.content && chapter.content.length) {
      var pages = paginateText(chapter.content);
      if (pages.length) {
        pageProgress = (pageIdx + 1) / pages.length;
      }
    } else {
      pageProgress = 1.0;
    }
  } else {
    pageProgress = 1.0;
  }

  var val = ((chIdx + pageProgress) / totalChapters) * 100;
  return Math.round(Math.max(0, Math.min(100, val)));
}

function calculateActiveReaderProgress(story) {
  if (!story.chapters || !story.chapters.length) return 0;
  var totalChapters = story.chapters.length;
  var currentChapterIndex = ui.currentChapterIndex;

  var pageProgress = 1.0;
  var chapter = story.chapters[currentChapterIndex];
  if (chapter && ui.readerMode === "pages") {
    if (story.type === "Chitrānk" && chapter.pages && chapter.pages.length) {
      pageProgress = (ui.currentComicPageIndex + 1) / chapter.pages.length;
    } else if (chapter.content && chapter.content.length) {
      var pages = paginateText(chapter.content);
      if (pages.length) {
        pageProgress = (ui.currentTextPageIndex + 1) / pages.length;
      }
    }
  }

  var val = ((currentChapterIndex + pageProgress) / totalChapters) * 100;
  return Math.round(Math.max(0, Math.min(100, val)));
}

function notify(message) {
  alerts.innerHTML = "";
  alerts.appendChild(el("div", "toast", message));
  clearTimeout(notify.timer);
  notify.timer = setTimeout(function () { alerts.innerHTML = ""; }, 2800);
}
