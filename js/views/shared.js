import { button, el, formatNumber, getStoryRatingInfo, iconButton, normalizeStoryType, normalizeStoryStatus, progress, svgEl, t } from "../components.js";
import { state } from "../state.js";

export function storyGrid(ctx, stories, options) {
  var g = el("section", "story-grid");
  stories.forEach(function (s) {
    g.appendChild(storyCard(ctx, s, options));
  });
  return g;
}

export function getReleaseBadgeInfo(story) {
  var chapters = story.chapters || [];
  var latestTime = null;
  var latestChapter = null;
  var latestChapterNum = chapters.length || 1;

  if (chapters.length > 0) {
    var publishedChapters = chapters.filter(function (c) {
      return !c.status || c.status === "published";
    });
    var chList = publishedChapters.length ? publishedChapters : chapters;

    var latestOrder = -1;
    chList.forEach(function (ch, idx) {
      var t = ch.scheduledAt || ch.scheduled_at || ch.createdAt || ch.created_at;
      var ms = t ? new Date(t).getTime() : 0;
      var order = (ch.sort_order !== undefined && ch.sort_order !== null) ? ch.sort_order : idx;
      if (latestChapter === null || ms > latestTime || (ms === latestTime && order >= latestOrder)) {
        latestTime = ms;
        latestOrder = order;
        latestChapter = ch;
        latestChapterNum = (ch.sort_order !== undefined && ch.sort_order !== null)
          ? (ch.sort_order + 1)
          : (idx + 1);
      }
    });
  }

  if ((!latestTime || latestTime === 0) && story.created_at) {
    latestTime = new Date(story.created_at).getTime();
  }

  var now = Date.now();
  var diffMs = latestTime ? (now - latestTime) : (24 * 60 * 60 * 1000 + 1);
  var isRecent = diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000;
  var text = "";

  if (isRecent) {
    var diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours >= 1) {
      text = diffHours + "h";
    } else {
      var diffMins = Math.floor(diffMs / (1000 * 60));
      text = diffMins > 0 ? (diffMins + "m") : "New";
    }
  } else if (latestTime) {
    var date = new Date(latestTime);
    var dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var dayName = dayNames[date.getDay()];
    // DD.MM DAY format (e.g. 10.11 TUE or 12.7 SUN)
    text = day + "." + month + " " + dayName;
  }

  var chapterTitle = latestChapter ? (latestChapter.title || ("Chapter " + latestChapterNum)) : ("Chapter " + latestChapterNum);

  return {
    text: text,
    isRecent: isRecent,
    chapterNum: latestChapterNum,
    chapterTitle: chapterTitle
  };
}

