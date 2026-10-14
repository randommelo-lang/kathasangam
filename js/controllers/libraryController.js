export function handleLibraryClick(ctx, action, target, e) {
  if (action === "follow") {
    var storyId = target.dataset.id;
    if (!storyId) return true;

    var prevLibrary = (ctx.state.library || []).slice();
    var isFollowing = prevLibrary.indexOf(storyId) !== -1;
    ctx.state.library = isFollowing
      ? prevLibrary.filter(function (id) { return id !== storyId; })
      : prevLibrary.concat([storyId]);
    ctx.render();

    var doFollow = function () {
      ctx.apiPost("/library/follow", { story_id: storyId })
        .then(function (r) {
          ctx.notify(r.message || (isFollowing ? "Unfollowed story" : "Following story"), "success");
          return ctx.api("/library/ids");
        })
        .then(function (ids) {
          ctx.state.library = ids;
          ctx.render();
        })
        .catch(function (err) {
          console.error("Follow toggle failed:", err);
          ctx.state.library = prevLibrary;
          ctx.render();
          ctx.notify("Failed to update library: " + (err.message || "Unknown error") + ". Action reverted.", "error", {
            onRetry: doFollow
          });
        });
    };
    doFollow();
    return true;
  }

  if (action === "openNotificationChapterFromLibrary") {
    var storyId = target.dataset.storyId;
    var sortOrder = Number(target.dataset.sortOrder);
    var notifId = target.dataset.notifId;
    
    var notif = (ctx.state.notifications || []).find(function (n) { return n.id === notifId; });
    if (notif && !notif.is_read) {
      notif.is_read = true;
      ctx.apiPatch("/notifications/" + notifId + "/read").catch(function (err) {
        console.error("Failed to mark notification read:", err);
      });
      ctx.updateHeroNotificationUI();
      if (typeof ctx.renderLibraryNotifications === "function") {
        ctx.renderLibraryNotifications();
      } else {
        ctx.render();
      }
    }

    var story = ctx.state.stories.find(function (s) { return s.id === storyId; });
    if (story && story.chapters) {
      var foundIdx = story.chapters.findIndex(function (c) { return c.sort_order === sortOrder; });
      if (foundIdx !== -1) {
        ctx.ui.currentStoryId = storyId;
        ctx.ui.currentChapterIndex = foundIdx;
        ctx.ui.currentComicPageIndex = 0;
        ctx.ui.currentTextPageIndex = 0;
        window.location.hash = "reader";
        ctx.render();
        ctx.syncCurrentProgress();
      } else {
        ctx.notify("Could not find the specific chapter in this story.");
      }
    } else {
      ctx.notify("Story not found.");
    }
    return true;
  }

  if (action === "markNotificationReadFromLibrary") {
    var notifId = target.dataset.notifId;
    var notif = (ctx.state.notifications || []).find(function (n) { return n.id === notifId; });
    if (notif && !notif.is_read) {
      notif.is_read = true;
      ctx.apiPatch("/notifications/" + notifId + "/read").catch(function (err) {
        console.error("Failed to mark notification read:", err);
      });
      ctx.updateHeroNotificationUI();
      if (typeof ctx.renderLibraryNotifications === "function") {
        ctx.renderLibraryNotifications();
      } else {
        ctx.render();
      }
    }
    return true;
  }

  if (action === "dismissNotificationFromLibrary" || action === "clearGeneralNotificationFromLibrary") {
    var notifId = target.dataset.notifId;
    var prevNotifsGeneral = (ctx.state.notifications || []).slice();
    ctx.state.notifications = prevNotifsGeneral.filter(function (notif) { return notif.id !== notifId; });
    ctx.updateHeroNotificationUI();
    if (typeof ctx.renderLibraryNotifications === "function") {
      ctx.renderLibraryNotifications();
    } else {
      ctx.render();
    }

    ctx.apiDelete("/notifications/" + notifId).then(function () {
      ctx.notify("Notification dismissed.", "info");
    }).catch(function (err) {
      console.error("Failed to delete notification:", err);
      ctx.state.notifications = prevNotifsGeneral;
      ctx.updateHeroNotificationUI();
      if (typeof ctx.renderLibraryNotifications === "function") {
        ctx.renderLibraryNotifications();
      } else {
        ctx.render();
      }
      ctx.notify(err.message || "Failed to dismiss notification.", "error");
    });
    return true;
  }


  return false;
}
