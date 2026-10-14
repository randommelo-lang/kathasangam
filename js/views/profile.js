import { state, ui } from "../state.js";
import { api, apiPost, apiPut, getSupabaseClient } from "../api.js";
import {
  el,
  button,
  field,
  input,
  textarea,
  select,
  formatNumber,
  svgEl,
  CANONICAL_GENRES,
  CANONICAL_LANGUAGES,
  normalizeLanguage,
  normalizeStoryStatus,
  t,
  makeTipIcon
} from "../components.js";
import { storyCard, emptyState } from "./shared.js";
import {
  ACHIEVEMENTS,
  CATEGORY_LABELS,
  TIER_LABELS,
  getUserAchievementsProgress,
  createCoinBadgeElement,
  openAchievementModal,
  getAchievementsData
} from "../achievements.js";

let ctx = null;

function makeBookIcon() {
  return svgEl("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: "stat-icon"
  }, [
    svgEl("path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" }),
    svgEl("path", { d: "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" })
  ]);
}

function makeEyeIcon() {
  return svgEl("svg", {
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: "stat-icon"
  }, [
    svgEl("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
    svgEl("circle", { cx: "12", cy: "12", r: "3" })
  ]);
}

function makeDatalists() {
  return [
    el("datalist", { id: "canonicalLanguagesList" }, CANONICAL_LANGUAGES.map(function (l) {
      return el("option", { value: l.name }, l.name + " (" + l.nativeName + ")");
    })),
    el("datalist", { id: "canonicalGenresList" }, CANONICAL_GENRES.map(function (g) {
      return el("option", { value: g }, g);
    }))
  ];
}

function storyForm() {
  var dls = makeDatalists();
  return el("form", { "data-form": "storyForm", class: "form-grid" }, [
    dls[0],
    dls[1],
    field("Title", input("text", "", { name: "title", placeholder: "New series title", required: "true" })),
    field("Type", select("type", [["Web Novel", "Web Novel"], ["Chitrānk", "Chitrānk"]])),
    field("Genre (comma separated)", input("text", "", { name: "genre", placeholder: "e.g. Fantasy, Romance, Sci-Fi", list: "canonicalGenresList", required: "true" })),
    field("Tags (comma separated)", input("text", "", { name: "tags", placeholder: "e.g. Magic, Academy, Adventure" })),
    field("Language", input("text", "English", { name: "language", placeholder: "e.g. English, Nepali, Hindi", list: "canonicalLanguagesList", required: "true" })),
    field("Eligibility", select("eligibility", [["All ages", "All ages"], ["13+", "13+"], ["16+", "16+"], ["18+", "18+"]], "All ages")),
    field("Sponsored / Promoted Content", select("isPromoted", [["false", "Standard Story"], ["true", "📢 Promoted / Sponsored Series"]])),
    field("Synopsis", textarea("description", "A new serialized story begins here.")),
    el("button", { type: "submit", class: "btn primary orange-glow-btn auth-submit-btn" }, "Create")
  ]);
}

function storySettingsForm(story) {
  var dls = makeDatalists();
  var currentEligibility = story.eligibility || story.content_rating || story.contentRating || (story.isNsfw ? "18+" : "All ages");
  if (currentEligibility !== "18+" && currentEligibility !== "16+" && currentEligibility !== "13+" && currentEligibility !== "All ages") {
    var lower = String(currentEligibility).toLowerCase();
    if (lower.indexOf("18") !== -1) currentEligibility = "18+";
    else if (lower.indexOf("16") !== -1) currentEligibility = "16+";
    else if (lower.indexOf("13") !== -1) currentEligibility = "13+";
    else currentEligibility = "All ages";
  }
  var isPromotedStr = (story.isPromoted || story.is_promoted || (Array.isArray(story.tags) && story.tags.some(function(t) { return String(t).toLowerCase() === "promoted" || String(t).toLowerCase() === "sponsored"; }))) ? "true" : "false";
  var customTagsStr = (Array.isArray(story.tags) ? story.tags : []).filter(function (t) {
    var lower = String(t).toLowerCase();
    return lower !== "promoted" && lower !== "sponsored" && lower !== (story.genre || "").toLowerCase() && lower !== (story.type || "").toLowerCase();
  }).join(", ");

  var normStatus = normalizeStoryStatus(story.status || "draft").id;

  return el("form", { "data-form": "storySettingsForm", class: "form-grid" }, [
    dls[0],
    dls[1],
    (function () {
      var hidden = el("input");
      hidden.type = "hidden";
      hidden.name = "id";
      hidden.value = story.id;
      return hidden;
    })(),
    field("Title", input("text", story.title, { name: "title", placeholder: "Series title", required: "true" })),
    field("Genre (comma separated)", input("text", story.genre, { name: "genre", placeholder: "e.g. Fantasy, Romance, Sci-Fi", list: "canonicalGenresList", required: "true" })),
    field("Tags (comma separated)", input("text", customTagsStr, { name: "tags", placeholder: "e.g. Magic, Academy, Adventure" })),
    field("Language", input("text", normalizeLanguage(story.language || "English"), { name: "language", placeholder: "English", list: "canonicalLanguagesList", required: "true" })),
    field("Eligibility", select("eligibility", [["All ages", "All ages"], ["13+", "13+"], ["16+", "16+"], ["18+", "18+"]], currentEligibility)),
    field("Sponsored / Promoted Content", select("isPromoted", [["false", "Standard Story"], ["true", "📢 Promoted / Sponsored Series"]], isPromotedStr)),
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
      ], normStatus)),
    field("Synopsis", textarea("description", story.description || "")),
    el("button", { type: "submit", class: "btn primary orange-glow-btn auth-submit-btn" }, "Save Changes")
  ]);
}

export { storyForm, storySettingsForm };

