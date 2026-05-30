export function handleLibraryClick(ctx, action, target, e) {
  if (action === "follow") {
    ctx.apiPost("/library/follow", { story_id: target.dataset.id })
      .then(function (r) {
        ctx.notify(r.message);
        return ctx.api("/library/ids");
      })
      .then(function (ids) {
        ctx.state.library = ids;
        ctx.render();
      });
    return true;
  }

  if (action === "openNotificationChapterFromLibrary") {
    var storyId = target.dataset.storyId;
    var sortOrder = Number(target.dataset.sortOrder);
    var notifId = target.dataset.notifId;
    
    ctx.apiDelete("/notifications/" + notifId).then(function () {
      ctx.state.notifications = ctx.state.notifications.filter(function (notif) { return notif.id !== notifId; });
      ctx.updateHeroNotificationUI();
    }).catch(function (err) {
      console.error("Failed to delete notification:", err);
    });

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

  if (action === "clearGeneralNotificationFromLibrary") {
    var notifId = target.dataset.notifId;
    ctx.apiDelete("/notifications/" + notifId).then(function () {
      ctx.state.notifications = ctx.state.notifications.filter(function (notif) { return notif.id !== notifId; });
      ctx.updateHeroNotificationUI();
      ctx.render();
    }).catch(function (err) {
      console.error("Failed to delete notification:", err);
    });
    return true;
  }

  return false;
}
