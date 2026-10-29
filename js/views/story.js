import {
  button,
  el,
  formatDate,
  formatDateDDMMYYYY,
  formatNumber,
  formatStoryType,
  getStoryRatingInfo,
  isChitrank,
  list,
  normalizeGenre,
  normalizeLanguage,
  normalizeStoryStatus,
  normalizeStoryType,
  progress,
  t,
  makeTipIcon
} from "../components.js";
import { state } from "../state.js";
import { openSupportModal } from "../components/supportModal.js";

export function renderStoryDetails(ctx) {
  ctx = ctx || this;
  var params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  var storyId = params.get("id");
  if (!ctx.state.stories) ctx.state.stories = [];
  var story = ctx.state.stories.find(function (s) { return s.id === storyId; });

  if (!story) {
    if (storyId && ctx.api) {
      ctx.api("/stories/" + storyId).then(function (fetched) {
        if (fetched && !fetched.id && !fetched.title && Array.isArray(fetched.items)) {
          fetched = fetched.items.find(function (s) { return s.id === storyId; }) || fetched.items[0];
        }
        if (fetched && (fetched.id || fetched.title)) {
          var item = fetched.id ? fetched : Object.assign({ id: storyId }, fetched);
          var idx = ctx.state.stories.findIndex(function (s) { return s.id === storyId; });
          if (idx !== -1) {
            ctx.state.stories[idx] = item;
          } else {
            ctx.state.stories.push(item);
          }
          if (ctx.ui.currentView === "story") {
            ctx.render();
          }
        } else {
          ctx.view.appendChild(el("div", "empty", "Story not found."));
        }
      }).catch(function () {
        ctx.view.appendChild(el("div", "empty", "Story not found."));
      });
      return;
    }
    ctx.view.appendChild(el("div", "empty", "Story not found."));
    return;
  }

  // Update current story ID so other actions (like follow, tip) refer to this story
  ctx.ui.currentStoryId = story.id;

  // 1. Back button
  var backBtn = el("a", "btn text-btn back-btn", "← Back to Discover");
  backBtn.href = "#discover";
  ctx.view.appendChild(backBtn);

  // 2. Glassmorphic Hero Banner
  var rawCover = story.cover || "";
  var coverVal = rawCover;
  var isImgUrl = rawCover && (rawCover.startsWith("http://") || rawCover.startsWith("https://") || rawCover.startsWith("/uploads/") || rawCover.startsWith("data:") || rawCover.startsWith("blob:"));

  if (coverVal && !coverVal.startsWith("url") && !coverVal.startsWith("linear-gradient") && !coverVal.startsWith("radial-gradient")) {
    coverVal = "url('" + coverVal + "')";
  }

  var headerCover = el("div", "story-details-cover");
  if (coverVal) {
    headerCover.style.backgroundImage = coverVal;
  }
  if (isImgUrl) {
    var coverImg = el("img", {
      class: "story-details-cover-img",
      src: rawCover,
      alt: (story.title || "Story") + " cover",
      loading: "eager",
      decoding: "async",
      width: "160",
      height: "240"
    });
    coverImg.setAttribute("fetchpriority", "high");
    headerCover.appendChild(coverImg);
  }
  if (story.isNsfw) {
    var prefs = (state.profile && state.profile.preferences) || {};
    var pref = prefs.nsfw_preference || "blur";
    if (pref === "blur") {
      headerCover.style.filter = "blur(24px) brightness(0.7)";
      headerCover.style.transform = "scale(1.05)";
    }
  }

  var authorName = story.author ||
    story.author_name ||
    (story.profile && story.profile.username) ||
    (ctx.state.profile && (ctx.state.profile.id === story.author_id || ctx.state.profile.user_id === story.author_id) ? ctx.state.profile.username : "") ||
    (ctx.state.user && ctx.state.user.id === story.author_id ? (ctx.state.profile && ctx.state.profile.username ? ctx.state.profile.username : "You") : "");

  if (!authorName) {
    var knownStory = (ctx.state.stories || []).find(function (s) {
      return s.author_id === story.author_id && (s.author || s.author_name);
    });
    authorName = knownStory ? (knownStory.author || knownStory.author_name) : "Author";
  }

  function createAuthorLink() {
    var link = el("a", "story-author-link", authorName);
    link.href = "#profile?username=" + encodeURIComponent(authorName);
    return link;
  }

  // Reading progress computation
  var progressData = ctx.getStoryReadingProgress(story.id);
  var readBtnText = "Start Reading";
  var chIdx = -1;
  var percent = 0;
  if (progressData && story.chapters && story.chapters.length) {
    chIdx = story.chapters.findIndex(function (c) { return c.id === progressData.chapter_id; });
    percent = ctx.calculateStoryProgressPercent(story);
    if (percent >= 100) {
      readBtnText = "Start Reading Again (Ch. 1)";
    } else if (chIdx !== -1) {
      readBtnText = "Resume Reading (Ch. " + (chIdx + 1) + ")";
    } else {
      readBtnText = "Resume Reading";
    }
  }

  // Reading status badge
  var readingStatusBadge;
  if (percent >= 100) {
    readingStatusBadge = el("span", { class: "badge reading-status-badge completed" }, "✅ Completed (100%)");
  } else if (progressData && chIdx !== -1) {
    readingStatusBadge = el("span", { class: "badge reading-status-badge in-progress" }, [
      el("span", "icon icon-bookmark icon-sm"),
      " Reading (Ch. " + (chIdx + 1) + " · " + percent + "%)"
    ]);
  } else {
    readingStatusBadge = el("span", { class: "badge reading-status-badge unread" }, "✨ Unread");
  }

  // Eligibility / Content rating badge
  var rawEligibility = story.eligibility || story.content_rating || story.contentRating || (story.isNsfw ? "18+" : "All ages");
  var normElig = String(rawEligibility).toLowerCase();
  var contentRatingBadge;
  if (normElig.indexOf("18") !== -1 || story.isNsfw) {
    contentRatingBadge = el("span", { class: "badge nsfw-badge" }, "🔞 18+");
  } else if (normElig.indexOf("16") !== -1) {
    contentRatingBadge = el("span", { class: "badge rating-badge mature-16" }, "🟡 16+");
  } else if (normElig.indexOf("13") !== -1) {
    contentRatingBadge = el("span", { class: "badge rating-badge teen-13" }, "🟡 13+");
  } else {
    contentRatingBadge = el("span", { class: "badge rating-badge all-ages" }, "🟢 All Ages");
  }

  var isBookmarked = ctx.state.bookmarkIds && ctx.state.bookmarkIds.indexOf(story.id) !== -1;
  var isLiked = ctx.state.likedStoryIds && ctx.state.likedStoryIds.indexOf(story.id) !== -1;

  if (ctx.state.user && ctx.state.bookmarkIds === null) {
    ctx.api("/bookmarks/ids")
      .then(ids => {
        ctx.state.bookmarkIds = ids;
        ctx.render();
      })
      .catch(err => console.error("Error loading bookmark IDs:", err));
  }

  if (ctx.state.user && ctx.state.likedStoryIds === null) {
    ctx.state.likedStoryIds = [];
    ctx.api("/stories/" + story.id + "/liked")
      .then(res => {
        if (res.liked) {
          ctx.state.likedStoryIds = [story.id];
          ctx.render();
        }
      })
      .catch(err => console.error("Error checking liked status:", err));
  }

  if (ctx.api && story.rating_distribution === undefined) {
    story.rating_distribution = null;
    ctx.api("/stories/" + story.id + "/rating")
      .then(function (res) {
        if (res) {
          if (typeof res.average_rating === "number") {
            story.rating = res.average_rating;
          }
          if (typeof res.ratings_count === "number") {
            story.ratings_count = res.ratings_count;
          }
          if (res.user_rating !== undefined && res.user_rating !== null) {
            story.user_rating = res.user_rating;
          }
          story.rating_distribution = res.distribution || {};
          if (ctx.ui.currentView === "story") {
            ctx.render();
          }
        }
      })
      .catch(function (err) {
        console.error("Error loading story rating:", err);
      });
  }

  var bookmarkBtn = el("button", {
    class: "btn" + (isBookmarked ? " active bookmarked" : ""),
    style: "display: flex; align-items: center; gap: 6px;" + (isBookmarked ? " color: var(--accent); border-color: var(--accent);" : ""),
    "data-action": "bookmarkStory",
    "data-story-id": story.id,
    "aria-label": isBookmarked ? "Remove bookmark" : "Bookmark this story"
  }, [
    el("span", { class: "icon " + (isBookmarked ? "icon-bookmark-filled" : "icon-bookmark"), style: "width: 16px; height: 16px;" }),
    isBookmarked ? "Bookmarked" : "Bookmark"
  ]);

  var likeBtn = el("button", {
    class: "btn" + (isLiked ? " active liked" : ""),
    style: "display: flex; align-items: center; gap: 6px;" + (isLiked ? " color: #e0245e; border-color: #e0245e;" : ""),
    "data-action": "likeStory",
    "data-story-id": story.id,
    "aria-label": isLiked ? "Unlike story" : "Like this story"
  }, [
    el("span", { class: "icon " + (isLiked ? "icon-heart-filled" : "icon-heart"), style: "width: 16px; height: 16px;" }),
    isLiked ? "Liked" : "Like"
  ]);

  var playlistBtn = el("button", {
    class: "btn",
    style: "display: flex; align-items: center; gap: 6px;",
    "data-action": "openAddToReadingListModal",
    "data-story-id": story.id,
    "aria-label": "Add to reading playlist"
  }, [
    el("span", { class: "icon icon-plus", style: "width: 16px; height: 16px;" }),
    "Add to Playlist"
  ]);

  var donateBtn = el("button", {
    class: "btn btn-support-creator",
    "data-action": "openSupportModal",
    "data-story-id": story.id,
    "data-story-title": story.title || "Story",
    "data-author-name": authorName,
    "data-author-id": story.author_id,
    "aria-label": "Support creator with a tip",
    style: "display: flex; align-items: center; gap: 6px;"
  }, [
    makeTipIcon("icon-tip-svg"),
    "Support Creator"
  ]);

  var primaryReadBtn = button(readBtnText, "btn primary orange-glow-btn story-main-cta", {
    action: "openReader",
    id: story.id,
    "data-id": story.id,
    "data-story-id": story.id,
    "aria-label": readBtnText + " for " + story.title
  });

  // Resume callout banner if user has active reading progress
  var resumeCallout = null;
  if (progressData && chIdx !== -1 && percent < 100 && story.chapters[chIdx]) {
    resumeCallout = el("div", "story-resume-callout", [
      el("div", "story-resume-callout-text", [
        el("span", "story-resume-label", "Pick up where you left off:"),
        el("strong", "story-resume-chapter", " Chapter " + (chIdx + 1) + ": " + (story.chapters[chIdx].title || "Untitled") + " (" + percent + "% read)")
      ]),
      button("Resume Reading →", "btn primary btn-sm", { action: "openReader", id: story.id, "data-id": story.id, "data-story-id": story.id, "aria-label": "Resume reading Chapter " + (chIdx + 1) })
    ]);
  }

  var isPromoted = Boolean(
    story.isPromoted ||
    story.is_promoted ||
    (Array.isArray(story.tags) && story.tags.some(function (t) {
      return String(t).toLowerCase() === "promoted" || String(t).toLowerCase() === "sponsored";
    }))
  );
  var promotedBadge = isPromoted ? el("span", { class: "badge badge-accent promoted-badge", title: "Promoted Content" }, "📢 Promoted") : null;

  var ratingInfo = getStoryRatingInfo(story);
  var ratingStat = ratingInfo.isTrustworthy
    ? el("span", "stat-item rating-stat", [el("strong", null, "★ " + ratingInfo.score), " rating"])
    : el("span", "stat-item rating-stat", [el("span", { class: "mini-meta" }, "New · Unrated")]);

  var normType = normalizeStoryType(story.type);
  var statusInfo = normalizeStoryStatus(story.status);
  var normLang = normalizeLanguage(story.language);
  var langBadge = story.language ? el("span", { class: "badge language-badge", title: "Story Language: " + normLang }, "🌐 " + normLang) : null;

  var badgeList = (story.genre || "").split(",").map(function (g) { return g.trim(); }).filter(Boolean).map(function (g) {
    return el("span", "badge genre-badge", normalizeGenre(g));
  }).concat([
    promotedBadge,
    langBadge,
    el("span", { class: "badge type-badge", "data-type": normType, title: isChitrank(normType) ? "Visual Webcomic" : "Serialized Web Novel" }, formatStoryType(normType, true)),
    el("span", { class: "badge status-badge " + statusInfo.id }, statusInfo.badgeLabel),
    contentRatingBadge,
    readingStatusBadge
  ]).filter(Boolean);

  var badgeRow = el("div", "story-details-badge-row", badgeList);

  var headerCard = el("section", "story-header-card", [
    headerCover,
    el("div", "story-header-info", [
      badgeRow,
      el("h1", "story-details-title", story.title),
      el("div", "story-details-author-row", [
        "By ",
        createAuthorLink()
      ]),
      el("div", "story-details-stats", [
        el("span", "stat-item", [el("strong", null, formatNumber(story.views)), " reads"]),
        el("span", "stat-item", [el("strong", null, formatNumber(story.likes || 0)), " likes"]),
        ratingStat,
        el("span", "stat-item", [el("strong", null, formatNumber(story.followers)), " followers"]),
        el("span", "stat-item", [el("strong", null, story.chapters ? story.chapters.length : 0), " chapters"])
      ]),
      resumeCallout,
      el("div", "button-row details-action-row", [
        primaryReadBtn,
        donateBtn,
        likeBtn,
        bookmarkBtn,
        playlistBtn
      ].filter(Boolean))
    ].filter(Boolean))
  ]);

  ctx.view.appendChild(headerCard);

  // 3. Layout Two Columns: Synopsis/Chapters left, and Sidebar right
  var layout = el("div", "layout-two");

  // Left Column
  var leftCol = el("div", "story-details-main");

  // Synopsis Panel
  var tagsContainer = el("div", "tag-row");
  var genres = (story.genre || "").split(",").map(function (g) { return g.trim(); }).filter(Boolean);
  genres.forEach(function (g) {
    tagsContainer.appendChild(el("span", "tag", g));
  });
  var customTags = (Array.isArray(story.tags) ? story.tags : []).filter(function (t) {
    var lower = String(t).toLowerCase();
    return lower !== "promoted" && lower !== "sponsored" && lower !== (story.genre || "").toLowerCase() && lower !== (story.type || "").toLowerCase();
  });
  customTags.forEach(function (t) {
    tagsContainer.appendChild(el("span", "tag tag-custom", "#" + t));
  });

  var synopsisPanel = el("section", "panel", [
    el("h2", "panel-title", "Synopsis"),
    el("p", "story-details-synopsis", story.description || "No synopsis available."),
    tagsContainer
  ]);
  leftCol.appendChild(synopsisPanel);

  // Chapters Panel (Table of Contents) with Search and Sort
  var rawChapters = story.chapters || [];
  var allChapters = rawChapters.map(function (ch, idx) {
    return { ch: ch, origIndex: idx };
  });

  // Filter by search query if any
  var searchQuery = (ctx.ui.storyChapterSearch || "").trim().toLowerCase();
  var filteredChapters = allChapters.filter(function (item) {
    if (!searchQuery) return true;
    var chNumStr = String(item.origIndex + 1);
    var titleStr = (item.ch.title || "").toLowerCase();
    if (chNumStr === searchQuery) return true;
    if (titleStr.indexOf(searchQuery) !== -1) return true;
    if (("ch " + chNumStr).indexOf(searchQuery) !== -1) return true;
    if (("chapter " + chNumStr).indexOf(searchQuery) !== -1) return true;
    return false;
  });

  // Sort
  var isDesc = ctx.ui.storyChapterSort === "desc";
  filteredChapters.sort(function (a, b) {
    var aOrder = a.ch.sort_order !== undefined ? a.ch.sort_order : a.origIndex;
    var bOrder = b.ch.sort_order !== undefined ? b.ch.sort_order : b.origIndex;
    return isDesc ? (bOrder - aOrder) : (aOrder - bOrder);
  });

  var chapterLimit = ctx.ui.storyChapterLimit || 30;
  var isSearchActive = !!searchQuery;
  var displayChapters = filteredChapters;
  var hasMoreChapters = false;
  if (!isSearchActive && filteredChapters.length > chapterLimit) {
    displayChapters = filteredChapters.slice(0, chapterLimit);
    hasMoreChapters = true;
  }

  var chapterListItems = [];
  if (rawChapters.length === 0) {
    chapterListItems.push(el("div", "empty", "No chapters published yet."));
  } else if (filteredChapters.length === 0) {
    chapterListItems.push(el("div", "empty-search-state", [
      el("p", null, "No chapters found matching \"" + ctx.ui.storyChapterSearch + "\""),
      button("Clear Search", "btn secondary btn-sm", { action: "clearStoryChapterSearch", "aria-label": "Clear Search" })
    ]));
  } else {
    displayChapters.forEach(function (item) {
      var ch = item.ch;
      var origIndex = item.origIndex;
      var chStatus = ch.status || "published";

      var metaText = "Ch. " + (origIndex + 1);
      var pubDate = ch.createdAt || ch.created_at || ch.scheduledAt;
      if (chStatus === "scheduled" && ch.scheduledAt) {
        metaText += " · Scheduled " + formatDateDDMMYYYY(ch.scheduledAt);
      } else if (pubDate) {
        metaText += " · Published " + formatDateDDMMYYYY(pubDate);
      } else if (chStatus !== "published") {
        metaText += " · " + chStatus.charAt(0).toUpperCase() + chStatus.slice(1);
      } else {
        metaText += " · Published";
      }

      var isCurrentReading = progressData && progressData.chapter_id === ch.id;
      var isReadBefore = progressData && chIdx !== -1 && origIndex < chIdx;

      var readingBadge = null;
      if (isCurrentReading) {
        readingBadge = el("span", "badge chapter-reading-pill", "Reading");
      } else if (isReadBefore) {
        readingBadge = el("span", "badge chapter-read-pill", "✓ Read");
      }

      var row = el("div", {
        class: "chapter-item details-chapter-item" + (isCurrentReading ? " current-reading-row" : ""),
        "data-action": "openChapter",
        "data-index": String(origIndex),
        "data-story-id": story.id,
        "data-id": story.id,
        "role": "button",
        "tabindex": "0",
        "aria-label": "Read Chapter " + (origIndex + 1) + ": " + (ch.title || "Untitled")
      }, [
        el("div", "chapter-item-left", [
          el("span", "chapter-number-badge", String(origIndex + 1)),
          el("div", "chapter-item-info", [
            el("div", "chapter-item-title-row", [
              el("strong", "chapter-item-title", ch.title),
              readingBadge
            ].filter(Boolean)),
            el("span", "mini-meta", metaText)
          ])
        ]),
        el("span", "chapter-read-arrow", "→")
      ]);
      chapterListItems.push(row);
    });

    if (hasMoreChapters) {
      var remaining = filteredChapters.length - displayChapters.length;
      chapterListItems.push(el("div", "chapters-pagination-row", [
        button("Show more chapters (" + remaining + " remaining)", "btn secondary btn-sm", {
          action: "loadMoreStoryChapters",
          "aria-label": "Show more chapters (" + remaining + " remaining)"
        })
      ]));
    }
  }

  // Chapter List Controls: Search input & Sort button
  var searchInput = el("input", {
    type: "search",
    class: "chapter-search-input",
    placeholder: "Search chapters (e.g. 1 or title)...",
    "aria-label": "Search chapters by number or title",
    value: ctx.ui.storyChapterSearch || "",
    "data-action": "storyChapterSearch"
  });

  var sortBtn = button(
    isDesc ? "Newest First ▾" : "Oldest First ▾",
    "btn chapter-sort-btn",
    {
      action: "toggleStoryChapterSort",
      "aria-label": "Sort chapters: currently " + (isDesc ? "newest first" : "oldest first")
    }
  );

  var chaptersHeader = el("div", "chapters-panel-header", [
    el("div", "chapters-header-left", [
      el("h2", "panel-title", "Table of Contents"),
      el("span", "chapter-count-meta", "Showing " + displayChapters.length + " of " + rawChapters.length + " chapters")
    ]),
    el("div", "chapters-header-controls", [
      searchInput,
      sortBtn
    ])
  ]);

  var chaptersPanel = el("section", "panel chapters-panel", [
    chaptersHeader,
    el("div", "chapter-list", chapterListItems)
  ]);
  leftCol.appendChild(chaptersPanel);
  layout.appendChild(leftCol);

  // Right Column (Sidebar)
  var rightCol = el("div", "story-details-sidebar");

  // Reading Progress Panel (if logged in and has progress)
  if (ctx.state.user && progressData && story.chapters && story.chapters.length) {
    var progressPanel = el("section", "panel progress-sidebar-panel", [
      el("h3", "panel-title", "Your Progress"),
      el("div", "progress-container-row", [
        progress(percent),
        el("span", "progress-percentage-text", percent + "%")
      ]),
      el("div", "mini-meta", "You've read " + percent + "% of this story")
    ]);
    rightCol.appendChild(progressPanel);
  }

  // Author details info
  var authorPanel = el("section", "panel", [
    el("h3", "panel-title", "About the Author"),
    el("div", "author-sidebar-info", [
      el("div", "profile-avatar-sm", authorName.charAt(0).toUpperCase()),
      el("div", null, [
        createAuthorLink(),
        el("div", "mini-meta", "Creator of " + story.title)
      ])
    ])
  ]);
  rightCol.appendChild(authorPanel);

  // Story Supporters Panel
  var supportersPanel = renderStorySupportersPanel(ctx, story, authorName);
  rightCol.appendChild(supportersPanel);

  // Story Rating & Review Panel
  var ratingPanel = renderStoryRatingPanel(ctx, story);
  rightCol.appendChild(ratingPanel);

  layout.appendChild(rightCol);

  ctx.view.appendChild(layout);
}

