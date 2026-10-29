// Immediate Theme Initialization (prevents flash, CSP compliant)
(function () {
  var savedTheme = localStorage.getItem("kathasangam_theme") || "dark";
  document.documentElement.className = savedTheme;
})();

import { state, ui } from "./state.js";
import { log } from "./logger.js";
import { api, apiDelete, apiPatch, apiPost, apiPut, uploadFileWithProgress, loadSupabaseConfig, supabaseClient, getSupabaseClient } from "./api.js";
import { getRoute, hydrateGenres as hydrateGenresModule, render as renderModule } from "./router.js";
import { renderEditor as renderEditorModule, saveChapterFromEditor as saveChapterFromEditorModule } from "./editor.js";
import { el, button, select, input, textarea, showConfirm, calculateStars, setFormFeedback, setButtonLoading } from "./components.js";
import { getMetrics, isLowBandwidth, markRouteStart, markRouteEnd, trackInteraction } from "./perf.js";
import { recordDailyVisit, recordStoryPublished, recordChapterRead, recordStoryCompleted, recordLikeGiven } from "./achievements.js";

// Import view modules
import { renderDiscover } from "./views/discover.js";
import { renderLibrary, renderLibraryNotifications } from "./views/library.js";
import { renderReader } from "./views/reader.js";
import { renderStudio } from "./views/studio.js";
import { renderModeration } from "./views/moderation.js";
import { renderStoryDetails } from "./views/story.js";
import { renderWallet } from "./views/wallet.js";
import { renderAbout } from "./views/about.js";
import { openSupportModal } from "./components/supportModal.js";
import { canDeleteStory, storyCard } from "./views/shared.js";

// Import controller modules
import { handleDiscoverClick } from "./controllers/discoverController.js";
import { handleLibraryClick } from "./controllers/libraryController.js";
import { handleReaderClick, handleReaderInput, handleReaderSubmit, initReaderController, updateReaderScrollProgress, openReportModal } from "./controllers/readerController.js";
import { handleStudioClick, handleStudioSubmit, handleStudioInput } from "./controllers/studioController.js";
import { handleModerationClick, handleModerationInput } from "./controllers/moderationController.js";
import { handleProfileClick } from "./controllers/profileController.js";
import { handleCommunityClick, handleCommunitySubmit } from "./controllers/communityController.js";

// Split Cleanups
import {
  openAuthModal,
  closeAuthModal,
  handleLogin,
  handleSignup,
  handleSignOut,
  changeUserRole,
  fetchProfile,
  getAuthGeneration,
  loadPreferences,
  autoSaveReaderPreferences,
  initAuthModule,
  closeAccountMenu,
  toggleAccountMenu,
  updateAuthUI,
  switchAuthTab
} from "./auth.js";

import {
  updateHeroNotificationUI,
  closeNotificationMenu,
  startNotificationPolling,
  initNotificationsModule
} from "./notifications.js";

import {
  renderProfileSettings
} from "./views/profile.js";

import {
  openStoryModal,
  openStorySettingsModal,
  closeStoryModal,
  handleStoryClick,
  handleStoryInput,
  initStoryController
} from "./controllers/storyController.js";

import {
  getStoryReadingProgress,
  saveReadingProgress,
  syncCurrentProgress,
  calculateStoryProgressPercent,
  calculateActiveReaderProgress,
  initReadingProgress
} from "./readingProgress.js";

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
window.state = state;
window.ui = ui;
window.updateHeroNotificationUI = updateHeroNotificationUI;
window.render = render;
window.updateAuthUI = updateAuthUI;
window.setFormFeedback = setFormFeedback;
window.setButtonLoading = setButtonLoading;
window.handleLibraryClick = handleLibraryClick;
window.handleProfileClick = handleProfileClick;
window.openReportModal = openReportModal;
window.apiPost = apiPost;
window.api = api;
window.perfMetrics = {
  getMetrics: getMetrics,
  isLowBandwidth: isLowBandwidth,
  markRouteStart: markRouteStart,
  markRouteEnd: markRouteEnd,
  trackInteraction: trackInteraction
};