export function renderProfileSettings(context) {
  ctx = context || this || ctx;
  var view = ctx.view;
  view.innerHTML = "";

  var isSettings = ctx.ui.currentView === "settings";
  if (isSettings) {
    renderPrivateSettings(ctx);
    return;
  }

  // Public Profile View
  var params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  var targetUsername = params.get("username");
  var tabParam = params.get("tab");

  var myUsername = (ctx.state.profile && ctx.state.profile.username) ||
                   (ctx.state.user && ctx.state.user.email ? ctx.state.user.email.split("@")[0] : "");

  var isMe = (!targetUsername || (myUsername && targetUsername.toLowerCase() === myUsername.toLowerCase()));

  var currentTarget = (targetUsername || myUsername || "").toLowerCase();
  if (tabParam) {
    ctx.ui.profileSubTab = tabParam;
    ctx.ui.lastProfileTarget = currentTarget;
  } else if (ctx.ui.profileSubTab === "achievements" && !targetUsername) {
    ctx.ui.lastProfileTarget = currentTarget;
  } else if (ctx.ui.lastProfileTarget !== currentTarget) {
    ctx.ui.profileSubTab = "stories";
    ctx.ui.lastProfileTarget = currentTarget;
  }

  if (!isMe && targetUsername) {
    state.publicProfiles = state.publicProfiles || {};
    var cached = state.publicProfiles[targetUsername];
    if (!cached) {
      var loadingEl = el("div", "empty", "Loading profile...");
      view.appendChild(loadingEl);
      api("/profiles/" + encodeURIComponent(targetUsername))
        .then(function (profile) {
          state.publicProfiles[targetUsername] = profile;
          ctx.render();
        })
        .catch(function (err) {
          console.error("Error loading public profile:", err);
          loadingEl.textContent = "Profile not found or failed to load.";
        });
      return;
    }
    renderPublicProfile(ctx, cached, false);
    return;
  }

  // Own Public Profile
  if (!ctx.state.user || !ctx.state.profile) {
    view.appendChild(
      emptyState(
        "Please log in to view your profile",
        "Sign in to KathaSangam to customize your creator identity, view your stories, and manage your reading collections.",
        el("button", {
          class: "btn primary",
          onclick: function () {
            if (ctx.openAuthModal) ctx.openAuthModal();
          }
        }, "Sign In"),
        "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
      )
    );
    return;
  }

  var myData = {
    id: ctx.state.user.id,
    username: myUsername,
    role: (ctx.state.profile.role || "reader").toLowerCase(),
    avatar_url: ctx.state.profile.avatar_url || "",
    bio: ctx.state.profile.bio || "",
    followers_count: ctx.state.profile.followers_count || 0,
    following_count: ctx.state.profile.following_count || 0,
    is_following: false
  };

  renderPublicProfile(ctx, myData, true);
}

