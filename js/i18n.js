// Centralized localization, string dictionary, and normalization module

export const CANONICAL_GENRES = [
  "Fantasy",
  "Romance",
  "Sci-Fi",
  "Action",
  "Drama",
  "Mystery",
  "Slice of Life",
  "Supernatural",
  "Historical",
  "Poetry",
  "Comedy",
  "Horror",
  "Thriller",
  "Adventure"
];

export const CANONICAL_LANGUAGES = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "ne", name: "Nepali", nativeName: "नेपाली" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" }
];

export const CANONICAL_STORY_STATUSES = [
  { id: "draft", label: "Draft", badgeLabel: "📝 Draft", display: "Draft / Unpublished" },
  { id: "ongoing", label: "Ongoing", badgeLabel: "🟢 Ongoing", display: "Ongoing / Active" },
  { id: "completed", label: "Completed", badgeLabel: "✅ Completed", display: "Completed" },
  { id: "on_hold", label: "On Hold", badgeLabel: "⏸️ On Hold", display: "On Hold" },
  { id: "cancelled", label: "Cancelled", badgeLabel: "🚫 Cancelled", display: "Cancelled" }
];

export const CANONICAL_CHAPTER_STATUSES = [
  { id: "draft", label: "Draft", badgeClass: "status-draft" },
  { id: "scheduled", label: "Scheduled", badgeClass: "status-scheduled" },
  { id: "published", label: "Published", badgeClass: "status-published" }
];

// String dictionary for user-facing copy
const STRINGS = {
  en: {
    // Navigation
    "nav.discover": "Discover",
    "nav.library": "Library",
    "nav.studio": "Studio",
    "nav.reader": "Reader",
    "nav.profile": "Profile",
    "nav.settings": "Settings",
    "nav.moderation": "Moderation",

    // Common actions & buttons
    "common.read": "Read",
    "common.read_now": "Read now",
    "common.resume": "Resume",
    "common.follow": "Follow",
    "common.following": "Following",
    "common.manage": "Manage",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.save": "Save",
    "common.save_changes": "Save Changes",
    "common.create": "Create",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.retry": "Retry",
    "common.loading": "Loading...",
    "common.all": "All",
    "common.close": "Close",

    // Formats & Badges
    "format.web_novel": "Web Novel",
    "format.web_novel_badge": "📖 Web Novel · Text",
    "format.chitrank": "Chitrānk",
    "format.chitrank_badge": "🎨 Chitrānk · Comic",
    "rating.all_ages": "🟢 All Ages",
    "rating.mature_nsfw": "🔞 18+ Mature (NSFW)",
    "badge.promoted": "📢 Promoted",
    "badge.sponsored": "📢 Sponsored",

    // Story Statuses
    "status.draft": "Draft",
    "status.ongoing": "Ongoing",
    "status.completed": "Completed",
    "status.on_hold": "On Hold",
    "status.cancelled": "Cancelled",

    // Story Details
    "story.synopsis": "Synopsis",
    "story.table_of_contents": "Table of Contents",
    "story.about_author": "About the Author",
    "story.your_progress": "Your Progress",
    "story.no_chapters": "No chapters published yet.",
    "story.search_chapters_placeholder": "Search chapters (e.g. 1 or title)...",
    "story.bookmark": "Bookmark",
    "story.bookmarked": "Bookmarked",
    "story.like": "Like",
    "story.liked": "Liked",
    "story.add_to_playlist": "Add to Playlist",
    "story.pick_up_where_left_off": "Pick up where you left off:",

    // Studio
    "studio.workspace_title": "Author Studio",
    "studio.switch_story": "Switch Story",
    "studio.new_story": "New Story",
    "studio.all_chapters": "All",
    "studio.drafts": "Drafts",
    "studio.scheduled": "Scheduled",
    "studio.published": "Published",
    "studio.save_status_saved": "Saved",
    "studio.save_status_saving": "Saving...",
    "studio.save_status_unsaved": "Unsaved",
    "studio.save_status_cloud": "Saved to cloud",
    "studio.publish_now": "Publish Now",
    "studio.preview_chapter": "Preview Chapter",
    "studio.danger_zone": "Danger Zone",

    // Discover
    "discover.title": "Discover",
    "discover.filter_all_languages": "All Languages",
    "discover.filter_all_genres": "All Genres",
    "discover.filter_all_formats": "All",
    "discover.load_more": "Load more stories",
    "discover.showing_stories": "Showing {count} stories",
    "discover.no_stories_found": "No stories found matching your criteria."
  }
};