var ctx = {
  state: state,
  ui: ui,
  perf: window.perfMetrics,
  view: view,
  pageTitle: pageTitle,
  genreFilter: genreFilter,
  api: api,
  apiDelete: apiDelete,
  apiPatch: apiPatch,
  apiPost: apiPost,
  apiPut: apiPut,
  uploadFileWithProgress: uploadFileWithProgress,
  notify: notify,
  openReportModal: openReportModal,
  setFormFeedback: setFormFeedback,
  setButtonLoading: setButtonLoading,
  render: render,
  renderDiscover: renderDiscover,
  renderLibrary: renderLibrary,
  renderLibraryNotifications: function () { renderLibraryNotifications(ctx); },
  renderReader: renderReader,
  renderStudio: renderStudio,
  renderModeration: renderModeration,
  renderStoryDetails: renderStoryDetails,
  renderWallet: function () { renderWallet(ctx); },
  renderAbout: function () { renderAbout(ctx); },
  renderEditor: renderEditor,
  renderProfileSettings: renderProfileSettings,
  getCurrentStudioStory: getCurrentStudioStory,
  canModerateRole: canModerateRole,
  loadAll: loadAll,
  hydrateGenres: hydrateGenres,
  
  // Helpers
  getCurrentStory: getCurrentStory,
  getCurrentChapter: getCurrentChapter,
  getStoryReadingProgress: getStoryReadingProgress,
  calculateStoryProgressPercent: calculateStoryProgressPercent,
  calculateActiveReaderProgress: calculateActiveReaderProgress,
  paginateText: paginateText,
  filteredStories: filteredStories,
  loadDiscoveryPage: loadDiscoveryPage,
  canDeleteStory: function (story) { return canDeleteStory(ctx, story); },
  openStoryModal: openStoryModal,
  openStorySettingsModal: openStorySettingsModal,
  closeStoryModal: closeStoryModal,
  openAuthModal: openAuthModal,
  closeAuthModal: closeAuthModal,
  closeAccountMenu: closeAccountMenu,
  closeNotificationMenu: closeNotificationMenu,
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
  fetchProfile: fetchProfile,
  changeUserRole: changeUserRole,
  updateReaderScrollProgress: function () { return updateReaderScrollProgress(ctx); },

  // Achievement Trackers
  recordDailyVisit: function () { return recordDailyVisit(state.user); },
  recordStoryPublished: function (story) { return recordStoryPublished(state.user, story); },
  recordChapterRead: function (chapterId) { return recordChapterRead(state.user, chapterId); },
  recordStoryCompleted: function (storyId) { return recordStoryCompleted(state.user, storyId); },
  recordLikeGiven: function () { return recordLikeGiven(state.user); }
};

// ── Bootstrap ──
async function bootstrap() {
  bindGlobalEvents();
  bindAuthEvents();
  
  // Initialize modular contexts
  initNotificationsModule(ctx);
  initStoryController(ctx);
  initReadingProgress(ctx);
  initReaderController(ctx);

  loadPreferences();
  await loadSupabaseConfig();
  
  // Initialize auth module after Supabase client is configured
  initAuthModule(ctx);

  // Track daily visit & consecutive streak
  recordDailyVisit(state.user);

  syncDiscoverFromUrl();

  render();

  loadAll().then(function () {
    hydrateGenres();
    recordDailyVisit(state.user);
    render();
    startNotificationPolling();
  }).catch(function (err) {
    console.warn("loadAll failed:", err);
    render();
  });
}

