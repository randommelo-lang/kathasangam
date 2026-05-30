import { el, list, progress } from "../components.js?v=studio-20260529-preferences-v21";
import { storyGrid } from "./shared.js?v=studio-20260529-preferences-v21";

export function renderLibrary(ctx) {
  ctx = ctx || this;
  var libraryStories = ctx.state.stories.filter(function (s) {
    return ctx.state.library.indexOf(s.id) !== -1;
  });

  ctx.view.appendChild(el("div", "layout-two", [
    el("section", null, [
      el("div", "toolbar", [
        el("h2", null, "Reading list"),
        el("div", "mini-meta", libraryStories.length + " followed")
      ]),
      libraryStories.length ? storyGrid(ctx, libraryStories) : el("div", "empty", "Follow a story to add it to your library.")
    ]),
    el("aside", null, [
      el("section", "panel", [
        el("h2", { style: "display: flex; align-items: center; gap: 8px; width: 100%;" }, (function () {
          var headerChildren = [
            el("span", "icon icon-bell"),
            document.createTextNode("Notifications")
          ];
          if (ctx.state.notifications && ctx.state.notifications.length > 0) {
            var clearAllBtn = el("button", {
              style: "background: none; border: none; color: var(--accent); font-size: 0.8rem; cursor: pointer; padding: 0; margin-left: auto;"
            }, "Clear All");
            clearAllBtn.addEventListener("click", function () {
              ctx.apiDelete("/notifications").then(function () {
                ctx.state.notifications = [];
                ctx.updateHeroNotificationUI();
                ctx.render();
              }).catch(function (err) {
                console.error("Failed to clear notifications:", err);
              });
            });
            headerChildren.push(clearAllBtn);
          }
          return headerChildren;
        })()),
        list(ctx.state.notifications, "activity-list", function (n) {
          var itemContent = [
            el("div", { style: "display: flex; align-items: start; gap: 10px;" }, [
              el("span", { class: "icon icon-bell", style: "color: var(--accent); flex-shrink: 0; margin-top: 2px;" }),
              el("span", null, n.message || "")
            ])
          ];

          var liAttrs = { class: "activity-item" };
          if (n.story_id && n.chapter_sort_order !== null && n.chapter_sort_order !== undefined) {
            liAttrs["style"] = "cursor: pointer;";
            liAttrs["data-action"] = "openNotificationChapterFromLibrary";
            liAttrs["data-story-id"] = n.story_id;
            liAttrs["data-sort-order"] = n.chapter_sort_order;
            liAttrs["data-notif-id"] = n.id;
          } else {
            liAttrs["style"] = "cursor: pointer;";
            liAttrs["data-action"] = "clearGeneralNotificationFromLibrary";
            liAttrs["data-notif-id"] = n.id;
          }

          return el("li", liAttrs, itemContent);
        })
      ]),
      el("section", "panel", [
        el("h2", null, "Progress"),
        list(libraryStories, "activity-list", function (s) {
          var progPercent = ctx.calculateStoryProgressPercent(s);
          return el("li", "activity-item", [
            el("strong", null, s.title),
            progress(progPercent),
            el("span", "mini-meta", progPercent + "% read")
          ]);
        })
      ])
    ])
  ]));
}