function renderStoryRatingPanel(ctx, story) {
  var avg = typeof story.rating === "number" && (story.ratings_count || 0) > 0 ? story.rating : null;
  var count = story.ratings_count || 0;
  var userRating = story.user_rating || null;
  var dist = story.rating_distribution || {};

  var bigScoreEl = el("div", "rating-big-score", [
    el("span", "rating-score-num", avg ? avg.toFixed(1) : "—"),
    el("span", "rating-score-stars", avg ? "★".repeat(Math.round(avg)) + "☆".repeat(5 - Math.round(avg)) : "☆☆☆☆☆"),
    el("span", "rating-count-meta", count > 0 ? (count + " " + (count === 1 ? "rating" : "ratings")) : "No ratings yet")
  ]);

  var distRows = [];
  var totalVotes = count > 0 ? count : 1;
  for (var star = 5; star >= 1; star--) {
    var starCount = Number(dist[star] || dist[String(star)] || 0);
    var pct = count > 0 ? Math.round((starCount / totalVotes) * 100) : 0;
    distRows.push(el("div", "rating-bar-row", [
      el("span", "rating-bar-label", star + "★"),
      el("div", "rating-bar-track", [
        el("div", { class: "rating-bar-fill", style: "width: " + pct + "%;" })
      ]),
      el("span", "rating-bar-count", String(starCount))
    ]));
  }
  var distEl = el("div", "rating-distribution", distRows);

  var overviewEl = el("div", "rating-overview", [
    bigScoreEl,
    distEl
  ]);

  // Interactive rating stars
  var starButtons = [];
  for (var s = 1; s <= 5; s++) {
    (function (val) {
      var isStarActive = Boolean(userRating && val <= userRating);
      var btn = el("button", {
        type: "button",
        class: "star-rate-btn" + (isStarActive ? " active" : ""),
        "data-action": "rateStory",
        "data-story-id": story.id,
        "data-rating": String(val),
        "aria-label": "Rate " + val + " out of 5 stars",
        title: val + " Star" + (val > 1 ? "s" : "")
      }, isStarActive ? "★" : "☆");
      starButtons.push(btn);
    })(s);
  }

  var feedbackText = userRating
    ? "You rated this " + userRating + " / 5 ★ (click to update)"
    : "Tap a star to rate this story";

  var rateBox = el("div", "rate-story-box", [
    el("span", "rate-story-title", "Rate this story"),
    el("div", "rate-stars-input", starButtons),
    el("span", "rate-story-feedback", feedbackText)
  ]);

  return el("section", "panel story-rating-panel", [
    el("h3", "panel-title", "Community Rating"),
    overviewEl,
    rateBox
  ]);
}

