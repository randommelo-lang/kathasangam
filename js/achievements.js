import { apiPut } from "./api.js";
import { state } from "./state.js";

export const ACHIEVEMENTS = [
  // ─── Streaks Category ───
  {
    id: "streak_7",
    category: "streaks",
    tier: "silver",
    icon: "flame",
    title: "Weekly Spark",
    desc: "Active on KathaSangam for 7 consecutive days",
    target: 7,
    unit: "days"
  },
  {
    id: "streak_30",
    category: "streaks",
    tier: "gold",
    icon: "fire_bolt",
    title: "Monthly Flame",
    desc: "Active on KathaSangam for 30 consecutive days (1 Month)",
    target: 30,
    unit: "days"
  },
  {
    id: "streak_100",
    category: "streaks",
    tier: "platinum",
    icon: "crown",
    title: "Centurion Torch",
    desc: "Active on KathaSangam for 100 consecutive days",
    target: 100,
    unit: "days"
  },

  // ─── Creator Category ───
  {
    id: "creator_1",
    category: "creator",
    tier: "bronze",
    icon: "quill",
    title: "First Quill",
    desc: "Published your first story on KathaSangam",
    target: 1,
    unit: "stories"
  },
  {
    id: "creator_5",
    category: "creator",
    tier: "silver",
    icon: "scroll",
    title: "Wordsmith",
    desc: "Published 5 stories and established your author presence",
    target: 5,
    unit: "stories"
  },
  {
    id: "creator_10",
    category: "creator",
    tier: "gold",
    icon: "library",
    title: "Master Author",
    desc: "Published 10 stories across KathaSangam",
    target: 10,
    unit: "stories"
  },
  {
    id: "creator_comic",
    category: "creator",
    tier: "silver",
    icon: "palette",
    title: "Chitrānk Artist",
    desc: "Published your first visual Chitrānk comic story",
    target: 1,
    unit: "comics"
  },

  // ─── Reader Category ───
  {
    id: "reader_1",
    category: "reader",
    tier: "bronze",
    icon: "bookmark",
    title: "First Step",
    desc: "Read your very first story chapter",
    target: 1,
    unit: "chapters"
  },
  {
    id: "reader_10",
    category: "reader",
    tier: "silver",
    icon: "glasses",
    title: "Bookworm",
    desc: "Read 10 story chapters",
    target: 10,
    unit: "chapters"
  },
  {
    id: "reader_50",
    category: "reader",
    tier: "gold",
    icon: "tome",
    title: "Voracious Reader",
    desc: "Read 50 chapters across various tales",
    target: 50,
    unit: "chapters"
  },
  {
    id: "reader_complete",
    category: "reader",
    tier: "gold",
    icon: "trophy",
    title: "Completionist",
    desc: "Read a complete story from beginning to end",
    target: 1,
    unit: "stories"
  },

  // ─── Community & Likes Category ───
  {
    id: "like_1",
    category: "community",
    tier: "bronze",
    icon: "heart",
    title: "Warm Heart",
    desc: "Gave your first like to a story or chapter",
    target: 1,
    unit: "likes"
  },
  {
    id: "like_25",
    category: "community",
    tier: "silver",
    icon: "double_hearts",
    title: "Patron of Arts",
    desc: "Gave 25 likes to encourage authors and creators",
    target: 25,
    unit: "likes"
  }
];

export const CATEGORY_LABELS = {
  streaks: "Daily Active Streaks",
  creator: "Author & Studio Milestones",
  reader: "Reading & Exploration",
  community: "Community & Support"
};

export const TIER_LABELS = {
  bronze: "🥉 Bronze Achievement",
  silver: "🥈 Silver Achievement",
  gold: "🥇 Gold Achievement",
  platinum: "💎 Platinum Achievement"
};

/**
 * Returns crisp SVG vector glyph for coin emblems
 */
