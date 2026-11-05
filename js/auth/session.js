import { state, ui } from "../state.js";
import { log } from "../logger.js";
import {
  api,
  apiPatch,
  apiPut,
  clearTokenCache,
  setTokenCache,
  getSupabaseClient
} from "../api.js";
import { stopNotificationPolling } from "../notifications.js";
import { openAuthModal, closeAuthModal, switchAuthTab } from "./authModal.js";
import { updateAuthUI, highlightAccountMenu } from "./accountMenu.js";

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
  // F-025: Explicitly purge all Supabase auth tokens from localStorage even on network failure
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("sb-") || key.includes("-auth-token"))) {
        localStorage.removeItem(key);
      }
    }
  } catch (storageErr) {
    console.warn("Failed to purge localStorage auth keys:", storageErr);
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

let fetchProfilePromise = null;
let currentAuthGeneration = 0;

export function getAuthGeneration() {
  return currentAuthGeneration;
}

export async function fetchProfile() {
  if (fetchProfilePromise) {
    return fetchProfilePromise;
  }

  const initiatingGen = currentAuthGeneration;
  const initiatingUser = state.user && state.user.id;

  fetchProfilePromise = (async function () {
    try {
      log.debug("[PROFILE] Fetching profile...");
      var profile = await api("/profile");

      if (
        currentAuthGeneration !== initiatingGen ||
        (state.user && state.user.id !== initiatingUser)
      ) {
        log.debug("[PROFILE] Dropping stale profile response due to auth transition");
        return null;
      }

      log.debug("[PROFILE] Profile loaded successfully:", profile);
      state.profile = profile;

      state.role = profile.role || "reader";
      loadPreferences();
      return profile;
    } catch (e) {
      if (currentAuthGeneration !== initiatingGen) {
        return null;
      }
      console.error("[PROFILE] Failed to load profile:", e.message);

      // If profile record is not found yet (e.g. freshly created OAuth user whose DB row is delayed),
      // synthesize a fallback profile from the session user metadata so the user is NOT kicked out!
      if (e.status === 404 && state.user) {
        log.debug("[PROFILE] Profile record 404. Falling back to session user metadata.");
        var userMeta = state.user.user_metadata || {};
        var fallbackProfile = {
          username:
            userMeta.full_name ||
            userMeta.name ||
            (state.user.email ? state.user.email.split("@")[0] : "reader"),
          role: "reader",
          avatar_url: userMeta.avatar_url || userMeta.picture || "",
          bio: "",
          preferences: {},
          followers_count: 0,
          following_count: 0
        };
        state.profile = fallbackProfile;
        state.role = "reader";
        loadPreferences();
        return fallbackProfile;
      }

      state.profile = null;
      state.role = "reader";
      loadPreferences();

      // Only force sign-out if session is truly rejected/expired (401) and Supabase client confirms no active session
      if (e.status === 401) {
        const client = getSupabaseClient();
        let activeSession = null;
        if (client) {
          try {
            const res = await client.auth.getSession();
            activeSession = res && res.data ? res.data.session : null;
          } catch (_) {}
        }
        if (!activeSession) {
          log.debug(
            "[PROFILE] Session user unauthorized (401) and session confirmed dead. Forcing sign out."
          );
          handleSignOut();
        }
      }
      throw e;
    } finally {
      fetchProfilePromise = null;
    }
  })();

  return fetchProfilePromise;
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
    var existingPrefs = state.profile && state.profile.preferences ? state.profile.preferences : {};
    var prefs = Object.assign({}, existingPrefs, {
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
    });
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
  log.debug("[AUTH] onAuthStateChange event:", event);

  if (event === "PASSWORD_RECOVERY") {
    log.debug("[AUTH] Password recovery event detected. Opening reset password form.");
    openAuthModal();
    switchAuthTab("reset");
    return;
  }

  currentAuthGeneration++;
  fetchProfilePromise = null;

  if (session && session.user) {
    if (session.access_token) {
      setTokenCache(session.access_token);
    }
    if (typeof window !== "undefined" && window.location && window.location.hash) {
      if (
        window.location.hash.includes("access_token=") ||
        window.location.hash.includes("refresh_token=") ||
        window.location.hash.includes("error_description=")
      ) {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + window.location.search
        );
      }
    }
    closeAuthModal();

    var isNewLogin = event === "SIGNED_IN";

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

    // Immediately update UI to show logged in state so the user doesn't see "Log In" button while profile loads
    updateAuthUI();

    return fetchProfile()
      .then(function (profile) {
        updateAuthUI();
        if (isNewLogin) {
          var name =
            (profile && profile.username) ||
            (state.user && state.user.email ? state.user.email.split("@")[0] : "reader");
          if (authEffects.notify) {
            authEffects.notify("Welcome, " + name + "!", "success");
          }
          highlightAccountMenu();
        }
        if (authEffects.loadAll) return authEffects.loadAll();
      })
      .then(function () {
        if (authEffects.hydrateGenres) authEffects.hydrateGenres();
        if (authEffects.render) authEffects.render();
        window.kathasangam_loaded = true;
      })
      .catch(function (err) {
        console.warn("Failed to refresh authenticated data:", err);
        updateAuthUI();
        if (isNewLogin && authEffects.notify) {
          var fallbackName =
            state.user && state.user.email ? state.user.email.split("@")[0] : "reader";
          authEffects.notify("Welcome, " + fallbackName + "!", "success");
          highlightAccountMenu();
        }
        if (authEffects.render) authEffects.render();
        window.kathasangam_loaded = true;
      });
  } else {
    clearTokenCache();
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
    state.stories = null;
    state.activeReadingListDetail = null;
    state.pendingInvites = null;
    state.pendingInvitesUserId = null;
    state.bookmarks = null;
    state.bookmarkIds = null;
    state.readingLists = null;
    // F-028: Clear moderation & stats data
    state.auditLogs = [];
    state.logModerators = [];
    state.stats = null;

    // F-027: Clear sensitive modals & DOM inputs
    try {
      var modalContent = document.getElementById("storyModalContent");
      if (modalContent) modalContent.innerHTML = "";
      var mfaKey = /** @type {HTMLInputElement | null} */ (document.getElementById("mfaSecretKey"));
      if (mfaKey) mfaKey.value = "";
      var codeInputs = document.querySelectorAll("input[name='code'], input[name='otp']");
      codeInputs.forEach(function (inp) {
        /** @type {HTMLInputElement} */ (inp).value = "";
      });
    } catch (domErr) {
      console.warn("Error cleaning sensitive modal DOM on signout:", domErr);
    }

    loadPreferences();
    updateAuthUI();
    if (authEffects.render) authEffects.render();
    window.kathasangam_loaded = true;
  }
}
