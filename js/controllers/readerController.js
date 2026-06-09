export function handleReaderClick(ctx, action, target, e) {
  if (action === "readerMode") {
    ctx.ui.readerMode = target.dataset.value;
    ctx.ui.currentComicPageIndex = 0;
    ctx.ui.currentTextPageIndex = 0;
    ctx.render();
    ctx.syncCurrentProgress();
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "loginToComment") {
    ctx.openAuthModal();
    return true;
  }
  if (action === "openStory") {
    var storyId = target.dataset.id;
    window.location.hash = "story?id=" + storyId;
    return true;
  }
  if (action === "openReader") {
    var storyId = target.dataset.id;
    var story = ctx.state.stories.find(function (s) { return s.id === storyId; });
    var chapterIdx = 0;
    var pageIdx = 0;
    var progData = ctx.getStoryReadingProgress(storyId);
    if (progData && story && story.chapters) {
      var foundIdx = story.chapters.findIndex(function (c) { return c.id === progData.chapter_id; });
      if (foundIdx !== -1) {
        chapterIdx = foundIdx;
        pageIdx = progData.page_index;
      }
    }
    ctx.ui.currentStoryId = storyId;
    ctx.ui.currentChapterIndex = chapterIdx;
    if (story && story.type === "Chitrānk") {
      ctx.ui.currentComicPageIndex = pageIdx;
      ctx.ui.currentTextPageIndex = 0;
    } else {
      ctx.ui.currentTextPageIndex = pageIdx;
      ctx.ui.currentComicPageIndex = 0;
    }
    if (window.location.hash === "#reader" || window.location.hash === "reader") {
      ctx.render();
    } else {
      window.location.hash = "reader";
    }
    return true;
  }
  if (action === "tip") {
    ctx.apiPost("/stories/" + target.dataset.id + "/tip", { amount: 5 }).then(function (r) {
      ctx.notify(r.message);
      return ctx.api("/stories");
    }).then(function (s) {
      ctx.state.stories = s;
      ctx.render();
    });
    return true;
  }
  if (action === "chapter") {
    ctx.moveChapter(Number(target.dataset.step));
    return true;
  }
  if (action === "comicPage") {
    ctx.moveComicPage(Number(target.dataset.step));
    return true;
  }
  if (action === "textPage") {
    ctx.moveTextPage(Number(target.dataset.step));
    return true;
  }
  if (action === "toggleFullscreen") {
    ctx.toggleFullscreen();
    return true;
  }
  if (action === "theme") {
    ctx.ui.readerTheme = ctx.ui.readerTheme === "dark" ? "light" : "dark";
    ctx.render();
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "openChapter") {
    ctx.ui.currentChapterIndex = Number(target.dataset.index);
    ctx.ui.currentComicPageIndex = 0;
    ctx.ui.currentTextPageIndex = 0;
    window.location.hash = "reader";
    ctx.render();
    ctx.syncCurrentProgress();
    return true;
  }
  if (action === "deleteComment") {
    window.showConfirm({
      title: "Delete Comment",
      message: "Are you sure you want to delete this comment? This cannot be undone.",
      confirmText: "Delete",
      isDanger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      var commentId = target.dataset.id;
      // Optimistic UI update
      var backupStories = JSON.parse(JSON.stringify(ctx.state.stories));
      ctx.state.stories.forEach(function (s) {
        s.chapters.forEach(function (ch) {
          ch.comments = ch.comments.filter(function (c) { return c.id !== commentId; });
        });
      });
      ctx.notify("Comment deleted.");
      ctx.render();
      
      ctx.apiDelete("/comments/" + commentId).then(function () {
        return ctx.api("/stories");
      }).then(function (s) {
        ctx.state.stories = s;
        ctx.render();
      }).catch(function (err) {
        console.error("Failed to delete comment:", err);
        ctx.state.stories = backupStories;
        ctx.notify(err.message || "Failed to delete comment. Restored.");
        ctx.render();
      });
    });
    return true;
  }
  if (action === "reportContent") {
    var storyId = target.dataset.storyId;
    var chapterId = target.dataset.chapterId;
    var option = window.prompt("Type 'story' to report the story, or 'chapter' to report the current chapter:");
    if (!option) return true;
    option = option.trim().toLowerCase();
    if (option !== "story" && option !== "chapter") {
      ctx.notify("Invalid option. Please type 'story' or 'chapter'.");
      return true;
    }
    var reason = window.prompt("Please enter the reason for reporting this " + option + ":");
    if (!reason || !reason.trim()) {
      ctx.notify("Reporting requires a reason.");
      return true;
    }
    var targetId = option === "story" ? storyId : chapterId;
    ctx.apiPost("/reports", {
      target_type: option,
      target_id: targetId,
      reason: reason.trim()
    }).then(function () {
      ctx.notify("Report submitted successfully.");
    }).catch(function (err) {
      console.error(err);
      ctx.notify(err.message || "Failed to submit report. Please log in.");
    });
    return true;
  }
  if (action === "reportComment") {
    var commentId = target.dataset.id;
    var reason = window.prompt("Please enter the reason for reporting this comment:");
    if (!reason || !reason.trim()) {
      ctx.notify("Reporting requires a reason.");
      return true;
    }
    ctx.apiPost("/reports", {
      target_type: "comment",
      target_id: commentId,
      reason: reason.trim()
    }).then(function () {
      ctx.notify("Report submitted successfully.");
    }).catch(function (err) {
      console.error(err);
      ctx.notify(err.message || "Failed to submit report. Please log in.");
    });
    return true;
  }
  return false;
}

export function handleReaderInput(ctx, action, target, e) {
  if (action === "fontSize") {
    ctx.ui.readerSize = Number(target.value);
    var c = ctx.view.querySelector(".reader-content");
    if (c) c.style.setProperty("--reader-size", ctx.ui.readerSize + "px");
    ctx.autoSaveReaderPreferences();
    return true;
  }
  return false;
}

export function handleReaderSubmit(ctx, formName, target, e) {
  if (formName === "commentForm") {
    var comment = new FormData(target).get("comment").trim();
    if (!comment) return true;
    var story = ctx.getCurrentStory();
    var chapter = ctx.getCurrentChapter(story);
    if (!chapter || !chapter.id) {
      ctx.notify("No chapter selected.");
      return true;
    }
    ctx.apiPost("/chapters/" + story.id + "/" + chapter.sort_order + "/comments", { user: "You", text: comment })
      .then(function () {
        return ctx.api("/stories");
      })
      .then(function (s) {
        ctx.state.stories = s;
        ctx.notify("Comment posted.");
        ctx.render();
      })
      .catch(function (err) {
        console.error("Failed to post comment:", err);
        ctx.notify(err.message || "Failed to post comment. Please log in.");
      });
    return true;
  }
  return false;
}
