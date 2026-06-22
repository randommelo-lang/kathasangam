import { button, el, field, form, formatDate, input, list, progress, segmentButton, select, submitButton, textarea } from "../components.js?v=profile-redirect-20260619-v30";

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

  var pageFirst = el("figure", "comic-page comic-page-current", [wrapperFirst]);

  var pageSecond = null;
  if (currentSecond) {
    var wrapperSecond = el("div", "comic-page-wrapper", [
      el("img", { class: "comic-page-img", src: extractRawUrl(currentSecond.bg), alt: currentSecond.label || "" })
    ]);
    wrapperSecond.dataset.label = currentSecond.label;
    wrapperSecond.dataset.page = (secondIdx + 1) + " / " + pages.length;

    pageSecond = el("figure", "comic-page comic-page-current", [wrapperSecond]);
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

  var modeSelect = select("readerMode", [
    ["scroll", "Continuous Scroll"],
    ["pages", "Paginated Pages"]
  ], ctx.ui.readerMode);
  modeSelect.dataset.action = "readerModeSelect";
  
  drawerContent.push(el("div", "drawer-section", [
    el("label", null, "Reading Mode"),
    modeSelect
  ]));

  var themeSelect = select("readerTheme", [
    ["light", "Light Theme"],
    ["dark", "Dark Theme"],
    ["sepia", "Sepia Theme"]
  ], ctx.ui.readerTheme);
  themeSelect.dataset.action = "readerThemeSelect";

  drawerContent.push(el("div", "drawer-section", [
    el("label", null, "Color Theme"),
    themeSelect
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
    container.appendChild(el("div", "comic-pages", chapter.pages.map(function (p) {
      var wrapper = el("div", "comic-page-wrapper", [
        el("img", { class: "comic-page-img scroll-img", src: extractRawUrl(p.bg), alt: p.label || "" })
      ]);
      wrapper.dataset.label = p.label;
      return el("figure", "comic-page", [wrapper]);
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
        container.appendChild(p);
      });
      return container;
    }
    chapter.content.forEach(function (para) {
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
      container.appendChild(p);
    });
  }
  return container;
}

export function renderReader(ctx) {
  ctx = ctx || this;
  var story = ctx.getCurrentStory();
  var chapter = ctx.getCurrentChapter(story);
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
    el("div", null, [
      el("h2", null, story.title),
      el("div", "mini-meta", [
        (function () {
          var a = el("a", "story-author-link", story.author);
          a.href = "#profile?username=" + encodeURIComponent(story.author);
          return a;
        })(),
        " / " + chapter.title + " / " + chapter.access,
        chapter.status === "scheduled" ? " Scheduled " + formatDate(chapter.scheduledAt) : ""
      ])
    ]),
    el("div", "button-row", [
      button("Prev", "btn", { action: "chapter", step: "-1" }),
      button("Next", "btn", { action: "chapter", step: "1" }),
      button(ctx.ui.readerTheme === "dark" ? "Light" : "Dark", "btn", { action: "theme" }),
      button("Comfort ⚙️", "btn", { action: "toggleSettingsDrawer" }),
      button(document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen", "btn", { action: "toggleFullscreen" }),
      ctx.state.user ? button("Report Content", "btn danger", { action: "reportContent", storyId: story.id, chapterId: chapter.id }) : null
    ].filter(Boolean)),
    progressLine
  ]);

  var secondaryToolbar = controls.length ? el("div", "reader-toolbar paging-toolbar", controls) : null;
  
  var frame = el("div", "reader-frame " + ctx.ui.readerTheme, [
    primaryToolbar,
    secondaryToolbar,
    readerContent(ctx, story, chapter),
    settingsDrawer(ctx)
  ].filter(Boolean));

  ctx.view.appendChild(frame);

  ctx.view.appendChild(el("div", "layout-two", [
    el("section", "panel", [
      el("h2", null, "Chapters"),
      list(story.chapters, "chapter-list", function (item, i) {
        return el("li", "chapter-item", [
          el("strong", null, item.title),
          el("span", "mini-meta", (i + 1) + " / " + item.status + " / " + item.access),
          button("Open", "btn", { action: "openChapter", index: String(i) })
        ]);
      })
    ]),
    el("aside", "panel", [
      el("h2", null, "Comments"),
      chapter.comments.length ? list(chapter.comments, "activity-list", function (c) {
        var canDelete = (ctx.state.user && c.user_id === ctx.state.user.id) || ["moderator", "admin"].indexOf(ctx.state.role) !== -1;
        var canReport = ctx.state.user && c.user_id !== ctx.state.user.id;
        return el("li", "activity-item", [
          el("div", "comment-header", [
            (function () {
              var a = el("a", "story-author-link", c.user);
              a.style.fontWeight = "bold";
              a.href = "#profile?username=" + encodeURIComponent(c.user);
              return a;
            })(),
            el("div", "button-row", [
              canReport ? button("Report", "btn text-btn btn-sm", { action: "reportComment", id: c.id }) : null,
              canDelete ? button("Delete", "btn danger btn-sm", { action: "deleteComment", id: c.id }) : null
            ].filter(Boolean))
          ]),
          el("span", null, c.text)
        ]);
      }) : el("div", "empty", "No comments yet."),
      commentForm(ctx)
    ])
  ]));
}
