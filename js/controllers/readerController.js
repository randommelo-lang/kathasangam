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
  if (action === "toggleSettingsDrawer") {
    ctx.ui.showSettingsDrawer = !ctx.ui.showSettingsDrawer;
    ctx.render();
    return true;
  }
  if (action === "theme") {
    ctx.ui.readerTheme = ctx.ui.readerTheme === "dark" ? "light" : "dark";
    ctx.render();
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "readerThemeSelect") {
    ctx.ui.readerTheme = target.dataset.value;
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
    var storyId = target.dataset.storyId || target.dataset.storyid;
    var chapterId = target.dataset.chapterId || target.dataset.chapterid;
    openReportModal(ctx, "content", storyId, chapterId);
    return true;
  }
  if (action === "reportComment") {
    var commentId = target.dataset.id;
    openReportModal(ctx, "comment", commentId, null);
    return true;
  }
  return false;
}

function openReportModal(ctx, mode, id1, id2) {
  var modal = document.getElementById("reportModal");
  var form = document.getElementById("reportForm");
  var typeSection = document.getElementById("reportTypeSection");
  var reasonInput = document.getElementById("reportReason");
  var errorEl = document.getElementById("reportError");
  var submitBtn = document.getElementById("reportSubmitBtn");
  var closeBtn = document.getElementById("reportModalClose");
  var title = document.getElementById("reportModalTitle");
  var subtitle = document.getElementById("reportModalSubtitle");

  if (!modal || !form) return;

  // Reset state
  reasonInput.value = "";
  errorEl.hidden = true;
  errorEl.textContent = "";
  submitBtn.disabled = false;
  submitBtn.textContent = "Submit Report";

  if (mode === "comment") {
    typeSection.hidden = true;
    title.textContent = "Report Comment";
    subtitle.textContent = "Tell us why this comment is inappropriate";
  } else {
    typeSection.hidden = false;
    title.textContent = "Report Content";
    subtitle.textContent = "Help us keep KathaSangam safe";
    // Reset radio to story
    var storyRadio = form.querySelector('input[name="reportType"][value="story"]');
    if (storyRadio) storyRadio.checked = true;

    // Dynamically show/hide the chapter radio depending on whether a valid chapterId was passed
    var chapterOption = form.querySelector('input[value="chapter"]');
    if (chapterOption) {
      var label = chapterOption.closest('.report-type-option');
      if (label) {
        if (!id2 || id2 === "undefined") {
          label.style.display = "none";
        } else {
          label.style.display = "block";
        }
      }
    }
  }

  // Show modal
  modal.hidden = false;

  // Cleanup function
  function cleanup() {
    form.removeEventListener("submit", onSubmit);
    closeBtn.removeEventListener("click", onClose);
    modal.removeEventListener("click", onBackdrop);
    document.removeEventListener("keydown", onEscape);
  }

  function closeModal() {
    modal.hidden = true;
    cleanup();
  }

  function onClose() {
    closeModal();
  }

  function onBackdrop(e) {
    if (e.target === modal) closeModal();
  }

  function onEscape(e) {
    if (e.key === "Escape") closeModal();
  }

  function onSubmit(e) {
    e.preventDefault();
    var reason = reasonInput.value.trim();
    if (!reason) {
      errorEl.textContent = "Please provide a reason for your report.";
      errorEl.hidden = false;
      return;
    }

    var targetType, targetId;
    if (mode === "comment") {
      targetType = "comment";
      targetId = id1;
    } else {
      var checked = form.querySelector('input[name="reportType"]:checked');
      targetType = checked ? checked.value : "story";
      targetId = targetType === "story" ? id1 : id2;
    }

    if (!targetId || targetId === "undefined") {
      errorEl.textContent = "Unable to identify the reported content ID. Please refresh and try again.";
      errorEl.hidden = false;
      return;
    }

    var severitySelect = document.getElementById("reportSeverity");
    var severity = severitySelect ? severitySelect.value : "medium";

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
    errorEl.hidden = true;

    ctx.apiPost("/reports", {
      target_type: targetType,
      target_id: targetId,
      reason: reason,
      severity: severity
    }).then(function () {
      closeModal();
      ctx.notify("Report submitted successfully.");
    }).catch(function (err) {
      console.error(err);
      errorEl.textContent = err.message || "Failed to submit report. Please log in.";
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Report";
    });
  }

  form.addEventListener("submit", onSubmit);
  closeBtn.addEventListener("click", onClose);
  modal.addEventListener("click", onBackdrop);
  document.addEventListener("keydown", onEscape);
}

export function handleReaderInput(ctx, action, target, e) {
  if (action === "fontSize") {
    ctx.ui.readerSize = Number(target.value);
    var c = ctx.view.querySelector(".reader-content");
    if (c) c.style.setProperty("--reader-size", ctx.ui.readerSize + "px");
    
    // Dynamically update the slider label text without rerendering the whole drawer
    var parentLabel = target.parentElement.querySelector("label");
    if (parentLabel) {
      parentLabel.textContent = "Text Size (" + target.value + "px)";
    }
    
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "readerModeSelect") {
    ctx.ui.readerMode = target.value;
    ctx.ui.currentComicPageIndex = 0;
    ctx.ui.currentTextPageIndex = 0;
    ctx.render();
    ctx.syncCurrentProgress();
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "readerThemeSelect") {
    ctx.ui.readerTheme = target.value;
    var frame = ctx.view.querySelector(".reader-frame");
    if (frame) {
      frame.className = "reader-frame " + target.value;
    }
    var content = ctx.view.querySelector(".reader-content");
    if (content) {
      content.className = "reader-content " + target.value + " font-" + (ctx.ui.readerFont || "sans");
    }
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "readerFontSelect") {
    ctx.ui.readerFont = target.value;
    var content = ctx.view.querySelector(".reader-content");
    if (content) {
      content.className = "reader-content " + ctx.ui.readerTheme + " font-" + target.value;
    }
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "readerLineHeightSelect") {
    ctx.ui.readerLineHeight = target.value;
    var content = ctx.view.querySelector(".reader-content");
    if (content) {
      content.style.setProperty("--reader-line-height", target.value);
    }
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "readerWidthSelect") {
    ctx.ui.readerWidth = target.value;
    var content = ctx.view.querySelector(".reader-content");
    if (content) {
      content.style.setProperty("--reader-width", target.value);
    }
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
