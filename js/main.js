import { state, ui } from "./state.js?v=auth-tabs-20260619-v29";
import { log } from "./logger.js?v=auth-tabs-20260619-v29";
import { api, apiDelete, apiPatch, apiPost, apiPut, adminEmail, loadSupabaseConfig, moderatorEmails, supabaseClient } from "./api.js?v=auth-tabs-20260619-v29";
import { getRoute, hydrateGenres as hydrateGenresModule, render as renderModule } from "./router.js?v=auth-tabs-20260619-v29";
import { renderEditor as renderEditorModule, saveChapterFromEditor as saveChapterFromEditorModule } from "./editor.js?v=auth-tabs-20260619-v29";
import { el, button, select, input, textarea, showConfirm, calculateStars } from "./components.js?v=auth-tabs-20260619-v29";

// Import view modules
import { renderDiscover } from "./views/discover.js?v=auth-tabs-20260619-v29";
import { renderLibrary } from "./views/library.js?v=auth-tabs-20260619-v29";
import { renderReader } from "./views/reader.js?v=auth-tabs-20260619-v29";
import { renderStudio } from "./views/studio.js?v=auth-tabs-20260619-v29";
import { renderModeration } from "./views/moderation.js?v=auth-tabs-20260619-v29";
import { renderStoryDetails } from "./views/story.js?v=auth-tabs-20260619-v29";
import { renderMessages } from "./views/messages.js?v=auth-tabs-20260619-v29";
import { canDeleteStory, storyCard } from "./views/shared.js?v=auth-tabs-20260619-v29";

// Import controller modules
import { handleDiscoverClick } from "./controllers/discoverController.js?v=auth-tabs-20260619-v29";
import { handleLibraryClick } from "./controllers/libraryController.js?v=auth-tabs-20260619-v29";
import { handleReaderClick, handleReaderInput, handleReaderSubmit } from "./controllers/readerController.js?v=auth-tabs-20260619-v29";
import { handleStudioClick, handleStudioSubmit } from "./controllers/studioController.js?v=auth-tabs-20260619-v29";
import { handleModerationClick } from "./controllers/moderationController.js?v=auth-tabs-20260619-v29";
import { handleProfileClick } from "./controllers/profileController.js?v=auth-tabs-20260619-v29";
import { handleCommunityClick, handleCommunitySubmit } from "./controllers/communityController.js?v=auth-tabs-20260619-v29";

// Split Cleanups
import {
  openAuthModal,
  closeAuthModal,
  handleLogin,
  handleSignup,
  handleSignOut,
  changeUserRole,
  fetchProfile,
  loadPreferences,
  autoSaveReaderPreferences,
  initAuthModule,
  closeAccountMenu,
  toggleAccountMenu,
  updateAuthUI,
  switchAuthTab
} from "./auth.js?v=auth-tabs-20260619-v29";

import {
  updateHeroNotificationUI,
  closeNotificationMenu,
  startNotificationPolling,
  initNotificationsModule
} from "./notifications.js?v=auth-tabs-20260619-v29";

import {
  renderProfileSettings
} from "./views/profile.js?v=auth-tabs-20260619-v29";

import {
  openStoryModal,
  openStorySettingsModal,
  closeStoryModal,
  initStoryController
} from "./controllers/storyController.js?v=auth-tabs-20260619-v29";

import {
  getStoryReadingProgress,
  saveReadingProgress,
  syncCurrentProgress,
  calculateStoryProgressPercent,
  calculateActiveReaderProgress,
  initReadingProgress
} from "./readingProgress.js?v=auth-tabs-20260619-v29";

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
  changeUserRole: changeUserRole
};

// ── Bootstrap ──
async function bootstrap() {
  bindGlobalEvents();
  bindAuthEvents();
  
  // Initialize modular contexts
  initNotificationsModule(ctx);
  initStoryController(ctx);
  initReadingProgress(ctx);

  loadPreferences();
  await loadSupabaseConfig();
  
  // Initialize auth module after Supabase client is configured
  initAuthModule(ctx);

  render();

  loadAll().then(function () {
    hydrateGenres();
    render();
    startNotificationPolling();
  }).catch(function (err) {
    console.warn("loadAll failed:", err);
    render();
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

function hydrateGenres() { hydrateGenresModule(ctx); }

function render() {
  updateHeroNotificationUI();
  renderModule(ctx);
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

function notify(message) {
  alerts.innerHTML = "";
  alerts.appendChild(el("div", "toast", message));
  clearTimeout(notify.timer);
  notify.timer = setTimeout(function () { alerts.innerHTML = ""; }, 2800);
}
