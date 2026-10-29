import { setFormFeedback, setButtonLoading } from "../components.js";

var readerRequestId = 0;

export function recordStoryView(ctx, storyId) {
  if (!storyId) return;
  ctx.apiPost("/stories/" + storyId + "/view")
    .then(function (res) {
      if (res && res.viewed && ctx.state && ctx.state.stories) {
        var story = ctx.state.stories.find(function (s) { return s.id === storyId; });
        if (story) story.views = res.views;
      }
    })
    .catch(function (err) {
      console.warn("Failed to record view:", err);
    });
}

export function handleReaderClick(ctx, action, target, e) {
  if (action === "readerMode") {
    ctx.ui.readerMode = target.dataset.value;
    ctx.ui.currentComicPageIndex = 0;
    ctx.ui.currentTextPageIndex = 0;
    ctx.ui.currentScrollProgress = 0;
    window.scrollTo(0, 0);
    ctx.render();
    ctx.syncCurrentProgress();
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "loginToComment") {
    ctx.openAuthModal();
    return true;
  }
  if (action === "viewAllTrending") {
    window.location.hash = "discover";
    return true;
  }
  if (action === "openStory") {
    if (e && e.target && e.target.closest("a[href]")) return false;
    var storyId = target.dataset.id || (target.closest("[data-id]") && target.closest("[data-id]").dataset.id);
    if (storyId) {
      window.location.hash = "story?id=" + storyId;
      return true;
    }
  }
  if (action === "openReader") {
    var storyId = target.dataset.id || target.id || target.dataset.storyId || (target.closest("[data-id]") && target.closest("[data-id]").dataset.id) || ctx.ui.currentStoryId;
    if (!storyId) return true;
    var requestId = ++readerRequestId;
    var routeBeforeLoad = window.location.hash;
    ctx.ui.currentStoryId = storyId;
    var progData = ctx.getStoryReadingProgress(storyId);
    var existingStory = ctx.state.stories ? ctx.state.stories.find(function (item) { return item.id === storyId; }) : null;
    var chapterIdx = 0;
    var pageIdx = 0;
    if (progData && existingStory && existingStory.chapters) {
      var foundIdx = existingStory.chapters.findIndex(function (c) { return c.id === progData.chapter_id; });
      if (foundIdx !== -1) { chapterIdx = foundIdx; pageIdx = progData.page_index || 0; }
    }
    ctx.ui.currentChapterIndex = chapterIdx;
    if (existingStory && existingStory.type === "Chitrānk") {
      ctx.ui.currentComicPageIndex = pageIdx;
      ctx.ui.currentTextPageIndex = 0;
    } else {
      ctx.ui.currentTextPageIndex = pageIdx;
    }
    window.location.hash = "reader";

    if (existingStory && existingStory._fullLoaded) {
      recordStoryView(ctx, storyId);
      return true;
    }

    if (existingStory) existingStory._loadingFull = true;

    var initiatingUserId = ctx.state.user && ctx.state.user.id;

    ctx.api("/stories/" + storyId).then(function (fullStory) {
      if (requestId !== readerRequestId) return;
      var currentUserId = ctx.state.user && ctx.state.user.id;
      if (currentUserId !== initiatingUserId) return;
      fullStory._fullLoaded = true;
      if (fullStory.chapters) {
        fullStory.chapters.forEach(function (ch) {
          if (fullStory.type !== "Chitrānk" && ch.content == null) {
            ch.content = [];
          }
        });
      }
      var index = (ctx.state.stories || []).findIndex(function (item) { return item.id === storyId; });
      if (index >= 0) ctx.state.stories[index] = fullStory;
      else ctx.state.stories.push(fullStory);

      if (progData && fullStory.chapters) {
        var foundIdx = fullStory.chapters.findIndex(function (c) { return c.id === progData.chapter_id; });
        if (foundIdx !== -1) {
          ctx.ui.currentChapterIndex = foundIdx;
          var pIdx = progData.page_index || 0;
          if (fullStory.type === "Chitrānk") {
            ctx.ui.currentComicPageIndex = pIdx;
            ctx.ui.currentTextPageIndex = 0;
          } else {
            ctx.ui.currentTextPageIndex = pIdx;
          }
        }
      }

      recordStoryView(ctx, storyId);
      if (window.location.hash.indexOf("reader") !== -1) {
        ctx.render();
      }
    }).catch(function (error) {
      if (requestId !== readerRequestId) return;
      if (existingStory) existingStory._loadingFull = false;
      ctx.notify(error.status === 401 ? "Your session expired. Please sign in again." : (error.status === 403 ? "You do not have permission to read this story." : "The story could not be opened. Check your connection and try again."));
      if (error.status === 401) ctx.openAuthModal();
    });
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
    var drawer = ctx.view ? ctx.view.querySelector(".reader-settings-drawer") : null;
    var btn = ctx.view ? ctx.view.querySelector(".reader-settings-btn") : null;
    if (drawer) {
      if (ctx.ui.showSettingsDrawer) {
        drawer.classList.add("active");
        if (btn) btn.setAttribute("aria-expanded", "true");
      } else {
        drawer.classList.remove("active");
        if (btn) btn.setAttribute("aria-expanded", "false");
      }
    } else {
      ctx.render();
    }
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
  if (action === "fontSizeStep") {
    var step = Number(target.dataset.step) || 1;
    ctx.ui.readerSize = Math.max(16, Math.min(32, (ctx.ui.readerSize || 19) + step));
    var c = ctx.view.querySelector(".reader-content");
    if (c) c.style.setProperty("--reader-size", ctx.ui.readerSize + "px");
    var sizeInput = ctx.view.querySelector(".reader-settings-drawer input[type='range']");
    if (sizeInput) sizeInput.value = String(ctx.ui.readerSize);
    var parentLabel = sizeInput && sizeInput.closest(".drawer-section") && sizeInput.closest(".drawer-section").querySelector("label");
    if (parentLabel) parentLabel.textContent = "Text Size (" + ctx.ui.readerSize + "px)";
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "comicFitSelect") {
    ctx.ui.comicFit = target.dataset.value;
    ctx.render();
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "comicZoomSelect") {
    ctx.ui.comicZoom = Number(target.dataset.value);
    ctx.render();
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "comicZoomStep") {
    var step = Number(target.dataset.step) || 10;
    ctx.ui.comicZoom = Math.max(50, Math.min(200, (ctx.ui.comicZoom || 100) + step));
    var zoomFactor = String(ctx.ui.comicZoom / 100);
    var zoomPercent = ctx.ui.comicZoom + "%";
    var cp = ctx.view.querySelector(".comic-pages");
    if (cp) {
      cp.style.setProperty("--comic-zoom", zoomPercent);
      cp.style.setProperty("--comic-zoom-factor", zoomFactor);
    }
    var rc = ctx.view.querySelector(".reader-content");
    if (rc) {
      rc.style.setProperty("--comic-zoom", zoomPercent);
      rc.style.setProperty("--comic-zoom-factor", zoomFactor);
    }
    var fs = ctx.view.querySelector(".comic-flip-stage");
    if (fs) {
      fs.style.setProperty("--comic-zoom", zoomPercent);
      fs.style.setProperty("--comic-zoom-factor", zoomFactor);
    }
    var dp = ctx.view.querySelector(".comic-double-pages");
    if (dp) {
      dp.style.setProperty("--comic-zoom", zoomPercent);
      dp.style.setProperty("--comic-zoom-factor", zoomFactor);
    }
    var zoomInput = ctx.view.querySelector(".reader-settings-drawer input[data-action='comicZoom']");
    if (zoomInput) zoomInput.value = String(ctx.ui.comicZoom);
    var section = (zoomInput && zoomInput.closest(".drawer-section")) || target.closest(".drawer-section");
    var parentLabel = section && section.querySelector("label");
    if (parentLabel) {
      parentLabel.textContent = "Image Zoom (" + ctx.ui.comicZoom + "%)";
    }
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "openChapter") {
    var storyId = target.dataset.storyId || target.dataset.id || ctx.ui.currentStoryId || (ctx.getCurrentStory() ? ctx.getCurrentStory().id : null);
    var chIdx = Number(target.dataset.index);
    ctx.ui.currentChapterIndex = isNaN(chIdx) ? 0 : chIdx;
    ctx.ui.currentComicPageIndex = 0;
    ctx.ui.currentTextPageIndex = 0;
    ctx.ui.currentScrollProgress = 0;
    window.scrollTo(0, 0);
    if (storyId) {
      ctx.ui.currentStoryId = storyId;
      recordStoryView(ctx, storyId);
    }
    if (window.location.hash === "#reader" || window.location.hash === "reader") {
      ctx.render();
    } else {
      window.location.hash = "reader";
    }
    ctx.syncCurrentProgress();
    return true;
  }
  if (action === "retryLoadReaderStory") {
    var retryId = target.dataset.id || target.dataset.storyId || ctx.ui.currentStoryId;
    if (retryId && ctx.state.stories) {
      var s = ctx.state.stories.find(function (item) { return item.id === retryId; });
      if (s) {
        delete s._fullLoaded;
        delete s._loadingFull;
        delete s._loadError;
      }
    }
    ctx.render();
    return true;
  }
  if (action === "showReplyForm") {
    var id = target.dataset.id;
    var currentScroll = (typeof window !== "undefined") ? window.scrollY : 0;
    ctx.ui.activeReplyCommentId = ctx.ui.activeReplyCommentId === id ? null : id;
    ctx.renderReader();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: currentScroll, behavior: "instant" });
    }
    if (ctx.ui.activeReplyCommentId) {
      requestAnimationFrame(function () {
        var replyForm = ctx.view.querySelector("form[data-form='replyForm']");
        if (replyForm) {
          var ta = replyForm.querySelector("textarea[name='replyText']");
          if (ta) {
            ta.focus();
            ta.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }
      });
    }
    return true;
  }
  if (action === "cancelReply") {
    var currentScroll = (typeof window !== "undefined") ? window.scrollY : 0;
    ctx.ui.activeReplyCommentId = null;
    ctx.renderReader();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: currentScroll, behavior: "instant" });
    }
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
      var initiatingUserId = ctx.state.user && ctx.state.user.id;
      // Optimistic UI update
      var backupStories = JSON.parse(JSON.stringify(ctx.state.stories));
      ctx.state.stories.forEach(function (s) {
        (s.chapters || []).forEach(function (ch) {
          var hasChildren = (ch.comments || []).some(function (c) {
            return c.parentId === commentId;
          });
          if (hasChildren) {
            ch.comments.forEach(function (c) {
              if (c.id === commentId) {
                c.text = "[deleted]";
                c.user = "[deleted]";
                c.userId = null;
                c.user_id = null;
                c.isDeleted = true;
              }
            });
          } else {
            ch.comments = (ch.comments || []).filter(function (c) { return c.id !== commentId; });
          }
        });
      });
      ctx.notify("Comment deleted.");
      ctx.render();
      
      ctx.apiDelete("/comments/" + commentId).then(function () {
        var curStory = ctx.getCurrentStory();
        if (curStory && curStory.id) {
          return ctx.api("/stories/" + curStory.id).then(function (fullStory) {
            fullStory._fullLoaded = true;
            var idx = ctx.state.stories.findIndex(function (item) { return item.id === fullStory.id; });
            if (idx !== -1) ctx.state.stories[idx] = fullStory;
            ctx.render();
          });
        }
      }).catch(function (err) {
        console.error("Failed to delete comment:", err);
        if (ctx.state.user && ctx.state.user.id === initiatingUserId) {
          ctx.state.stories = backupStories;
        }
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
  if (action === "openParagraphComments") {
    var index = Number(target.dataset.index);
    ctx.ui.activeParagraphIndex = index;
    ctx.render();
    return true;
  }
  if (action === "closeParagraphComments") {
    ctx.ui.activeParagraphIndex = null;
    ctx.render();
    return true;
  }
  return false;
}

export function openReportModal(ctx, mode, id1, id2) {
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
  } else if (mode === "user") {
    typeSection.hidden = true;
    title.textContent = "Report User @" + (id2 || "User");
    subtitle.textContent = "Help us keep KathaSangam safe and respectful";
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
    } else if (mode === "user") {
      targetType = "user";
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
  if (action === "comicFitSelect") {
    ctx.ui.comicFit = target.value;
    ctx.render();
    ctx.autoSaveReaderPreferences();
    return true;
  }
  if (action === "quickSelectChapter") {
    ctx.ui.currentChapterIndex = Number(target.value);
    ctx.ui.currentComicPageIndex = 0;
    ctx.ui.currentTextPageIndex = 0;
    ctx.ui.currentScrollProgress = 0;
    window.scrollTo(0, 0);
    if (ctx.ui.currentStoryId) recordStoryView(ctx, ctx.ui.currentStoryId);
    ctx.render();
    ctx.syncCurrentProgress();
    return true;
  }
  if (action === "comicZoom") {
    ctx.ui.comicZoom = Number(target.value);
    var zoomFactor = String(ctx.ui.comicZoom / 100);
    var zoomPercent = ctx.ui.comicZoom + "%";
    var cp = ctx.view.querySelector(".comic-pages");
    if (cp) {
      cp.style.setProperty("--comic-zoom", zoomPercent);
      cp.style.setProperty("--comic-zoom-factor", zoomFactor);
    }
    var rc = ctx.view.querySelector(".reader-content");
    if (rc) {
      rc.style.setProperty("--comic-zoom", zoomPercent);
      rc.style.setProperty("--comic-zoom-factor", zoomFactor);
    }
    var fs = ctx.view.querySelector(".comic-flip-stage");
    if (fs) {
      fs.style.setProperty("--comic-zoom", zoomPercent);
      fs.style.setProperty("--comic-zoom-factor", zoomFactor);
    }
    var dp = ctx.view.querySelector(".comic-double-pages");
    if (dp) {
      dp.style.setProperty("--comic-zoom", zoomPercent);
      dp.style.setProperty("--comic-zoom-factor", zoomFactor);
    }
    var section = target.closest(".drawer-section");
    var parentLabel = section && section.querySelector("label");
    if (parentLabel) {
      parentLabel.textContent = "Image Zoom (" + ctx.ui.comicZoom + "%)";
    }
    ctx.autoSaveReaderPreferences();
    return true;
  }
  return false;
}

export function handleReaderSubmit(ctx, formName, target, e) {
  if (formName === "commentForm") {
    var comment = new FormData(target).get("comment").trim();
    var submitBtn = target.querySelector("button[type='submit']");
    if (!comment) {
      setFormFeedback(target, "Comment cannot be empty.", "error");
      return true;
    }
    setFormFeedback(target, "", "");
    var story = ctx.getCurrentStory();
    var chapter = ctx.getCurrentChapter(story);
    if (!chapter || !chapter.id) {
      ctx.notify("No chapter selected.", "warn");
      return true;
    }
    var iconHandle = (submitBtn && submitBtn._animatedIconHandle) ||
      (submitBtn && submitBtn.querySelector(".animated-send-icon") && submitBtn.querySelector(".animated-send-icon").handle);

    if (iconHandle && typeof iconHandle.startAnimation === "function") {
      iconHandle.startAnimation();
      if (submitBtn) submitBtn.disabled = true;
    } else {
      setButtonLoading(submitBtn, true, "Posting...");
    }
    var currentUsername = (ctx.state.profile && ctx.state.profile.username)
      || (ctx.state.user && ctx.state.user.email ? ctx.state.user.email.split("@")[0] : "You");

    ctx.apiPost("/chapters/" + story.id + "/" + chapter.sort_order + "/comments", { user: currentUsername, text: comment })
      .then(function (created) {
        if (iconHandle && typeof iconHandle.stopAnimation === "function") {
          iconHandle.stopAnimation();
          if (submitBtn) submitBtn.disabled = false;
        } else {
          setButtonLoading(submitBtn, false);
        }
        var newComment = (created && created.id) ? created : {
          id: (created && created.id) || ("c-" + Date.now()),
          user: (created && created.user) || currentUsername,
          user_id: (created && created.user_id) || (ctx.state.user && ctx.state.user.id),
          text: comment,
          parentId: null,
          createdAt: (created && (created.createdAt || created.created_at)) || new Date().toISOString()
        };
        chapter.comments = chapter.comments || [];
        chapter.comments.push(newComment);
        ctx.notify("Comment posted.", "success");
        var ta = target.querySelector("textarea[name='comment']");
        if (ta) ta.value = "";
        target.classList.remove("expanded");
        target.classList.add("collapsed");
        ctx.renderReader();
      })
      .catch(function (err) {
        if (iconHandle && typeof iconHandle.stopAnimation === "function") {
          iconHandle.stopAnimation();
          if (submitBtn) submitBtn.disabled = false;
        } else {
          setButtonLoading(submitBtn, false);
        }
        console.error("Failed to post comment:", err);
        var msg = err.message || "Failed to post comment. Please log in.";
        setFormFeedback(target, msg, "error");
        ctx.notify(msg, "error");
      });
    return true;
  }
  if (formName === "inlineCommentForm") {
    var inlineComment = new FormData(target).get("inlineCommentText").trim();
    var inlineSubmitBtn = target.querySelector("button[type='submit']");
    if (!inlineComment) {
      setFormFeedback(target, "Comment cannot be empty.", "error");
      return true;
    }
    setFormFeedback(target, "", "");
    var inlineStory = ctx.getCurrentStory();
    var inlineChapter = ctx.getCurrentChapter(inlineStory);
    if (!inlineChapter || !inlineChapter.id) {
      ctx.notify("No chapter selected.", "warn");
      return true;
    }
    var pIdx = Number(target.dataset.paragraphIndex);
    setButtonLoading(inlineSubmitBtn, true, "Posting...");
    var currentInlineUsername = (ctx.state.profile && ctx.state.profile.username)
      || (ctx.state.user && ctx.state.user.email ? ctx.state.user.email.split("@")[0] : "You");

    ctx.apiPost("/chapters/" + inlineStory.id + "/" + inlineChapter.sort_order + "/comments", {
      user: currentInlineUsername,
      text: inlineComment,
      paragraphIndex: pIdx
    })
      .then(function (created) {
        setButtonLoading(inlineSubmitBtn, false);
        var newComment = (created && created.id) ? created : {
          id: (created && created.id) || ("c-" + Date.now()),
          user: (created && created.user) || currentInlineUsername,
          user_id: (created && created.user_id) || (ctx.state.user && ctx.state.user.id),
          text: inlineComment,
          paragraphIndex: pIdx,
          parentId: null,
          createdAt: (created && (created.createdAt || created.created_at)) || new Date().toISOString()
        };
        inlineChapter.comments = inlineChapter.comments || [];
        inlineChapter.comments.push(newComment);
        ctx.notify("Comment posted.", "success");
        ctx.renderReader();
      })
      .catch(function (err) {
        setButtonLoading(inlineSubmitBtn, false);
        console.error("Failed to post comment:", err);
        var errMsg = err.message || "Failed to post comment. Please log in.";
        setFormFeedback(target, errMsg, "error");
        ctx.notify(errMsg, "error");
      });
    return true;
  }
  if (formName === "replyForm") {
    var fd = new FormData(target);
    var text = fd.get("replyText").trim();
    var replySubmitBtn = target.querySelector("button[type='submit']");
    var parentId = fd.get("parentId");
    var paragraphIndexVal = fd.get("paragraphIndex");
    var paragraphIndex = (paragraphIndexVal !== null && paragraphIndexVal !== "") ? Number(paragraphIndexVal) : null;
    
    if (!text) {
      setFormFeedback(target, "Reply cannot be empty.", "error");
      return true;
    }
    setFormFeedback(target, "", "");
    var replyStory = ctx.getCurrentStory();
    var replyChapter = ctx.getCurrentChapter(replyStory);
    if (!replyChapter || !replyChapter.id) {
      ctx.notify("No chapter selected.", "warn");
      return true;
    }
    setButtonLoading(replySubmitBtn, true, "Posting...");
    var currentReplyUsername = (ctx.state.profile && ctx.state.profile.username)
      || (ctx.state.user && ctx.state.user.email ? ctx.state.user.email.split("@")[0] : "You");

    ctx.apiPost("/chapters/" + replyStory.id + "/" + replyChapter.sort_order + "/comments", {
      text: text,
      parentId: parentId,
      paragraphIndex: paragraphIndex
    })
      .then(function (created) {
        setButtonLoading(replySubmitBtn, false);
        ctx.ui.activeReplyCommentId = null; // Close reply input form
        var newReply = (created && created.id) ? created : {
          id: (created && created.id) || ("r-" + Date.now()),
          user: (created && created.user) || currentReplyUsername,
          user_id: (created && created.user_id) || (ctx.state.user && ctx.state.user.id),
          text: text,
          parentId: parentId,
          paragraphIndex: paragraphIndex,
          createdAt: (created && (created.createdAt || created.created_at)) || new Date().toISOString()
        };
        replyChapter.comments = replyChapter.comments || [];
        replyChapter.comments.push(newReply);
        ctx.notify("Reply posted.", "success");
        var curScroll = (typeof window !== "undefined") ? window.scrollY : 0;
        ctx.renderReader();
        if (typeof window !== "undefined" && curScroll > 0) {
          window.scrollTo({ top: curScroll, behavior: "instant" });
        }
      })
      .catch(function (err) {
        setButtonLoading(replySubmitBtn, false);
        console.error("Failed to post reply:", err);
        var replyErr = err.message || "Failed to post reply. Please log in.";
        setFormFeedback(target, replyErr, "error");
        ctx.notify(replyErr, "error");
      });
    return true;
  }
  return false;
}


export function updateReaderScrollProgress(ctx) {
  if (!ctx || ctx.ui.currentView !== "reader") return;
  var story = ctx.getCurrentStory();
  if (!story || !story.chapters || !story.chapters.length) return;

  if (ctx.ui.readerMode === "scroll") {
    var content = document.querySelector(".reader-content");
    if (content) {
      var rect = content.getBoundingClientRect();
      var winHeight = window.innerHeight;
      var headerOffset = 61;
      var totalHeight = rect.height - (winHeight - headerOffset);
      var scrollProgress = 0;
      if (totalHeight <= 0) {
        scrollProgress = 1.0;
      } else {
        var scrolled = (headerOffset + 40) - rect.top;
        scrollProgress = Math.max(0, Math.min(1.0, scrolled / totalHeight));
      }
      ctx.ui.currentScrollProgress = scrollProgress;
    }
  }

  var progressVal = ctx.calculateActiveReaderProgress(story);
  var progressLine = document.querySelector(".reader-progress-line");
  if (progressLine) {
    progressLine.style.width = progressVal + "%";
  }
}

export function initReaderController(context) {
  window.addEventListener("scroll", function () {
    if (context.ui.currentView === "reader") {
      updateReaderScrollProgress(context);
    }
  }, { passive: true });
}