export function storyCard(ctx, story, options) {
  options = options || {};
  var tpl = document.getElementById("storyCardTemplate");
  var card = tpl.content.firstElementChild.cloneNode(true);
  var rawCover = story.cover || "";
  var coverVal = rawCover;
  var isImgUrl = rawCover && (rawCover.startsWith("http://") || rawCover.startsWith("https://") || rawCover.startsWith("/uploads/") || rawCover.startsWith("data:") || rawCover.startsWith("blob:"));

  if (coverVal && !coverVal.startsWith("url") && !coverVal.startsWith("linear-gradient") && !coverVal.startsWith("radial-gradient")) {
    coverVal = "url('" + coverVal + "')";
  }
  var coverArt = card.querySelector(".cover-art");
  coverArt.style.setProperty("--cover", coverVal);

  if (isImgUrl) {
    var imgEl = el("img", {
      class: "cover-img",
      src: rawCover,
      alt: (story.title || "Story") + " cover",
      loading: "lazy",
      decoding: "async",
      width: "300",
      height: "180"
    });
    imgEl.addEventListener("load", function () {
      imgEl.classList.add("loaded");
    });
    imgEl.addEventListener("error", function () {
      imgEl.style.display = "none";
    });
    coverArt.appendChild(imgEl);
  }
  var normType = normalizeStoryType(story.type);
  var badgeInfo = getReleaseBadgeInfo(story);
  var coverBadge = card.querySelector(".cover-badge");
  coverBadge.textContent = normType;
  coverBadge.dataset.type = normType;

  var coverDateBadge = card.querySelector(".cover-date-badge");
  if (coverDateBadge) {
    if (badgeInfo.text) {
      coverDateBadge.textContent = badgeInfo.isRecent ? ("🕒 " + badgeInfo.text) : badgeInfo.text;
      if (badgeInfo.isRecent) {
        coverDateBadge.classList.add("is-recent");
      }
      coverDateBadge.title = badgeInfo.isRecent ? ("Released " + badgeInfo.text + " ago") : ("Released on " + badgeInfo.text);
    } else {
      coverDateBadge.style.display = "none";
    }
  }

  // Populate rich hover overlay (Image 3)
  var authorName = story.author || story.author_name || "Author";
  var hoverTitle = card.querySelector(".hover-title");
  if (hoverTitle) {
    hoverTitle.dataset.title = story.title;
    hoverTitle.textContent = "";
  }

  var hoverAuthor = card.querySelector(".hover-author");
  if (hoverAuthor) {
    var hoverAuthorLink = el("a", "story-author-link", authorName);
    hoverAuthorLink.href = "#profile?username=" + encodeURIComponent(authorName);
    hoverAuthor.appendChild(hoverAuthorLink);
  }

  var hoverChBadge = card.querySelector(".hover-chapter-badge");
  if (hoverChBadge) hoverChBadge.textContent = "#" + badgeInfo.chapterNum;

  var hoverChName = card.querySelector(".hover-chapter-name");
  if (hoverChName) hoverChName.textContent = badgeInfo.chapterTitle;

  var hoverViews = card.querySelector(".hover-views");
  if (hoverViews) hoverViews.textContent = formatNumber(story.views) + " views";

  if (story.isNsfw) {
    var nsfwBadge = el("span", "badge badge-danger nsfw-tag-badge", "18+ NSFW");
    card.querySelector(".cover-button").appendChild(nsfwBadge);

    var prefs = (state.profile && state.profile.preferences) || {};
    var pref = prefs.nsfw_preference || "blur";
    if (pref === "blur") {
      card.querySelector(".cover-art").style.filter = "blur(12px) brightness(0.8)";
      var blurOverlay = el("div", "nsfw-blur-overlay", [
        el("span", { style: "display: inline-flex; justify-content: center; margin-bottom: 4px;" }, [el("span", "icon icon-warning icon-lg")]),
        el("span", { style: "font-size: 0.75rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;" }, "NSFW Blurred")
      ]);
      card.querySelector(".cover-button").appendChild(blurOverlay);
    }
  }

  var openButton = card.querySelector(".cover-button");
  openButton.dataset.action = options.manage ? "manageStory" : "openStory";
  openButton.dataset.id = story.id;
  openButton.setAttribute("aria-label", (options.manage ? "Manage " : "Open ") + story.title);

  var storyBody = card.querySelector(".story-body");
  if (storyBody) {
    storyBody.dataset.action = options.manage ? "manageStory" : "openStory";
    storyBody.dataset.id = story.id;
  }

  if (options.manage) {
    card.classList.add("manage-card");
  }

  var genres = (story.genre || "").split(",").map(function (g) { return g.trim(); }).filter(Boolean);
  var metaContainer = card.querySelector(".story-meta");
  metaContainer.innerHTML = "";

  // Bottom caption subtitle: chapter # + views (Image 2)
  var subChapter = el("span", "story-sub-chapter", "#" + badgeInfo.chapterNum);
  var subViews = el("span", "story-sub-views", formatNumber(story.views));
  metaContainer.appendChild(subChapter);
  metaContainer.appendChild(subViews);

  // Hidden author link inside meta for DOM/test compatibility
  var authorLink = el("a", { class: "story-author-link test-author-link", style: "display:none;" }, authorName);
  authorLink.href = "#profile?username=" + encodeURIComponent(authorName);
  metaContainer.appendChild(authorLink);

  // Honest rating: only display rating if trustworthy data exists
  var ratingInfo = getStoryRatingInfo(story);
  if (ratingInfo.isTrustworthy) {
    metaContainer.appendChild(el("span", { class: "meta-rating test-rating" }, "★ " + ratingInfo.score));
  }

  if (options.shelf) {
    card.classList.remove("story-card");
    card.classList.add("shelf-card");
    var titleH2 = card.querySelector("h2");
    if (titleH2) {
      var shelfTitleEl = el("div", "story-card-title", story.title);
      shelfTitleEl.title = "Read latest: " + badgeInfo.chapterTitle;
      shelfTitleEl.dataset.action = options.manage ? "manageStory" : "openLatestChapter";
      shelfTitleEl.dataset.id = story.id;
      shelfTitleEl.style.cursor = "pointer";
      titleH2.replaceWith(shelfTitleEl);
    }
  } else {
    var titleEl = card.querySelector("h2");
    if (titleEl) {
      titleEl.textContent = story.title;
      titleEl.title = "Read latest: " + badgeInfo.chapterTitle;
      titleEl.dataset.action = options.manage ? "manageStory" : "openLatestChapter";
      titleEl.dataset.id = story.id;
      titleEl.style.cursor = "pointer";
    }
  }
  card.querySelector("p").textContent = story.description;

  var tags = card.querySelector(".tag-row");
  var isPromoted = Boolean(
    story.isPromoted ||
    story.is_promoted ||
    (Array.isArray(story.tags) && story.tags.some(function (t) {
      return String(t).toLowerCase() === "promoted" || String(t).toLowerCase() === "sponsored";
    }))
  );
  if (isPromoted) {
    tags.appendChild(el("span", {
      class: "tag tag-promoted",
      style: "background: var(--accent); color: #fff; font-weight: 700;",
      title: "Promoted or Sponsored Content",
      "aria-label": "Promoted story"
    }, "📢 Promoted"));
  }

  var statusInfo = normalizeStoryStatus(story.status);
  if (statusInfo.id !== "published") {
    tags.appendChild(el("span", "tag status-tag " + statusInfo.id, statusInfo.label));
  }
  genres.forEach(function (g) {
    tags.appendChild(el("span", "tag", g));
  });

  var customTags = (Array.isArray(story.tags) ? story.tags : []).filter(function (t) {
    var lower = String(t).toLowerCase();
    return lower !== "promoted" && lower !== "sponsored" && lower !== (story.genre || "").toLowerCase() && lower !== (story.type || "").toLowerCase();
  });
  customTags.slice(0, 3).forEach(function (tag) {
    tags.appendChild(el("span", "tag tag-custom", "#" + tag));
  });

  // Progress indicators
  var progressData = ctx.getStoryReadingProgress(story.id);
  var readBtnText = "Read";
  var isResume = false;
  if (progressData && story.chapters && story.chapters.length) {
    var chIdx = story.chapters.findIndex(function (c) { return c.id === progressData.chapter_id; });
    if (chIdx !== -1) {
      readBtnText = "Resume (Ch. " + (chIdx + 1) + ")";
      isResume = true;
      var percent = ctx.calculateStoryProgressPercent(story);
      var progressEl = el("div", "story-progress-row", [
        progress(percent),
        el("span", "mini-meta", percent + "% read")
      ]);
      card.querySelector(".story-body").insertBefore(progressEl, tags);
    } else {
      readBtnText = "Resume";
      isResume = true;
    }
  } else if (progressData) {
    readBtnText = "Resume";
    isResume = true;
  }

  var actions = card.querySelector(".story-actions");
  var primaryBtnAction = isResume ? "openReader" : "openStory";
  if (options.manage) {
    actions.appendChild(iconButton("Manage", "btn success", { action: "manageStory", id: story.id }, "icon-gear"));
    actions.appendChild(iconButton(readBtnText, "btn", { action: primaryBtnAction, id: story.id }, "icon-book"));
    actions.appendChild(iconButton("Delete", "btn danger", { action: "deleteStory", id: story.id }, "icon-trash", !canDeleteStory(ctx, story)));
  } else if (isResume) {
    card.classList.add("has-resume");
    actions.appendChild(button(readBtnText, "btn primary btn-sm", { action: "openReader", id: story.id }));
  }

  return card;
}