function loadAll() {
  var batchUserId = state.user && state.user.id;
  var batchAuthGeneration = getAuthGeneration();
  var isAuthenticated = !!(state.user || state.accessToken);
  var initialDiscoveryId = ++discoveryRequestId;
  var canLoadReports = isAuthenticated && canModerateRole();
  const client = getSupabaseClient();
  var mfaPromise = (client && isAuthenticated)
    ? client.auth.mfa.listFactors().catch(function () { return { data: { all: [] } }; })
    : Promise.resolve({ data: { all: [] } });

  var storyParams = new URLSearchParams();
  storyParams.set("limit", "24");
  var q = searchInput ? searchInput.value.trim() : "";
  if (q) storyParams.set("q", q);
  if (genreFilter && genreFilter.value && genreFilter.value !== "all") storyParams.set("genre", genreFilter.value);
  if (ui.filterType && ui.filterType !== "all") storyParams.set("type", ui.filterType);
  if (ui.filterStatus && ui.filterStatus !== "all") storyParams.set("status", ui.filterStatus);
  if (ui.filterLanguage && ui.filterLanguage !== "all") storyParams.set("language", ui.filterLanguage);
  if (ui.filterRecency && ui.filterRecency !== "all") storyParams.set("recency", ui.filterRecency);
  if (ui.filterSort && ui.filterSort !== "newest") storyParams.set("sort_by", ui.filterSort);

  return Promise.all([
    api("/stories?" + storyParams.toString()).catch(function (err) {
      if (initialDiscoveryId === discoveryRequestId) state.discoveryError = err;
      return { items: [], next_cursor: null, has_more: false };
    }),
    isAuthenticated ? api("/library/ids").catch(function () { return []; }) : Promise.resolve([]),
    canLoadReports ? api("/reports?status=open&limit=5&offset=0").catch(function () { return { items: [], total: 0 }; }) : Promise.resolve({ items: [], total: 0 }),
    isAuthenticated ? api("/notifications").catch(function () { return []; }) : Promise.resolve([]),
    api("/stats").catch(function () { return { published: 0, views: 0, followers: 0, open_reports: 0 }; }),
    isAuthenticated ? api("/progress").catch(function () { return []; }) : Promise.resolve([]),
    mfaPromise,
    api("/stories/recommended").catch(function () { return null; })
  ]).then(function (results) {
    var storyPage = results[0] || { items: [], next_cursor: null, has_more: false };
    if (initialDiscoveryId === discoveryRequestId) {
      state.stories = storyPage.items || [];
      state.discoveryCursor = storyPage.next_cursor || null;
      state.discoveryHasMore = !!storyPage.has_more;
      state.genreOptions = storyPage.genres || [];
      state.languageOptions = storyPage.languages || [];
      state.discoveryLoading = false;
    }
    state.stats = results[4];

    // F-032: Only commit user-specific session data if the initiating authenticated user is still active
    var currentUserId = state.user && state.user.id;
    if (batchUserId && currentUserId === batchUserId && getAuthGeneration() === batchAuthGeneration) {
      state.library = results[1] || [];
      var reps = results[2] || { items: [], total: 0 };
      var repsArray = reps.items || [];
      repsArray.items = repsArray;
      repsArray.total = reps.total || repsArray.length;
      state.reports = repsArray;
      state.notifications = results[3] || [];
      state.progress = results[5] || [];
      var mfaRes = results[6] || { data: { all: [] } };
      state.mfaFactors = (mfaRes.data && mfaRes.data.all) || [];
      state.recommendations = results[7] || null;
    } else if (!batchUserId && !currentUserId) {
      state.library = [];
      state.reports = [];
      state.notifications = [];
      state.progress = [];
      state.mfaFactors = [];
      state.recommendations = results[7] || null;
    }
  });
}

function syncDiscoverToUrl() {
  if (ui.currentView !== "discover") return;
  var params = new URLSearchParams();
  var q = searchInput ? searchInput.value.trim() : "";
  if (q) params.set("q", q);
  if (genreFilter && genreFilter.value && genreFilter.value !== "all") params.set("genre", genreFilter.value);
  if (ui.filterType && ui.filterType !== "all") params.set("type", ui.filterType);
  if (ui.filterStatus && ui.filterStatus !== "all") params.set("status", ui.filterStatus);
  if (ui.filterLanguage && ui.filterLanguage !== "all") params.set("language", ui.filterLanguage);
  if (ui.filterRecency && ui.filterRecency !== "all") params.set("recency", ui.filterRecency);
  if (ui.filterSort && ui.filterSort !== "newest") params.set("sort_by", ui.filterSort);
  var qs = params.toString();
  if (!qs && (window.location.hash === "" || window.location.hash === "#")) return;
  var newHash = qs ? "#discover?" + qs : "#discover";
  if (window.location.hash !== newHash) {
    history.replaceState(null, "", newHash);
  }
}

function syncDiscoverFromUrl() {
  var hash = window.location.hash;
  var qIdx = hash.indexOf("?");
  if (qIdx === -1) return false;
  var params = new URLSearchParams(hash.slice(qIdx + 1));
  var changed = false;

  var q = params.get("q") || "";
  if (searchInput && searchInput.value !== q) {
    searchInput.value = q;
    changed = true;
  }
  var genre = params.get("genre") || "all";
  if (genreFilter && genreFilter.value !== genre) {
    genreFilter.value = genre;
    changed = true;
  }
  var type = params.get("type") || params.get("format") || "all";
  if (ui.filterType !== type) {
    ui.filterType = type;
    changed = true;
  }
  var status = params.get("status") || "all";
  if (ui.filterStatus !== status) {
    ui.filterStatus = status;
    changed = true;
  }
  var lang = params.get("language") || params.get("lang") || "all";
  if (ui.filterLanguage !== lang) {
    ui.filterLanguage = lang;
    changed = true;
  }
  var recency = params.get("recency") || "all";
  if (ui.filterRecency !== recency) {
    ui.filterRecency = recency;
    changed = true;
  }
  var sort = params.get("sort_by") || params.get("sort") || "newest";
  if (ui.filterSort !== sort) {
    ui.filterSort = sort;
    changed = true;
  }
  return changed;
}