let currentLocale = "en";

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  if (STRINGS[locale] || locale === "en") {
    currentLocale = locale;
  }
}

export function registerTranslations(locale, translations) {
  if (!STRINGS[locale]) {
    STRINGS[locale] = {};
  }
  Object.assign(STRINGS[locale], translations);
}

/**
 * Look up a localized string with parameter interpolation and fallback
 * @param {string} key
 * @param {Record<string, any>} [params]
 * @param {string} [fallback]
 * @returns {string}
 */
export function t(key, params, fallback) {
  var dict = STRINGS[currentLocale] || STRINGS.en;
  var text = dict[key] || STRINGS.en[key] || fallback || key;
  if (params && typeof text === "string") {
    Object.keys(params).forEach(function (param) {
      text = text.replace(new RegExp("{" + param + "}", "g"), String(params[param]));
    });
  }
  return text;
}

// -------------------------------------------------------------
// Normalization Helpers
// -------------------------------------------------------------

/**
 * Standardize story type, guaranteeing diacritics for Chitrānk
 * @param {string} raw
 * @returns {"Web Novel" | "Chitrānk"}
 */
export function normalizeStoryType(raw) {
  if (!raw) return "Web Novel";
  var trimmed = String(raw).trim().toLowerCase();
  if (trimmed === "chitrānk" || trimmed === "chitrank") {
    return "Chitrānk";
  }
  return "Web Novel";
}

/**
 * Returns true if story format is a comic/Chitrānk
 * @param {string} raw
 * @returns {boolean}
 */
export function isChitrank(raw) {
  if (!raw) return false;
  var trimmed = String(raw).trim().toLowerCase();
  return trimmed === "chitrānk" || trimmed === "chitrank";
}

/**
 * Format story type with optional icon & descriptive subtitle
 * @param {string} raw
 * @param {boolean} [includeIcon=false]
 * @returns {string}
 */
export function formatStoryType(raw, includeIcon) {
  var isComic = isChitrank(raw);
  if (includeIcon) {
    return isComic ? "🎨 Chitrānk · Comic" : "📖 Web Novel · Text";
  }
  return isComic ? "Chitrānk" : "Web Novel";
}

/**
 * Standardize language strings to canonical display names
 * @param {string} raw
 * @returns {string}
 */