export function getCoinIconSvg(iconType) {
  switch (iconType) {
    case "flame":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-4.97 0-9-4.03-9-9 0-4.07 3.03-7.58 4.44-8.87.39-.36.99-.33 1.34.07.36.4.34 1.01-.05 1.39C7.4 7.82 5 10.98 5 14c0 3.86 3.14 7 7 7s7-3.14 7-7c0-2.85-1.57-5.59-3.21-7.23-.39-.39-.39-1.02 0-1.41.39-.39 1.02-.39 1.41 0C19.38 7.55 21 10.87 21 14c0 4.97-4.03 9-9 9zm0-15c-1.66 0-3 1.34-3 3 0 1.3.84 2.4 2 2.82V17c0 .55.45 1 1 1s1-.45 1-1v-3.18c1.16-.42 2-1.52 2-2.82 0-1.66-1.34-3-3-3z"/></svg>';
    case "fire_bolt":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 2L3 14h8l-1.5 8L20 10h-8l1.5-8z"/></svg>';
    case "crown":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1s.45-1 1-1h12c.55 0 1 .45 1 1z"/></svg>';
    case "quill":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.71 2.29a1 1 0 0 0-1.42 0l-9.3 9.29-2.83-.71a1 1 0 0 0-1.12.37l-4 6A1 1 0 0 0 3.8 18.7l2.83-.71 3.54 3.54a1 1 0 0 0 1.41-1.42l-.71-2.83 6-4a1 1 0 0 0 .37-1.12l-.71-2.83 9.29-9.3a1 1 0 0 0 0-1.42z"/></svg>';
    case "scroll":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H7c-2.21 0-4 1.79-4 4v10c0 2.21 1.79 4 4 4h12c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 14H7c-1.1 0-2-.9-2-2s.9-2 2-2h10v4zm0-6H7c-.37 0-.71.07-1.03.18-.58-.69-.97-1.57-.97-2.53 0-1.85 1.28-3.41 3-3.86V7c0 1.1.9 2 2 2h6v2z"/></svg>';
    case "library":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>';
    case "palette":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.21-.64-1.67-.4-.46-.64-1.06-.64-1.67 0-1.38 1.12-2.5 2.5-2.5H17c2.76 0 5-2.24 5-5 0-4.96-4.49-8.66-10-8.66zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>';
    case "bookmark":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>';
    case "glasses":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 8.5h-2.18c-.46-1.46-1.83-2.5-3.42-2.5-1.59 0-2.96 1.04-3.42 2.5H12c-.46-1.46-1.83-2.5-3.42-2.5-1.59 0-2.96 1.04-3.42 2.5H3c-.55 0-1 .45-1 1s.45 1 1 1h.52c.26 2.51 2.38 4.5 4.88 4.5 2.5 0 4.62-1.99 4.88-4.5h1.44c.26 2.51 2.38 4.5 4.88 4.5 2.5 0 4.62-1.99 4.88-4.5H21c.55 0 1-.45 1-1s-.45-1-1-1zm-12.6 4c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3zm8.2 0c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"/></svg>';
    case "tome":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4zm12 16H6v-2h12v2zm0-4H6V4h12v12z"/></svg>';
    case "trophy":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H8v2h8v-2h-3v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>';
    case "heart":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    case "double_hearts":
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>';
    case "lock":
    default:
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>';
  }
}

/**
 * Get current achievement metrics and unlocked list
 */
export function getAchievementsData(user) {
  var defaultData = {
    streak_days: 0,
    last_active_date: "",
    stories_created: 0,
    comic_created: false,
    read_chapters: [],
    stories_completed: 0,
    likes_given: 0,
    unlocked: {} // id -> ISO timestamp
  };

  try {
    if (user && user.preferences && user.preferences.achievements) {
      return Object.assign({}, defaultData, user.preferences.achievements);
    }
    var local = localStorage.getItem("kathasangam_achievements");
    if (local) {
      return Object.assign({}, defaultData, JSON.parse(local));
    }
  } catch (e) {
    console.warn("Failed to load achievements data:", e);
  }
  return defaultData;
}

/**
 * Save achievement metrics to local storage and sync to remote profile if logged in
 */
export function saveAchievementsData(user, data) {
  try {
    localStorage.setItem("kathasangam_achievements", JSON.stringify(data));
    if (user) {
      if (!user.preferences) user.preferences = {};
      user.preferences.achievements = data;
      apiPut("/profile", { preferences: user.preferences }).catch(function (err) {
        console.warn("Could not sync achievements to profile:", err);
      });
    }
  } catch (e) {
    console.warn("Failed to save achievements data:", e);
  }
}

/**
 * Evaluate achievements and trigger celebration toast if newly unlocked
 */