var discoveryRequestId = 0;
function loadDiscoveryPage(reset) {
  if (reset) {
    state.stories = [];
    state.discoveryCursor = null;
    state.discoveryHasMore = false;
  }
  syncDiscoverToUrl();
  var requestId = ++discoveryRequestId;
  var routeAtRequest = window.location.hash;
  state.discoveryRequestId = requestId;
  state.discoveryLoading = true;
  state.discoveryError = null;
  render();
  var params = new URLSearchParams();
  params.set("limit", "24");
  var q = searchInput.value.trim();
  if (q) params.set("q", q);
  if (genreFilter.value && genreFilter.value !== "all") params.set("genre", genreFilter.value);
  if (ui.filterType && ui.filterType !== "all") params.set("type", ui.filterType);
  if (ui.filterStatus && ui.filterStatus !== "all") params.set("status", ui.filterStatus);
  if (ui.filterLanguage && ui.filterLanguage !== "all") params.set("language", ui.filterLanguage);
  if (ui.filterRecency && ui.filterRecency !== "all") params.set("recency", ui.filterRecency);
  if (ui.filterSort) params.set("sort_by", ui.filterSort);
  if (!reset && state.discoveryCursor) params.set("cursor", state.discoveryCursor);
  return api("/stories?" + params.toString()).then(function (page) {
    if (requestId !== discoveryRequestId || routeAtRequest !== window.location.hash) return;
    var items = page.items || [];
    state.stories = reset ? items : (state.stories || []).concat(items);
    state.discoveryCursor = page.next_cursor || null;
    state.discoveryHasMore = !!page.has_more;
    state.genreOptions = page.genres || state.genreOptions || [];
    state.languageOptions = page.languages || state.languageOptions || [];
    hydrateGenres();
  }).catch(function (err) {
    if (requestId === discoveryRequestId && routeAtRequest === window.location.hash) state.discoveryError = err;
  }).finally(function () {
    if (requestId !== discoveryRequestId) return;
    state.discoveryLoading = false;
    if (routeAtRequest !== window.location.hash) return;
    render();
  });
}

bootstrap();

