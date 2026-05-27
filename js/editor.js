import { button, el, formatDate, formatNumber } from "./components.js";

export function saveChapterFromEditor(ctx, status) {
  const titleEl = document.querySelector(".editor-title-input");
  const contentEl = document.querySelector(".editor-textarea");
  if (!titleEl || !contentEl) return;

  const newTitle = titleEl.value.trim();
  if (!newTitle) {
    ctx.notify("Chapter title cannot be empty.");
    return;
  }

  const text = contentEl.value.trim();
  let paragraphs = text ? text.split(/\n\s*\n/) : [];
  paragraphs = paragraphs.map(function (p) { return p.trim(); }).filter(Boolean);

  const payload = {
    title: newTitle,
    content: paragraphs,
    status: status
  };

  ctx.apiPut("/chapters/" + ctx.ui.editingChapterId, payload).then(function () {
    localStorage.removeItem("kathasangam_draft_" + ctx.ui.editingChapterId);
    return ctx.api("/stories");
  }).then(function (s) {
    ctx.state.stories = s;
    ctx.notify("Chapter saved.");
    ctx.ui.currentView = "studio";
    window.location.hash = "studio";
    ctx.render();
  }).catch(function (err) {
    console.error(err);
    ctx.notify("Failed to save chapter.");
  });
}

export function renderEditor(ctx) {
  const story = ctx.getCurrentStudioStory();
  if (!story || !story.id) {
    ctx.ui.currentView = "studio";
    window.location.hash = "studio";
    ctx.render();
    return;
  }

  let chapter = null;
  for (let i = 0; i < story.chapters.length; i++) {
    if (story.chapters[i].id === ctx.ui.editingChapterId) {
      chapter = story.chapters[i];
      break;
    }
  }

  if (!chapter) {
    ctx.notify("Chapter not found.");
    ctx.ui.currentView = "studio";
    window.location.hash = "studio";
    ctx.render();
    return;
  }

  const titleInput = el("input", "editor-title-input");
  titleInput.type = "text";
  titleInput.value = chapter.title;
  titleInput.placeholder = "Chapter Title";

  let contentText = "";
  if (chapter.content && chapter.content.length) {
    contentText = chapter.content.join("\n\n");
  }

  const textarea = el("textarea", "editor-textarea");
  textarea.value = contentText;
  textarea.placeholder = "Write your chapter content here. Separate paragraphs with double newlines.";

  const wordCountEl = el("span", "editor-word-count", "0 words");
  function updateWordCount() {
    const text = textarea.value.trim();
    const count = text ? text.split(/\s+/).length : 0;
    wordCountEl.textContent = formatNumber(count) + " words";
  }
  textarea.addEventListener("input", updateWordCount);

  const initialCount = contentText.trim() ? contentText.trim().split(/\s+/).length : 0;
  wordCountEl.textContent = formatNumber(initialCount) + " words";

  const draftKey = "kathasangam_draft_" + ctx.ui.editingChapterId;
  let autoSaveTimer = null;
  function triggerAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function () {
      const draftData = {
        title: titleInput.value,
        content: textarea.value,
        timestamp: Date.now()
      };
      localStorage.setItem(draftKey, JSON.stringify(draftData));
    }, 800);
  }
  titleInput.addEventListener("input", triggerAutoSave);
  textarea.addEventListener("input", triggerAutoSave);

  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(draftKey));
  } catch (e) {}

  let banner = null;
  if (cached && (cached.title !== chapter.title || cached.content !== contentText)) {
    const restoreBtn = button("Restore Draft", "btn primary btn-sm");
    const discardBtn = button("Discard", "btn danger btn-sm");

    const bannerText = "We found a newer unsaved draft from " + formatDate(cached.timestamp) + ". ";
    banner = el("div", "editor-recovery-banner", [
      el("span", null, bannerText),
      el("div", { style: "display: flex; gap: 8px;" }, [restoreBtn, discardBtn])
    ]);
    banner.style.display = "flex";
    banner.style.justifyContent = "space-between";
    banner.style.alignItems = "center";
    banner.style.padding = "10px 16px";
    banner.style.marginBottom = "16px";
    banner.style.background = "rgba(229, 124, 51, 0.12)";
    banner.style.border = "1px solid var(--accent)";
    banner.style.borderRadius = "var(--radius)";

    restoreBtn.addEventListener("click", function () {
      titleInput.value = cached.title;
      textarea.value = cached.content;
      updateWordCount();
      banner.style.display = "none";
      ctx.notify("Draft restored.");
    });

    discardBtn.addEventListener("click", function () {
      localStorage.removeItem(draftKey);
      banner.style.display = "none";
      ctx.notify("Draft discarded.");
    });
  }

  const uploadStatus = el("span", "mini-meta", "");
  const fileInput = el("input", null);
  fileInput.type = "file";
  fileInput.accept = ".docx,.txt";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    uploadStatus.textContent = "Processing " + file.name + "...";

    const reader = new FileReader();
    if (file.name.endsWith(".txt")) {
      reader.onload = function (evt) {
        textarea.value = evt.target.result;
        updateWordCount();
        triggerAutoSave();
        uploadStatus.textContent = "Extracted text from " + file.name;
      };
      reader.readAsText(file);
    } else if (file.name.endsWith(".docx")) {
      reader.onload = function (evt) {
        const arrayBuffer = evt.target.result;
        if (window.mammoth) {
          window.mammoth.extractRawText({ arrayBuffer: arrayBuffer })
            .then(function (result) {
              textarea.value = result.value;
              updateWordCount();
              triggerAutoSave();
              uploadStatus.textContent = "Extracted text from " + file.name;
            })
            .catch(function (err) {
              console.error(err);
              uploadStatus.textContent = "Extraction failed: " + err.message;
            });
        } else {
          uploadStatus.textContent = "Mammoth.js library is not loaded.";
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      uploadStatus.textContent = "Unsupported file format.";
    }
  });

  const uploadBtn = el("label", "btn", [
    el("span", "icon icon-document"),
    " Extract from DOCX / TXT"
  ]);
  uploadBtn.style.cursor = "pointer";
  uploadBtn.appendChild(fileInput);

  const uploadSection = el("div", "editor-upload-section", [
    uploadBtn,
    uploadStatus
  ]);

  const actionsRow = el("div", "editor-actions-row", [
    button("Publish", "btn primary orange-glow-btn", { action: "publishChapter" }),
    button("Save Draft", "btn", { action: "saveChapterDraft" }),
    button("Cancel", "btn danger", { action: "cancelEditChapter" })
  ]);

  const editorPanel = el("section", "panel editor-panel", [
    el("div", "editor-header", [
      el("h2", null, "Chapter Editor"),
      el("span", "mini-meta", "Story: " + story.title)
    ]),
    banner,
    el("div", "form-grid", [
      el("label", "field", [
        el("span", null, "Chapter Title"),
        titleInput
      ]),
      uploadSection,
      el("label", "field", [
        el("span", null, "Chapter Content"),
        textarea
      ]),
      wordCountEl,
      actionsRow
    ])
  ]);

  ctx.view.appendChild(editorPanel);
}
