import { state } from "./state.js";
import { log } from "./logger.js";

const API_BASE_URL = window.KATHASANGAM_API_URL || "";
const TOKEN_TTL_MS = 4 * 60 * 1000;

export let supabaseClient = null;
export function getSupabaseClient() {
  return supabaseClient;
}
// SB-04: ADMIN_EMAIL and MODERATOR_EMAILS are no longer served by GET /api/config.
// They are server-side authorization inputs only; role checks belong on the API,
// not in the client. See backend/src/routes/config.rs.

let supabaseUrl = "";
let supabaseAnonKey = "";
const tokenCache = { token: null, expiresAt: 0 };

export function clearTokenCache() {
  tokenCache.token = null;
  tokenCache.expiresAt = 0;
}

export function setTokenCache(token) {
  tokenCache.token = token || null;
  tokenCache.expiresAt = token ? Date.now() + TOKEN_TTL_MS : 0;
  state.accessToken = token || null;
}

export async function loadSupabaseConfig() {
  try {
    const res = await fetch(API_BASE_URL + "/api/config");
    if (!res.ok) throw new Error(String(res.status));
    const config = await res.json();

    supabaseUrl = config.supabase_url;
    supabaseAnonKey = config.supabase_anon_key;
    if (config.social_links) {
      state.socialLinks = Object.assign({}, state.socialLinks, config.social_links);
    }

    if (window.supabase && supabaseAnonKey) {
      const safeAuthLock = async (name, acquireTimeout, fn) => {
        if (typeof navigator === "undefined" || !navigator.locks) {
          return await fn();
        }
        try {
          return await navigator.locks.request(
            name,
            acquireTimeout === 0 ? { mode: "exclusive", ifAvailable: true } : { mode: "exclusive" },
            async (lock) => {
              if (!lock) return await fn();
              return await fn();
            }
          );
        } catch (err) {
          return await fn();
        }
      };

      supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          lock: safeAuthLock
        }
      });
      window.supabaseClient = supabaseClient;
      log.debug("[AUTH] Supabase client initialized from /api/config");
    } else {
      console.warn("[AUTH] Supabase JS SDK not loaded or anon key missing");
    }
  } catch (e) {
    console.error("[AUTH] Failed to load config from /api/config:", e);
  }
}

export function apiPost(path, body) {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function apiPatch(path, body) {
  return api(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
}

export function apiPut(path, body) {
  return api(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function apiDelete(path) {
  return api(path, { method: "DELETE" });
}

export function uploadFileWithProgress(path, file, onProgress) {
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", (window.KATHASANGAM_API_URL || "") + "/api" + path);

    var token = state.accessToken || (tokenCache.token && Date.now() < tokenCache.expiresAt ? tokenCache.token : null);
    if (token) {
      xhr.setRequestHeader("Authorization", "Bearer " + token);
    }

    if (xhr.upload && typeof onProgress === "function") {
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && e.total > 0) {
          var percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch (_) {
          resolve(xhr.responseText);
        }
      } else {
        var msg = String(xhr.status);
        try {
          var payload = JSON.parse(xhr.responseText);
          if (payload && payload.message) msg = payload.message;
        } catch (_) {}
        var err = Object.assign(new Error(msg), { status: xhr.status });
        reject(err);
      }
    };

    xhr.onerror = function () {
      var err = new Error("Network error during upload");
      reject(err);
    };

    var fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}


export async function api(path, options = {}) {
  const now = Date.now();
  let token = null;

  if (tokenCache.token && now < tokenCache.expiresAt) {
    token = tokenCache.token;
  } else if (supabaseClient) {
    try {
      const {
        data: { session }
      } = await supabaseClient.auth.getSession();
      token = session?.access_token || null;
      state.accessToken = token;
      if (token) {
        tokenCache.token = token;
        tokenCache.expiresAt = now + TOKEN_TTL_MS;
      }
    } catch (err) {
      console.error(`[API ${path}] Failed to get session:`, err.message);
      state.accessToken = null;
    }
  } else {
    token = state.accessToken;
  }

  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(API_BASE_URL + `/api${path}`, { ...options, headers });

  if (!response.ok) {
    if (response.status === 401 && !options.__sessionRetry) {
      clearTokenCache();
      if (supabaseClient) {
        try {
          const refreshed = await supabaseClient.auth.refreshSession();
          const session = refreshed && refreshed.data && refreshed.data.session;
          if (session && session.access_token) {
            tokenCache.token = session.access_token;
            tokenCache.expiresAt = Date.now() + TOKEN_TTL_MS;
            state.accessToken = session.access_token;
            return api(path, { ...options, __sessionRetry: true });
          }
        } catch (refreshError) {
          log.debug("Session refresh failed after an unauthorized response", refreshError);
        }
      }
      state.accessToken = null;
    }
    const text = await response.text();
    console.error(`[API ${path}] Error ${response.status}:`, text);
    let serverMessage = String(response.status);
    try {
      const payload = JSON.parse(text);
      if (payload && payload.message) {
        serverMessage = payload.message;
      }
    } catch (_) {
      /* response was not JSON, fall back to status code */
    }
    const err = /** @type {Error & { status: number }} */ (new Error(serverMessage));
    err.status = response.status;
    throw err;
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  // Mutation flows historically consumed the unfiltered story list as an array.
  // Preserve that shape while page-aware discovery requests keep their metadata.
  if (path === "/stories" && payload && Array.isArray(payload.items)) return payload.items;
  return payload;
}