// ── Events ──
function bindGlobalEvents() {
  window.addEventListener("hashchange", function () {
    ui.currentView = getRoute();
    if (ui.currentView === "discover") {
      var changed = syncDiscoverFromUrl();
      if (changed) {
        loadDiscoveryPage(true);
        return;
      }
    }
    render();
    view.focus();
  });
  searchInput.addEventListener("input", function () {
    if (ui.currentView !== "discover") { ui.currentView = "discover"; window.location.hash = "discover"; }
    discoveryRequestId += 1;
    state.discoveryLoading = false;
    clearTimeout(searchInput._discoverTimer);
    searchInput._discoverTimer = setTimeout(function () { loadDiscoveryPage(true); }, 250);
  });
  genreFilter.addEventListener("change", function () { loadDiscoveryPage(true); });
  view.addEventListener("click", handleViewClick);
  view.addEventListener("input", handleViewInput);
  view.addEventListener("change", handleViewInput);
  document.addEventListener("submit", handleViewSubmit);

  // Mobile menu and search toggle events
  var mobileMenuBtn = document.getElementById("mobileMenuBtn");
  var mobileSearchBtn = document.getElementById("mobileSearchBtn");
  var navLinks = document.querySelector(".nav-links");
  var searchBar = document.querySelector(".searchbar");

  if (mobileMenuBtn && mobileSearchBtn && navLinks && searchBar) {
    mobileMenuBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isExpanded = mobileMenuBtn.getAttribute("aria-expanded") === "true";
      mobileMenuBtn.setAttribute("aria-expanded", !isExpanded);
      navLinks.classList.toggle("active");

      // Close search bar if opening menu
      if (!isExpanded) {
        searchBar.classList.remove("active");
        mobileSearchBtn.setAttribute("aria-expanded", "false");
      }
    });

    mobileSearchBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isExpanded = mobileSearchBtn.getAttribute("aria-expanded") === "true";
      mobileSearchBtn.setAttribute("aria-expanded", !isExpanded);
      searchBar.classList.toggle("active");

      // Close menu if opening search
      if (!isExpanded) {
        navLinks.classList.remove("active");
        mobileMenuBtn.setAttribute("aria-expanded", "false");
      }
    });

    // Close menu when clicking a nav link
    navLinks.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        navLinks.classList.remove("active");
        mobileMenuBtn.setAttribute("aria-expanded", "false");
      }
    });

    // Close panels when clicking outside hero bar
    document.addEventListener("click", function (e) {
      var heroBar = document.getElementById("heroBar");
      if (heroBar && !heroBar.contains(e.target)) {
        navLinks.classList.remove("active");
        mobileMenuBtn.setAttribute("aria-expanded", "false");
        searchBar.classList.remove("active");
        mobileSearchBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Global Light/Dark Theme Toggle
  var themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    var updateThemeUI = function() {
      var isLight = document.documentElement.classList.contains("light");
      var sun = themeToggleBtn.querySelector(".sun-icon");
      var moon = themeToggleBtn.querySelector(".moon-icon");
      if (isLight) {
        if (sun) sun.style.display = "none";
        if (moon) moon.style.display = "block";
      } else {
        if (sun) sun.style.display = "block";
        if (moon) moon.style.display = "none";
      }
    };
    
    updateThemeUI();
    
    themeToggleBtn.addEventListener("click", function() {
      var isLight = document.documentElement.classList.contains("light");
      var nextTheme = isLight ? "dark" : "light";
      document.documentElement.className = nextTheme;
      localStorage.setItem("kathasangam_theme", nextTheme);
      updateThemeUI();
    });
  }
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
      var viewName = nav.dataset.view;
      if (viewName === "achievements") {
        ui.currentView = "profile";
        ui.profileSubTab = "achievements";
        window.location.hash = "profile?tab=achievements";
      } else {
        ui.currentView = viewName;
        window.location.hash = viewName;
      }
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
    if (e.key === "Escape" && (ui.showOnboardingModal || ui.showWelcomeModal)) {
      localStorage.setItem("kathasangam_welcome_popup_v1", "true");
      localStorage.setItem("kathasangam_onboarding_dismissed", "true");
      ui.showOnboardingModal = false;
      ui.showWelcomeModal = false;
      render();
    }
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

      if (e.key === "Escape") {
        if (ui.showSettingsDrawer) {
          ui.showSettingsDrawer = false;
          var drawer = document.querySelector(".reader-settings-drawer");
          if (drawer) drawer.classList.remove("active");
          var btn = document.querySelector(".reader-settings-btn");
          if (btn) btn.setAttribute("aria-expanded", "false");
        }
      }

      var story = getCurrentStory();
      if (!story || !story.id) return;
      var isComic = story.type === "Chitrānk";
      if (e.key === "[" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        moveChapter(-1);
      } else if (e.key === "]" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        moveChapter(1);
      } else if (e.key === "ArrowLeft") {
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
    var rolePicker = document.querySelector(".auth-role-picker");
    if (rolePicker && !rolePicker.contains(e.target)) {
      var rolePopup = rolePicker.querySelector(".auth-role-popup");
      var roleBtn = rolePicker.querySelector(".auth-role-badge-select");
      if (rolePopup) rolePopup.hidden = true;
      if (roleBtn) roleBtn.setAttribute("aria-expanded", "false");
    }
    var notifArea = document.getElementById("heroNotificationArea");
    if (notifArea && !notifArea.contains(e.target)) closeNotificationMenu();

    if (ui.showSettingsDrawer) {
      var drawer = document.querySelector(".reader-settings-drawer");
      var comfortBtn = e.target.closest('[data-action="toggleSettingsDrawer"]');
      var insideDrawer = e.target.closest(".reader-settings-drawer") || (drawer && drawer.contains(e.target));
      if (!insideDrawer && !comfortBtn) {
        ui.showSettingsDrawer = false;
        if (drawer) {
          drawer.classList.remove("active");
          var btn = document.querySelector(".reader-settings-btn");
          if (btn) btn.setAttribute("aria-expanded", "false");
        } else {
          render();
        }
      }
    }
  });

  loginForm.addEventListener("submit", handleLogin);
  signupForm.addEventListener("submit", handleSignup);
}

