import { button, el, formatDate, formatNumber, list, progress } from "../components.js?v=comic-fit-20260609-v27";

export function renderStoryDetails(ctx) {
  ctx = ctx || this;
  var params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  var storyId = params.get("id");
  var story = ctx.state.stories.find(function (s) { return s.id === storyId; });

  if (!story) {
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
  var coverVal = story.cover;
  if (coverVal && !coverVal.startsWith("url") && !coverVal.startsWith("linear-gradient") && !coverVal.startsWith("radial-gradient")) {
    coverVal = "url('" + coverVal + "')";
  }

  var headerCover = el("div", "story-details-cover");
  if (coverVal) {
    headerCover.style.backgroundImage = coverVal;
  }

  var authorLink = el("a", "story-author-link", story.author);
  authorLink.href = "#profile?username=" + encodeURIComponent(story.author);

  // Reading progress computation
  var progressData = ctx.getStoryReadingProgress(story.id);
  var readBtnText = "Start Reading";
  if (progressData && story.chapters && story.chapters.length) {
    var chIdx = story.chapters.findIndex(function (c) { return c.id === progressData.chapter_id; });
    if (chIdx !== -1) {
      readBtnText = "Resume Reading (Ch. " + (chIdx + 1) + ")";
    } else {
      readBtnText = "Resume Reading";
    }
  }

  var isBookmarked = ctx.state.bookmarkIds && ctx.state.bookmarkIds.indexOf(story.id) !== -1;

  if (ctx.state.user && ctx.state.bookmarkIds === null) {
    ctx.api("/bookmarks/ids")
      .then(ids => {
        ctx.state.bookmarkIds = ids;
        ctx.render();
      })
      .catch(err => console.error("Error loading bookmark IDs:", err));
  }

  var bookmarkBtn = el("button", {
    class: "btn" + (isBookmarked ? " active" : ""),
    style: "display: flex; align-items: center; gap: 6px;" + (isBookmarked ? " color: var(--accent);" : ""),
    "data-action": "bookmarkStory",
    "data-story-id": story.id
  }, [
    el("span", { class: "icon icon-bookmark", style: "width: 16px; height: 16px;" }),
    isBookmarked ? "Bookmarked" : "Bookmark"
  ]);

  var playlistBtn = el("button", {
    class: "btn",
    style: "display: flex; align-items: center; gap: 6px;",
    "data-action": "openAddToReadingListModal",
    "data-story-id": story.id
  }, [
    el("span", { class: "icon icon-plus", style: "width: 16px; height: 16px;" }),
    "Add to Playlist"
  ]);

  var headerCard = el("section", "story-header-card", [
    headerCover,
    el("div", "story-header-info", [
      el("div", "story-details-badge-row", 
        (story.genre || "").split(",").map(function (g) { return g.trim(); }).filter(Boolean).map(function (g) {
          return el("span", "badge genre-badge", g);
        }).concat([
          el("span", "badge type-badge", story.type)
        ])
      ),
      el("h1", "story-details-title", story.title),
      el("div", "story-details-author-row", [
        "By ",
        authorLink
      ]),
      el("div", "story-details-stats", [
        el("span", "stat-item", [el("strong", null, formatNumber(story.views)), " reads"]),
        el("span", "stat-item", [el("strong", null, formatNumber(story.followers)), " followers"]),
        el("span", "stat-item", [el("strong", null, story.chapters ? story.chapters.length : 0), " chapters"])
      ]),
      el("div", "button-row details-action-row", [
        button(readBtnText, "btn primary orange-glow-btn", { action: "openReader", id: story.id }),
        bookmarkBtn,
        playlistBtn
      ])
    ])
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

  var synopsisPanel = el("section", "panel", [
    el("h2", "panel-title", "Synopsis"),
    el("p", "story-details-synopsis", story.description || "No synopsis available."),
    tagsContainer
  ]);
  leftCol.appendChild(synopsisPanel);

  // Chapters Panel
  var chapterListItems = [];
  var sortedChapters = (story.chapters || []).slice().sort(function (a, b) {
    return a.sort_order - b.sort_order;
  });

  if (sortedChapters.length === 0) {
    chapterListItems.push(el("div", "empty", "No chapters published yet."));
  } else {
    // Determine the index of each chapter in the original story.chapters array so openChapter routes correctly
    sortedChapters.forEach(function (ch) {
      var origIndex = story.chapters.findIndex(function (c) { return c.id === ch.id; });
      if (origIndex === -1) origIndex = 0;

      var chStatus = ch.status || "published";
      var chAccess = ch.access || "public";
      
      var metaText = "Ch. " + (origIndex + 1);
      if (chAccess !== "public") {
        metaText += " · " + chAccess.charAt(0).toUpperCase() + chAccess.slice(1);
      }
      if (chStatus !== "published") {
        metaText += " · " + chStatus.charAt(0).toUpperCase() + chStatus.slice(1);
      }
      if (ch.scheduledAt && chStatus === "scheduled") {
        metaText += " (" + formatDate(ch.scheduledAt) + ")";
      }

      var row = el("div", "chapter-item details-chapter-item", [
        el("div", "chapter-item-info", [
          el("strong", "chapter-item-title", ch.title),
          el("span", "mini-meta", metaText)
        ]),
        button("Read", "btn text-btn", { action: "openChapter", index: String(origIndex) })
      ]);
      chapterListItems.push(row);
    });
  }

  var chaptersPanel = el("section", "panel", [
    el("h2", "panel-title", "Table of Contents"),
    el("div", "chapter-list", chapterListItems)
  ]);
  leftCol.appendChild(chaptersPanel);
  layout.appendChild(leftCol);

  // Right Column (Sidebar)
  var rightCol = el("div", "story-details-sidebar");

  // Reading Progress Panel (if logged in and has progress)
  if (ctx.state.user && progressData && story.chapters && story.chapters.length) {
    var percent = ctx.calculateStoryProgressPercent(story);
    var progressPanel = el("section", "panel", [
      el("h3", "panel-title", "Your Progress"),
      progress(percent),
      el("div", "mini-meta", percent + "% read")
    ]);
    rightCol.appendChild(progressPanel);
  }

  // Author details info
  var authorPanel = el("section", "panel", [
    el("h3", "panel-title", "About the Author"),
    el("div", "author-sidebar-info", [
      el("div", "profile-avatar-sm", story.author.charAt(0).toUpperCase()),
      el("div", null, [
        authorLink,
        el("div", "mini-meta", "Creator of " + story.title)
      ])
    ])
  ]);
  rightCol.appendChild(authorPanel);
  layout.appendChild(rightCol);

  ctx.view.appendChild(layout);
}