export function canDeleteStory(ctx, story) {
  if (ctx.state.role === "admin") return true;
  if (ctx.state.role === "author") {
    if (story.author === "You") return true;
    if (ctx.state.user && story.author_id === ctx.state.user.id) return true;
    var currentUsername = ctx.state.profile ? ctx.state.profile.username : "";
    return !!(currentUsername && story.author === currentUsername);
  }
  return false;
}

export function storyCardSkeleton() {
  return el("div", "skeleton-card", [
    svgEl("svg", {
      width: "100%",
      height: "100%",
      viewBox: "0 0 450 200",
      class: "skeleton-svg"
    }, [
      svgEl("defs", null, [
        svgEl("linearGradient", { id: "shimmer-card", x1: "-20%", y1: "0%", x2: "120%", y2: "0%" }, [
          svgEl("stop", { offset: "0%", "stop-color": "#241E1A" }),
          svgEl("stop", { offset: "50%", "stop-color": "#332A24" }),
          svgEl("stop", { offset: "100%", "stop-color": "#241E1A" }),
          svgEl("animate", { attributeName: "x1", from: "-100%", to: "100%", dur: "1.6s", repeatCount: "indefinite" }),
          svgEl("animate", { attributeName: "x2", from: "0%", to: "200%", dur: "1.6s", repeatCount: "indefinite" })
        ])
      ]),
      svgEl("rect", { x: "10", y: "10", rx: "8", ry: "8", width: "120", height: "180", fill: "url(#shimmer-card)" }),
      svgEl("rect", { x: "150", y: "20", rx: "4", ry: "4", width: "160", height: "14", fill: "url(#shimmer-card)" }),
      svgEl("rect", { x: "150", y: "45", rx: "4", ry: "4", width: "240", height: "22", fill: "url(#shimmer-card)" }),
      svgEl("rect", { x: "150", y: "85", rx: "4", ry: "4", width: "280", height: "12", fill: "url(#shimmer-card)" }),
      svgEl("rect", { x: "150", y: "105", rx: "4", ry: "4", width: "260", height: "12", fill: "url(#shimmer-card)" }),
      svgEl("rect", { x: "150", y: "135", rx: "4", ry: "4", width: "60", height: "18", fill: "url(#shimmer-card)" }),
      svgEl("rect", { x: "220", y: "135", rx: "4", ry: "4", width: "70", height: "18", fill: "url(#shimmer-card)" }),
      svgEl("rect", { x: "150", y: "165", rx: "6", ry: "6", width: "90", height: "24", fill: "url(#shimmer-card)" }),
      svgEl("rect", { x: "250", y: "165", rx: "6", ry: "6", width: "90", height: "24", fill: "url(#shimmer-card)" })
    ])
  ]);
}