function hydrateGenres() { hydrateGenresModule(ctx); }

function render() {
  updateHeroNotificationUI();
  renderModule(ctx);
}

function toggleFullscreen() {
  var viewEl = document.getElementById("view");
  if (!viewEl) return;
  if (!document.fullscreenElement) {
    viewEl.requestFullscreen().catch(function (err) {
      console.error("Error attempting to enable fullscreen:", err);
    });
  } else {
    document.exitFullscreen();
  }
}

document.addEventListener("fullscreenchange", function () {
  var isFs = !!document.fullscreenElement;
  var viewEl = document.getElementById("view");
  if (viewEl) {
    if (isFs) viewEl.classList.add("is-fullscreen");
    else viewEl.classList.remove("is-fullscreen");
  }
  var frame = document.querySelector(".reader-frame");
  if (frame) {
    if (isFs) {
      frame.classList.add("is-fullscreen");
      frame.scrollTop = 0;
      var rc = frame.querySelector(".reader-content");
      if (rc) rc.scrollTop = 0;
    } else {
      frame.classList.remove("is-fullscreen");
    }
  }
  var btn = document.querySelector('[data-action="toggleFullscreen"]');
  if (btn) {
    btn.textContent = isFs ? "Exit Fullscreen" : "Fullscreen";
  }
});

// ── Click handler ──
function handleViewClick(e) {
  var target = e.target.closest("[data-action]");
  if (!target) return;
  var action = target.dataset.action;
  console.log("[DEBUG CLICK] Element clicked. Action:", action);

  if (action === "go") {
    window.location.hash = target.dataset.view;
    return;
  }

  if (action === "openSupportModal") {
    var sid = target.dataset.storyId;
    var stitle = target.dataset.storyTitle;
    var aname = target.dataset.authorName;
    var aid = target.dataset.authorId;
    if (!sid) {
      var curr = getCurrentStory();
      if (curr) {
        sid = curr.id;
        stitle = curr.title;
        aname = curr.author || curr.author_name;
        aid = curr.author_id;
      }
    }
    openSupportModal({
      storyId: sid,
      storyTitle: stitle,
      authorName: aname,
      authorId: aid
    });
    return;
  }

  if (action === "reloadWallet") {
    renderWallet(ctx);
    return;
  }

  // Delegate actions to specific controllers
  if (handleDiscoverClick(ctx, action, target, e)) return;
  if (handleLibraryClick(ctx, action, target, e)) return;
  if (handleStoryClick(ctx, action, target, e)) return;
  if (handleReaderClick(ctx, action, target, e)) return;
  if (handleStudioClick(ctx, action, target, e)) return;
  if (handleModerationClick(ctx, action, target, e)) return;
  if (handleProfileClick(ctx, action, target, e)) return;
  if (handleCommunityClick(ctx, action, target, e)) return;
}

function handleViewInput(e) {
  var action = e.target.dataset.action;
  if (!action && !e.target.classList.contains("studio-chapter-search")) return;
  if (handleStoryInput(ctx, action, e.target, e)) return;
  if (handleStudioInput(ctx, action, e.target, e)) return;
  if (handleReaderInput(ctx, action, e.target, e)) return;
  if (handleModerationInput(ctx, action, e.target, e)) return;
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
  return state.stories || [];
}

function getCurrentStory() {
  if (!state.stories || !state.stories.length) {
    return null;
  }
  var hash = window.location.hash || "";
  var params = new URLSearchParams(hash.split("?")[1] || "");
  var targetId = params.get("id") || params.get("story") || ui.currentStoryId;
  if (!targetId) return null;
  return state.stories.find(function (s) { return s.id === targetId; }) || null;
}