export function evaluateUnlocks(user, data) {
  var newlyUnlocked = [];
  var nowIso = new Date().toISOString();

  ACHIEVEMENTS.forEach(function (ach) {
    if (data.unlocked[ach.id]) return; // Already unlocked

    var isMet = false;
    switch (ach.id) {
      case "streak_7":
        isMet = data.streak_days >= 7;
        break;
      case "streak_30":
        isMet = data.streak_days >= 30;
        break;
      case "streak_100":
        isMet = data.streak_days >= 100;
        break;
      case "creator_1":
        isMet = data.stories_created >= 1;
        break;
      case "creator_5":
        isMet = data.stories_created >= 5;
        break;
      case "creator_10":
        isMet = data.stories_created >= 10;
        break;
      case "creator_comic":
        isMet = !!data.comic_created;
        break;
      case "reader_1":
        isMet = (data.read_chapters || []).length >= 1;
        break;
      case "reader_10":
        isMet = (data.read_chapters || []).length >= 10;
        break;
      case "reader_50":
        isMet = (data.read_chapters || []).length >= 50;
        break;
      case "reader_complete":
        isMet = data.stories_completed >= 1;
        break;
      case "like_1":
        isMet = data.likes_given >= 1;
        break;
      case "like_25":
        isMet = data.likes_given >= 25;
        break;
    }

    if (isMet) {
      data.unlocked[ach.id] = nowIso;
      newlyUnlocked.push(ach);
    }
  });

  if (newlyUnlocked.length > 0) {
    saveAchievementsData(user, data);
    newlyUnlocked.forEach(function (ach) {
      if (typeof window.notify === "function") {
        window.notify("🪙 Achievement Unlocked: " + ach.title + "!", "success", { duration: 4500 });
      }
    });
  }
  return newlyUnlocked;
}

/**
 * Record a daily visit and update consecutive streak counter
 */
export function recordDailyVisit(user) {
  var data = getAchievementsData(user);
  var today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  if (!data.last_active_date) {
    data.streak_days = 1;
    data.last_active_date = today;
  } else if (data.last_active_date !== today) {
    var lastDate = new Date(data.last_active_date);
    var currentDate = new Date(today);
    var diffDays = Math.round((currentDate - lastDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      data.streak_days = (data.streak_days || 0) + 1;
    } else if (diffDays > 1) {
      data.streak_days = 1; // Streak reset
    }
    data.last_active_date = today;
  }

  evaluateUnlocks(user, data);
  saveAchievementsData(user, data);
  return data;
}

/**
 * Record a story publish event
 */
export function recordStoryPublished(user, story) {
  var data = getAchievementsData(user);
  data.stories_created = (data.stories_created || 0) + 1;
  if (story && (story.type === "Chitrānk" || story.type === "comic")) {
    data.comic_created = true;
  }
  evaluateUnlocks(user, data);
  saveAchievementsData(user, data);
  return data;
}

/**
 * Record a chapter read event
 */
export function recordChapterRead(user, chapterId) {
  if (!chapterId) return;
  var data = getAchievementsData(user);
  if (!Array.isArray(data.read_chapters)) data.read_chapters = [];
  if (data.read_chapters.indexOf(chapterId) === -1) {
    data.read_chapters.push(chapterId);
  }
  evaluateUnlocks(user, data);
  saveAchievementsData(user, data);
  return data;
}

/**
 * Record a full story completion
 */
export function recordStoryCompleted(user, storyId) {
  var data = getAchievementsData(user);
  data.stories_completed = (data.stories_completed || 0) + 1;
  evaluateUnlocks(user, data);
  saveAchievementsData(user, data);
  return data;
}

/**
 * Record a like given
 */
export function recordLikeGiven(user) {
  var data = getAchievementsData(user);
  data.likes_given = (data.likes_given || 0) + 1;
  evaluateUnlocks(user, data);
  saveAchievementsData(user, data);
  return data;
}

/**
 * Compute progress metrics for all achievements
 */
export function getUserAchievementsProgress(user) {
  var data = getAchievementsData(user);
  return ACHIEVEMENTS.map(function (ach) {
    var isUnlocked = !!data.unlocked[ach.id];
    var current = 0;

    switch (ach.id) {
      case "streak_7":
      case "streak_30":
      case "streak_100":
        current = data.streak_days || 0;
        break;
      case "creator_1":
      case "creator_5":
      case "creator_10":
        current = data.stories_created || 0;
        break;
      case "creator_comic":
        current = data.comic_created ? 1 : 0;
        break;
      case "reader_1":
      case "reader_10":
      case "reader_50":
        current = (data.read_chapters || []).length;
        break;
      case "reader_complete":
        current = data.stories_completed || 0;
        break;
      case "like_1":
      case "like_25":
        current = data.likes_given || 0;
        break;
    }

    var percent = isUnlocked ? 100 : Math.min(100, Math.round((current / ach.target) * 100));

    return {
      achievement: ach,
      isUnlocked: isUnlocked,
      unlockedAt: data.unlocked[ach.id] || null,
      current: current,
      target: ach.target,
      percent: percent,
      progressText: current + " / " + ach.target + " " + ach.unit
    };
  });
}

/**
 * Create a Coin Badge DOM Element
 */
export function createCoinBadgeElement(achievement, options) {
  options = options || {};
  var size = options.size || "md";
  var isUnlocked = options.isUnlocked !== false;

  var coin = document.createElement("div");
  coin.className =
    "coin-badge coin-tier-" +
    achievement.tier +
    " coin-badge-" +
    size +
    (isUnlocked ? "" : " locked");
  coin.setAttribute("data-achievement-id", achievement.id);
  coin.setAttribute("title", achievement.title + (isUnlocked ? " (Unlocked)" : " (Locked)"));
  coin.setAttribute("role", "button");
  coin.setAttribute("tabindex", "0");

  var face = document.createElement("div");
  face.className = "coin-face";

  var innerRim = document.createElement("div");
  innerRim.className = "coin-inner-rim";
  face.appendChild(innerRim);

  var sheen = document.createElement("div");
  sheen.className = "coin-sheen";
  face.appendChild(sheen);

  var iconWrap = document.createElement("div");
  iconWrap.className = "coin-icon";
  iconWrap.innerHTML = isUnlocked ? getCoinIconSvg(achievement.icon) : getCoinIconSvg("lock");
  face.appendChild(iconWrap);

  coin.appendChild(face);

  if (options.interactive !== false) {
    coin.addEventListener("click", function (e) {
      e.stopPropagation();
      openAchievementModal(achievement, options.progressData);
    });
    coin.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        openAchievementModal(achievement, options.progressData);
      }
    });
  }

  return coin;
}

