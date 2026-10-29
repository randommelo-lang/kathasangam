import { state, ui } from "./state.js";
import { api, apiDelete, apiPatch } from "./api.js";
import { el } from "./components.js";

let ctx = null;

export function formatNotificationTime(timestamp) {
  if (!timestamp) return "";
  var date = new Date(timestamp);
  if (isNaN(date.getTime())) return "";
  var diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  var diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return diffMin + "m ago";
  var diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + "h ago";
  var diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return diffDay + "d ago";
  if (diffDay < 30) {
    var weeks = Math.floor(diffDay / 7);
    return weeks + "w ago";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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

    var unreadCount = (state.notifications || []).filter(function (n) { return !n.is_read; }).length;
    if (unreadCount > 0) {
      var badge = el("span", "hero-bell-badge");
      trigger.appendChild(badge);
    }

    var dropdown = el("div", "notification-dropdown");
    dropdown.hidden = true;

    var headerChildren = [document.createTextNode("Notifications")];
    if (state.notifications && state.notifications.length > 0) {
      var actionsBox = el("div", {
        class: "notification-header-actions",
        style: "display: flex; gap: 8px; margin-left: auto; align-items: center;"
      });

      if (unreadCount > 0) {
        var markAllBtn = el("button", {
          style: "background: none; border: none; color: var(--accent); font-size: 0.75rem; cursor: pointer; padding: 0;"
        }, "Mark all read");
        markAllBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          apiPatch("/notifications/read-all").then(function () {
            (state.notifications || []).forEach(function (n) { n.is_read = true; });
            updateHeroNotificationUI();
            if (ui.currentView === "library" && ctx) {
              if (typeof ctx.renderLibraryNotifications === "function") ctx.renderLibraryNotifications();
              else ctx.render();
            }
          }).catch(function (err) {
            console.error("Failed to mark all read:", err);
          });
        });
        actionsBox.appendChild(markAllBtn);
      }

      var clearAllBtn = el("button", {
        style: "background: none; border: none; color: var(--muted); font-size: 0.75rem; cursor: pointer; padding: 0;"
      }, "Clear All");
      clearAllBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        apiDelete("/notifications").then(function () {
          state.notifications = [];
          updateHeroNotificationUI();
          if (ui.currentView === "library" && ctx) {
            if (typeof ctx.renderLibraryNotifications === "function") ctx.renderLibraryNotifications();
            else ctx.render();
          }
        }).catch(function (err) {
          console.error("Failed to clear notifications:", err);
        });
      });
      actionsBox.appendChild(clearAllBtn);
      headerChildren.push(actionsBox);
    }

    dropdown.appendChild(el("div", {
      class: "notification-header",
      style: "display: flex; align-items: center; justify-content: space-between;"
    }, headerChildren));

    if (!state.notifications || state.notifications.length === 0) {
      dropdown.appendChild(el("div", "notification-empty", "No new notifications"));
    } else {
      var notifList = el("ul", { style: "list-style: none; padding: 0; margin: 0;" });
      state.notifications.forEach(function (n) {
        var isUnread = !n.is_read;
        var liAttrs = {
          class: "notification-item " + (isUnread ? "notification-unread" : "notification-read"),
          style: "display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; cursor: pointer;"
        };

        var timeStr = formatNotificationTime(n.created_at);

        var contentCol = el("div", { style: "display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0;" }, [
          el("div", { style: "display: flex; align-items: flex-start; gap: 10px;" }, [
            el("span", {
              class: "icon icon-bell",
              style: (isUnread ? "color: var(--accent);" : "color: var(--muted); opacity: 0.6;") + " flex-shrink: 0; margin-top: 2px;"
            }),
            el("span", {
              class: "notification-text",
              style: isUnread ? "font-weight: 600; color: var(--text);" : "color: var(--text); opacity: 0.8;"
            }, n.message || "")
          ]),
          timeStr ? el("span", {
            class: "notification-time",
            style: "font-size: 0.72rem; color: var(--muted); margin-left: 26px;"
          }, timeStr) : null
        ].filter(Boolean));

        var dismissBtn = el("button", {
          type: "button",
          title: "Dismiss notification",
          class: "notification-dismiss-btn",
          style: "background: none; border: none; color: var(--muted); cursor: pointer; padding: 2px 6px; font-size: 0.85rem; border-radius: 4px; opacity: 0.6; line-height: 1; flex-shrink: 0;"
        }, "✕");

        dismissBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          apiDelete("/notifications/" + n.id).then(function () {
            state.notifications = state.notifications.filter(function (notif) { return notif.id !== n.id; });
            updateHeroNotificationUI();
            if (ui.currentView === "library" && ctx) {
              if (typeof ctx.renderLibraryNotifications === "function") ctx.renderLibraryNotifications();
              else ctx.render();
            }
          }).catch(function (err) {
            console.error("Failed to delete notification:", err);
          });
        });

        var li = el("li", liAttrs, [contentCol, dismissBtn]);

        li.addEventListener("click", function (e) {
          e.stopPropagation();
          closeNotificationMenu();
          
          // Mark as read instead of deleting
          if (!n.is_read) {
            n.is_read = true;
            apiPatch("/notifications/" + n.id + "/read").catch(function (err) {
              console.error("Failed to mark notification read:", err);
            });
            updateHeroNotificationUI();
            if (ui.currentView === "library" && ctx) {
              if (typeof ctx.renderLibraryNotifications === "function") ctx.renderLibraryNotifications();
              else ctx.render();
            }
          }

          if (n.story_id && n.chapter_sort_order !== null && n.chapter_sort_order !== undefined) {
            var story = state.stories ? state.stories.find(function (s) { return s.id === n.story_id; }) : null;
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
        var menu = /** @type {HTMLElement | null} */ (document.querySelector(".account-dropdown"));
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
  var dropdown = /** @type {HTMLElement | null} */ (document.querySelector(".notification-dropdown"));
  if (dropdown) dropdown.hidden = true;
}

let _pollingIntervalId = null;

export function startNotificationPolling() {
  // Guard: don't start a second polling loop if one is already active
  if (_pollingIntervalId !== null) return;

  _pollingIntervalId = setInterval(function () {
    // F-034: Only poll when user ID is established and valid
    if (state.user && state.user.id) {
      var pollingUserId = state.user.id;
      api("/notifications").then(function (notifs) {
        // F-034: Strictly verify user is still authenticated and same user
        if (!state.user || state.user.id !== pollingUserId) {
          return;
        }
        var hasChanges = false;
        if (!state.notifications || notifs.length !== state.notifications.length) {
          hasChanges = true;
        } else {
          for (var i = 0; i < notifs.length; i++) {
            if (notifs[i].id !== state.notifications[i].id || notifs[i].is_read !== state.notifications[i].is_read) {
              hasChanges = true;
              break;
            }
          }
        }
        
        if (hasChanges) {
          state.notifications = notifs;
          updateHeroNotificationUI();
          if (ui.currentView === "library" && ctx) {
            if (typeof ctx.renderLibraryNotifications === "function") {
              ctx.renderLibraryNotifications();
            } else {
              ctx.render();
            }
          }
        }
      }).catch(function (err) {
        console.warn("Failed to poll notifications:", err);
      });
    }
  }, 15000);
}

export function stopNotificationPolling() {
  if (_pollingIntervalId !== null) {
    clearInterval(_pollingIntervalId);
    _pollingIntervalId = null;
  }
}

export function initNotificationsModule(context) {
  ctx = context;
}