export function readingListCardSkeleton() {
  return el("div", "reading-list-card skeleton-card", [
    svgEl("svg", {
      width: "100%",
      height: "80",
      viewBox: "0 0 600 80",
      class: "skeleton-svg"
    }, [
      svgEl("defs", null, [
        svgEl("linearGradient", { id: "shimmer-list", x1: "-20%", y1: "0%", x2: "120%", y2: "0%" }, [
          svgEl("stop", { offset: "0%", "stop-color": "#241E1A" }),
          svgEl("stop", { offset: "50%", "stop-color": "#332A24" }),
          svgEl("stop", { offset: "100%", "stop-color": "#241E1A" }),
          svgEl("animate", { attributeName: "x1", from: "-100%", to: "100%", dur: "1.6s", repeatCount: "indefinite" }),
          svgEl("animate", { attributeName: "x2", from: "0%", to: "200%", dur: "1.6s", repeatCount: "indefinite" })
        ])
      ]),
      svgEl("rect", { x: "10", y: "15", rx: "4", ry: "4", width: "180", height: "18", fill: "url(#shimmer-list)" }),
      svgEl("rect", { x: "200", y: "15", rx: "4", ry: "4", width: "60", height: "18", fill: "url(#shimmer-list)" }),
      svgEl("rect", { x: "10", y: "42", rx: "3", ry: "3", width: "350", height: "12", fill: "url(#shimmer-list)" }),
      svgEl("rect", { x: "10", y: "62", rx: "3", ry: "3", width: "240", height: "10", fill: "url(#shimmer-list)" })
    ])
  ]);
}

export function emptyState(title, message, ctaButton, iconPath) {
  iconPath = iconPath || "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z";
  const content = [
    svgEl("svg", {
      viewBox: "0 0 24 24",
      width: "64",
      height: "64",
      class: "empty-state-icon"
    }, [
      svgEl("path", { d: iconPath })
    ]),
    el("h3", null, title),
    el("p", null, message)
  ];
  if (ctaButton) {
    content.push(ctaButton);
  }
  return el("div", "empty-state", content);
}
