import { state, ui } from "../state.js";
import { log } from "../logger.js";
import { api, apiPatch, apiPut, clearTokenCache, getSupabaseClient } from "../api.js";
import { stopNotificationPolling } from "../notifications.js";
import { openAuthModal, switchAuthTab } from "./authModal.js";
import { updateAuthUI } from "./accountMenu.js";

let authEffects = {};

export function getAuthEffects() {
  return authEffects;
}

export function setAuthEffects(effects) {
  authEffects = Object.assign(authEffects, effects);
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
    if (authEffects.render) authEffects.render();
  } catch (e) {
    console.error("Failed to switch role:", e);
    if (e.message === "403") {
      if (authEffects.notify)
        authEffects.notify("Permission denied: you are not authorized to switch to this role.");
    } else {
      if (authEffects.notify) authEffects.notify("Failed to switch role: " + e.message);
    }
    fetchProfile().then(function () {
      updateAuthUI();
      if (authEffects.render) authEffects.render();
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
      log.debug(
        "[PROFILE] Session user profile not found or unauthorized (404/401). Forcing sign out."
      );
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
    ui.comicFit = p.comic_fit || "standard";
    ui.comicZoom = typeof p.comic_zoom === "number" ? p.comic_zoom : 100;
  } else {
    try {
      var localPref = JSON.parse(localStorage.getItem("kathasangam_anon_preferences") || "{}");
      ui.readerTheme = localPref.reader_theme || "light";
      ui.readerSize = localPref.reader_size || 19;
      ui.readerMode = localPref.reader_mode || "scroll";
      ui.readerFont = localPref.reader_font || "sans";
      ui.readerLineHeight = localPref.reader_line_height || "1.6";
      ui.readerWidth = localPref.reader_width || "800px";
      ui.comicFit = localPref.comic_fit || "standard";
      ui.comicZoom = typeof localPref.comic_zoom === "number" ? localPref.comic_zoom : 100;
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
      comic_fit: ui.comicFit,
      comic_zoom: ui.comicZoom,
      email_notifications: emailNotif,
      in_app_notifications: inAppNotif
    };
    if (state.user && state.profile) {
      state.profile.preferences = prefs;
      apiPut("/profile", { preferences: prefs }).catch(function (err) {
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
    fetchProfile()
      .then(function () {
        updateAuthUI();
        if (authEffects.loadAll) return authEffects.loadAll();
      })
      .then(function () {
        if (authEffects.hydrateGenres) authEffects.hydrateGenres();
        if (authEffects.render) authEffects.render();
        window.kathasangam_loaded = true;
      })
      .catch(function (err) {
        console.warn("Failed to refresh authenticated data:", err);
        if (authEffects.render) authEffects.render();
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
    /** @type {any} */ (repsArray).items = repsArray;
    /** @type {any} */ (repsArray).total = 0;
    state.reports = repsArray;
    state.notifications = [];
    stopNotificationPolling();
    state.progress = [];
    state.bookmarks = null;
    state.bookmarkIds = null;
    state.readingLists = null;
    loadPreferences();
    updateAuthUI();
    if (authEffects.render) authEffects.render();
    window.kathasangam_loaded = true;
  }
}