export function normalizeLanguage(raw) {
  if (!raw) return "English";
  var trimmed = String(raw).trim();
  var lower = trimmed.toLowerCase();
  if (lower === "en" || lower === "eng" || lower === "english") return "English";
  if (lower === "ne" || lower === "nep" || lower === "nepali") return "Nepali";
  if (lower === "hi" || lower === "hin" || lower === "hindi") return "Hindi";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Standardize genre labels against canonical list
 * @param {string} raw
 * @returns {string}
 */
export function normalizeGenre(raw) {
  if (!raw) return "Fantasy";
  var trimmed = String(raw).trim();
  for (var i = 0; i < CANONICAL_GENRES.length; i++) {
    if (trimmed.toLowerCase() === CANONICAL_GENRES[i].toLowerCase()) {
      return CANONICAL_GENRES[i];
    }
  }
  return trimmed
    .split(/\s+/)
    .map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Standardize story statuses across views and APIs
 * @param {string} raw
 * @returns {{ id: string, label: string, badgeLabel: string, display: string }}
 */
export function normalizeStoryStatus(raw) {
  var lower = (raw || "ongoing").toString().trim().toLowerCase();
  if (lower === "active" || lower === "ongoing") {
    return {
      id: "ongoing",
      label: "Ongoing",
      badgeLabel: "🟢 Ongoing",
      display: "Ongoing / Active"
    };
  }
  if (lower === "completed" || lower === "complete") {
    return {
      id: "completed",
      label: "Completed",
      badgeLabel: "✅ Completed",
      display: "Completed"
    };
  }
  if (lower === "on_hold" || lower === "on hold" || lower === "hiatus") {
    return { id: "on_hold", label: "On Hold", badgeLabel: "⏸️ On Hold", display: "On Hold" };
  }
  if (lower === "cancelled" || lower === "canceled") {
    return {
      id: "cancelled",
      label: "Cancelled",
      badgeLabel: "🚫 Cancelled",
      display: "Cancelled"
    };
  }
  if (lower === "draft" || lower === "unpublished") {
    return { id: "draft", label: "Draft", badgeLabel: "📝 Draft", display: "Draft / Unpublished" };
  }
  var titleCased = lower.charAt(0).toUpperCase() + lower.slice(1);
  return { id: lower, label: titleCased, badgeLabel: "📖 " + titleCased, display: titleCased };
}

/**
 * Standardize chapter status badges and labels
 * @param {string} raw
 * @returns {{ id: string, label: string, badgeClass: string }}
 */
export function normalizeChapterStatus(raw) {
  var lower = (raw || "draft").toString().trim().toLowerCase();
  if (lower === "published") {
    return { id: "published", label: "Published", badgeClass: "status-published" };
  }
  if (lower === "scheduled") {
    return { id: "scheduled", label: "Scheduled", badgeClass: "status-scheduled" };
  }
  return { id: "draft", label: "Draft", badgeClass: "status-draft" };
}

// -------------------------------------------------------------
// Unified Date & Number Formatters
// -------------------------------------------------------------

/**
 * Format numbers in standard or compact notation
 * @param {number} v
 * @param {Intl.NumberFormatOptions} [options]
 * @returns {string}
 */
export function formatNumber(v, options) {
  var num = Number(v) || 0;
  var defaultOptions = { notation: num > 9999 ? "compact" : "standard", maximumFractionDigits: 1 };
  return new Intl.NumberFormat("en", Object.assign(defaultOptions, options)).format(num);
}

/**
 * Standard readable date with short month, day, and time
 * @param {string | number | Date} v
 * @returns {string}
 */
export function formatDate(v) {
  if (!v) return "";
  var d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(d);
}

/**
 * Formatted date in DD/MM/YYYY format
 * @param {string | number | Date} v
 * @returns {string}
 */
export function formatDateDDMMYYYY(v) {
  if (!v) return "";
  var d = new Date(v);
  if (isNaN(d.getTime())) return "";
  var day = String(d.getDate()).padStart(2, "0");
  var month = String(d.getMonth() + 1).padStart(2, "0");
  var year = d.getFullYear();
  return day + "/" + month + "/" + year;
}

/**
 * Unified full date and time string: "Oct 11, 2026 at 10:30 AM"
 * @param {string | number | Date} v
 * @returns {string}
 */
export function formatDateTime(v) {
  if (!v) return "";
  var d = new Date(v);
  if (isNaN(d.getTime())) return "";
  var datePart = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(d);
  var timePart = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(d);
  return datePart + " at " + timePart;
}

/**
 * Unified time-only string: "10:30 AM"
 * @param {string | number | Date} v
 * @returns {string}
 */
export function formatTime(v) {
  if (!v) return "";
  var d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(d);
}

/**
 * Relative time string (e.g. "just now", "5m ago", "2h ago", "yesterday")
 * @param {string | number | Date} v
 * @returns {string}
 */
export function formatRelativeTime(v) {
  if (!v) return "";
  var d = new Date(v);
  if (isNaN(d.getTime())) return "";
  var now = Date.now();
  var diffMs = now - d.getTime();
  if (diffMs < 0) diffMs = 0;
  var diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return "just now";
  var diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + "m ago";
  var diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return diffHours + "h ago";
  var diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return diffDays + "d ago";
  return formatDateDDMMYYYY(d);
}

// Attach to window for global debugging and accessibility testing
if (typeof window !== "undefined") {
  window.i18n = {
    t: t,
    getLocale: getLocale,
    setLocale: setLocale,
    formatNumber: formatNumber,
    formatDate: formatDate,
    formatDateDDMMYYYY: formatDateDDMMYYYY,
    formatDateTime: formatDateTime,
    formatTime: formatTime,
    formatRelativeTime: formatRelativeTime,
    normalizeStoryType: normalizeStoryType,
    isChitrank: isChitrank,
    formatStoryType: formatStoryType,
    normalizeLanguage: normalizeLanguage,
    normalizeGenre: normalizeGenre,
    normalizeStoryStatus: normalizeStoryStatus,
    normalizeChapterStatus: normalizeChapterStatus,
    CANONICAL_GENRES: CANONICAL_GENRES,
    CANONICAL_LANGUAGES: CANONICAL_LANGUAGES,
    CANONICAL_STORY_STATUSES: CANONICAL_STORY_STATUSES,
    CANONICAL_CHAPTER_STATUSES: CANONICAL_CHAPTER_STATUSES
  };
}
