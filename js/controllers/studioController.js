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
  if (action === "publishChapter") {
    saveChapterFromEditorModule(ctx, "published");
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
  return false;
}