function renderPublicProfile(ctx, profileData, isMe) {
  var view = ctx.view;
  var username = profileData.username;
  var role = (profileData.role || "reader").toLowerCase();
  var avatarUrl = profileData.avatar_url || "";
  var bio = profileData.bio || "";
  var initial = (username.charAt(0) || "U").toUpperCase();

  // Header Avatar
  var avatarEl = el("div", "profile-avatar-lg");
  if (avatarUrl) {
    avatarEl.style.backgroundImage = "url('" + avatarUrl + "')";
  } else {
    avatarEl.textContent = initial;
  }

  // Header Info (Strictly public: Avatar, Username, Role badge, Follower stats, Coin Achievements Showcase)
  var userForAch = isMe ? ctx.state.user : profileData;
  var achProgress = getUserAchievementsProgress(userForAch);
  var unlockedAchs = achProgress.filter(function (p) { return p.isUnlocked; });

  var showcaseStrip = el("div", "profile-achievements-showcase");
  if (unlockedAchs.length > 0) {
    unlockedAchs.slice(0, 4).forEach(function (p) {
      showcaseStrip.appendChild(createCoinBadgeElement(p.achievement, { size: "sm", isUnlocked: true, progressData: p }));
    });
  } else if (achProgress.length > 0) {
    var firstP = achProgress[0];
    showcaseStrip.appendChild(createCoinBadgeElement(firstP.achievement, { size: "sm", isUnlocked: false, progressData: firstP }));
  }

  var headerInfo = el("div", "profile-header-info", [
    el("h2", "profile-display-name", username),
    el("div", { style: "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" }, [
      el("span", "auth-role-badge profile-role-badge " + role, role.charAt(0).toUpperCase() + role.slice(1)),
      showcaseStrip
    ]),
    el("div", { class: "profile-header-social-stats", style: "margin-top: 8px; font-size: 0.85rem; color: var(--text-muted);" }, [
      el("span", null, formatNumber(profileData.followers_count || 0) + " Followers"),
      " · ",
      el("span", null, formatNumber(profileData.following_count || 0) + " Following")
    ])
  ]);

  var headerCardChildren = [avatarEl, headerInfo];

  // Actions Container
  var actionsContainer = el("div", {
    style: "margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;"
  });

  if (isMe) {
    var settingsBtn = button("⚙️ Settings", "btn secondary btn-sm", { action: "goToSettings" });
    var shareBtn = button("📋 Share", "btn secondary btn-sm", { action: "shareProfile", username: username });
    actionsContainer.appendChild(settingsBtn);
    actionsContainer.appendChild(shareBtn);
    headerCardChildren.push(actionsContainer);
  } else {
    if (ctx.state.user) {
      // Clarified Follow State
      var isFollowing = !!profileData.is_following;
      var followBtn = el("button", {
        class: "btn follow-btn" + (isFollowing ? " is-following active" : " primary"),
        "data-action": "followUser",
        "data-id": profileData.id,
        "data-username": username,
        "aria-label": isFollowing ? "Unfollow " + username : "Follow " + username
      });

      if (isFollowing) {
        followBtn.appendChild(el("span", "following-text", "✓ Following"));
        followBtn.appendChild(el("span", "unfollow-text", "✕ Unfollow"));
      } else {
        followBtn.textContent = "+ Follow";
      }

      actionsContainer.appendChild(followBtn);

      var authorStory = (ctx.state.stories || []).find(function (s) {
        return s.author_id === profileData.id || s.author === username;
      });
      if (authorStory) {
        var supportBtn = el("button", {
          class: "btn btn-support-creator",
          "data-action": "openSupportModal",
          "data-story-id": authorStory.id,
          "data-story-title": authorStory.title || "Story",
          "data-author-name": username,
          "data-author-id": profileData.id,
          "aria-label": "Support " + username + " with a tip",
          style: "display: flex; align-items: center; gap: 6px;"
        }, [
          makeTipIcon("icon-tip-svg"),
          "Tip Creator"
        ]);
        actionsContainer.appendChild(supportBtn);
      }

      // Safety Actions: Block, Report, Share
      var prefs = (ctx.state.profile && ctx.state.profile.preferences) || {};
      var blockedList = prefs.blocked_users || [];
      var isBlocked = blockedList.some(function (u) {
        return u.id === profileData.id || u.username === username;
      });

      var safetyBox = el("div", "profile-safety-actions");

      var blockBtn = el("button", {
        class: "btn-safety" + (isBlocked ? " is-blocked" : ""),
        "data-action": isBlocked ? "unblockUser" : "blockUser",
        "data-id": profileData.id,
        "data-username": username,
        title: isBlocked ? "Unblock user" : "Block user"
      }, isBlocked ? "✓ Blocked" : "🚫 Block");

      var reportBtn = el("button", {
        class: "btn-safety",
        "data-action": "reportUser",
        "data-id": profileData.id,
        "data-username": username,
        title: "Report user profile"
      }, "🚩 Report");

      var otherShareBtn = el("button", {
        class: "btn-safety",
        "data-action": "shareProfile",
        "data-username": username,
        title: "Share profile link"
      }, "📋 Share");

      safetyBox.appendChild(blockBtn);
      safetyBox.appendChild(reportBtn);
      safetyBox.appendChild(otherShareBtn);
      actionsContainer.appendChild(safetyBox);
    } else {
      var guestFollowBtn = el("button", {
        class: "btn primary follow-btn",
        onclick: function () { if (ctx.openAuthModal) ctx.openAuthModal(); }
      }, "+ Follow");
      var guestShareBtn = button("📋 Share", "btn secondary btn-sm", { action: "shareProfile", username: username });
      actionsContainer.appendChild(guestFollowBtn);
      actionsContainer.appendChild(guestShareBtn);
    }
    headerCardChildren.push(actionsContainer);
  }

  var headerCard = el("section", "profile-header-card", headerCardChildren);
  view.appendChild(headerCard);

  // Subtabs: Stories, Reading Lists, About
  var activeTab = ctx.ui.profileSubTab || "stories";
  var authorStories = (ctx.state.stories || []).filter(function (s) {
    if (isMe && ctx.state.user) {
      return s.author_id === ctx.state.user.id || s.author === username;
    }
    return s.author === username;
  });

  var tabs = el("div", "profile-tabs", [
    button("Stories" + (authorStories.length ? " (" + authorStories.length + ")" : ""), activeTab === "stories" ? "profile-tab active" : "profile-tab", { action: "profileSubTab", value: "stories" }),
    button("Reading Lists", activeTab === "lists" ? "profile-tab active" : "profile-tab", { action: "profileSubTab", value: "lists" }),
    button("Achievements" + (unlockedAchs.length ? " (" + unlockedAchs.length + ")" : ""), activeTab === "achievements" ? "profile-tab active" : "profile-tab", { action: "profileSubTab", value: "achievements" }),
    button("About", activeTab === "about" ? "profile-tab active" : "profile-tab", { action: "profileSubTab", value: "about" })
  ]);
  view.appendChild(tabs);

  // Subtab Content
  if (activeTab === "stories") {
    // Quick Stats
    var statsRow = el("div", "profile-stats-row", [
      el("div", "profile-stat", [
        makeBookIcon(),
        el("div", "profile-stat-details", [
          el("strong", null, String(authorStories.length)),
          el("span", null, "Stories")
        ])
      ]),
      el("div", "profile-stat", [
        makeEyeIcon(),
        el("div", "profile-stat-details", [
          el("strong", null, formatNumber(authorStories.reduce(function (sum, s) { return sum + (s.views || 0); }, 0))),
          el("span", null, "Total Reads")
        ])
      ])
    ]);
    view.appendChild(statsRow);

    if (authorStories.length) {
      view.appendChild(el("div", "profile-section-header", [
        el("h3", "profile-section-title", isMe ? "Your Stories" : "Stories by " + username),
        el("span", "story-count-pill", String(authorStories.length))
      ]));
      var grid = el("section", "story-grid");
      authorStories.forEach(function (story) {
        grid.appendChild(storyCard(ctx, story, { manage: isMe }));
      });
      view.appendChild(grid);
    } else {
      // Contextual Creator / Reader Empty States
      view.appendChild(
        emptyState(
          isMe ? "You haven't published any stories yet" : "No stories published yet",
          isMe
            ? "Start sharing your serialized web novels or comics with the community in Author Studio."
            : "@" + username + " hasn't published any stories yet. Explore other works in Discover.",
          el("button", {
            class: "btn primary",
            onclick: function () {
              window.location.hash = isMe ? "studio" : "discover";
            }
          }, isMe ? "Open Author Studio" : "Browse Discover"),
          "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
        )
      );
    }
  } else if (activeTab === "lists") {
    var myLists = (isMe && ctx.state.readingLists) ? ctx.state.readingLists : [];
    if (isMe && myLists.length > 0) {
      view.appendChild(el("div", "profile-section-header", [
        el("h3", "profile-section-title", "Your Reading Playlists"),
        el("span", "story-count-pill", String(myLists.length))
      ]));
      var listsGrid = el("div", { class: "reading-lists-container", style: "margin-top: 16px;" });
      myLists.forEach(function (list) {
        var card = el("div", "reading-list-card", [
          el("div", "reading-list-card-body", [
            el("h4", "reading-list-title", list.name),
            el("p", "reading-list-desc", list.description || "Curated reading collection"),
            el("span", "reading-list-count", (list.story_ids ? list.story_ids.length : 0) + " stories")
          ])
        ]);
        listsGrid.appendChild(card);
      });
      view.appendChild(listsGrid);
    } else {
      view.appendChild(
        emptyState(
          isMe ? "Your reading lists are empty" : "No public reading lists",
          isMe
            ? "Organize your favorite stories into custom collections to share with followers or read later."
            : "@" + username + " hasn't created any public reading collections yet.",
          el("button", {
            class: "btn primary",
            onclick: function () {
              window.location.hash = isMe ? "discover" : "discover";
            }
          }, isMe ? "Explore Stories to Add" : "Browse Discover"),
          "M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0-2-.9-2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"
        )
      );
    }
  } else if (activeTab === "about") {
    if (bio && bio.trim()) {
      var bioCard = el("section", "profile-bio-card", [
        el("h3", "profile-section-title", "About " + username),
        el("p", "profile-bio-text", bio)
      ]);
      view.appendChild(bioCard);
    } else {
      view.appendChild(
        emptyState(
          isMe ? "You haven't added a bio yet" : "No bio available",
          isMe
            ? "Introduce yourself to your readers and fellow authors. Tell them what you write or read."
            : "@" + username + " hasn't written an introduction yet.",
          isMe
            ? el("button", {
                class: "btn primary",
                onclick: function () { window.location.hash = "settings"; }
              }, "Add Bio in Settings")
            : null,
          "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
        )
      );
    }
  } else if (activeTab === "achievements") {
    renderAchievementsTab(ctx, view, userForAch, isMe, achProgress, unlockedAchs);
  }
}

