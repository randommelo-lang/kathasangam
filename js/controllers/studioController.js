import { saveChapterFromEditor as saveChapterFromEditorModule } from "../editor.js";

export function handleStudioClick(ctx, action, target, e) {
  if (action === "manageStory") {
    ctx.ui.currentStoryId = target.dataset.id;
    ctx.ui.currentView = "studio";
    window.location.hash = "studio";
    ctx.render();
    return true;
  }
  if (action === "openStoryModal") {
    ctx.openStoryModal();
    return true;
  }
  if (action === "editStorySettings") {
    ctx.openStorySettingsModal(target.dataset.id);
    return true;
  }
  if (action === "quickDraft") {
    ctx.notify("Quick Draft feature is currently in prototype mode.");
    return true;
  }
  if (action === "storyNotes") {
    ctx.notify("Story Notes feature is currently in prototype mode.");
    return true;
  }
  if (action === "uploadCover") {
    var story = ctx.getCurrentStudioStory();
    if (!story || !story.id) {
      ctx.notify("Please select or create a story first.");
      return true;
    }
    
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.onchange = function(evt) {
      var file = evt.target.files[0];
      if (!file) return;
      
      ctx.notify("Uploading cover image...");
      
      var fd = new FormData();
      fd.append("file", file);
      
      ctx.api("/upload/image", {
        method: "POST",
        body: fd
      }).then(function(resp) {
        if (!resp || !resp.url) throw new Error("Upload failed");
        return ctx.apiPut("/stories/" + story.id, { cover: resp.url });
      }).then(function() {
        return ctx.api("/stories");
      }).then(function(s) {
        ctx.state.stories = s;
        ctx.notify("Cover image updated successfully!");
        ctx.render();
      }).catch(function(err) {
        console.error(err);
        if (err.status === 413) {
          ctx.notify("Upload failed: File is too large (max 5MB).");
        } else if (err.status === 415) {
          ctx.notify("Upload failed: Invalid format. Only PNG, JPG, WEBP, and GIF allowed.");
        } else {
          ctx.notify(err.message || "Failed to upload cover.");
        }
      });
    };
    fileInput.click();
    return true;
  }
  if (action === "deleteCover") {
    var story = ctx.getCurrentStudioStory();
    if (!story || !story.id) {
      ctx.notify("Please select or create a story first.");
      return true;
    }
    window.showConfirm({
      title: "Remove Cover Image",
      message: "Are you sure you want to remove the cover image and reset to default?",
      confirmText: "Remove",
      isDanger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      ctx.notify("Removing cover image...");
      ctx.apiPut("/stories/" + story.id, { cover: "" })
        .then(function() {
          return ctx.api("/stories");
        })
        .then(function(s) {
          ctx.state.stories = s;
          ctx.notify("Cover image removed.");
          ctx.render();
        })
        .catch(function(err) {
          console.error(err);
          ctx.notify(err.message || "Failed to remove cover image.");
        });
    });
    return true;
  }
  if (action === "newChapter") {
    var story = ctx.getCurrentStudioStory();
    if (!story || !story.id) {
      ctx.notify("Please create a story first before adding chapters.");
      return true;
    }
    var num = story.chapters.length + 1;
    ctx.apiPost("/stories/" + story.id + "/chapters", { title: "Draft Chapter " + num }).then(function () {
      return ctx.api("/stories");
    }).then(function (s) {
      ctx.state.stories = s;
      ctx.notify("Draft chapter created.");
      ctx.render();
    });
    return true;
  }
  if (action === "editChapter") {
    ctx.ui.editingChapterId = target.dataset.id;
    ctx.ui.currentView = "editor";
    window.location.hash = "editor";
    ctx.render();
    return true;
  }
  if (action === "continueWriting") {
    var story = ctx.getCurrentStudioStory();
    if (!story || !story.id) {
      ctx.notify("Please create a story first before adding chapters.");
      return true;
    }
    if (story.chapters && story.chapters.length) {
      var lastCh = story.chapters[story.chapters.length - 1];
      ctx.ui.editingChapterId = lastCh.id;
      ctx.ui.currentView = "editor";
      window.location.hash = "editor";
      ctx.render();
    } else {
      ctx.apiPost("/stories/" + story.id + "/chapters", { title: "Draft Chapter 1" }).then(function () {
        return ctx.api("/stories");
      }).then(function (s) {
        ctx.state.stories = s;
        var updatedStory = ctx.getCurrentStudioStory();
        if (updatedStory && updatedStory.chapters.length) {
          var newCh = updatedStory.chapters[updatedStory.chapters.length - 1];
          ctx.ui.editingChapterId = newCh.id;
          ctx.ui.currentView = "editor";
          window.location.hash = "editor";
        }
        ctx.notify("Draft chapter created.");
        ctx.render();
      });
    }
    return true;
  }
  if (action === "saveChapterDraft") {
    saveChapterFromEditorModule(ctx, "draft");
    return true;
  }
  if (action === "revertToDraft") {
    saveChapterFromEditorModule(ctx, "draft");
    return true;
  }
  if (action === "publishChapter") {
    saveChapterFromEditorModule(ctx, "published");
    return true;
  }
  if (action === "openScheduleModal") {
    var modal = document.getElementById("scheduleModal");
    var input = document.getElementById("scheduleDateTime");
    var chapterIdField = document.getElementById("scheduleChapterId");
    var info = document.getElementById("scheduleInfo");
    if (!modal || !input) return true;
    
    // Set chapter ID
    var chId = target.dataset.id || ctx.ui.editingChapterId;
    if (chapterIdField) chapterIdField.value = chId || "";
    
    // Set min to current datetime
    var now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    input.min = now.toISOString().slice(0, 16);
    
    // Pre-fill existing schedule
    var existingSchedule = target.dataset.scheduledat || "";
    if (existingSchedule) {
      var d = new Date(existingSchedule);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      input.value = d.toISOString().slice(0, 16);
      info.textContent = "This chapter is currently scheduled. Change the date to reschedule.";
    } else {
      input.value = "";
      info.textContent = "The chapter will be automatically published at the selected date and time.";
    }
    
    modal.hidden = false;
    
    // Setup handlers
    var closeModal = function() { modal.hidden = true; };
    var closeBtn = document.getElementById("scheduleModalClose");
    var cancelBtn = document.getElementById("scheduleCancelBtn");
    if (closeBtn) closeBtn.onclick = closeModal;
    if (cancelBtn) cancelBtn.onclick = closeModal;
    modal.onclick = function(e) { if (e.target === modal) closeModal(); };
    
    var form = document.getElementById("scheduleForm");
    form.onsubmit = function(e) {
      e.preventDefault();
      var scheduledAt = input.value;
      if (!scheduledAt) { ctx.notify("Please select a date and time."); return; }
      var selectedDate = new Date(scheduledAt);
      if (selectedDate <= new Date()) { ctx.notify("Scheduled time must be in the future."); return; }
      
      var scheduleChapterId = chapterIdField.value;
      var confirmBtn = document.getElementById("scheduleConfirmBtn");
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Scheduling...";
      
      // If in editor view, save chapter content with schedule
      if (ctx.ui.currentView === "editor" && ctx.ui.editingChapterId === scheduleChapterId) {
        var titleEl = document.querySelector(".editor-title-input");
        var contentEl = document.querySelector(".editor-textarea");
        var story = ctx.getCurrentStudioStory();
        var isComic = story && story.type === "Chitrānk";
        
        var payload = { title: titleEl ? titleEl.value.trim() : "Untitled", content: [], status: "scheduled", scheduledAt: scheduledAt + ":00" };
        if (isComic) {
          payload.pages = ctx.ui.editingPages || [];
        } else if (contentEl) {
          var paragraphs = [];
          Array.from(contentEl.childNodes).forEach(function(node) {
            var text = node.textContent.trim();
            if (!text) return;
            var align = "left";
            if (node.nodeType === 1) {
              if (node.classList.contains("align-center")) align = "center";
              else if (node.classList.contains("align-right")) align = "right";
            }
            if (align === "center") paragraphs.push("[center]" + text);
            else if (align === "right") paragraphs.push("[right]" + text);
            else paragraphs.push("[left]" + text);
          });
          payload.content = paragraphs;
        }
        
        ctx.apiPut("/chapters/" + scheduleChapterId, payload).then(function() {
          closeModal();
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<svg class="icon calendar-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle; display: inline-block;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>Confirm Schedule';
          ctx.notify("Chapter scheduled for " + selectedDate.toLocaleString() + ".");
          return ctx.api("/stories");
        }).then(function(s) {
          ctx.state.stories = s;
          ctx.ui.currentView = "studio";
          window.location.hash = "studio";
          ctx.render();
        }).catch(function(err) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<svg class="icon calendar-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle; display: inline-block;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>Confirm Schedule';
          ctx.notify(err.message || "Failed to schedule chapter.");
        });
      } else {
        // From timeline view, just update schedule
        var story = ctx.getCurrentStudioStory();
        var chapter = story ? story.chapters.find(function(ch) { return ch.id === scheduleChapterId; }) : null;
        
        var payload = {
          title: chapter ? chapter.title : "Untitled",
          content: chapter && chapter.content ? chapter.content : [],
          status: "scheduled",
          scheduledAt: scheduledAt + ":00"
        };
        if (chapter && chapter.pages) payload.pages = chapter.pages;
        
        ctx.apiPut("/chapters/" + scheduleChapterId, payload).then(function() {
          closeModal();
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<svg class="icon calendar-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle; display: inline-block;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>Confirm Schedule';
          ctx.notify("Chapter scheduled for " + selectedDate.toLocaleString() + ".");
          return ctx.api("/stories");
        }).then(function(s) {
          ctx.state.stories = s;
          ctx.render();
        }).catch(function(err) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<svg class="icon calendar-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle; display: inline-block;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>Confirm Schedule';
          ctx.notify(err.message || "Failed to schedule chapter.");
        });
      }
    };
    return true;
  }
  if (action === "cancelSchedule") {
    var chapterId = target.dataset.id;
    var story = ctx.getCurrentStudioStory();
    var chapter = story ? story.chapters.find(function(ch) { return ch.id === chapterId; }) : null;
    if (!chapter) return true;
    
    window.showConfirm({
      title: "Cancel Schedule",
      message: 'Cancel the scheduled publishing for "' + chapter.title + '"? It will revert to draft status.',
      confirmText: "Cancel Schedule",
      isDanger: true
    }).then(function(confirmed) {
      if (!confirmed) return;
      ctx.apiPut("/chapters/" + chapterId, {
        title: chapter.title,
        content: chapter.content || [],
        scheduledAt: ""
      }).then(function() {
        ctx.notify('Schedule cancelled for "' + chapter.title + '".');
        return ctx.api("/stories");
      }).then(function(s) {
        ctx.state.stories = s;
        ctx.render();
      });
    });
    return true;
  }
  if (action === "publishNow") {
    var chapterId = target.dataset.id;
    ctx.apiPatch("/chapters/" + chapterId + "/status").then(function(r) {
      ctx.notify('"' + r.title + '" published immediately!');
      return ctx.api("/stories");
    }).then(function(s) {
      ctx.state.stories = s;
      ctx.render();
    });
    return true;
  }
  if (action === "cancelEditChapter") {
    var titleEl = document.querySelector(".editor-title-input");
    var contentEl = document.querySelector(".editor-textarea");
    var story = ctx.getCurrentStudioStory();
    var chapter = null;
    if (story) {
      chapter = story.chapters.find(function(ch) { return ch.id === ctx.ui.editingChapterId; });
    }
    
    var hasChanges = false;
    if (titleEl && contentEl && chapter) {
      var originalText = "";
      if (chapter.content && chapter.content.length) {
        originalText = chapter.content.join("\n\n");
      }
      if (titleEl.value !== chapter.title || contentEl.value !== originalText) {
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      window.showConfirm({
        title: "Discard Changes",
        message: "You have unsaved changes. Are you sure you want to discard them?",
        confirmText: "Discard",
        isDanger: true
      }).then(function (confirmed) {
        if (!confirmed) return;
        localStorage.removeItem("kathasangam_draft_" + ctx.ui.editingChapterId);
        ctx.ui.currentView = "studio";
        window.location.hash = "studio";
        ctx.render();
      });
      return true;
    }
    localStorage.removeItem("kathasangam_draft_" + ctx.ui.editingChapterId);
    ctx.ui.currentView = "studio";
    window.location.hash = "studio";
    ctx.render();
    return true;
  }
  if (action === "toggleChapterStatus") {
    var chapterId = target.dataset.id;
    ctx.apiPatch("/chapters/" + chapterId + "/status").then(function (r) {
      ctx.notify(r.title + " is now " + r.status + ".");
      return ctx.api("/stories");
    }).then(function (s) {
      ctx.state.stories = s;
      ctx.render();
    });
    return true;
  }
  if (action === "deleteChapter") {
    var doomedId = target.dataset.id;
    window.showConfirm({
      title: "Delete Chapter",
      message: "Are you sure you want to delete this chapter? This cannot be undone.",
      confirmText: "Delete",
      isDanger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      var backupStories = JSON.parse(JSON.stringify(ctx.state.stories));
      ctx.state.stories.forEach(function (s) {
        s.chapters = s.chapters.filter(function (ch) { return ch.id !== doomedId; });
      });
      ctx.ui.currentChapterIndex = 0;
      ctx.notify("Chapter deleted.");
      ctx.render();
      
      ctx.apiDelete("/chapters/" + doomedId).then(function () {
        return ctx.api("/stories");
      }).then(function (s) {
        ctx.state.stories = s;
        ctx.render();
      }).catch(function (err) {
        console.error("Failed to delete chapter:", err);
        ctx.state.stories = backupStories;
        ctx.notify(err.message || "Failed to delete chapter. Restored.");
        ctx.render();
      });
    });
    return true;
  }
  if (action === "deleteStory") {
    var doomed = ctx.state.stories.find(function (s) { return s.id === target.dataset.id; });
    if (!doomed || !ctx.canDeleteStory(doomed)) return true;
    
    window.showConfirm({
      title: "Delete Story",
      message: "Delete \"" + doomed.title + "\" and all of its chapters? This cannot be undone.",
      confirmText: "Delete",
      isDanger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      var backupStories = ctx.state.stories.slice();
      var backupLibrary = ctx.state.library.slice();
      ctx.state.stories = ctx.state.stories.filter(function (s) { return s.id !== doomed.id; });
      ctx.state.library = ctx.state.library.filter(function (id) { return id !== doomed.id; });
      if (ctx.ui.currentStoryId === doomed.id) {
        ctx.ui.currentStoryId = ctx.state.stories[0] ? ctx.state.stories[0].id : "";
        ctx.ui.currentChapterIndex = 0;
      }
      ctx.hydrateGenres();
      ctx.notify("Story deleted.");
      ctx.render();
      
      ctx.apiDelete("/stories/" + doomed.id).then(function () {
        return Promise.all([ctx.api("/stories"), ctx.api("/library/ids")]);
      }).then(function (results) {
        ctx.state.stories = results[0];
        ctx.state.library = results[1];
        ctx.hydrateGenres();
        ctx.render();
      }).catch(function (err) {
        console.error("Failed to delete story:", err);
        ctx.state.stories = backupStories;
        ctx.state.library = backupLibrary;
        ctx.hydrateGenres();
        ctx.notify(err.message || "Failed to delete story. Restored.");
        ctx.render();
      });
    });
    return true;
  }
  if (action === "acceptInvite") {
    var inviteId = target.dataset.id;
    ctx.notify("Accepting invitation...");
    ctx.apiPost("/collaborations/invites/" + inviteId + "/respond", { action: "accept" })
      .then(function () {
        ctx.notify("Invitation accepted!");
        ctx.state.pendingInvitesUserId = null; // force reload invites
        return ctx.api("/stories");
      })
      .then(function (s) {
        ctx.state.stories = s;
        ctx.render();
      })
      .catch(function (err) {
        ctx.notify(err.message || "Failed to accept invitation.");
      });
    return true;
  }
  if (action === "declineInvite") {
    var inviteId = target.dataset.id;
    ctx.notify("Declining invitation...");
    ctx.apiPost("/collaborations/invites/" + inviteId + "/respond", { action: "decline" })
      .then(function () {
        ctx.notify("Invitation declined.");
        ctx.state.pendingInvitesUserId = null; // force reload invites
        ctx.render();
      })
      .catch(function (err) {
        ctx.notify(err.message || "Failed to decline invitation.");
      });
    return true;
  }
  if (action === "removeCollaborator") {
    var storyId = target.dataset.storyId;
    var userId = target.dataset.userId;
    var isSelf = (ctx.state.user && userId === ctx.state.user.id);
    
    window.showConfirm({
      title: isSelf ? "Leave Story" : "Remove Collaborator",
      message: isSelf ? "Are you sure you want to leave this story's collaboration?" : "Are you sure you want to remove this collaborator?",
      confirmText: isSelf ? "Leave" : "Remove",
      isDanger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      ctx.notify(isSelf ? "Leaving story..." : "Removing collaborator...");
      ctx.apiDelete("/stories/" + storyId + "/collaborators/" + userId)
        .then(function () {
          ctx.notify(isSelf ? "You have left the story." : "Collaborator removed.");
          if (isSelf && ctx.ui.currentStoryId === storyId) {
            ctx.ui.currentStoryId = "";
          }
          return ctx.api("/stories");
        })
        .then(function (s) {
          ctx.state.stories = s;
          ctx.render();
        })
        .catch(function (err) {
          ctx.notify(err.message || "Failed to remove collaborator.");
        });
    });
    return true;
  }
  if (action === "deleteInternalNote") {
    var storyId = target.dataset.storyId;
    var noteId = target.dataset.noteId;
    
    ctx.apiDelete("/stories/" + storyId + "/internal-notes/" + noteId)
      .then(function () {
        ctx.notify("Note deleted.");
        if (ctx.state.internalNotes) {
          ctx.state.internalNotes = ctx.state.internalNotes.filter(function (n) { return n.id !== noteId; });
        }
        ctx.render();
      })
      .catch(function (err) {
        ctx.notify(err.message || "Failed to delete note.");
      });
    return true;
  }
  return false;
}