function renderStorySupportersPanel(ctx, story, authorName) {
  var container = el("section", "panel story-supporters-panel");
  var titleRow = el("div", "story-supporters-header", [
    el("h3", "panel-title", "Supporters & Tips"),
    el("button", {
      type: "button",
      class: "btn btn-sm btn-support-creator",
      "data-action": "openSupportModal",
      "data-story-id": story.id,
      "data-story-title": story.title || "Story",
      "data-author-name": authorName,
      "data-author-id": story.author_id,
      "aria-label": "Support creator with a tip",
      style: "display: flex; align-items: center; gap: 6px;"
    }, [
      makeTipIcon("icon-tip-svg"),
      "Tip Creator"
    ])
  ]);
  container.appendChild(titleRow);

  var listContainer = el("div", "story-supporters-list");
  listContainer.appendChild(el("p", "mini-meta", "Loading supporters..."));
  container.appendChild(listContainer);

  function loadSupporters() {
    if (!ctx.api) return;
    ctx.api("/stories/" + story.id + "/tips")
      .then(function (tips) {
        listContainer.innerHTML = "";
        if (!tips || tips.length === 0) {
          listContainer.appendChild(el("div", "empty-supporters", [
            el("p", "mini-meta", "Be the first supporter of \"" + story.title + "\"! 95% goes directly to the creator.")
          ]));
          return;
        }

        tips.forEach(function (tip) {
          var dateStr = tip.created_at ? formatDate(tip.created_at) : "Recently";
          var item = el("div", "story-supporter-item", [
            el("div", "story-supporter-meta", [
              el("span", "story-supporter-name", tip.donor_name || "A Generous Reader"),
              tip.donor_message ? el("span", "story-supporter-note", "“" + tip.donor_message + "”") : null,
              el("span", "mini-meta", dateStr)
            ].filter(Boolean)),
            el("span", "story-supporter-badge", "₹" + Math.round(tip.gross_amount))
          ]);
          listContainer.appendChild(item);
        });
      })
      .catch(function (err) {
        console.error("Failed to load story tips:", err);
        listContainer.innerHTML = "";
        listContainer.appendChild(el("p", "mini-meta", "Be the first supporter of this story!"));
      });
  }

  loadSupporters();

  var onTipCompleted = function (e) {
    if (e.detail && e.detail.storyId === story.id) {
      loadSupporters();
    }
  };
  document.addEventListener("tip:completed", onTipCompleted);

  return container;
}