function getCurrentStudioStory() {
  if (!state.stories) {
    return { id: "", title: "", author: "", type: "Web Novel", chapters: [], tags: [], description: "", cover: "", genre: "", language: "", license: "", status: "", followers: 0, views: 0, likes: 0, earnings: 0, progress: 0 };
  }
  var userStories = state.stories.filter(function (s) {
    if (!state.user) return false;
    if (s.author_id === state.user.id) return true;
    return s.collaborators && s.collaborators.some(function (c) {
      return c.user_id === state.user.id && c.status === "accepted";
    });
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
  if (!content || !content.length) return [[{ text: "", align: "left", originalIndex: 0 }]];
  var pages = [];
  var currentPage = [];
  var currentWordCount = 0;
  content.forEach(function (para, idx) {
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
        currentPage.push({ text: "", align: align, originalIndex: idx });
      }
      return;
    }
    if (currentWordCount + wordCount > 150 && currentWordCount > 0) {
      pages.push(currentPage);
      currentPage = [];
      currentWordCount = 0;
    }
    if (words.length > 150) {
      var wordOffset = 0;
      while (wordOffset < words.length) {
        var limit = 150 - currentWordCount;
        var chunk = words.slice(wordOffset, wordOffset + limit);
        currentPage.push({ text: chunk.join(" "), align: align, originalIndex: idx });
        currentWordCount += chunk.length;
        wordOffset += chunk.length;
        if (currentWordCount >= 150 || wordOffset < words.length) {
          pages.push(currentPage);
          currentPage = [];
          currentWordCount = 0;
        }
      }
    } else {
      currentPage.push({ text: cleanText, align: align, originalIndex: idx });
      currentWordCount += wordCount;
    }
  });
  if (currentPage.length > 0) {
    pages.push(currentPage);
  }
  if (pages.length === 0) {
    pages.push([{ text: "", align: "left" }]);
  }
  pages.push([{ isEndCard: true }]);
  return pages;
}

function moveTextPage(step) {
  var s = getCurrentStory();
  var chapter = getCurrentChapter(s);
  var pages = paginateText(chapter.content || []);
  ui.currentTextPageIndex = Math.max(0, Math.min(pages.length - 1, ui.currentTextPageIndex + step));
  render();
  var rc = document.querySelector(".reader-content");
  if (rc) rc.scrollTop = 0;
  var frame = document.querySelector(".reader-frame");
  if (frame) frame.scrollTop = 0;
  syncCurrentProgress();
}

function clampTextPage(pages) {
  if (!pages.length) ui.currentTextPageIndex = 0;
  else ui.currentTextPageIndex = Math.max(0, Math.min(pages.length - 1, ui.currentTextPageIndex));
}

function canModerateRole() {
  return ["moderator", "admin"].indexOf(state.role) !== -1;
}

function notify(message, type, options) {
  if (typeof type === "object" && type !== null) {
    options = type;
    type = options.type;
  }
  options = options || {};
  type = type || options.type;

  if (!type || typeof type !== "string") {
    var lower = String(message || "").toLowerCase();
    if (lower.indexOf("fail") !== -1 || lower.indexOf("error") !== -1) {
      type = "error";
    } else if (lower.indexOf("success") !== -1 || lower.indexOf("saved") !== -1 || lower.indexOf("restored") !== -1) {
      type = "success";
    } else {
      type = "info";
    }
  }

  if (type === "warning") type = "warn";
  if (["success", "error", "warn", "info"].indexOf(type) === -1) {
    type = "info";
  }

  if (!alerts) alerts = document.getElementById("alerts");
  if (!alerts) return;

  alerts.innerHTML = "";
  alerts.setAttribute("role", type === "error" ? "alert" : "status");
  alerts.setAttribute("aria-live", type === "error" ? "assertive" : "polite");

  var toast = document.createElement("div");
  toast.className = "toast toast-" + type;

  var iconMap = {
    success: "✓",
    error: "✕",
    warn: "⚠",
    info: "ℹ"
  };

  var iconSpan = document.createElement("span");
  iconSpan.className = "toast-icon";
  iconSpan.setAttribute("aria-hidden", "true");
  iconSpan.textContent = iconMap[type] || "ℹ";
  toast.appendChild(iconSpan);

  var msgSpan = document.createElement("span");
  msgSpan.className = "toast-msg";
  msgSpan.textContent = message;
  toast.appendChild(msgSpan);

  if (options && typeof options.onRetry === "function") {
    var retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "toast-action-btn";
    retryBtn.textContent = options.retryText || "Retry";
    retryBtn.addEventListener("click", function (evt) {
      evt.stopPropagation();
      alerts.innerHTML = "";
      clearTimeout(notify.timer);
      options.onRetry();
    });
    toast.appendChild(retryBtn);
  }

  alerts.appendChild(toast);
  clearTimeout(notify.timer);

  var duration = options.duration || (type === "error" || (options && options.onRetry) ? 5000 : 3000);
  notify.timer = setTimeout(function () {
    alerts.innerHTML = "";
  }, duration);
}

window.notify = notify;

