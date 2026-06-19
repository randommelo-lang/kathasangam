import { state, ui } from "./state.js?v=profile-redirect-20260619-v30";
import { api, apiDelete } from "./api.js?v=profile-redirect-20260619-v30";
import { el } from "./components.js?v=profile-redirect-20260619-v30";

let ctx = null;

export function updateHeroNotificationUI() {
  var area = document.getElementById("heroNotificationArea");
  if (!area) return;
  area.innerHTML = "";

  if (state.user && state.profile) {
    var menu = el("div");
    menu.className = "notification-menu";
    menu.style.position = "relative";
    menu.style.display = "inline-block";

    var trigger = el("button", {
      type: "button",
      title: "View Notifications",
      style: "display: inline-flex; align-items: center; justify-content: center; position: relative; color: var(--text); padding: 8px; cursor: pointer; background: none; border: none; border-radius: 8px; transition: background 0.2s ease;"
    });
    trigger.className = "hero-bell-btn";

    var bellIcon = el("span", "icon icon-bell");
    bellIcon.style.width = "20px";
    bellIcon.style.height = "20px";
    trigger.appendChild(bellIcon);

    if (state.notifications && state.notifications.length > 0) {
      var badge = el("span", "hero-bell-badge");
      trigger.appendChild(badge);
    }

    var dropdown = el("div", "notification-dropdown");
    dropdown.hidden = true;

    var headerChildren = [document.createTextNode("Notifications")];
    if (state.notifications && state.notifications.length > 0) {
      var clearAllBtn = el("button", {
        style: "background: none; border: none; color: var(--accent); font-size: 0.8rem; cursor: pointer; padding: 0; margin-left: auto;"
      }, "Clear All");
      clearAllBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        apiDelete("/notifications").then(function () {
          state.notifications = [];
          updateHeroNotificationUI();
          if (ui.currentView === "library" && ctx) {
            ctx.render();
          }
        }).catch(function (err) {
          console.error("Failed to clear notifications:", err);
        });
      });
      headerChildren.push(clearAllBtn);
    }

    dropdown.appendChild(el("div", {
      class: "notification-header",
      style: "display: flex; align-items: center;"
    }, headerChildren));

    if (!state.notifications || state.notifications.length === 0) {
      dropdown.appendChild(el("div", "notification-empty", "No new notifications"));
    } else {
      var notifList = el("ul", { style: "list-style: none; padding: 0; margin: 0;" });
      state.notifications.forEach(function (n) {
        var liAttrs = { class: "notification-item" };
        var itemContent = [
          el("div", { style: "display: flex; align-items: start; gap: 10px;" }, [
            el("span", { class: "icon icon-bell", style: "color: var(--accent); flex-shrink: 0; margin-top: 2px;" }),
            el("span", null, n.message || "")
          ])
        ];

        var li = el("li", liAttrs, itemContent);

        li.addEventListener("click", function (e) {
          e.stopPropagation();
          closeNotificationMenu();
          
          apiDelete("/notifications/" + n.id).then(function () {
            state.notifications = state.notifications.filter(function (notif) { return notif.id !== n.id; });
            updateHeroNotificationUI();
            if (ui.currentView === "library" && ctx) {
              ctx.render();
            }
          }).catch(function (err) {
            console.error("Failed to delete notification:", err);
          });

          if (n.story_id && n.chapter_sort_order !== null && n.chapter_sort_order !== undefined) {
            var story = state.stories.find(function (s) { return s.id === n.story_id; });
            if (story && story.chapters) {
              var foundIdx = story.chapters.findIndex(function (c) { return c.sort_order === n.chapter_sort_order; });
              if (foundIdx !== -1) {
                ui.currentStoryId = n.story_id;
                ui.currentChapterIndex = foundIdx;
                ui.currentComicPageIndex = 0;
                ui.currentTextPageIndex = 0;
                window.location.hash = "reader";
                if (ctx) {
                  ctx.render();
                  ctx.syncCurrentProgress();
                }
              } else {
                if (ctx) ctx.notify("Could not find the specific chapter in this story.");
              }
            } else {
              if (ctx) ctx.notify("Story not found.");
            }
          } else {
            window.location.hash = "library";
          }
        });

        notifList.appendChild(li);
      });
      dropdown.appendChild(notifList);
    }

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var isHidden = dropdown.hidden;
      if (ctx && ctx.closeAccountMenu) {
        ctx.closeAccountMenu();
      } else {
        var menu = document.querySelector(".account-dropdown");
        if (menu) menu.hidden = true;
      }
      dropdown.hidden = !isHidden;
    });

    menu.appendChild(trigger);
    menu.appendChild(dropdown);
    area.appendChild(menu);
  }
}

export function closeNotificationMenu() {
  var dropdown = document.querySelector(".notification-dropdown");
  if (dropdown) dropdown.hidden = true;
}

export function startNotificationPolling() {
  setInterval(function () {
    if (state.user || state.accessToken) {
      api("/notifications").then(function (notifs) {
        var hasChanges = false;
        if (!state.notifications || notifs.length !== state.notifications.length) {
          hasChanges = true;
        } else {
          for (var i = 0; i < notifs.length; i++) {
            if (notifs[i].id !== state.notifications[i].id) {
              hasChanges = true;
              break;
            }
          }
        }
        
        if (hasChanges) {
          state.notifications = notifs;
          updateHeroNotificationUI();
          if (ui.currentView === "library" && ctx) {
            ctx.render();
          }
        }
      }).catch(function (err) {
        console.warn("Failed to poll notifications:", err);
      });
    }
  }, 15000);
}

export function initNotificationsModule(context) {
  ctx = context;
}
