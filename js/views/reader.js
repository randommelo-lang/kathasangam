import { button, el, field, form, formatDate, formatDateDDMMYYYY, formatNumber, input, list, progress, segmentButton, select, submitButton, textarea, svgEl, makeAnimatedDotsHorizontalIcon, makeAnimatedSendHorizontalIcon, makeTipIcon } from "../components.js";
import { emptyState } from "./shared.js";
import { recordStoryView } from "../controllers/readerController.js";

function createParagraphBubble(ctx, chapter, index) {
  var inlineComments = (chapter.comments || []).filter(function (c) {
    return c.paragraphIndex === index;
  });
  var count = inlineComments.length;
  var bubble = el("button", "para-comment-bubble" + (count > 0 ? " has-comments" : ""), [
    svgEl("svg", { viewBox: "0 0 24 24", class: "icon-bubble-svg" }, [
      svgEl("path", { d: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" })
    ]),
    count > 0 ? el("span", "count", String(count)) : null
  ].filter(Boolean));
  bubble.setAttribute("aria-label", (count ? count + " comments" : "Add comment") + " for paragraph " + (index + 1));
  bubble.dataset.action = "openParagraphComments";
  bubble.dataset.index = String(index);
  return bubble;
}

function renderCommentItem(c, ctx, story, isReply, isInline, pIdx) {
  var isDeleted = c.text === "[deleted]" || c.isDeleted;
  var currentUserId = ctx.state.user && ctx.state.user.id ? String(ctx.state.user.id) : "";
  var commentUserId = c.user_id || c.userId ? String(c.user_id || c.userId) : "";
  var currentUsername = ctx.state.profile && ctx.state.profile.username
    ? ctx.state.profile.username
    : (ctx.state.user && ctx.state.user.email ? ctx.state.user.email.split("@")[0] : "");
  var ownsComment = (currentUserId && commentUserId && currentUserId === commentUserId)
    || (currentUsername && c.user === currentUsername);
  var userRole = (ctx.state.profile && ctx.state.profile.role) || ctx.state.role;
  var canDelete = !isDeleted && (ownsComment || ["moderator", "admin"].indexOf(userRole) !== -1);
  var canReport = !isDeleted && (ctx.state.user && !ownsComment);
  var initials = isDeleted ? "—" : (c.user || "U").substring(0, 2).toUpperCase();
  var isStoryCreator = !isDeleted && (c.user === story.author || c.user_id === story.author_id);
  var isSupporter = !isDeleted && !isStoryCreator && (c.isSupporter || c.is_supporter);
  var menuItems = [];

  if (canReport) {
    menuItems.push(button("Report", "comment-menu-item comment-menu-report", { action: "reportComment", id: c.id }));
  }

  if (canDelete) {
    var deleteButton = button("", "comment-menu-item comment-menu-delete", {
      action: "deleteComment",
      id: c.id
    });
    deleteButton.title = "Delete comment";
    deleteButton.setAttribute("aria-label", "Delete comment");
    deleteButton.appendChild(el("img", {
      class: "comment-menu-trash-icon",
      src: "icons/trash-icon.svg",
      alt: ""
    }));
    deleteButton.appendChild(el("span", "comment-menu-delete-label", "Delete"));
    menuItems.push(deleteButton);
  }

  var overflowMenu = null;
  if (!isDeleted && ctx.state.user && menuItems.length) {
    overflowMenu = el("details", "comment-overflow-menu", [
      el("summary", {
        class: "comment-overflow-trigger",
        "aria-label": "Comment actions",
        title: "Comment actions"
      }, el("img", {
        class: "comment-menu-dots-icon",
        src: "icons/dots-vertical-icon.svg?v=2",
        alt: ""
      })),
      el("div", "comment-overflow-panel", menuItems)
    ]);
  }

  var itemClass = "activity-item comment-item" + (isReply ? " comment-reply-item" : "") + (isInline ? " inline-comment-item" : "") + (isDeleted ? " comment-deleted-item" : "");
  var itemStyle = isReply ? "padding: 6px 0; border: none; background: none; box-shadow: none;" : "";

  var avatarEl = el("div", "comment-avatar" + (isDeleted ? " comment-deleted-avatar" : ""), initials);
  if (isReply) {
    avatarEl.setAttribute("style", "width: 26px; height: 26px; min-width: 26px; font-size: 0.72rem; line-height: 26px;");
  }

  var commentTime = (!isDeleted && (c.createdAt || c.created_at)) ? el("span", "comment-time", formatDateDDMMYYYY(c.createdAt || c.created_at)) : null;

  var commenterNameEl = isDeleted
    ? el("span", "commenter-name comment-deleted-name", "[deleted]")
    : (function () {
        var a = el("a", "commenter-name", c.user);
        a.href = "#profile?username=" + encodeURIComponent(c.user);
        return a;
      })();

  var commentTextEl = isDeleted
    ? el("span", "comment-text comment-deleted-text", "[deleted]")
    : el("span", "comment-text", c.text);

  var item = el("div", { class: itemClass }, [
    avatarEl,
    el("div", "comment-body", [
      el("div", "comment-header", [
        el("div", "comment-meta", [
          commenterNameEl,
          isStoryCreator ? el("span", "comment-author-badge", "Author") : null,
          isSupporter ? el("span", { class: "comment-supporter-badge", title: "Story Supporter" }, "🪙 Supporter") : null,
          commentTime
        ].filter(Boolean)),
        overflowMenu
      ]),
      commentTextEl,
      (!isDeleted && ctx.state.user) ? el("div", "comment-footer-actions", [
        button("Reply", "comment-reply-link", { action: "showReplyForm", id: c.id })
      ]) : null
    ].filter(Boolean))
  ]);

  if (itemStyle) item.setAttribute("style", itemStyle);
  return item;
}

function renderCommentNode(c, childrenMap, depth, ctx, story, isInline, pIdx) {
  var isReply = depth > 0;
  var isDeleted = c.text === "[deleted]" || c.isDeleted;
  var rawChildren = childrenMap[c.id] || [];

  // Recursively process children
  var renderedChildren = [];
  if (rawChildren.length) {
    renderedChildren = rawChildren.map(function (child) {
      return renderCommentNode(child, childrenMap, depth + 1, ctx, story, isInline, pIdx);
    }).filter(Boolean);
  }

  // If this comment is deleted and has no visible replies, hide it completely
  if (isDeleted && renderedChildren.length === 0) {
    return null;
  }

  var nodeChildren = [
    renderCommentItem(c, ctx, story, isReply, isInline, pIdx)
  ];

  if (ctx.ui.activeReplyCommentId === c.id) {
    var replyFormEl = el("form", {
      "data-form": "replyForm",
      class: "comment-inline-reply-form" + (isReply ? " is-nested-reply-form" : "")
    }, [
      el("input", { type: "hidden", name: "parentId", value: c.id }),
      (pIdx !== undefined && pIdx !== null) ? el("input", { type: "hidden", name: "paragraphIndex", value: String(pIdx) }) : null,
      (function() {
        var replyTa = document.createElement("textarea");
        replyTa.name = "replyText";
        replyTa.className = "comment-reply-textarea";
        replyTa.placeholder = "Write a reply to " + (isDeleted ? "comment" : (c.user || "comment")) + "...";
        replyTa.maxLength = 5000;
        replyTa.required = true;
        replyTa.rows = 2;
        return replyTa;
      })(),
      el("div", { class: "comment-reply-form-actions" }, [
         button("Cancel", "btn secondary btn-sm", { action: "cancelReply" }),
         submitButton("Post Reply", "btn primary btn-sm")
      ])
    ].filter(Boolean));
    nodeChildren.push(replyFormEl);
  }

  if (renderedChildren.length) {
    var repliesList = el("div", {
      class: "comment-replies-list comment-tree-replies"
    }, renderedChildren);
    nodeChildren.push(repliesList);
  }

  var nodeTag = isReply ? "div" : "li";
  var nodeClass = isReply ? "comment-tree-node" : "comment-thread-wrapper comment-tree-node";
  return el(nodeTag, {
    class: nodeClass
  }, nodeChildren);
}

function renderCommentThread(c, replies, ctx, story, isInline, pIdx) {
  var childrenMap = {};
  if (replies && replies.length) {
    childrenMap[c.id] = replies;
  }
  return renderCommentNode(c, childrenMap, 0, ctx, story, isInline, pIdx);
}

function inlineCommentsDrawer(ctx, story, chapter) {
  var pIdx = ctx.ui.activeParagraphIndex;
  var isOpen = pIdx !== undefined && pIdx !== null;
  
  var drawerClasses = "inline-comments-drawer" + (isOpen ? " active" : "");
  if (!isOpen) {
    return el("div", drawerClasses); // Render empty hidden drawer
  }

  // Get paragraph snippet
  var isComic = story.type === "Chitrānk";
  var snippetText = "";
  if (isComic) {
    var pObj = chapter.pages && chapter.pages[pIdx];
    snippetText = pObj ? (pObj.label || "Comic Panel #" + (pIdx + 1)) : "Comic Panel #" + (pIdx + 1);
  } else {
    var rawPara = chapter.content && chapter.content[pIdx];
    if (rawPara) {
      snippetText = rawPara;
      // Strip formatting tags
      if (snippetText.startsWith("[center]")) snippetText = snippetText.substring(8);
      else if (snippetText.startsWith("[right]")) snippetText = snippetText.substring(7);
      else if (snippetText.startsWith("[left]")) snippetText = snippetText.substring(6);
    } else {
      snippetText = "Paragraph #" + (pIdx + 1);
    }
  }

  // Max snippet length for header
  if (snippetText.length > 60) {
    snippetText = snippetText.substring(0, 57) + "...";
  }

  var closeBtn = button("✕", "drawer-close-btn", { action: "closeParagraphComments" });
  
  var header = el("div", "drawer-header", [
    el("div", "inline-comments-header-title", [
      el("h3", null, "Inline Comments"),
      el("span", "snippet-text", snippetText)
    ]),
    closeBtn
  ]);

  // Filter comments for this paragraph
  var inlineComments = (chapter.comments || []).filter(function (c) {
    return c.paragraphIndex === pIdx;
  });

  var listContent;
  if (inlineComments.length) {
    var rootInlineComments = inlineComments.filter(function (c) { return !c.parentId; });
    var repliesMap = {};
    inlineComments.forEach(function (c) {
      if (c.parentId) {
        if (!repliesMap[c.parentId]) repliesMap[c.parentId] = [];
        repliesMap[c.parentId].push(c);
      }
    });

    var renderedInline = rootInlineComments.map(function (c) {
      return renderCommentThread(c, repliesMap[c.id] || [], ctx, story, true, pIdx);
    }).filter(Boolean);

    if (renderedInline.length) {
      listContent = el("ul", "activity-list comment-feed-list inline-comments-list", renderedInline);
    } else {
      listContent = emptyState(
        "No inline comments yet",
        "Be the first to react to this specific paragraph/panel!",
        null,
        "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
      );
    }
  } else {
    listContent = emptyState(
      "No inline comments yet",
      "Be the first to react to this specific paragraph/panel!",
      null,
      "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
    );
  }

  // Inline Comment Form
  var formEl;
  if (!ctx.state.user) {
    formEl = el("div", "comment-login-prompt", [
      el("p", null, "Please log in to comment."),
      button("Log In", "btn primary btn-sm", { action: "loginToComment" })
    ]);
  } else {
    var inlineTa = textarea("inlineCommentText", "");
    inlineTa.maxLength = 5000;
    formEl = form("inlineCommentForm", [
      field("Add reaction (max 5000 characters)", inlineTa),
      submitButton("Post Comment", "btn primary btn-sm")
    ]);
    // Set a data attribute to bind the index
    formEl.dataset.paragraphIndex = String(pIdx);
  }

  return el("div", drawerClasses, [
    header,
    el("div", "drawer-scroll-container", [
      listContent,
      formEl
    ])
  ]);
}

function extractRawUrl(bg) {
  if (!bg) return "";
  var match = bg.match(/^url\(['"]?(.*?)['"]?\)$/i);
  return match ? match[1] : bg;
}

function commentForm(ctx) {
  if (!ctx.state.user) {
    return el("div", "comment-login-prompt", [
      el("p", null, "Please log in to post a comment."),
      button("Log In", "btn primary", { action: "loginToComment" })
    ]);
  }

  var ta = document.createElement("textarea");
  ta.name = "comment";
  ta.className = "comment-composer-textarea";
  ta.placeholder = "Join the conversation";
  ta.maxLength = 5000;
  ta.rows = 1;
  ta.required = true;

  // Twitter-style Circular Character Progress Ring
  var ringRadius = 9;
  var ringCircumference = 2 * Math.PI * ringRadius; // ~56.5487
  var trackCircle = svgEl("circle", {
    class: "comment-char-ring-track",
    cx: "12",
    cy: "12",
    r: String(ringRadius),
    fill: "none",
    stroke: "rgba(255, 255, 255, 0.15)",
    "stroke-width": "2"
  });
  var progressCircle = svgEl("circle", {
    class: "comment-char-ring-progress",
    cx: "12",
    cy: "12",
    r: String(ringRadius),
    fill: "none",
    stroke: "var(--primary)",
    "stroke-width": "2",
    "stroke-dasharray": String(ringCircumference),
    "stroke-dashoffset": String(ringCircumference),
    "stroke-linecap": "round",
    transform: "rotate(-90 12 12)"
  });

  var ringSvg = svgEl("svg", {
    class: "comment-char-ring-svg",
    width: "22",
    height: "22",
    viewBox: "0 0 24 24"
  }, [trackCircle, progressCircle]);

  var ringWrap = el("div", {
    class: "comment-char-ring-wrap",
    title: "0 / 5000"
  }, [ringSvg]);

  // Send Button with animated horizontal plane icon
  var sendIcon = makeAnimatedSendHorizontalIcon({ size: 18, className: "comment-send-plane-icon" });
  var sendBtn = el("button", {
    type: "submit",
    class: "comment-send-btn",
    "aria-label": "Send comment",
    title: "Send comment"
  }, [sendIcon]);
  sendBtn._animatedIconHandle = sendIcon.handle;

  sendBtn.addEventListener("click", function () {
    if (sendIcon.handle) {
      sendIcon.handle.startAnimation();
    }
  });

  var toolsWrap = el("div", "comment-composer-tools", [
    ringWrap,
    sendBtn
  ]);

  var bottomRow = el("div", "comment-composer-bottom", [
    el("div", "comment-composer-spacer"),
    toolsWrap
  ]);

  var formCard = el("form", {
    class: "comment-composer-card collapsed",
    "data-form": "commentForm"
  }, [
    ta,
    bottomRow
  ]);

  function updateCharRing() {
    var len = ta.value.length;
    var ratio = Math.min(1, len / 5000);
    var offset = ringCircumference * (1 - ratio);
    progressCircle.style.strokeDashoffset = offset + "px";
    ringWrap.title = len + " / 5000";

    if (ratio > 0.95) {
      progressCircle.style.stroke = "var(--danger, #ef4444)";
    } else if (ratio > 0.8) {
      progressCircle.style.stroke = "var(--warning, #f59e0b)";
    } else {
      progressCircle.style.stroke = "var(--primary)";
    }
  }

  ta.addEventListener("input", updateCharRing);

  function expandComposer() {
    formCard.classList.remove("collapsed");
    formCard.classList.add("expanded");
  }

  function collapseComposer() {
    formCard.classList.remove("expanded");
    formCard.classList.add("collapsed");
  }

  ta.addEventListener("focus", expandComposer);
  formCard.addEventListener("click", function (e) {
    if (!formCard.classList.contains("expanded")) {
      expandComposer();
      ta.focus();
    }
  });

  // Cancel/collapse on click outside
  document.addEventListener("click", function onDocClick(e) {
    if (!document.body.contains(formCard)) {
      document.removeEventListener("click", onDocClick);
      return;
    }
    if (!formCard.contains(e.target)) {
      if (!ta.value.trim()) {
        collapseComposer();
        ta.value = "";
        progressCircle.style.strokeDashoffset = ringCircumference + "px";
        ringWrap.title = "0 / 5000";
      } else {
        collapseComposer();
      }
    }
  });

  return formCard;
}

function comicNavButton(label, direction, step, disabled) {
  var b = button(direction === "prev" ? "‹" : "›", "comic-nav " + direction, { action: "comicPage", step: String(step) }, disabled);
  b.setAttribute("aria-label", label);
  return b;
}

function comicPager(ctx, chapter) {
  var pages = chapter.pages || [];
  ctx.clampComicPage(pages);
  var firstIdx = ctx.ui.currentComicPageIndex;
  var secondIdx = firstIdx + 1;
  var label = pages.length ? (firstIdx + 1) : "0";
  if (secondIdx < pages.length) {
    label += " - " + (secondIdx + 1);
  }
  return el("div", "comic-pager", [
    button("<", "btn", { action: "comicPage", step: "-2" }, firstIdx === 0),
    el("span", "mini-meta", pages.length ? label + " / " + pages.length : "0 / 0"),
    button(">", "btn", { action: "comicPage", step: "2" }, secondIdx >= pages.length - 1)
  ]);
}

function textPager(ctx, pages) {
  return el("div", "comic-pager text-pager", [
    button("<", "btn", { action: "textPage", step: "-1" }, ctx.ui.currentTextPageIndex === 0),
    el("span", "mini-meta", pages.length ? (ctx.ui.currentTextPageIndex + 1) + " / " + pages.length : "0 / 0"),
    button(">", "btn", { action: "textPage", step: "1" }, ctx.ui.currentTextPageIndex >= pages.length - 1)
  ]);
}

function createComicPageWrapper(p, pIdx, totalPages) {
  var isFirst = pIdx === 0;
  var loadingEl = el("div", "comic-page-loading", [
    el("div", "comic-loading-spinner"),
    el("span", "comic-loading-text", "Loading panel " + (pIdx + 1) + " of " + totalPages)
  ]);
  var imgProps = {
    class: "comic-page-img scroll-img",
    src: extractRawUrl(p.bg),
    alt: p.label || ("Comic Panel " + (pIdx + 1)),
    loading: isFirst ? "eager" : "lazy",
    decoding: "async",
    width: "800",
    height: "1200"
  };
  if (isFirst) {
    imgProps.fetchpriority = "high";
  }
  var img = el("img", imgProps);
  img.addEventListener("load", function () {
    img.classList.add("loaded");
    loadingEl.style.display = "none";
  });
  img.addEventListener("error", function () {
    loadingEl.innerHTML = "";
    var retryBtn = button("Retry loading panel", "btn secondary btn-sm", { action: "retryComicImage", "aria-label": "Retry loading comic panel " + (pIdx + 1) });
    retryBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      var raw = extractRawUrl(p.bg);
      img.src = raw + (raw.indexOf("?") !== -1 ? "&" : "?") + "retry=" + Date.now();
    });
    loadingEl.appendChild(el("span", "comic-error-text", "Panel could not be loaded."));
    loadingEl.appendChild(retryBtn);
  });
  var wrapper = el("div", "comic-page-wrapper", [loadingEl, img]);
  wrapper.dataset.label = p.label;
  wrapper.dataset.page = (pIdx + 1) + " / " + totalPages;
  return wrapper;
}

function comicFlipContent(ctx, chapter) {
  var pages = chapter.pages || [];
  ctx.clampComicPage(pages);
  var firstIdx = ctx.ui.currentComicPageIndex;
  var secondIdx = firstIdx + 1;

  var currentFirst = pages[firstIdx];
  var currentSecond = secondIdx < pages.length ? pages[secondIdx] : null;

  var currentFit = ctx.ui.comicFit || "standard";
  if (currentFit === "640px") currentFit = "narrow";
  if (currentFit === "800px") currentFit = "standard";
  if (currentFit === "960px") currentFit = "width";
  if (currentFit === "100%") currentFit = "full";
  if (currentFit === "screen") currentFit = "standard";
  var fitClass = "comic-fit-" + currentFit;

  var container = el("article", "reader-content comic-reader flip-mode " + ctx.ui.readerTheme + " " + fitClass);
  var zoomVal = ctx.ui.comicZoom || 100;
  var zoomFactor = zoomVal / 100;
  container.style.setProperty("--comic-zoom", zoomVal + "%");
  container.style.setProperty("--comic-zoom-factor", String(zoomFactor));
  if (!currentFirst) return container;

  var wrapperFirst = createComicPageWrapper(currentFirst, firstIdx, pages.length);
  var bubbleFirst = createParagraphBubble(ctx, chapter, firstIdx);
  var pageFirst = el("figure", "comic-page comic-page-current paragraph-wrapper", [wrapperFirst, bubbleFirst]);
  pageFirst.dataset.index = String(firstIdx);

  var pageSecond = null;
  if (currentSecond) {
    var wrapperSecond = createComicPageWrapper(currentSecond, secondIdx, pages.length);
    var bubbleSecond = createParagraphBubble(ctx, chapter, secondIdx);
    pageSecond = el("figure", "comic-page comic-page-current paragraph-wrapper", [wrapperSecond, bubbleSecond]);
    pageSecond.dataset.index = String(secondIdx);
  }

  var pagesContainer = el("div", "comic-double-pages " + fitClass, [pageFirst]);
  if (pageSecond) {
    pagesContainer.appendChild(pageSecond);
  }
  pagesContainer.style.setProperty("--comic-zoom", zoomVal + "%");
  pagesContainer.style.setProperty("--comic-zoom-factor", String(zoomFactor));

  var flipStage = el("div", "comic-flip-stage " + fitClass, [pagesContainer]);
  flipStage.style.setProperty("--comic-zoom", zoomVal + "%");
  flipStage.style.setProperty("--comic-zoom-factor", String(zoomFactor));
  container.appendChild(flipStage);

  return container;
}

function settingsDrawer(ctx) {
  var story = ctx.getCurrentStory();
  var isComic = story && story.type === "Chitrānk";
  
  var closeBtn = button("✕", "drawer-close-btn", { action: "toggleSettingsDrawer", "aria-label": "Close reader settings" });
  
  var drawerContent = [
    el("div", "drawer-header", [
      el("h3", null, "Reader Settings"),
      closeBtn
    ])
  ];

  var modeControls = el("div", "segmented-controls", [
    button("📜 Scroll", ctx.ui.readerMode === "scroll" ? "btn active" : "btn", { action: "readerMode", value: "scroll", "aria-label": "Continuous scroll mode" }),
    button("📖 Pages", ctx.ui.readerMode === "pages" ? "btn active" : "btn", { action: "readerMode", value: "pages", "aria-label": "Paginated mode" })
  ]);
  
  drawerContent.push(el("div", "drawer-section", [
    el("label", null, "Reading Mode"),
    modeControls
  ]));

  var themeControls = el("div", "segmented-controls theme-toggles", [
    button("☀️ Light", ctx.ui.readerTheme === "light" ? "btn active" : "btn", { action: "readerThemeSelect", value: "light", "aria-label": "Light reading surface" }),
    button("🌙 Dark", ctx.ui.readerTheme === "dark" ? "btn active" : "btn", { action: "readerThemeSelect", value: "dark", "aria-label": "Dark low-light surface" }),
    button("📜 Sepia", ctx.ui.readerTheme === "sepia" ? "btn active" : "btn", { action: "readerThemeSelect", value: "sepia", "aria-label": "Warm eye-comfort parchment surface" })
  ]);

  drawerContent.push(el("div", "drawer-section", [
    el("label", null, "Color Theme"),
    themeControls
  ]));

  if (!isComic) {
    var fontSelect = select("readerFont", [
      ["sans", "Sans-serif (Inter / System)"],
      ["serif", "Serif (Georgia / Literary)"],
      ["mono", "Monospace (JetBrains Mono)"]
    ], ctx.ui.readerFont || "sans");
    fontSelect.dataset.action = "readerFontSelect";
    fontSelect.setAttribute("aria-label", "Select typography font style");

    drawerContent.push(el("div", "drawer-section", [
      el("label", null, "Reading Font"),
      fontSelect
    ]));

    var sizeInput = input("range", ctx.ui.readerSize, { min: "16", max: "32", action: "fontSize" });
    sizeInput.setAttribute("aria-label", "Text size range slider");
    var sizeRow = el("div", "size-control-row", [
      button("A−", "btn size-step-btn", { action: "fontSizeStep", step: "-1", "aria-label": "Decrease text size" }),
      sizeInput,
      button("A+", "btn size-step-btn", { action: "fontSizeStep", step: "1", "aria-label": "Increase text size" })
    ]);

    drawerContent.push(el("div", "drawer-section", [
      el("label", null, "Text Size (" + ctx.ui.readerSize + "px)"),
      sizeRow
    ]));

    var lhSelect = select("readerLineHeight", [
      ["1.4", "Compact (1.4)"],
      ["1.6", "Normal (1.6)"],
      ["1.8", "Spacious (1.8)"],
      ["2.0", "Relaxed (2.0)"]
    ], ctx.ui.readerLineHeight || "1.6");
    lhSelect.dataset.action = "readerLineHeightSelect";
    lhSelect.setAttribute("aria-label", "Select line spacing");

    drawerContent.push(el("div", "drawer-section", [
      el("label", null, "Line Spacing"),
      lhSelect
    ]));

    var widthSelect = select("readerWidth", [
      ["640px", "Narrow (640px)"],
      ["800px", "Standard (800px)"],
      ["960px", "Wide (960px)"],
      ["100%", "Full Width (100%)"]
    ], ctx.ui.readerWidth || "800px");
    widthSelect.dataset.action = "readerWidthSelect";
    widthSelect.setAttribute("aria-label", "Select reading measure width");

    drawerContent.push(el("div", "drawer-section", [
      el("label", null, "Reading Width"),
      widthSelect
    ]));
  } else {
    var currentFit = ctx.ui.comicFit || "standard";
    if (currentFit === "640px") currentFit = "narrow";
    if (currentFit === "800px") currentFit = "standard";
    if (currentFit === "960px") currentFit = "width";
    if (currentFit === "100%") currentFit = "full";
    if (currentFit === "screen") currentFit = "standard";

    var fitSelect = select("comicFit", [
      ["narrow", "Narrow (640px)"],
      ["standard", "Standard (800px)"],
      ["width", "Wide (960px)"],
      ["full", "Full Width (100%)"],
      ["original", "Original Resolution"]
    ], currentFit);
    fitSelect.dataset.action = "comicFitSelect";
    fitSelect.setAttribute("aria-label", "Select panel fit");

    drawerContent.push(el("div", "drawer-section", [
      el("label", null, "Panel Fit"),
      fitSelect
    ]));

    var zoomInput = input("range", ctx.ui.comicZoom || 100, { min: "50", max: "200", step: "5", action: "comicZoom" });
    zoomInput.setAttribute("aria-label", "Image zoom range slider");
    var zoomRow = el("div", "size-control-row", [
      button("−", "btn size-step-btn", { action: "comicZoomStep", step: "-10", "aria-label": "Decrease image zoom" }),
      zoomInput,
      button("+", "btn size-step-btn", { action: "comicZoomStep", step: "10", "aria-label": "Increase image zoom" })
    ]);

    drawerContent.push(el("div", "drawer-section", [
      el("label", null, "Image Zoom (" + (ctx.ui.comicZoom || 100) + "%)"),
      zoomRow
    ]));
  }

  var chapter = ctx.getCurrentChapter(story);

  var actionsRow = el("div", "drawer-actions-row", [
    button(document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen", "btn", { action: "toggleFullscreen", "aria-label": "Toggle fullscreen reading" }),
    ctx.state.user ? button([el("span", "icon icon-warning icon-sm"), " Report"], "btn danger", { action: "reportContent", storyId: story.id, chapterId: chapter.id, "aria-label": "Report content" }) : null
  ].filter(Boolean));

  drawerContent.push(el("div", "drawer-section", [
    el("label", null, "Actions"),
    actionsRow
  ]));

  var drawer = el("div", {
    class: "reader-settings-drawer reader-settings-dropdown" + (ctx.ui.showSettingsDrawer ? " active" : ""),
    role: "region",
    "aria-label": "Reader settings menu"
  }, drawerContent);
  return drawer;
}

function readerContent(ctx, story, chapter) {
  var isComic = story && story.type === "Chitrānk";
  var currentFit = ctx.ui.comicFit || "standard";
  if (currentFit === "screen") currentFit = "standard";
  var fitClass = isComic ? ("comic-fit-" + currentFit) : "";
  var themeClass = ctx.ui.readerTheme;
  var fontClass = "font-" + (ctx.ui.readerFont || "sans");
  var cn = "reader-content " + themeClass + " " + fontClass + (isComic ? (" comic-reader comic-scroll-mode " + fitClass) : "");
  
  var container = el("article", cn);
  container.style.setProperty("--reader-size", ctx.ui.readerSize + "px");
  container.style.setProperty("--reader-line-height", ctx.ui.readerLineHeight || "1.6");
  container.style.setProperty("--reader-width", ctx.ui.readerWidth || "800px");
  if (isComic) {
    var zoomVal = ctx.ui.comicZoom || 100;
    container.style.setProperty("--comic-zoom", zoomVal + "%");
    container.style.setProperty("--comic-zoom-factor", String(zoomVal / 100));
  }

  var hasRenderedContent = false;

  // End of Chapter & Next Chapter Flow
  var isLastChapter = !story.chapters || ctx.ui.currentChapterIndex >= story.chapters.length - 1;
  var nextChapter = !isLastChapter && story.chapters[ctx.ui.currentChapterIndex + 1];
  var isBookmarked = ctx.state.bookmarkIds && ctx.state.bookmarkIds.indexOf(story.id) !== -1;
  var authorDisplayName = story.author || story.author_name || (story.profile && story.profile.username) || "the author";
  var supportCallout = el("div", "reader-support-callout", [
    el("div", "reader-support-info", [
      el("span", "reader-support-icon-wrap", [makeTipIcon("reader-support-icon-svg")]),
      el("div", "reader-support-text", [
        el("strong", null, "Enjoying the story?"),
        el("span", null, "Send a direct UPI tip to support " + authorDisplayName + "!")
      ])
    ]),
    el("button", {
      type: "button",
      class: "btn btn-support-creator",
      "data-action": "openSupportModal",
      "data-story-id": story.id,
      "data-story-title": story.title || "Story",
      "data-author-name": authorDisplayName,
      "data-author-id": story.author_id,
      "aria-label": "Support creator with a tip",
      style: "display: flex; align-items: center; gap: 6px;"
    }, [
      makeTipIcon("icon-tip-svg"),
      "Tip Creator"
    ])
  ]);

  var endCard;
  if (!isLastChapter && nextChapter) {
    endCard = el("div", "end-of-chapter-card", [
      el("div", "end-chapter-meta", "Finished Chapter " + (ctx.ui.currentChapterIndex + 1)),
      el("h3", "end-chapter-next-title", "Next Chapter: " + (nextChapter.title || ("Chapter " + (ctx.ui.currentChapterIndex + 2)))),
      button("Read Next Chapter →", "btn primary orange-glow-btn end-chapter-next-btn", {
        action: "chapter",
        step: "1",
        "aria-label": "Read Next Chapter: " + (nextChapter.title || ("Chapter " + (ctx.ui.currentChapterIndex + 2)))
      }),
      supportCallout
    ]);
  } else {
    endCard = el("div", "end-of-series-card", [
      el("span", "celebration-icon", "🎉"),
      el("h3", "end-series-title", "You're all caught up!"),
      el("p", "end-series-desc", "You've reached the latest chapter of " + story.title + ". Check back soon or bookmark the story to receive updates."),
      supportCallout,
      el("div", "button-row end-series-actions", [
        button(isBookmarked ? "Bookmarked ✓" : "Bookmark Story", "btn", { action: "bookmarkStory", "data-story-id": story.id, "aria-label": "Bookmark story" }),
        el("a", { class: "btn secondary", href: "#story?id=" + story.id }, "← Story Overview"),
        el("a", { class: "btn text-btn", href: "#discover" }, "Discover More Stories →")
      ])
    ]);
  }

  if (story.type === "Chitrānk" && chapter.pages && chapter.pages.length > 0) {
    hasRenderedContent = true;
    if (ctx.ui.readerMode === "pages") return comicFlipContent(ctx, chapter);
    var fitClass = "comic-fit-" + currentFit;
    var zoomVal = ctx.ui.comicZoom || 100;
    var zoomFactor = zoomVal / 100;
    var comicPagesEl = el("div", "comic-pages " + fitClass, chapter.pages.map(function (p, pIdx) {
      var wrapper = createComicPageWrapper(p, pIdx, chapter.pages.length);
      var bubble = createParagraphBubble(ctx, chapter, pIdx);
      var fig = el("figure", "comic-page paragraph-wrapper", [wrapper, bubble]);
      fig.dataset.index = String(pIdx);
      return fig;
    }));
    comicPagesEl.style.setProperty("--comic-zoom", zoomVal + "%");
    comicPagesEl.style.setProperty("--comic-zoom-factor", String(zoomFactor));
    container.appendChild(comicPagesEl);
    container.appendChild(endCard);
  } else if (chapter.content) {
    var rawContent = chapter.content;
    var contentArray = Array.isArray(rawContent)
      ? rawContent
      : (typeof rawContent === "string" ? rawContent.split("\n\n").filter(Boolean) : []);

    if (contentArray.length > 0) {
      hasRenderedContent = true;
      if (ctx.ui.readerMode === "pages") {
        var pages = ctx.paginateText(contentArray);
        ctx.clampTextPage(pages);
        var isEndCardPage = ctx.ui.currentTextPageIndex === pages.length - 1;
        if (isEndCardPage) {
          container.classList.add("reader-end-page");
          container.appendChild(endCard);
        } else {
          var activePage = pages[ctx.ui.currentTextPageIndex] || [];
          activePage.forEach(function (pObj) {
            if (pObj.isEndCard) return;
            var p = el("p", null, pObj.text);
            p.classList.add("align-" + pObj.align);
            var bubble = createParagraphBubble(ctx, chapter, pObj.originalIndex);
            var wrap = el("div", "paragraph-wrapper", [p, bubble]);
            wrap.dataset.index = String(pObj.originalIndex);
            container.appendChild(wrap);
          });
        }
      } else {
        contentArray.forEach(function (para, pIdx) {
          var align = "left";
          var cleanText = para;
          if (para.startsWith("[center]")) {
            align = "center";
            cleanText = para.substring(8);
          } else if (para.startsWith("[right]")) {
            align = "right";
            cleanText = para.substring(7);
          } else if (para.startsWith("[left]")) {
            align = "left";
            cleanText = para.substring(6);
          }
          var p = el("p", null, cleanText);
          p.classList.add("align-" + align);
          var bubble = createParagraphBubble(ctx, chapter, pIdx);
          var wrap = el("div", "paragraph-wrapper", [p, bubble]);
          wrap.dataset.index = String(pIdx);
          container.appendChild(wrap);
        });
        container.appendChild(endCard);
      }
    }
  }

  if (!hasRenderedContent) {
    var emptyNotice = el("div", "empty-chapter-content-card", [
      el("p", { style: "color: var(--text-muted); text-align: center; padding: 48px 16px; font-style: italic; font-size: 1.05rem;" }, "This chapter does not have any text or comic panels published yet.")
    ]);
    container.appendChild(emptyNotice);
    container.appendChild(endCard);
  }

  return container;
}

function renderReaderRecommendations(ctx, currentStory) {
  var allStories = (ctx.state.stories || []).filter(function (s) {
    return s && s.id && s.id !== currentStory.id && s.status && s.status !== "draft" && s.status !== "unpublished";
  });

  if (!allStories.length) return null;

  var scored = allStories.map(function (s) {
    var score = 0;
    if (currentStory.genre && s.genre && s.genre.toLowerCase() === currentStory.genre.toLowerCase()) {
      score += 3;
    }
    if (currentStory.type && s.type && s.type === currentStory.type) {
      score += 2;
    }
    return { story: s, score: score, views: s.views || 0 };
  });

  scored.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return b.views - a.views;
  });

  var topStories = scored.slice(0, 5).map(function (item) { return item.story; });
  if (!topStories.length) return null;

  var aside = el("aside", { class: "trending-sidebar reader-recommend-sidebar", "aria-label": "Recommended Stories" });

  var header = el("div", "trending-header", [
    el("h2", "trending-heading", "RECOMMENDED"),
    el("button", {
      type: "button",
      class: "trending-view-all-btn",
      "data-action": "viewAllTrending",
      "aria-label": "Discover more stories"
    }, [
      document.createTextNode("Discover "),
      el("span", { class: "trending-chevron", "aria-hidden": "true" }, "›")
    ])
  ]);
  aside.appendChild(header);

  var listEl = el("div", { class: "trending-list", role: "list" });

  topStories.forEach(function (story, index) {
    var rank = index + 1;
    var rankClass = rank === 1 ? "trending-rank-1" : (rank === 2 ? "trending-rank-2" : (rank === 3 ? "trending-rank-3" : "trending-rank-other"));

    var coverWrap = el("div", "trending-cover-wrap");
    var rawCover = story.cover || "";
    var isImgUrl = rawCover && (rawCover.startsWith("http://") || rawCover.startsWith("https://") || rawCover.startsWith("/uploads/") || rawCover.startsWith("data:") || rawCover.startsWith("blob:"));
    if (isImgUrl) {
      var img = el("img", {
        class: "trending-cover",
        src: rawCover,
        alt: (story.title || "Story") + " cover",
        loading: "lazy",
        width: "52",
        height: "72"
      });
      img.addEventListener("error", function () {
        img.style.display = "none";
        coverWrap.appendChild(el("div", "trending-cover-fallback", (story.title || "S").charAt(0).toUpperCase()));
      });
      coverWrap.appendChild(img);
    } else {
      coverWrap.appendChild(el("div", "trending-cover-fallback", (story.title || "S").charAt(0).toUpperCase()));
    }

    var rankEl = el("span", "trending-rank " + rankClass, String(rank));

    var viewsCount = formatNumber(story.views || 0);
    var info = el("div", "trending-info", [
      el("span", "trending-title", story.title || "Untitled"),
      el("span", "trending-author", story.author || "Unknown"),
      el("span", "trending-views", [
        svgEl("svg", {
          viewBox: "0 0 24 24",
          fill: "currentColor",
          class: "trending-flame-icon",
          "aria-hidden": "true"
        }, [
          svgEl("path", { d: "M12 23c6.075 0 11-4.925 11-11 0-5.04-3.41-9.3-8.08-10.63a.5.5 0 0 0-.61.54c.2 2.37-.62 4.67-2.26 6.32C10.74 9.53 9 11.23 9 13.5c0 .35.04.7.12 1.03-1.46-.86-2.58-2.29-3.03-3.99a.5.5 0 0 0-.82-.24C3.86 11.83 3 14.32 3 17c0 3.31 2.69 6 6 6h3z" })
        ]),
        document.createTextNode(viewsCount)
      ])
    ]);

    var item = el("div", {
      class: "trending-item",
      role: "listitem",
      tabindex: "0",
      "data-action": "openStory",
      "data-id": story.id,
      "aria-label": (story.title || "Story") + " by " + (story.author || "Unknown")
    }, [
      coverWrap,
      rankEl,
      info
    ]);

    item.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.hash = "story?id=" + story.id;
      }
    });

    listEl.appendChild(item);
  });

  aside.appendChild(listEl);
  return aside;
}

