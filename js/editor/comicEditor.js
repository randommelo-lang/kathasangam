import { button, el, makeCalendarIcon } from "../components.js";
import { getDraftKey, loadDraft, setupAutosave, showRecoveryBanner } from "./autosave.js";
import { importComicPdf, importComicImages } from "./importers.js";

function setFormFeedback(message, type) {
  const panel = document.querySelector(".editor-panel");
  if (!panel) return;
  const existing = panel.querySelectorAll(".form-feedback");
  existing.forEach(function (e) { e.remove(); });
  
  if (!message) return;
  
  const feedback = el("p", "form-feedback " + (type || "info"), message);
  const actionsRow = panel.querySelector(".editor-actions-row");
  if (actionsRow) {
    actionsRow.parentNode.insertBefore(feedback, actionsRow);
  } else {
    panel.appendChild(feedback);
  }
}

function setButtonsLoading(isLoading, activeAction) {
  const actionsRow = document.querySelector(".editor-actions-row");
  if (!actionsRow) return;
  const buttons = actionsRow.querySelectorAll("button");
  buttons.forEach(function (btn) {
    if (isLoading) {
      btn.disabled = true;
      if (btn.dataset.action === activeAction) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = activeAction === "publishChapter" ? "Publishing..." : "Saving...";
      }
    } else {
      btn.disabled = false;
      if (btn.dataset.originalText) {
        btn.textContent = btn.dataset.originalText;
        delete btn.dataset.originalText;
      }
    }
  });
}

export function saveComicChapter(ctx, title, status, scheduledAt) {
  const payload = {
    title: title,
    content: [],
    pages: ctx.ui.editingPages || [],
    status: status
  };
  if (scheduledAt) payload.scheduledAt = scheduledAt;

  setFormFeedback("", "");
  const activeAction = status === "published" ? "publishChapter" : "saveChapterDraft";
  setButtonsLoading(true, activeAction);

  const draftKey = getDraftKey(ctx.ui.editingChapterId);
  ctx.apiPut("/chapters/" + ctx.ui.editingChapterId, payload).then(function () {
    setButtonsLoading(false, activeAction);
    setFormFeedback("Chapter saved successfully!", "success");
    ctx.notify("Chapter saved.");
    localStorage.removeItem(draftKey);
    return ctx.api("/stories");
  }).then(function (s) {
    ctx.state.stories = s;
    setTimeout(function () {
      ctx.ui.currentView = "studio";
      window.location.hash = "studio";
      ctx.render();
    }, 1000);
  }).catch(function (err) {
    setButtonsLoading(false, activeAction);
    console.error(err);
    setFormFeedback((err.message || "Failed to save chapter.") + " Please check your input and try again.", "error");
  });
}