function setFormFeedback(form, message, type) {
  if (!form) return;
  var existing = form.querySelectorAll(".form-feedback");
  existing.forEach(function (e) { e.remove(); });
  
  if (!message) return;
  
  var feedback = document.createElement("p");
  feedback.className = "form-feedback " + (type || "info");
  feedback.textContent = message;
  
  var submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.parentNode.insertBefore(feedback, submitBtn);
  } else {
    form.appendChild(feedback);
  }
}

function setButtonLoading(btn, isLoading, originalText) {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = originalText || "Saving...";
  } else {
    btn.disabled = false;
    if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
    }
  }
}

export function handleStudioSubmit(ctx, formName, target, e) {
  if (formName === "storyForm") {
    var fd = new FormData(target);
    var title = fd.get("title").trim();
    var genre = fd.get("genre").trim();
    var description = fd.get("description").trim();
    var type = fd.get("type");
    
    setFormFeedback(target, "", "");

    if (!title || !genre) {
      setFormFeedback(target, "Title and Genre are required. Please check your inputs and try again.", "error");
      return true;
    }
    
    var submitBtn = target.querySelector("button[type='submit']");
    setButtonLoading(submitBtn, true, "Creating...");
    
    ctx.apiPost("/stories", {
      title: title,
      type: type,
      genre: genre,
      description: description
    }).then(function (resp) {
      setButtonLoading(submitBtn, false);
      setFormFeedback(target, "Story created successfully!", "success");
      ctx.ui.currentStoryId = resp.id;
      ctx.ui.currentChapterIndex = 0;
      return ctx.api("/stories");
    }).then(function (s) {
      ctx.state.stories = s;
      ctx.hydrateGenres();
      setTimeout(function () {
        ctx.closeStoryModal();
        ctx.render();
      }, 1000);
    }).catch(function (err) {
      setButtonLoading(submitBtn, false);
      console.error(err);
      setFormFeedback(target, (err.message || "Failed to create story.") + " Please check your inputs and try again.", "error");
    });
    return true;
  }
  if (formName === "storySettingsForm") {
    var fd = new FormData(target);
    var storyId = fd.get("id");
    var title = fd.get("title").trim();
    var genre = fd.get("genre").trim();
    var description = fd.get("description").trim();
    var status = fd.get("status");
    var language = fd.get("language").trim();
    var license = fd.get("license");
    
    setFormFeedback(target, "", "");

    if (!title || !genre || !language) {
      setFormFeedback(target, "Title, Genre, and Language are required. Please check your inputs and try again.", "error");
      return true;
    }
    
    var submitBtn = target.querySelector("button[type='submit']");
    setButtonLoading(submitBtn, true, "Saving...");

    ctx.apiPut("/stories/" + storyId, {
      title: title,
      genre: genre,
      description: description,
      status: status,
      language: language,
      license: license
    }).then(function (resp) {
      setButtonLoading(submitBtn, false);
      setFormFeedback(target, "Story settings saved successfully!", "success");
      return ctx.api("/stories");
    }).then(function (s) {
      ctx.state.stories = s;
      ctx.hydrateGenres();
      setTimeout(function () {
        ctx.closeStoryModal();
        ctx.render();
      }, 1000);
    }).catch(function (err) {
      setButtonLoading(submitBtn, false);
      console.error(err);
      setFormFeedback(target, (err.message || "Failed to update story metadata.") + " Please check your inputs and try again.", "error");
    });
    return true;
  }
  if (formName === "inviteForm") {
    var active = ctx.getCurrentStudioStory();
    if (!active || !active.id) return true;
    var fd = new FormData(target);
    var username = fd.get("username").trim();
    var role = fd.get("role");
    
    if (!username) return true;
    
    var submitBtn = target.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    
    ctx.apiPost("/stories/" + active.id + "/collaborators", {
      username: username,
      role: role
    }).then(function () {
      ctx.notify("Invitation sent to @" + username);
      target.reset();
      return ctx.api("/stories");
    }).then(function (s) {
      ctx.state.stories = s;
      ctx.render();
    }).catch(function (err) {
      ctx.notify(err.message || "Failed to invite collaborator.");
    }).finally(function () {
      submitBtn.disabled = false;
    });
    return true;
  }
  if (formName === "noteForm") {
    var active = ctx.getCurrentStudioStory();
    if (!active || !active.id) return true;
    var fd = new FormData(target);
    var chapterId = fd.get("chapterId") || null;
    var content = fd.get("content").trim();
    
    if (!content) return true;
    
    var submitBtn = target.querySelector("button[type='submit']");
    submitBtn.disabled = true;
    
    ctx.apiPost("/stories/" + active.id + "/internal-notes", {
      chapterId: chapterId || null,
      content: content
    }).then(function (note) {
      ctx.notify("Note posted.");
      if (!ctx.state.internalNotes) ctx.state.internalNotes = [];
      ctx.state.internalNotes.push(note);
      target.reset();
      ctx.render();
    }).catch(function (err) {
      ctx.notify(err.message || "Failed to post note.");
    }).finally(function () {
      submitBtn.disabled = false;
    });
    return true;
  }
  return false;
}
