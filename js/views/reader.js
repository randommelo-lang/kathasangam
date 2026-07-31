import { button, el, field, form, formatDate, formatDateDDMMYYYY, input, list, progress, segmentButton, select, submitButton, textarea, svgEl } from "../components.js";
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
  bubble.dataset.action = "openParagraphComments";
  bubble.dataset.index = String(index);
  return bubble;
}

function renderCommentItem(c, ctx, story, isReply, isInline, pIdx) {
  var currentUserId = ctx.state.user && ctx.state.user.id ? String(ctx.state.user.id) : "";
  var commentUserId = c.user_id || c.userId ? String(c.user_id || c.userId) : "";
  var currentUsername = ctx.state.profile && ctx.state.profile.username
    ? ctx.state.profile.username
    : (ctx.state.user && ctx.state.user.email ? ctx.state.user.email.split("@")[0] : "");
  var ownsComment = (currentUserId && commentUserId && currentUserId === commentUserId)
    || (currentUsername && c.user === currentUsername);
  var userRole = (ctx.state.profile && ctx.state.profile.role) || ctx.state.role;
  var canDelete = ownsComment || ["moderator", "admin"].indexOf(userRole) !== -1;
  var canReport = ctx.state.user && !ownsComment;
  var initials = (c.user || "U").substring(0, 2).toUpperCase();
  var isStoryCreator = c.user === story.author || c.user_id === story.author_id;
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
  if (ctx.state.user) {
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

  var itemClass = "activity-item comment-item" + (isReply ? " comment-reply-item" : "") + (isInline ? " inline-comment-item" : "");
  var itemStyle = isReply ? "padding: 8px 0; border: none; background: none; box-shadow: none;" : "";

  var avatarEl = el("div", "comment-avatar", initials);
  if (isReply) {
    avatarEl.setAttribute("style", "width: 24px; height: 24px; min-width: 24px; font-size: 0.7rem; line-height: 24px;");
  }

  var item = el("div", { class: itemClass }, [
    avatarEl,
    el("div", "comment-body", [
      el("div", "comment-header", [
        el("div", "comment-meta", [
          (function () {
            var a = el("a", "commenter-name", c.user);
            a.href = "#profile?username=" + encodeURIComponent(c.user);
            return a;
          })(),
          isStoryCreator ? el("span", "comment-author-badge", "Author") : null
        ].filter(Boolean)),
        overflowMenu
      ]),
      el("span", "comment-text", c.text),
      !isReply && ctx.state.user ? el("div", "comment-footer-actions", [
        button("Reply", "comment-reply-link", { action: "showReplyForm", id: c.id })
      ]) : null
    ].filter(Boolean))
  ]);

  if (itemStyle) item.setAttribute("style", itemStyle);
  return item;
}

function renderCommentThread(c, replies, ctx, story, isInline, pIdx) {
  var threadChildren = [
    renderCommentItem(c, ctx, story, false, isInline, pIdx)
  ];

  if (replies && replies.length) {
    var repliesList = el("div", {
      class: "comment-replies-list",
      style: "margin-left: 36px; padding-left: 12px; border-left: 2px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 8px; margin-top: 8px;"
    }, replies.map(function (r) {
      return renderCommentItem(r, ctx, story, true, isInline, pIdx);
    }));
    threadChildren.push(repliesList);
  }

  if (ctx.ui.activeReplyCommentId === c.id) {
    var replyFormEl = el("form", {
      "data-form": "replyForm",
      style: "margin-top: 10px; margin-left: 36px; display: flex; flex-direction: column; gap: 8px;"
    }, [
      el("input", { type: "hidden", name: "parentId", value: c.id }),
      (pIdx !== undefined && pIdx !== null) ? el("input", { type: "hidden", name: "paragraphIndex", value: String(pIdx) }) : null,
      (function() {
        var replyTa = document.createElement("textarea");
        replyTa.name = "replyText";
        replyTa.placeholder = "Write a reply...";
        replyTa.maxLength = 5000;
        replyTa.required = true;
        replyTa.style.width = "100%";
        replyTa.style.minHeight = "60px";
        replyTa.style.background = "rgba(0,0,0,0.2)";
        replyTa.style.border = "1px solid rgba(255,255,255,0.1)";
        replyTa.style.borderRadius = "var(--radius)";
        replyTa.style.color = "var(--text)";
        replyTa.style.padding = "8px";
        replyTa.style.fontSize = "0.9rem";
        return replyTa;
      })(),
      el("div", { style: "display: flex; justify-content: flex-end; gap: 8px;" }, [
         button("Cancel", "btn secondary btn-sm", { action: "cancelReply" }),
         submitButton("Post Reply", "btn primary btn-sm")
      ])
    ].filter(Boolean));
    threadChildren.push(replyFormEl);
  }

  return el("li", {
    class: "comment-thread-wrapper",
    style: "display: flex; flex-direction: column; gap: 8px; list-style: none; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"
  }, threadChildren);
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

    listContent = el("ul", "activity-list comment-feed-list inline-comments-list", rootInlineComments.map(function (c) {
      return renderCommentThread(c, repliesMap[c.id] || [], ctx, story, true, pIdx);
    }));
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
  var ta = textarea("comment", "");
  ta.maxLength = 5000;
  return form("commentForm", [
    field("Add comment (max 5000 characters)", ta),
    submitButton("Post comment", "btn primary")
  ]);
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

function comicFlipContent(ctx, chapter) {
  var pages = chapter.pages || [];
  ctx.clampComicPage(pages);
  var firstIdx = ctx.ui.currentComicPageIndex;
  var secondIdx = firstIdx + 1;

  var currentFirst = pages[firstIdx];
  var currentSecond = secondIdx < pages.length ? pages[secondIdx] : null;

  var container = el("article", "reader-content comic-reader flip-mode " + ctx.ui.readerTheme);
  if (!currentFirst) return container;

  var wrapperFirst = el("div", "comic-page-wrapper", [
    el("img", { class: "comic-page-img", src: extractRawUrl(currentFirst.bg), alt: currentFirst.label || "" })
  ]);
  wrapperFirst.dataset.label = currentFirst.label;
  wrapperFirst.dataset.page = (firstIdx + 1) + " / " + pages.length;

  var bubbleFirst = createParagraphBubble(ctx, chapter, firstIdx);
  var pageFirst = el("figure", "comic-page comic-page-current paragraph-wrapper", [wrapperFirst, bubbleFirst]);
  pageFirst.dataset.index = String(firstIdx);

  var pageSecond = null;
  if (currentSecond) {
    var wrapperSecond = el("div", "comic-page-wrapper", [
      el("img", { class: "comic-page-img", src: extractRawUrl(currentSecond.bg), alt: currentSecond.label || "" })
    ]);
    wrapperSecond.dataset.label = currentSecond.label;
    wrapperSecond.dataset.page = (secondIdx + 1) + " / " + pages.length;

    var bubbleSecond = createParagraphBubble(ctx, chapter, secondIdx);
    pageSecond = el("figure", "comic-page comic-page-current paragraph-wrapper", [wrapperSecond, bubbleSecond]);
    pageSecond.dataset.index = String(secondIdx);
  }

  var pagesContainer = el("div", "comic-double-pages", [pageFirst]);
  if (pageSecond) {
    pagesContainer.appendChild(pageSecond);
  }

  container.appendChild(el("div", "comic-flip-stage", [
    comicNavButton("Previous page", "prev", -2, firstIdx === 0),
    pagesContainer,
    comicNavButton("Next page", "next", 2, secondIdx >= pages.length - 1)
  ]));
  return container;
}

function settingsDrawer(ctx) {
  var isComic = ctx.getCurrentStory().type === "Chitrānk";
  
  var closeBtn = button("✕", "drawer-close-btn", { action: "toggleSettingsDrawer" });
  
  var drawerContent = [
    el("div", "drawer-header", [
      el("h3", null, "Reader Settings"),
      closeBtn
    ])
  ];

  var modeControls = el("div", "segmented-controls", [
    button("📜 Scroll", ctx.ui.readerMode === "scroll" ? "btn active" : "btn", { action: "readerMode", value: "scroll" }),
    button("📖 Pages", ctx.ui.readerMode === "pages" ? "btn active" : "btn", { action: "readerMode", value: "pages" })
  ]);
  
  drawerContent.push(el("div", "drawer-section", [
    el("label", null, "Reading Mode"),
    modeControls
  ]));

  var themeControls = el("div", "segmented-controls theme-toggles", [
    button("☀️ Light", ctx.ui.readerTheme === "light" ? "btn active" : "btn", { action: "readerThemeSelect", value: "light" }),
    button("🌙 Dark", ctx.ui.readerTheme === "dark" ? "btn active" : "btn", { action: "readerThemeSelect", value: "dark" })
  ]);

  drawerContent.push(el("div", "drawer-section", [
    el("label", null, "Color Theme"),
    themeControls
  ]));

  if (!isComic) {
    var fontSelect = select("readerFont", [
      ["sans", "Sans-serif (Inter)"],
      ["serif", "Serif (Georgia)"],
      ["mono", "Monospace (JetBrains)"]
    ], ctx.ui.readerFont || "sans");
    fontSelect.dataset.action = "readerFontSelect";

    drawerContent.push(el("div", "drawer-section", [
      el("label", null, "Font Style"),
      fontSelect
    ]));

    var sizeInput = input("range", ctx.ui.readerSize, { min: "16", max: "32", action: "fontSize" });
    drawerContent.push(el("div", "drawer-section", [
      el("label", null, "Text Size (" + ctx.ui.readerSize + "px)"),
      sizeInput
    ]));

    var lhSelect = select("readerLineHeight", [
      ["1.4", "Compact (1.4)"],
      ["1.6", "Normal (1.6)"],
      ["1.8", "Spacious (1.8)"],
      ["2.0", "Double (2.0)"]
    ], ctx.ui.readerLineHeight || "1.6");
    lhSelect.dataset.action = "readerLineHeightSelect";

    drawerContent.push(el("div", "drawer-section", [
      el("label", null, "Line Spacing"),
      lhSelect
    ]));

    var widthSelect = select("readerWidth", [
      ["600px", "Narrow (600px)"],
      ["800px", "Medium (800px)"],
      ["1000px", "Wide (1000px)"],
      ["100%", "Full Width"]
    ], ctx.ui.readerWidth || "800px");
    widthSelect.dataset.action = "readerWidthSelect";

    drawerContent.push(el("div", "drawer-section", [
      el("label", null, "Reading Width"),
      widthSelect
    ]));
  }

  var story = ctx.getCurrentStory();
  var chapter = ctx.getCurrentChapter(story);

  var actionsRow = el("div", "drawer-actions-row", [
    button(document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen", "btn", { action: "toggleFullscreen" }),
    ctx.state.user ? button("⚠️ Report", "btn danger", { action: "reportContent", storyId: story.id, chapterId: chapter.id }) : null
  ].filter(Boolean));

  drawerContent.push(el("div", "drawer-section", [
    el("label", null, "Actions"),
    actionsRow
  ]));

  var drawer = el("div", "reader-settings-drawer" + (ctx.ui.showSettingsDrawer ? " active" : ""), drawerContent);
  return drawer;
}

function readerContent(ctx, story, chapter) {
  var themeClass = ctx.ui.readerTheme;
  var fontClass = "font-" + (ctx.ui.readerFont || "sans");
  var cn = "reader-content " + themeClass + " " + fontClass;
  
  var container = el("article", cn);
  container.style.setProperty("--reader-size", ctx.ui.readerSize + "px");
  container.style.setProperty("--reader-line-height", ctx.ui.readerLineHeight || "1.6");
  container.style.setProperty("--reader-width", ctx.ui.readerWidth || "800px");

  if (story.type === "Chitrānk" && chapter.pages) {
    if (ctx.ui.readerMode === "pages") return comicFlipContent(ctx, chapter);
    container.appendChild(el("div", "comic-pages", chapter.pages.map(function (p, pIdx) {
      var wrapper = el("div", "comic-page-wrapper", [
        el("img", { class: "comic-page-img scroll-img", src: extractRawUrl(p.bg), alt: p.label || "" })
      ]);
      wrapper.dataset.label = p.label;
      var bubble = createParagraphBubble(ctx, chapter, pIdx);
      var fig = el("figure", "comic-page paragraph-wrapper", [wrapper, bubble]);
      fig.dataset.index = String(pIdx);
      return fig;
    })));
    return container;
  }
  if (chapter.content) {
    if (ctx.ui.readerMode === "pages") {
      var pages = ctx.paginateText(chapter.content);
      ctx.clampTextPage(pages);
      var activePage = pages[ctx.ui.currentTextPageIndex] || [];
      activePage.forEach(function (pObj) {
        var p = el("p", null, pObj.text);
        p.classList.add("align-" + pObj.align);
        var bubble = createParagraphBubble(ctx, chapter, pObj.originalIndex);
        var wrap = el("div", "paragraph-wrapper", [p, bubble]);
        wrap.dataset.index = String(pObj.originalIndex);
        container.appendChild(wrap);
      });
      return container;
    }
    chapter.content.forEach(function (para, pIdx) {
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
  }
  return container;
}

export function renderReader(ctx) {
  ctx = ctx || this;
  var story = ctx.getCurrentStory();
  var chapter = ctx.getCurrentChapter(story);
  if (story && story.id) {
    recordStoryView(ctx, story.id);
  }
  var isComic = story.type === "Chitrānk";
  var controls = [];
  
  if (isComic && ctx.ui.readerMode === "pages") controls.push(comicPager(ctx, chapter));
  if (!isComic && ctx.ui.readerMode === "pages" && chapter.content) {
    var textPages = ctx.paginateText(chapter.content);
    ctx.clampTextPage(textPages);
    controls.push(textPager(ctx, textPages));
  }
  
  var progressVal = ctx.calculateActiveReaderProgress(story);
  var progressLine = el("div", "reader-progress-line");
  progressLine.style.width = progressVal + "%";
  
  var primaryToolbar = el("div", "reader-toolbar sticky-header", [
    el("div", "reader-header-left", [
      el("a", { class: "back-breadcrumb", href: "#story?id=" + story.id }, "← " + story.title)
    ]),
    el("div", "reader-header-center", [
      (function () {
        var a = el("a", "story-author-link", story.author);
        a.href = "#profile?username=" + encodeURIComponent(story.author);
        return a;
      })(),
      el("span", "meta-dot", " · "),
      el("span", "chapter-meta-title", chapter.title),
      el("span", "meta-dot", " · "),
      el("span", "chapter-meta-access badge " + String(chapter.access || "free").toLowerCase(), chapter.access),
      chapter.status === "scheduled"
        ? el("span", "chapter-meta-scheduled", " · Scheduled " + formatDateDDMMYYYY(chapter.scheduledAt))
        : (chapter.createdAt || chapter.created_at)
        ? el("span", "chapter-meta-published", " · Published " + formatDateDDMMYYYY(chapter.createdAt || chapter.created_at))
        : null
    ].filter(Boolean)),
    el("div", "reader-header-right button-row", [
      button("⚙️ Settings", "btn", { action: "toggleSettingsDrawer" })
    ].filter(Boolean)),
    progressLine
  ]);

  var secondaryToolbar = controls.length ? el("div", "reader-toolbar paging-toolbar", controls) : null;

  var bottomNav = (story.chapters && story.chapters.length) ? el("div", "reader-bottom-nav", [
    button("← Previous Chapter", "btn", { action: "chapter", step: "-1" }, ctx.ui.currentChapterIndex === 0),
    button("Next Chapter →", "btn", { action: "chapter", step: "1" }, ctx.ui.currentChapterIndex === story.chapters.length - 1)
  ]) : null;
  
  var frame = el("div", "reader-frame", [
    primaryToolbar,
    secondaryToolbar,
    readerContent(ctx, story, chapter),
    bottomNav,
    settingsDrawer(ctx),
    inlineCommentsDrawer(ctx, story, chapter)
  ].filter(Boolean));

  var layoutTwo = el("div", "layout-two", [
    el("section", "panel", [
      el("h2", null, "Chapters"),
      list(story.chapters, "chapter-list", function (item, i) {
        var isActive = ctx.ui.currentChapterIndex === i;
        var liClasses = "chapter-item" + (isActive ? " active" : "");
        var chNum = String(i + 1).padStart(2, "0");
        return el("li", {
          class: liClasses,
          "data-action": "openChapter",
          "data-index": String(i)
        }, [
          el("div", "chapter-num", chNum),
          el("div", "chapter-info", [
            el("span", "chapter-title", item.title),
            item.status === "scheduled"
              ? el("span", "chapter-scheduled", "Scheduled " + formatDateDDMMYYYY(item.scheduledAt))
              : (item.createdAt || item.created_at)
              ? el("span", "chapter-published", "Published " + formatDateDDMMYYYY(item.createdAt || item.created_at))
              : null
          ].filter(Boolean)),
          el("div", "chapter-meta", [
            el("span", "chapter-access-badge " + String(item.access || "free").toLowerCase(), item.access),
            isActive ? el("span", "active-badge", "Reading") : null
          ].filter(Boolean))
        ]);
      })
    ]),
    el("aside", "panel", [
      el("h2", null, "Comments"),
      (function() {
        var rootComments = (chapter.comments || []).filter(function (c) { return !c.parentId; });
        var repliesMap = {};
        (chapter.comments || []).forEach(function (c) {
          if (c.parentId) {
            if (!repliesMap[c.parentId]) repliesMap[c.parentId] = [];
            repliesMap[c.parentId].push(c);
          }
        });

        if (rootComments.length) {
          return el("ul", "activity-list comment-feed-list", rootComments.map(function (c) {
            return renderCommentThread(c, repliesMap[c.id] || [], ctx, story, false, null);
          }));
        } else {
          return emptyState(
            "No comments yet",
            "Be the first to share your thoughts, theories, or words of encouragement!",
            null,
            "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm0 4h8v2H6v-2zm0-8h12v2H6V5z"
          );
        }
      })(),
      commentForm(ctx)
    ])
  ]);

  var wrapper = el("div", "reader-view-wrapper " + ctx.ui.readerTheme, [
    frame,
    layoutTwo
  ]);

  ctx.view.appendChild(wrapper);
}