export function renderReader(ctx) {
  ctx = ctx || this;
  var prevScrollY = (typeof window !== "undefined") ? (window.scrollY || (ctx.ui && ctx.ui._savedScrollY) || 0) : 0;
  if (ctx.ui && ctx.ui._savedScrollY) delete ctx.ui._savedScrollY;
  if (ctx.view) ctx.view.innerHTML = "";
  var story = ctx.getCurrentStory();
  var chapter = story ? ctx.getCurrentChapter(story) : null;
  if (!story || !story.id || !chapter || !chapter.id) {
    var params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    var targetStoryId = params.get("id") || params.get("story") || ctx.ui.currentStoryId;
    if (targetStoryId) {
      var loadingReader = el("div", "reader-view-wrapper reader-loading-context", [
        el("div", "panel empty-reader-card", [
          el("div", { class: "comic-loading-spinner", style: "margin: 0 auto 16px auto;" }),
          el("h2", { style: "text-align: center; margin-bottom: 8px;" }, "Loading Story..."),
          el("p", { style: "color: var(--text-muted); text-align: center;" }, "Fetching story and chapters...")
        ])
      ]);
      if (ctx.view) ctx.view.innerHTML = "";
      ctx.view.appendChild(loadingReader);

      ctx.api("/stories/" + targetStoryId).then(function (fullStory) {
        fullStory._fullLoaded = true;
        if (fullStory.chapters) {
          fullStory.chapters.forEach(function (ch) {
            if (fullStory.type !== "Chitrānk" && ch.content == null) {
              ch.content = [];
            }
          });
        }
        ctx.state.stories = ctx.state.stories || [];
        var idx = ctx.state.stories.findIndex(function (s) { return s.id === targetStoryId; });
        if (idx !== -1) ctx.state.stories[idx] = fullStory;
        else ctx.state.stories.push(fullStory);
        ctx.ui.currentStoryId = targetStoryId;
        if (ctx.ui.currentView === "reader") ctx.renderReader();
      }).catch(function () {
        ctx.view.innerHTML = "";
        var errorReader = el("div", "reader-view-wrapper reader-error-context", [
          el("div", "panel empty-reader-card", [
            el("span", "reader-icon-graphic", el("span", "icon icon-warning icon-xl")),
            el("h2", null, "Story Not Available"),
            el("p", null, "Could not load the requested story. Please check your connection or choose another story."),
            el("div", "button-row", [
              button("Try Again", "btn primary", { action: "retryLoadReaderStory", id: targetStoryId }),
              el("a", { class: "btn secondary", href: "#discover" }, "Browse Discover")
            ])
          ])
        ]);
        ctx.view.appendChild(errorReader);
      });
      return;
    }

    var emptyReader = el("div", "reader-view-wrapper reader-empty-context", [
      el("div", "panel empty-reader-card", [
        el("span", "reader-icon-graphic", "📖"),
        el("h2", null, "No Story Selected"),
        el("p", null, "You haven't opened a story to read yet. Choose a captivating Web Novel or Chitrānk comic from Discover, or resume a story from your Library."),
        el("div", "button-row", [
          el("a", { class: "btn primary orange-glow-btn", href: "#discover" }, "Browse Discover"),
          el("a", { class: "btn secondary", href: "#library" }, "View Library")
        ])
      ])
    ]);
    if (ctx.view) ctx.view.innerHTML = "";
    ctx.view.appendChild(emptyReader);
    return;
  }

  // Ensure full story chapter content/pages/comments have been loaded from API
  var isComic = story.type === "Chitrānk";
  var isFullLoaded = !!story._fullLoaded || (chapter && (chapter.content != null || chapter.pages != null));
  if (!isFullLoaded) {
    if (story._loadError) {
      var errCard = el("div", "reader-view-wrapper reader-error-context", [
        el("div", "panel empty-reader-card", [
          el("span", "reader-icon-graphic", el("span", "icon icon-warning icon-xl")),
          el("h2", null, "Chapter Could Not Be Loaded"),
          el("p", null, isComic
            ? "We couldn't load the comic pages and illustrations for this chapter. Please check your connection and try again."
            : "We couldn't load the text for this chapter. Please check your connection and try again."),
          el("div", "button-row", [
            button("Try Again", "btn primary", { action: "retryLoadReaderStory", id: story.id }),
            el("a", { class: "btn secondary", href: "#story?id=" + story.id }, "Back to Overview")
          ])
        ])
      ]);
      if (ctx.view) ctx.view.innerHTML = "";
      ctx.view.appendChild(errCard);
      return;
    }

    var loadingSubtext = isComic ? "Retrieving pages and illustrations..." : "Retrieving chapter text...";
    var loadingChapterCard = el("div", "reader-view-wrapper reader-loading-context", [
      el("div", "panel empty-reader-card", [
        el("div", { class: "comic-loading-spinner", style: "margin: 0 auto 16px auto;" }),
        el("h2", { style: "text-align: center; margin-bottom: 8px;" }, "Loading " + (chapter.title || ("Chapter " + (ctx.ui.currentChapterIndex + 1)))),
        el("p", { style: "color: var(--text-muted); text-align: center;" }, loadingSubtext)
      ])
    ]);
    if (ctx.view) ctx.view.innerHTML = "";
    ctx.view.appendChild(loadingChapterCard);

    if (!story._loadingFull) {
      story._loadingFull = true;
      ctx.api("/stories/" + story.id).then(function (fullStory) {
        fullStory._fullLoaded = true;
        if (fullStory.chapters) {
          fullStory.chapters.forEach(function (ch) {
            if (fullStory.type !== "Chitrānk" && ch.content == null) {
              ch.content = [];
            }
          });
        }
        story._loadingFull = false;
        story._loadError = null;
        var idx = (ctx.state.stories || []).findIndex(function (s) { return s.id === story.id; });
        if (idx !== -1) ctx.state.stories[idx] = fullStory;
        else ctx.state.stories.push(fullStory);
        if (ctx.ui.currentView === "reader") ctx.renderReader();
      }).catch(function (err) {
        story._loadingFull = false;
        story._loadError = err;
        if (ctx.ui.currentView === "reader") ctx.renderReader();
      });
    }
    return;
  }

  if (story && story.id) {
    recordStoryView(ctx, story.id);
  }
  
  var pageIndicatorText = "";
  var sideNavPrev = null;
  var sideNavNext = null;

  if (ctx.ui.readerMode === "pages") {
    if (isComic && chapter.pages) {
      var comicPages = chapter.pages || [];
      ctx.clampComicPage(comicPages);
      var cFirst = ctx.ui.currentComicPageIndex;
      var cSecond = cFirst + 1;
      var cLabel = comicPages.length ? (cFirst + 1) : "0";
      if (cSecond < comicPages.length) cLabel += " - " + (cSecond + 1);
      pageIndicatorText = comicPages.length ? (cLabel + " / " + comicPages.length) : "";

      sideNavPrev = button("‹", "reader-side-nav prev", { action: "comicPage", step: "-2" }, cFirst === 0);
      sideNavPrev.setAttribute("aria-label", "Previous page");
      sideNavNext = button("›", "reader-side-nav next", { action: "comicPage", step: "2" }, cSecond >= comicPages.length - 1);
      sideNavNext.setAttribute("aria-label", "Next page");
    } else if (chapter.content) {
      var tPages = ctx.paginateText(chapter.content);
      ctx.clampTextPage(tPages);
      var tIdx = ctx.ui.currentTextPageIndex;
      pageIndicatorText = tPages.length ? ((tIdx + 1) + " / " + tPages.length) : "";

      sideNavPrev = button("‹", "reader-side-nav prev", { action: "textPage", step: "-1" }, tIdx === 0);
      sideNavPrev.setAttribute("aria-label", "Previous page");
      sideNavNext = button("›", "reader-side-nav next", { action: "textPage", step: "1" }, tIdx >= tPages.length - 1);
      sideNavNext.setAttribute("aria-label", "Next page");
    }
  }
  
  var progressVal = ctx.calculateActiveReaderProgress(story);
  var progressLine = el("div", "reader-progress-line");
  progressLine.style.width = progressVal + "%";

  // Compact Chapter Navigator Select
  var chapterOptions = (story.chapters || []).map(function (c, idx) {
    return [String(idx), "Ch. " + (idx + 1) + (c.title ? ": " + c.title : "")];
  });
  var chapterQuickSelect = select("quickChapterSelect", chapterOptions, String(ctx.ui.currentChapterIndex));
  chapterQuickSelect.className = "reader-chapter-select";
  chapterQuickSelect.dataset.action = "quickSelectChapter";
  chapterQuickSelect.setAttribute("aria-label", "Jump to chapter");
  
  var primaryToolbar = el("div", "reader-toolbar sticky-header", [
    el("div", "reader-header-left", [
      el("a", { class: "back-breadcrumb", href: "#story?id=" + story.id, "aria-label": "Back to story details" }, "← " + story.title)
    ]),
    el("div", "reader-header-center", [
      chapterQuickSelect,
      (function () {
        var a = el("a", "story-author-link", story.author);
        a.href = "#profile?username=" + encodeURIComponent(story.author);
        return a;
      })(),
      el("span", "meta-dot", " · "),
      chapter.status === "scheduled"
        ? el("span", "chapter-meta-scheduled", "Scheduled " + formatDateDDMMYYYY(chapter.scheduledAt))
        : (chapter.createdAt || chapter.created_at)
        ? el("span", "chapter-meta-published", "Published " + formatDateDDMMYYYY(chapter.createdAt || chapter.created_at))
        : el("span", "chapter-meta-published", "Published")
    ].filter(Boolean)),
    el("div", "reader-header-right button-row", [
      (function () {
        var dotsIcon = makeAnimatedDotsHorizontalIcon({ size: 20, className: "reader-settings-dots" });
        var btn = button([dotsIcon, el("span", "sr-only", "Settings")], "btn reader-settings-btn", {
          action: "toggleSettingsDrawer",
          "aria-label": "Reader settings and preferences",
          title: "Reader settings",
          "aria-haspopup": "true",
          "aria-expanded": ctx.ui.showSettingsDrawer ? "true" : "false"
        });
        btn.addEventListener("mouseenter", function () {
          if (dotsIcon.handle) dotsIcon.handle.startAnimation();
        });
        btn.addEventListener("mouseleave", function () {
          if (dotsIcon.handle) dotsIcon.handle.stopAnimation();
        });
        return btn;
      })(),
      settingsDrawer(ctx)
    ].filter(Boolean)),
    progressLine
  ]);

  var isLastChapter = !story.chapters || ctx.ui.currentChapterIndex >= story.chapters.length - 1;
  var bottomNav = (story.chapters && story.chapters.length) ? el("div", "reader-bottom-nav", [
    button("← Previous Chapter", "btn prev-chapter-btn", { action: "chapter", step: "-1", "aria-label": "Previous Chapter" }, ctx.ui.currentChapterIndex === 0),
    el("span", "bottom-page-indicator", "Chapter " + (ctx.ui.currentChapterIndex + 1) + " of " + story.chapters.length + (pageIndicatorText ? " (" + pageIndicatorText + ")" : "")),
    button(isLastChapter ? "✓ Caught Up" : "Next Chapter →", "btn next-chapter-btn" + (isLastChapter ? " secondary" : " primary"), { action: "chapter", step: "1", "aria-label": isLastChapter ? "All chapters read" : "Next Chapter" }, isLastChapter)
  ]) : null;
  
  var modeClass = "mode-" + (ctx.ui.readerMode || "scroll");
  var fsExitBtn = button("✕", "btn reader-fullscreen-exit-btn", { action: "toggleFullscreen", "aria-label": "Exit Fullscreen (Esc)", title: "Exit Fullscreen (Esc)" });

  var frame = el("div", "reader-frame " + ctx.ui.readerTheme + " " + modeClass, [
    fsExitBtn,
    primaryToolbar,
    sideNavPrev,
    sideNavNext,
    readerContent(ctx, story, chapter),
    bottomNav,
    inlineCommentsDrawer(ctx, story, chapter)
  ].filter(Boolean));

  var layoutTwo = el("div", "layout-two", [
    el("section", "panel", [
      (function() {
        var allComments = chapter.comments || [];
        var commentsCount = allComments.length;
        var headingText = "Comments" + (commentsCount > 0 ? " (" + commentsCount + ")" : "");
        return el("h2", null, headingText);
      })(),
      commentForm(ctx),
      (function() {
        var allComments = chapter.comments || [];
        var rootComments = allComments.filter(function (c) { return !c.parentId; });
        var childrenMap = {};
        allComments.forEach(function (c) {
          if (c.parentId) {
            if (!childrenMap[c.parentId]) childrenMap[c.parentId] = [];
            childrenMap[c.parentId].push(c);
          }
        });

        var renderedRoot = rootComments.map(function (c) {
          return renderCommentNode(c, childrenMap, 0, ctx, story, false, null);
        }).filter(Boolean);

        if (renderedRoot.length) {
          return el("ul", "activity-list comment-feed-list comment-tree-container", renderedRoot);
        } else {
          return emptyState(
            "No comments yet",
            "Be the first to share your thoughts, theories, or words of encouragement!",
            null,
            "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm0 4h8v2H6v-2zm0-8h12v2H6V5z"
          );
        }
      })()
    ]),
    renderReaderRecommendations(ctx, story) || el("aside", { class: "trending-sidebar reader-recommend-sidebar", "aria-label": "Recommended Stories" }, [
      el("div", "trending-header", [
        el("h2", "trending-heading", "RECOMMENDED")
      ]),
      emptyState("No recommendations", "Discover other captivating stories on Discover!")
    ])
  ]);

  var wrapper = el("div", "reader-view-wrapper " + ctx.ui.readerTheme, [
    frame,
    layoutTwo
  ]);

  if (ctx.view) ctx.view.innerHTML = "";
  ctx.view.appendChild(wrapper);
  if (ctx.ui.readerMode === "pages") {
    var rc = wrapper.querySelector(".reader-content");
    if (rc) rc.scrollTop = 0;
    frame.scrollTop = 0;
  } else if (prevScrollY > 0 && typeof window !== "undefined") {
    window.scrollTo({ top: prevScrollY, behavior: "instant" });
  }
}
