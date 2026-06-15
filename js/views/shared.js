import { button, el, formatNumber, iconButton, progress, svgEl } from "../components.js?v=a11y-focus-20260613-v28";

export function storyGrid(ctx, stories, options) {
  var g = el("section", "story-grid");
  stories.forEach(function (s) {
    g.appendChild(storyCard(ctx, s, options));
  });
  return g;
}

export function storyCard(ctx, story, options) {
  options = options || {};
  var tpl = document.getElementById("storyCardTemplate");
  var card = tpl.content.firstElementChild.cloneNode(true);
  var coverVal = story.cover;
  if (coverVal && !coverVal.startsWith("url") && !coverVal.startsWith("linear-gradient") && !coverVal.startsWith("radial-gradient")) {
    coverVal = "url('" + coverVal + "')";
  }
  card.querySelector(".cover-art").style.setProperty("--cover", coverVal);
  var coverBadge = card.querySelector(".cover-badge");
  coverBadge.textContent = story.type;
  coverBadge.dataset.type = story.type;

  var openButton = card.querySelector(".cover-button");
  openButton.dataset.action = options.manage ? "manageStory" : "openStory";
  openButton.dataset.id = story.id;
  openButton.setAttribute("aria-label", (options.manage ? "Manage " : "Open ") + story.title);

  var genres = (story.genre || "").split(",").map(function (g) { return g.trim(); }).filter(Boolean);
  var metaContainer = card.querySelector(".story-meta");
  metaContainer.innerHTML = "";
  metaContainer.appendChild(document.createTextNode(genres.join(", ") + " / "));
  var authorLink = el("a", "story-author-link", story.author);
  authorLink.href = "#profile?username=" + encodeURIComponent(story.author);
  metaContainer.appendChild(authorLink);
  metaContainer.appendChild(document.createTextNode(" / " + formatNumber(story.views) + " reads"));
  var titleEl = card.querySelector("h2");
  titleEl.textContent = story.title;
  titleEl.dataset.action = "openStory";
  titleEl.dataset.id = story.id;
  card.querySelector("p").textContent = story.description;

  var tags = card.querySelector(".tag-row");
  genres.forEach(function (g) {
    tags.appendChild(el("span", "tag", g));
  });

  // Progress indicators
  var progressData = ctx.getStoryReadingProgress(story.id);
  var readBtnText = "Read";
  if (progressData && story.chapters && story.chapters.length) {
    var chIdx = story.chapters.findIndex(function (c) { return c.id === progressData.chapter_id; });
    if (chIdx !== -1) {
      readBtnText = "Resume (Ch. " + (chIdx + 1) + ")";
      var percent = ctx.calculateStoryProgressPercent(story);
      var progressEl = el("div", "story-progress-row", [
        progress(percent),
        el("span", "mini-meta", percent + "% read")
      ]);
      card.querySelector(".story-body").insertBefore(progressEl, tags);
    } else {
      readBtnText = "Resume";
    }
  }

  var actions = card.querySelector(".story-actions");
  if (options.manage) {
    actions.appendChild(iconButton("Manage", "btn success", { action: "manageStory", id: story.id }, "icon-gear"));
    actions.appendChild(iconButton(readBtnText, "btn", { action: "openStory", id: story.id }, "icon-book"));
    actions.appendChild(iconButton("Delete", "btn danger", { action: "deleteStory", id: story.id }, "icon-trash", !canDeleteStory(ctx, story)));
  } else {
    actions.appendChild(button(readBtnText, "btn primary", { action: "openStory", id: story.id }));
    actions.appendChild(button(ctx.state.library.indexOf(story.id) === -1 ? "Follow" : "Following", "btn", { action: "follow", id: story.id }));
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

export function conversationItemSkeleton() {
  return el("li", "messages-convo-item skeleton-convo", [
    svgEl("svg", {
      width: "100%",
      height: "60",
      viewBox: "0 0 320 60",
      class: "skeleton-svg"
    }, [
      svgEl("defs", null, [
        svgEl("linearGradient", { id: "shimmer-convo", x1: "-20%", y1: "0%", x2: "120%", y2: "0%" }, [
          svgEl("stop", { offset: "0%", "stop-color": "#241E1A" }),
          svgEl("stop", { offset: "50%", "stop-color": "#332A24" }),
          svgEl("stop", { offset: "100%", "stop-color": "#241E1A" }),
          svgEl("animate", { attributeName: "x1", from: "-100%", to: "100%", dur: "1.6s", repeatCount: "indefinite" }),
          svgEl("animate", { attributeName: "x2", from: "0%", to: "200%", dur: "1.6s", repeatCount: "indefinite" })
        ])
      ]),
      svgEl("circle", { cx: "30", cy: "30", r: "20", fill: "url(#shimmer-convo)" }),
      svgEl("rect", { x: "65", y: "12", rx: "3", ry: "3", width: "100", height: "14", fill: "url(#shimmer-convo)" }),
      svgEl("rect", { x: "260", y: "12", rx: "3", ry: "3", width: "45", height: "10", fill: "url(#shimmer-convo)" }),
      svgEl("rect", { x: "65", y: "35", rx: "3", ry: "3", width: "180", height: "12", fill: "url(#shimmer-convo)" })
    ])
  ]);
}

export function chatHistorySkeleton() {
  return el("div", "messages-bubble-wrapper received skeleton-bubble", [
    svgEl("svg", {
      width: "300",
      height: "60",
      viewBox: "0 0 300 60",
      class: "skeleton-svg"
    }, [
      svgEl("defs", null, [
        svgEl("linearGradient", { id: "shimmer-bubble", x1: "-20%", y1: "0%", x2: "120%", y2: "0%" }, [
          svgEl("stop", { offset: "0%", "stop-color": "#241E1A" }),
          svgEl("stop", { offset: "50%", "stop-color": "#332A24" }),
          svgEl("stop", { offset: "100%", "stop-color": "#241E1A" }),
          svgEl("animate", { attributeName: "x1", from: "-100%", to: "100%", dur: "1.6s", repeatCount: "indefinite" }),
          svgEl("animate", { attributeName: "x2", from: "0%", to: "200%", dur: "1.6s", repeatCount: "indefinite" })
        ])
      ]),
      svgEl("rect", { x: "0", y: "0", rx: "10", ry: "10", width: "240", height: "40", fill: "url(#shimmer-bubble)" }),
      svgEl("rect", { x: "0", y: "46", rx: "3", ry: "3", width: "60", height: "10", fill: "url(#shimmer-bubble)" })
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