/**
 * Open Reddit-Style Achievement Inspection Modal
 */
export function openAchievementModal(achievement, progressData) {
  var existing = document.querySelector(".achievement-modal-overlay");
  if (existing) existing.remove();

  var overlay = document.createElement("div");
  overlay.className = "achievement-modal-overlay";

  var dialog = document.createElement("div");
  dialog.className = "achievement-modal-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "ach-modal-title");

  // Close Button
  var closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "achievement-modal-close-btn";
  closeBtn.setAttribute("aria-label", "Close modal");
  closeBtn.innerHTML = "✕";
  closeBtn.onclick = function () {
    overlay.remove();
  };
  dialog.appendChild(closeBtn);

  // Large Coin Badge
  var coinWrap = document.createElement("div");
  coinWrap.className = "achievement-modal-coin-wrap";
  var isUnlocked = progressData ? progressData.isUnlocked : true;
  var largeCoin = createCoinBadgeElement(achievement, {
    size: "lg",
    isUnlocked: isUnlocked,
    interactive: false
  });
  coinWrap.appendChild(largeCoin);
  dialog.appendChild(coinWrap);

  // Title
  var title = document.createElement("h3");
  title.id = "ach-modal-title";
  title.className = "achievement-modal-title";
  title.textContent = achievement.title;
  dialog.appendChild(title);

  // Tier Badge
  var tierBadge = document.createElement("span");
  tierBadge.className = "badge badge-pill badge-accent achievement-modal-tier-badge";
  tierBadge.textContent = TIER_LABELS[achievement.tier] || "Achievement";
  dialog.appendChild(tierBadge);

  // Description
  var desc = document.createElement("p");
  desc.className = "achievement-modal-desc";
  desc.textContent = achievement.desc;
  dialog.appendChild(desc);

  // Progress Wrap
  var progressWrap = document.createElement("div");
  progressWrap.className = "achievement-modal-progress-wrap";

  var statusRow = document.createElement("div");
  statusRow.className = "achievement-modal-status-text";

  var leftStatus = document.createElement("span");
  leftStatus.textContent = isUnlocked ? "✓ Unlocked" : "In Progress";
  leftStatus.style.color = isUnlocked ? "var(--success)" : "var(--muted)";
  statusRow.appendChild(leftStatus);

  var rightStatus = document.createElement("span");
  if (progressData) {
    rightStatus.textContent = progressData.progressText;
  }
  statusRow.appendChild(rightStatus);
  progressWrap.appendChild(statusRow);

  var progressBg = document.createElement("div");
  progressBg.className = "achievement-progress-bar-bg";
  var progressFill = document.createElement("div");
  progressFill.className = "achievement-progress-bar-fill";
  progressFill.style.width = (progressData ? progressData.percent : isUnlocked ? 100 : 0) + "%";
  progressBg.appendChild(progressFill);
  progressWrap.appendChild(progressBg);

  dialog.appendChild(progressWrap);

  // Dismiss / Done Button
  var doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "btn primary";
  doneBtn.style.minWidth = "120px";
  doneBtn.textContent = "Got it";
  doneBtn.onclick = function () {
    overlay.remove();
  };
  dialog.appendChild(doneBtn);

  overlay.appendChild(dialog);

  // Backdrop click to close
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) overlay.remove();
  });

  // ESC key to close
  var handleKeyDown = function (e) {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", handleKeyDown);
    }
  };
  document.addEventListener("keydown", handleKeyDown);

  document.body.appendChild(overlay);
}
