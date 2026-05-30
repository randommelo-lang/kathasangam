import { state } from "./state.js";

const API_BASE_URL = window.KATHASANGAM_API_URL || "";
const TOKEN_TTL_MS = 4 * 60 * 1000;

export let supabaseClient = null;
export let adminEmail = "";
export let moderatorEmails = [];

let supabaseUrl = "";
let supabaseAnonKey = "";
const tokenCache = { token: null, expiresAt: 0 };

export async function loadSupabaseConfig() {
  try {
    const res = await fetch(API_BASE_URL + "/api/config");
    if (!res.ok) throw new Error(res.status);
    const config = await res.json();

    supabaseUrl = config.supabase_url;
    supabaseAnonKey = config.supabase_anon_key;
    adminEmail = config.admin_email || "";
    moderatorEmails = config.moderator_emails || [];

    if (window.supabase && supabaseAnonKey) {
      supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
      console.log("[AUTH] Supabase client initialized from /api/config");
    } else {
      console.warn("[AUTH] Supabase JS SDK not loaded or anon key missing");
    }
  } catch (e) {
    console.error("[AUTH] Failed to load config from /api/config:", e);
  }
}

export function apiPost(path, body) {
  return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function apiPatch(path, body) {
  return api(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
}

export function apiPut(path, body) {
  return api(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

export function apiDelete(path) {
  return api(path, { method: "DELETE" });
}

export async function api(path, options = {}) {
  const now = Date.now();
  let token = null;

  if (tokenCache.token && now < tokenCache.expiresAt) {
    token = tokenCache.token;
  } else if (supabaseClient) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
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
    const text = await response.text();
    console.error(`[API ${path}] Error ${response.status}:`, text);
    let serverMessage = String(response.status);
    try {
      const payload = JSON.parse(text);
      if (payload && payload.message) {
        serverMessage = payload.message;
      }
    } catch (_) { /* response was not JSON, fall back to status code */ }
    const err = new Error(serverMessage);
    err.status = response.status;
    throw err;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : {};
}