export function renderComicEditor(ctx, story, chapter) {
  ctx.ui.editingPages = JSON.parse(JSON.stringify(chapter.pages || []));
  const draftKey = getDraftKey(ctx.ui.editingChapterId);
  const cached = loadDraft(draftKey);

  const titleInput = el("input", "editor-title-input");
  titleInput.type = "text";
  titleInput.value = chapter.title;
  titleInput.placeholder = "Chapter Title";

  // Autosave setup
  const getDraftData = () => ({
    title: titleInput.value,
    pages: ctx.ui.editingPages,
    timestamp: Date.now()
  });

  const titleInputList = [titleInput];
  const triggerAutoSave = setupAutosave(titleInputList, draftKey, getDraftData);

  const uploadStatus = el("span", "mini-meta", "");

  const pdfInput = el("input", "comic-pdf-file-input");
  pdfInput.type = "file";
  pdfInput.accept = ".pdf";
  pdfInput.style.display = "none";
  pdfInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    importComicPdf(file, ctx, uploadStatus, function (page) {
      ctx.ui.editingPages.push(page);
      renderPagesGrid();
      triggerAutoSave();
    });
  });

  const extractPdfBtn = el("label", "btn", [
    el("span", "icon icon-document"),
    " Extract pages from PDF"
  ]);
  extractPdfBtn.style.cursor = "pointer";
  extractPdfBtn.appendChild(pdfInput);

  const imageInput = el("input", "comic-image-file-input");
  imageInput.type = "file";
  imageInput.accept = "image/*";
  imageInput.multiple = true;
  imageInput.style.display = "none";
  imageInput.addEventListener("change", async function (e) {
    const files = Array.from(e.target.files);
    await importComicImages(files, ctx, uploadStatus, function (page) {
      ctx.ui.editingPages.push(page);
      renderPagesGrid();
      triggerAutoSave();
    });
  });

  const uploadImagesBtn = el("label", "btn", [
    el("span", "icon icon-document"),
    " Add image pages"
  ]);
  uploadImagesBtn.style.cursor = "pointer";
  uploadImagesBtn.appendChild(imageInput);

  const uploadSection = el("div", "comic-editor-upload-actions", [
    uploadImagesBtn,
    extractPdfBtn,
    uploadStatus
  ]);

  const gridContainer = el("div", "comic-editor-grid");

  gridContainer.addEventListener("dragenter", function (e) {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      gridContainer.classList.add("drag-over-files");
    }
  });

  gridContainer.addEventListener("dragover", function (e) {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      gridContainer.classList.add("drag-over-files");
    }
  });

  gridContainer.addEventListener("dragleave", function (e) {
    if (e.relatedTarget && gridContainer.contains(e.relatedTarget)) {
      return;
    }
    gridContainer.classList.remove("drag-over-files");
  });

  gridContainer.addEventListener("drop", async function (e) {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      gridContainer.classList.remove("drag-over-files");

      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;

      const pdfFile = files.find(f => f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf");
      if (pdfFile) {
        await importComicPdf(pdfFile, ctx, uploadStatus, function (page) {
          ctx.ui.editingPages.push(page);
          renderPagesGrid();
          triggerAutoSave();
        });
      } else {
        const imageFiles = files.filter(f => f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(f.name));
        if (imageFiles.length) {
          await importComicImages(imageFiles, ctx, uploadStatus, function (page) {
            ctx.ui.editingPages.push(page);
            renderPagesGrid();
            triggerAutoSave();
          });
        } else {
          uploadStatus.textContent = "No valid PDF or image files dropped.";
        }
      }
    }
  });

  function renderPagesGrid() {
    gridContainer.innerHTML = "";
    if (!ctx.ui.editingPages || !ctx.ui.editingPages.length) {
      gridContainer.appendChild(el("div", "empty", "No pages added yet. Add images or extract from PDF."));
      return;
    }

    ctx.ui.editingPages.forEach(function (page, idx) {
      const preview = el("div", "comic-editor-page-preview");
      preview.style.backgroundImage = page.bg;

      const badge = el("div", "comic-editor-page-badge", String(idx + 1));
      preview.appendChild(badge);

      const labelInput = el("input", "comic-editor-page-label");
      labelInput.type = "text";
      labelInput.value = page.label || "";
      labelInput.placeholder = "Page Label";
      labelInput.addEventListener("input", function () {
        page.label = labelInput.value;
        triggerAutoSave();
      });

      const deleteBtn = button("Delete", "btn danger btn-sm");
      deleteBtn.addEventListener("click", function () {
        ctx.ui.editingPages.splice(idx, 1);
        renderPagesGrid();
        triggerAutoSave();
      });

      const card = el("div", "comic-editor-page", [
        preview,
        el("div", "comic-editor-page-controls", [
          labelInput,
          deleteBtn
        ])
      ]);

      card.draggable = true;
      card.dataset.index = idx;

      card.addEventListener("dragstart", function (e) {
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", idx);
      });

      card.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });

      card.addEventListener("dragenter", function () {
        card.classList.add("drag-over");
      });

      card.addEventListener("dragleave", function () {
        card.classList.remove("drag-over");
      });

      card.addEventListener("drop", function (e) {
        e.stopPropagation();
        const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
        const toIdx = idx;
        if (fromIdx !== toIdx) {
          const temp = ctx.ui.editingPages[fromIdx];
          ctx.ui.editingPages.splice(fromIdx, 1);
          ctx.ui.editingPages.splice(toIdx, 0, temp);
          renderPagesGrid();
          triggerAutoSave();
        }
      });

      card.addEventListener("dragend", function () {
        card.classList.remove("dragging");
        gridContainer.querySelectorAll(".comic-editor-page").forEach(function (c) {
          c.classList.remove("drag-over");
        });
      });

      gridContainer.appendChild(card);
    });
  }

  renderPagesGrid();

  // Recovery banner check
  const currentPagesString = JSON.stringify(chapter.pages || []);
  const cachedPagesString = JSON.stringify(cached ? cached.pages || [] : []);
  const isChanged = cached && (cached.title !== chapter.title || cachedPagesString !== currentPagesString);

  const banner = showRecoveryBanner({
    ctx,
    draftKey,
    cached,
    currentTitle: chapter.title,
    isChanged,
    onRestore: function (restoredData) {
      titleInput.value = restoredData.title;
      ctx.ui.editingPages = JSON.parse(JSON.stringify(restoredData.pages || []));
      renderPagesGrid();
    }
  });

  const actionsRow = el("div", "editor-actions-row", [
    button("Publish", "btn primary orange-glow-btn", { action: "publishChapter" }),
    button([makeCalendarIcon(), " Schedule"], "btn schedule-btn", { action: "openScheduleModal" }),
    button("Save Draft", "btn", { action: "saveChapterDraft" }),
    button("Cancel", "btn danger", { action: "cancelEditChapter" })
  ]);

  const editorPanel = el("section", "panel editor-panel", [
    el("div", "editor-header", [
      el("h2", null, "Chapter Editor"),
      el("span", "mini-meta", "Story: " + story.title + " (Comic Layout Editor)")
    ]),
    banner,
    el("div", "form-grid", [
      el("label", "field", [
        el("span", null, "Chapter Title"),
        titleInput
      ]),
      uploadSection,
      el("div", "field", [
        el("span", null, "Chapter Pages"),
        gridContainer
      ]),
      actionsRow
    ])
  ]);

  ctx.view.appendChild(editorPanel);
}