function renderAchievementsTab(ctx, view, user, isMe, achProgress, unlockedAchs) {
  var achData = getAchievementsData(user);
  var streak = achData.streak_days || 0;
  var unlockedCount = unlockedAchs.length;
  var totalCount = achProgress.length;
  var completionPercent = Math.round((unlockedCount / totalCount) * 100);

  // Summary Banner Card
  var bannerCard = el("section", {
    class: "panel",
    style: "display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center; justify-content: space-between; padding: var(--space-4) var(--space-5); margin-bottom: var(--space-5); background: var(--surface);"
  }, [
    el("div", null, [
      el("h3", { style: "margin: 0 0 4px 0; font-size: var(--text-lg); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;" }, [
        "🏆 " + unlockedCount + " of " + totalCount + " Achievements Unlocked",
        el("span", "badge badge-pill badge-accent", completionPercent + "% Complete")
      ]),
      el("p", { style: "margin: 0; color: var(--muted); font-size: var(--text-sm);" },
        isMe
          ? "Earn metallic coin badges by keeping daily active streaks, authoring stories, reading chapters, and liking tales!"
          : "@" + user.username + "'s collection of earned authoring, reading, and community achievements."
      )
    ]),
    el("div", {
      style: "display: flex; align-items: center; gap: 12px; background: var(--surface-2); padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--line);"
    }, [
      el("span", { style: "font-size: 1.5rem;" }, "🔥"),
      el("div", null, [
        el("div", { style: "font-size: var(--text-xs); color: var(--muted); font-weight: 600;" }, "Current Streak"),
        el("strong", { style: "font-size: var(--text-base); color: var(--ink);" }, streak + " " + (streak === 1 ? "Day" : "Days"))
      ])
    ])
  ]);
  view.appendChild(bannerCard);

  // Group achievements by category
  var categories = ["streaks", "creator", "reader", "community"];
  categories.forEach(function (cat) {
    var items = achProgress.filter(function (p) { return p.achievement.category === cat; });
    if (!items.length) return;

    var catTitle = el("h4", "achievements-category-title", [
      CATEGORY_LABELS[cat] || cat,
      el("span", "badge badge-neutral", items.filter(function (i) { return i.isUnlocked; }).length + " / " + items.length)
    ]);
    view.appendChild(catTitle);

    var grid = el("div", "achievements-grid");
    items.forEach(function (item) {
      var ach = item.achievement;
      var coinEl = createCoinBadgeElement(ach, {
        size: "md",
        isUnlocked: item.isUnlocked,
        progressData: item,
        interactive: false
      });

      var titleRow = el("div", "achievement-card-title-row", [
        el("span", "achievement-card-title", ach.title),
        el("span", "badge badge-xs " + (item.isUnlocked ? "badge-accent" : "badge-neutral"), TIER_LABELS[ach.tier] || ach.tier)
      ]);

      var descEl = el("div", "achievement-card-desc", ach.desc);

      var progressWrap = el("div", null, [
        el("div", "achievement-progress-text", item.isUnlocked ? "✓ Unlocked" : item.progressText),
        el("div", "achievement-progress-bar-bg", [
          el("div", {
            class: "achievement-progress-bar-fill",
            style: "width: " + item.percent + "%;"
          })
        ])
      ]);

      var infoEl = el("div", "achievement-card-info", [
        titleRow,
        descEl,
        progressWrap
      ]);

      var card = el("div", "achievement-card" + (item.isUnlocked ? "" : " locked"), [
        coinEl,
        infoEl
      ]);

      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.addEventListener("click", function () {
        openAchievementModal(ach, item);
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openAchievementModal(ach, item);
        }
      });

      grid.appendChild(card);
    });

    view.appendChild(grid);
  });
}

