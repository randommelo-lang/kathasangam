import { button, el, field, form, formatDate, input, list, progress, segmentButton, select, submitButton, textarea } from "../components.js?v=studio-20260529-preferences-v21";

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
  return el("div", "comic-pager", [
    button("Prev page", "btn", { action: "comicPage", step: "-1" }, ctx.ui.currentComicPageIndex === 0),
    el("span", "mini-meta", pages.length ? (ctx.ui.currentComicPageIndex + 1) + " / " + pages.length : "0 / 0"),
    button("Next page", "btn", { action: "comicPage", step: "1" }, ctx.ui.currentComicPageIndex >= pages.length - 1)
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
  var current = pages[ctx.ui.currentComicPageIndex];
  var container = el("article", "reader-content comic-reader flip-mode" + (ctx.ui.readerTheme === "dark" ? " dark" : ""));
  if (!current) return container;
  var page = el("figure", "comic-page comic-page-current");
  page.style.setProperty("--page-bg", current.bg);
  page.dataset.label = current.label;
  page.dataset.page = (ctx.ui.currentComicPageIndex + 1) + " / " + pages.length;
  container.appendChild(el("div", "comic-flip-stage", [
    comicNavButton("Previous page", "prev", -1, ctx.ui.currentComicPageIndex === 0),
    page,
    comicNavButton("Next page", "next", 1, ctx.ui.currentComicPageIndex >= pages.length - 1)
  ]));
  return container;
}

function readerContent(ctx, story, chapter) {
  var cn = "reader-content " + (ctx.ui.readerTheme === "dark" ? "dark" : "");
  var container = el("article", cn);
  container.style.setProperty("--reader-size", ctx.ui.readerSize + "px");
  if (story.type === "Chitrānk" && chapter.pages) {
    if (ctx.ui.readerMode === "pages") return comicFlipContent(ctx, chapter);
    container.appendChild(el("div", "comic-pages", chapter.pages.map(function (p) {
      var pg = el("figure", "comic-page");
      pg.style.setProperty("--page-bg", p.bg);
      pg.dataset.label = p.label;
      return pg;
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
        p.style.textAlign = pObj.align;
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
      p.style.textAlign = align;
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
  var controls = [
    el("div", "segmented", [
      segmentButton("Scroll", "scroll", ctx.ui.readerMode, "readerMode"),
      segmentButton(isComic ? "Page flip" : "Pages", "pages", ctx.ui.readerMode, "readerMode")
    ])
  ];
  if (isComic && ctx.ui.readerMode === "pages") controls.push(comicPager(ctx, chapter));
  if (!isComic && ctx.ui.readerMode === "pages" && chapter.content) {
    var textPages = ctx.paginateText(chapter.content);
    ctx.clampTextPage(textPages);
    controls.push(textPager(ctx, textPages));
  }
  if (!isComic) {
    controls.push(el("label", "mini-meta", [
      "Text size",
      input("range", ctx.ui.readerSize, { min: "16", max: "26", action: "fontSize" })
    ]));
  }
  controls.push(progress(ctx.calculateActiveReaderProgress(story)));
  
  ctx.view.appendChild(el("div", "reader-frame", [
    el("div", "reader-toolbar", [
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
        button(document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen", "btn", { action: "toggleFullscreen" }),
        ctx.state.user ? button("Report Content", "btn danger", { action: "reportContent", storyId: story.id, chapterId: chapter.id }) : null
      ].filter(Boolean))
    ]),
    el("div", "reader-toolbar", controls),
    readerContent(ctx, story, chapter)
  ]));

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
