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
    listContent = el("ul", "activity-list comment-feed-list inline-comments-list", inlineComments.map(function (c) {
      var canDelete = (ctx.state.user && c.user_id === ctx.state.user.id) || ["moderator", "admin"].indexOf(ctx.state.role) !== -1;
      var initials = (c.user || "U").substring(0, 2).toUpperCase();
      var isStoryCreator = c.user === story.author || c.user_id === story.author_id;

      return el("li", "activity-item comment-item inline-comment-item", [
        el("div", "comment-avatar", initials),
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
            el("div", "comment-actions button-row", [
              canDelete ? button("Delete", "btn danger btn-sm", { action: "deleteComment", id: c.id }) : null
            ].filter(Boolean))
          ]),
          el("span", "comment-text", c.text)
        ])
      ]);
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
    formEl = form("inlineCommentForm", [
      field("Add reaction", textarea("inlineCommentText", "")),
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
  return form("commentForm", [
    field("Add comment", textarea("comment", "")),
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
    button("Prev page", "btn", { action: "comicPage", step: "-2" }, firstIdx === 0),
    el("span", "mini-meta", pages.length ? label + " / " + pages.length : "0 / 0"),
    button("Next page", "btn", { action: "comicPage", step: "2" }, secondIdx >= pages.length - 1)
  ]);
}

function textPager(ctx, pages) {
  return el("div", "comic-pager text-pager", [
    button("Prev page", "btn", { action: "textPage", step: "-1" }, ctx.ui.currentTextPageIndex === 0),
    el("span", "mini-meta", pages.length ? (ctx.ui.currentTextPageIndex + 1) + " / " + pages.length : "0 / 0"),
    button("Next page", "btn", { action: "textPage", step: "1" }, ctx.ui.currentTextPageIndex >= pages.length - 1)
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
      chapter.comments.length ? list(chapter.comments, "activity-list comment-feed-list", function (c) {
        var canDelete = (ctx.state.user && c.user_id === ctx.state.user.id) || ["moderator", "admin"].indexOf(ctx.state.role) !== -1;
        var canReport = ctx.state.user && c.user_id !== ctx.state.user.id;
        var initials = (c.user || "U").substring(0, 2).toUpperCase();
        var isStoryCreator = c.user === story.author || c.user_id === story.author_id;
        
        return el("li", "activity-item comment-item", [
          el("div", "comment-avatar", initials),
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
              el("div", "comment-actions button-row", [
                canReport ? button("Report", "btn text-btn btn-sm", { action: "reportComment", id: c.id }) : null,
                canDelete ? button("Delete", "btn danger btn-sm", { action: "deleteComment", id: c.id }) : null
              ].filter(Boolean))
            ]),
            el("span", "comment-text", c.text)
          ])
        ]);
      }) : emptyState(
        "No comments yet",
        "Be the first to share your thoughts, theories, or words of encouragement!",
        null,
        "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm0 4h8v2H6v-2zm0-8h12v2H6V5z"
      ),
      commentForm(ctx)
    ])
  ]);

  var wrapper = el("div", "reader-view-wrapper " + ctx.ui.readerTheme, [
    frame,
    layoutTwo
  ]);

  ctx.view.appendChild(wrapper);
}