function renderPrivateSettings(ctx) {
  var view = ctx.view;

  if (!ctx.state.user || !ctx.state.profile) {
    view.appendChild(
      emptyState(
        "Please log in to manage settings",
        "Sign in to KathaSangam to configure your account, reading preferences, notification channels, and security settings.",
        el("button", {
          class: "btn primary",
          onclick: function () {
            if (ctx.openAuthModal) ctx.openAuthModal();
          }
        }, "Sign In"),
        "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
      )
    );
    return;
  }

  var username = ctx.state.profile.username || ctx.state.user.email.split("@")[0];
  var email = ctx.state.user.email || "";
  var avatarUrl = ctx.state.profile.avatar_url || "";
  var initial = (username.charAt(0) || "U").toUpperCase();

  function makeSettingsSvg(name, size, className) {
    size = size || 18;
    className = className || "settings-icon-svg";
    var attrs = {
      width: String(size),
      height: String(size),
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      class: className
    };

    var paths = [];
    if (name === "arrow-left") {
      paths = [
        svgEl("path", { d: "M19 12H5" }),
        svgEl("path", { d: "M12 19l-7-7 7-7" })
      ];
    } else if (name === "user") {
      paths = [
        svgEl("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }),
        svgEl("circle", { cx: "12", cy: "7", r: "4" })
      ];
    } else if (name === "camera") {
      paths = [
        svgEl("path", { d: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" }),
        svgEl("circle", { cx: "12", cy: "13", r: "4" })
      ];
    } else if (name === "book-open") {
      paths = [
        svgEl("path", { d: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" }),
        svgEl("path", { d: "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" })
      ];
    } else if (name === "bell") {
      paths = [
        svgEl("path", { d: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" }),
        svgEl("path", { d: "M13.73 21a2 2 0 0 1-3.46 0" })
      ];
    } else if (name === "mail") {
      paths = [
        svgEl("rect", { width: "20", height: "16", x: "2", y: "4", rx: "2" }),
        svgEl("path", { d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" })
      ];
    } else if (name === "smartphone") {
      paths = [
        svgEl("rect", { width: "14", height: "20", x: "5", y: "2", rx: "2", ry: "2" }),
        svgEl("path", { d: "M12 18h.01" })
      ];
    } else if (name === "shield-check") {
      paths = [
        svgEl("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }),
        svgEl("path", { d: "m9 12 2 2 4-4" })
      ];
    } else if (name === "shield-alert") {
      paths = [
        svgEl("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }),
        svgEl("line", { x1: "12", y1: "8", x2: "12", y2: "12" }),
        svgEl("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" })
      ];
    } else if (name === "lock") {
      paths = [
        svgEl("rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }),
        svgEl("path", { d: "M7 11V7a5 5 0 0 1 10 0v4" })
      ];
    } else if (name === "download") {
      paths = [
        svgEl("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
        svgEl("polyline", { points: "7 10 12 15 17 10" }),
        svgEl("line", { x1: "12", y1: "15", x2: "12", y2: "3" })
      ];
    } else if (name === "trash") {
      paths = [
        svgEl("polyline", { points: "3 6 5 6 21 6" }),
        svgEl("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" })
      ];
    } else if (name === "alert-triangle") {
      paths = [
        svgEl("path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" }),
        svgEl("line", { x1: "12", y1: "9", x2: "12", y2: "13" }),
        svgEl("line", { x1: "12", y1: "17", x2: "12.01", y2: "17" })
      ];
    } else if (name === "check") {
      paths = [
        svgEl("polyline", { points: "20 6 9 17 4 12" })
      ];
    } else if (name === "upload") {
      paths = [
        svgEl("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
        svgEl("polyline", { points: "17 8 12 3 7 8" }),
        svgEl("line", { x1: "12", y1: "3", x2: "12", y2: "15" })
      ];
    }

    return svgEl("svg", attrs, paths);
  }

  function makeToggleSwitch(name, title, description, checked) {
    var chk = input("checkbox", null, Object.assign({ name: name }, checked ? { checked: "checked" } : {}));
    var slider = el("span", "toggle-slider");
    var switchContainer = el("div", "toggle-switch", [chk, slider]);

    return el("label", "pref-option-label", [
      el("div", "pref-option-text", [
        el("strong", null, title),
        el("span", null, description)
      ]),
      switchContainer
    ]);
  }

  // Settings Header with return link to Public Profile
  var settingsHeader = el("div", "settings-header", [
    el("div", "settings-header-text", [
      el("h2", null, "Account Settings & Privacy"),
      el("p", null, "Manage your public profile identity, notification preferences, reading comfort, and community safety.")
    ]),
    el("a", {
      href: "#profile",
      class: "btn secondary btn-sm settings-back-link",
      "aria-label": "← Back to Profile"
    }, [
      makeSettingsSvg("arrow-left", 16, "settings-back-icon"),
      el("span", { style: "display: none;" }, "← "),
      document.createTextNode("Back to Profile")
    ])
  ]);

  var defaultTheme = (ctx.state.profile && ctx.state.profile.preferences && ctx.state.profile.preferences.reader_theme) || "light";
  var defaultMode = (ctx.state.profile && ctx.state.profile.preferences && ctx.state.profile.preferences.reader_mode) || "scroll";
  var defaultSize = (ctx.state.profile && ctx.state.profile.preferences && ctx.state.profile.preferences.reader_size) || 19;
  var dobVal = (ctx.state.profile && ctx.state.profile.preferences && ctx.state.profile.preferences.date_of_birth) || "";
  var defaultNsfwPreference = (ctx.state.profile && ctx.state.profile.preferences && ctx.state.profile.preferences.nsfw_preference) || "blur";

  // Granular Notification Preferences
  var notifPrefs = (ctx.state.profile && ctx.state.profile.preferences && ctx.state.profile.preferences.notifications) || {};
  var emailStory = notifPrefs.email_new_chapters !== undefined
    ? notifPrefs.email_new_chapters
    : (ctx.state.profile.preferences && ctx.state.profile.preferences.email_notifications !== false);
  var emailComments = notifPrefs.email_comments !== undefined ? notifPrefs.email_comments : true;
  var emailInvites = notifPrefs.email_invites !== undefined ? notifPrefs.email_invites : true;

  var inAppStory = notifPrefs.in_app_story_updates !== undefined
    ? notifPrefs.in_app_story_updates
    : (ctx.state.profile.preferences && ctx.state.profile.preferences.in_app_notifications !== false);
  var inAppInteractions = notifPrefs.in_app_interactions !== undefined ? notifPrefs.in_app_interactions : true;
  var inAppSystem = notifPrefs.in_app_system !== undefined ? notifPrefs.in_app_system : true;

  // Blocked Users
  var blockedUsers = (ctx.state.profile && ctx.state.profile.preferences && ctx.state.profile.preferences.blocked_users) || [];

  // Username field with availability checker
  var uInput = input("text", username, { name: "username", placeholder: "Your username" });
  var uHint = el("p", "username-hint", "");
  uInput.addEventListener("input", function (e) {
    var val = e.target.value.trim();
    if (!val) {
      uHint.textContent = "";
      uHint.className = "username-hint";
      return;
    }
    if (val === (ctx.state.profile ? ctx.state.profile.username : "")) {
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

  function getAge(dateString) {
    if (!dateString) return 0;
    var today = new Date();
    var birthDate = new Date(dateString);
    var age = today.getFullYear() - birthDate.getFullYear();
    var m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  var bioTextarea = textarea("bio", ctx.state.profile.bio || "");
  bioTextarea.className = "settings-bio-textarea";
  bioTextarea.placeholder = "Write a short bio about yourself...";

  // Card 1: Public Profile Identity
  var profileCard = el("section", { id: "section-profile", class: "settings-card" }, [
    el("div", "settings-card-header", [
      el("div", "settings-card-icon-pill", [makeSettingsSvg("user", 22)]),
      el("div", "settings-card-title-group", [
        el("h3", "profile-section-title", "Public Profile Identity"),
        el("p", null, "Manage how readers and fellow authors see your profile across KathaSangam.")
      ])
    ]),
    el("div", "settings-card-body", [
      // Avatar upload
      (function () {
        var avatarPreview = el("div", "settings-avatar-preview");
        if (avatarUrl) {
          avatarPreview.style.backgroundImage = "url('" + avatarUrl + "')";
        } else {
          avatarPreview.textContent = initial;
        }

        var avatarFeedback = el("p", "form-feedback", "");
        avatarFeedback.style.display = "none";

        var fileInput = el("input");
        fileInput.type = "file";
        fileInput.accept = "image/png,image/jpeg,image/webp,image/gif";
        fileInput.style.display = "none";

        var uploadBtn = el("button", {
          class: "btn primary btn-sm",
          type: "button",
          style: "display: inline-flex; align-items: center; gap: 6px;"
        }, [
          makeSettingsSvg("upload", 14),
          document.createTextNode("Upload Photo")
        ]);
        uploadBtn.addEventListener("click", function () { fileInput.click(); });

        var removeBtn = el("button", {
          class: "btn secondary btn-sm",
          type: "button",
          style: "display: " + (avatarUrl ? "inline-flex" : "none") + "; align-items: center; gap: 6px;"
        }, [
          makeSettingsSvg("trash", 14),
          document.createTextNode("Remove Photo")
        ]);

        fileInput.addEventListener("change", function (evt) {
          var file = evt.target.files[0];
          if (!file) return;

          var allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
          if (!allowedTypes.includes(file.type)) {
            avatarFeedback.textContent = "Please select a PNG, JPEG, WebP, or GIF image.";
            avatarFeedback.className = "form-feedback error";
            avatarFeedback.style.display = "";
            fileInput.value = "";
            return;
          }
          if (file.size > 5 * 1024 * 1024) {
            avatarFeedback.textContent = "Image is too large. Maximum size is 5 MB.";
            avatarFeedback.className = "form-feedback error";
            avatarFeedback.style.display = "";
            fileInput.value = "";
            return;
          }

          avatarPreview.classList.add("loading");
          avatarFeedback.textContent = "Uploading...";
          avatarFeedback.className = "form-feedback info";
          avatarFeedback.style.display = "";
          uploadBtn.disabled = true;
          removeBtn.disabled = true;

          var fd = new FormData();
          fd.append("file", file);

          api("/upload/image", { method: "POST", body: fd })
            .then(function (resp) {
              if (!resp || !resp.url) throw new Error("Upload failed");
              return apiPut("/profile", { avatar_url: resp.url }).then(function () {
                return resp.url;
              });
            })
            .then(function (newUrl) {
              avatarPreview.classList.remove("loading");
              avatarPreview.textContent = "";
              avatarPreview.style.backgroundImage = "url('" + newUrl + "')";
              if (ctx.state && ctx.state.profile) ctx.state.profile.avatar_url = newUrl;
              avatarFeedback.textContent = "Avatar updated successfully!";
              avatarFeedback.className = "form-feedback success";
              removeBtn.style.display = "inline-flex";
              uploadBtn.disabled = false;
              removeBtn.disabled = false;
              fileInput.value = "";
            })
            .catch(function (err) {
              avatarPreview.classList.remove("loading");
              uploadBtn.disabled = false;
              removeBtn.disabled = false;
              fileInput.value = "";
              console.error(err);
              if (err.status === 413) {
                avatarFeedback.textContent = "Upload failed: File is too large (max 5 MB).";
              } else if (err.status === 415) {
                avatarFeedback.textContent = "Upload failed: Invalid format. Only PNG, JPG, WEBP, and GIF allowed.";
              } else {
                avatarFeedback.textContent = (err.message || "Failed to upload avatar.") + " Please try again.";
              }
              avatarFeedback.className = "form-feedback error";
            });
        });

        removeBtn.addEventListener("click", function () {
          avatarPreview.classList.add("loading");
          avatarFeedback.textContent = "Removing...";
          avatarFeedback.className = "form-feedback info";
          avatarFeedback.style.display = "";
          uploadBtn.disabled = true;
          removeBtn.disabled = true;

          apiPut("/profile", { avatar_url: "" })
            .then(function () {
              avatarPreview.classList.remove("loading");
              avatarPreview.style.backgroundImage = "";
              avatarPreview.textContent = initial;
              if (ctx.state && ctx.state.profile) ctx.state.profile.avatar_url = "";
              avatarFeedback.textContent = "Avatar removed.";
              avatarFeedback.className = "form-feedback success";
              removeBtn.style.display = "none";
              uploadBtn.disabled = false;
              removeBtn.disabled = false;
            })
            .catch(function (err) {
              avatarPreview.classList.remove("loading");
              uploadBtn.disabled = false;
              removeBtn.disabled = false;
              console.error(err);
              avatarFeedback.textContent = (err.message || "Failed to remove avatar.") + " Please try again.";
              avatarFeedback.className = "form-feedback error";
            });
        });

        return el("div", "settings-group", [
          el("label", "settings-label", "Profile Photo"),
          el("div", "settings-avatar-studio", [
            el("div", "settings-avatar-left", [
              avatarPreview,
              el("div", "settings-avatar-meta", [
                el("span", "settings-avatar-chip", [
                  makeSettingsSvg("camera", 14),
                  document.createTextNode("PNG, JPEG, WebP or GIF • Max 5 MB")
                ]),
                avatarFeedback
              ])
            ]),
            el("div", "settings-avatar-actions", [
              uploadBtn,
              removeBtn,
              fileInput
            ])
          ])
        ]);
      })(),

      // Username
      el("div", "settings-group", [
        el("label", "settings-label", "Username"),
        el("div", "settings-field-row", [
          el("div", "settings-input-wrapper", [
            el("span", "settings-input-addon", "@"),
            uInput
          ]),
          button("Update Username", "btn primary btn-sm", { action: "updateUsername" })
        ]),
        uHint
      ]),

      // Email
      el("div", "settings-group", [
        el("label", "settings-label", "Account Email (Private)"),
        el("div", "settings-field-row", [
          el("div", "settings-input-wrapper", [
            el("span", "settings-input-addon", [makeSettingsSvg("lock", 16)]),
            input("text", email, { name: "email", disabled: "true", placeholder: "Email address" })
          ])
        ]),
        el("p", "settings-hint", "Your email address is strictly private and never displayed on your public profile.")
      ]),

      // Bio
      el("div", "settings-group", [
        el("label", "settings-label", "Bio"),
        bioTextarea,
        el("div", { class: "settings-field-row", style: "margin-top: 10px;" }, [
          button("Update Bio", "btn primary btn-sm", { action: "updateBio" })
        ]),
        el("p", "settings-hint", "Tell readers and fellow authors about your creative projects and reading preferences.")
      ])
    ])
  ]);

  // Card 2: Reading & Content Preferences
  var readingCard = el("section", { id: "section-reading", class: "settings-card" }, [
    el("div", "settings-card-header", [
      el("div", "settings-card-icon-pill icon-pill-reading", [makeSettingsSvg("book-open", 22)]),
      el("div", "settings-card-title-group", [
        el("h4", null, "Reading & Content Preferences"),
        el("p", null, "Configure your default reader appearance, typography size, and mature content filters.")
      ])
    ]),
    el("div", "settings-card-body", [
      el("div", "settings-group", [
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
        el("div", { class: "settings-field-row-wrap", style: "margin-top: 16px;" }, [
          el("div", "settings-field-col", [
            el("label", "settings-label", "Date of Birth"),
            input("date", dobVal, { name: "date_of_birth" })
          ]),
          (function() {
            var age = getAge(dobVal);
            if (age >= 18) {
              return el("div", "settings-field-col", [
                el("label", "settings-label", "NSFW Content (18+)"),
                select("nsfw_preference", [
                  ["blur", "Blur 18+ content (Default)"],
                  ["show", "Show 18+ content"],
                  ["hide", "Hide 18+ content"]
                ], defaultNsfwPreference)
              ]);
            } else {
              return el("div", "settings-field-col", [
                el("label", "settings-label", "NSFW Content (18+)"),
                el("div", { style: "color: var(--muted); font-size: 0.88rem; padding-top: 10px; font-weight: 500;" }, "Hidden (under 18)")
              ]);
            }
          })()
        ]),
        el("div", { class: "settings-card-footer" }, [
          button("Save Reading Preferences", "btn primary btn-sm", { action: "updatePreferences" })
        ])
      ])
    ])
  ]);

  // Card 3: Notification Preferences Section
  var notificationCard = el("section", { id: "section-notifications", class: "settings-card" }, [
    el("div", "settings-card-header", [
      el("div", "settings-card-icon-pill icon-pill-bell", [makeSettingsSvg("bell", 22)]),
      el("div", "settings-card-title-group", [
        el("h4", null, "Notification Preferences"),
        el("p", null, "Configure how and when you receive updates from creators, readers, and the community.")
      ])
    ]),
    el("div", "settings-card-body", [
      el("div", "settings-group", [
        el("div", "notification-pref-grid", [
          el("div", "notification-pref-card", [
            el("h5", null, [
              makeSettingsSvg("mail", 17),
              document.createTextNode(" Email Notifications")
            ]),
            el("div", "notification-pref-options", [
              makeToggleSwitch("email_new_chapters", "New Chapter Releases", "Receive emails when stories or authors you follow release new chapters", emailStory),
              makeToggleSwitch("email_comments", "Comments & Mentions", "Receive emails for new comments and replies on your stories", emailComments),
              makeToggleSwitch("email_invites", "Collaboration Invites", "Receive emails when invited as a co-author or editor in Author Studio", emailInvites)
            ])
          ]),
          el("div", "notification-pref-card", [
            el("h5", null, [
              makeSettingsSvg("smartphone", 17),
              document.createTextNode(" In-App Notifications")
            ]),
            el("div", "notification-pref-options", [
              makeToggleSwitch("in_app_story_updates", "Real-time Story Updates", "Show banner notifications when new chapters become available", inAppStory),
              makeToggleSwitch("in_app_interactions", "Follower & Like Alerts", "Alerts when someone follows your profile or likes your chapters", inAppInteractions),
              makeToggleSwitch("in_app_system", "System & Safety Notices", "Platform safety announcements and policy updates", inAppSystem)
            ])
          ])
        ]),
        el("div", { class: "settings-card-footer" }, [
          button("Save Notification Preferences", "btn primary btn-sm", { action: "updateNotificationPreferences" })
        ])
      ])
    ])
  ]);

  // Card 4: Security & Community Safety
  var securityCard = el("section", { id: "section-security", class: "settings-card" }, [
    el("div", "settings-card-header", [
      el("div", "settings-card-icon-pill icon-pill-security", [makeSettingsSvg("shield-check", 22)]),
      el("div", "settings-card-title-group", [
        el("h4", null, "Security & Community Safety"),
        el("p", null, "Manage multi-factor authentication and blocked accounts.")
      ])
    ]),
    el("div", "settings-card-body", [
      // Two-Factor Authentication (2FA)
      (function () {
        var emailEnabled = (ctx.state.profile && ctx.state.profile.preferences && ctx.state.profile.preferences.two_factor_email_enabled) || false;

        return el("div", { class: "settings-group", style: "padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,0.015);" }, [
          el("h5", { style: "margin: 0 0 8px 0; font-size: 0.95rem; font-weight: 700; color: var(--ink);" }, "Email Verification Code (OTP)"),
          el("p", { style: "margin: 0 0 10px 0; font-size: 0.86rem; font-weight: 500;" }, [
            el("span", { class: "settings-status-badge " + (emailEnabled ? "status-badge-success" : "status-badge-danger") }, [
              makeSettingsSvg(emailEnabled ? "shield-check" : "shield-alert", 15, emailEnabled ? "status-svg-success" : "status-svg-danger"),
              document.createTextNode("Status: "),
              el("span", { style: "display: none;" }, emailEnabled ? "🟢 " : "🔴 "),
              document.createTextNode(emailEnabled ? "Enabled" : "Disabled")
            ])
          ]),
          el("p", "settings-hint", "Receive a 6-digit one-time code on your registered email address when logging in."),
          el("div", { style: "margin-top: 14px;" }, [
            emailEnabled
              ? button("Disable Email 2FA", "btn danger btn-sm", { action: "openEmailOtpDisable" })
              : button("Enable Email 2FA", "btn primary btn-sm", { action: "openEmailOtpSetup" })
          ])
        ]);
      })(),

      // Blocked accounts
      el("div", "settings-group", [
        el("h5", { style: "margin: 16px 0 6px 0; font-size: 0.95rem; font-weight: 700; color: var(--ink); display: flex; align-items: center; gap: 8px;" }, [
          makeSettingsSvg("shield-alert", 17),
          document.createTextNode(" Community Safety & Blocked Accounts")
        ]),
        el("p", "settings-hint", "Manage accounts you have blocked. Blocked users cannot follow you, comment on your stories, or interact with your profile."),
        (function () {
          if (!blockedUsers.length) {
            return el("div", {
              class: "empty-inline",
              style: "padding: 22px; text-align: center; color: var(--text-muted); font-size: 0.88rem; background: rgba(255,255,255,0.015); border-radius: 12px; border: 1px dashed var(--line); margin-top: 14px;"
            }, "No blocked accounts. Users you block from their public profile will appear here.");
          }
          var listContainer = el("div", "blocked-users-list");
          blockedUsers.forEach(function (user) {
            var uInitial = (user.username ? user.username.charAt(0) : "U").toUpperCase();
            var item = el("div", "blocked-user-item", [
              el("div", "blocked-user-info", [
                el("div", "blocked-user-avatar", uInitial),
                el("div", null, [
                  el("div", "blocked-user-name", "@" + user.username)
                ])
              ]),
              el("button", {
                class: "btn secondary btn-sm",
                "data-action": "unblockUser",
                "data-id": user.id,
                "data-username": user.username
              }, "Unblock")
            ]);
            listContainer.appendChild(item);
          });
          return listContainer;
        })()
      ])
    ])
  ]);

  // Card 5: Privacy & Data Management
  var privacyCard = el("section", { id: "section-privacy", class: "settings-card" }, [
    el("div", "settings-card-header", [
      el("div", "settings-card-icon-pill", [makeSettingsSvg("download", 22)]),
      el("div", "settings-card-title-group", [
        el("h4", null, "Privacy & Data Management"),
        el("p", null, "Manage and export your personal data under KathaSangam's privacy policy.")
      ])
    ]),
    el("div", "settings-card-body", [
      el("div", "settings-group", [
        el("p", "settings-hint", "Manage your personal data under KathaSangam's privacy policy. You can export a complete machine-readable copy of your personal data or clear your reading history at any time."),
        el("div", { style: "display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px;" }, [
          button("Export My Data (JSON)", "btn secondary btn-sm", { action: "exportUserData" }),
          button("Clear Reading History", "btn secondary btn-sm", { action: "clearReadingHistory" })
        ])
      ])
    ])
  ]);

  // Card 6: Danger Zone
  var dangerCard = el("section", { id: "section-danger", class: "settings-card settings-card-danger settings-group settings-danger-zone" }, [
    el("div", "settings-card-header", [
      el("div", "settings-card-icon-pill icon-pill-danger", [makeSettingsSvg("alert-triangle", 22)]),
      el("div", "settings-card-title-group", [
        el("h4", null, "Danger Zone"),
        el("p", null, "Irreversible actions regarding your account.")
      ])
    ]),
    el("div", "settings-card-body", [
      el("p", "settings-hint", "Once you delete your account, there is no going back."),
      el("div", { style: "margin-top: 14px;" }, [
        button("Delete Account", "btn danger", { action: "deleteAccount" })
      ])
    ])
  ]);

  // Settings Panel wrapping all cards
  var settingsPanel = el("section", "profile-settings-panel", [
    profileCard,
    readingCard,
    notificationCard,
    securityCard,
    privacyCard,
    dangerCard
  ]);

  // Sidebar navigation
  var navCategories = [
    { id: "section-profile", label: "Profile & Identity", icon: "user" },
    { id: "section-reading", label: "Reading Comfort", icon: "book-open" },
    { id: "section-notifications", label: "Notifications", icon: "bell" },
    { id: "section-security", label: "Security & Safety", icon: "shield-check" },
    { id: "section-privacy", label: "Data & Privacy", icon: "download" },
    { id: "section-danger", label: "Danger Zone", icon: "alert-triangle", isDanger: true }
  ];

  var navSidebar = el("nav", "settings-nav-sidebar");
  navCategories.forEach(function (cat, idx) {
    var navBtn = el("a", {
      href: "#" + cat.id,
      class: "settings-nav-item" + (idx === 0 ? " active" : "") + (cat.isDanger ? " nav-item-danger" : "")
    }, [
      el("span", "settings-nav-item-icon", [makeSettingsSvg(cat.icon, 18)]),
      el("span", null, cat.label)
    ]);
    navBtn.addEventListener("click", function (e) {
      e.preventDefault();
      var targetCard = document.getElementById(cat.id);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      navSidebar.querySelectorAll(".settings-nav-item").forEach(function (b) {
        b.classList.remove("active");
      });
      navBtn.classList.add("active");
    });
    navSidebar.appendChild(navBtn);
  });

  var settingsLayout = el("div", "settings-layout", [
    navSidebar,
    el("div", "settings-content-column", [
      settingsPanel
    ])
  ]);

  var settingsContainer = el("div", "settings-container", [
    settingsHeader,
    settingsLayout
  ]);

  view.appendChild(settingsContainer);
}
