import { button, el, formatDate, formatNumber } from "./components.js?v=studio-20260529-preferences-v21";

export function saveChapterFromEditor(ctx, status) {
  const titleEl = document.querySelector(".editor-title-input");
  const contentEl = document.querySelector(".editor-textarea");
  if (!titleEl || !contentEl) return;

  const newTitle = titleEl.value.trim();
  if (!newTitle) {
    ctx.notify("Chapter title cannot be empty.");
    return;
  }

  // Extract paragraphs from contenteditable div
  const paragraphs = [];
  const nodes = Array.from(contentEl.childNodes);
  nodes.forEach(function (node) {
    const text = node.textContent.trim();
    if (!text) return; // Skip empty lines/paragraphs

    let align = "left";
    if (node.nodeType === 1) { // Node.ELEMENT_NODE
      align = node.style.textAlign || "left";
    }

    if (align === "center") {
      paragraphs.push("[center]" + text);
    } else if (align === "right") {
      paragraphs.push("[right]" + text);
    } else if (align === "left") {
      paragraphs.push("[left]" + text);
    } else {
      paragraphs.push(text);
    }
  });

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

  // Create contenteditable editor instead of textarea
  const editorDiv = el("div", "editor-textarea");
  editorDiv.contentEditable = "true";
  editorDiv.setAttribute("role", "textbox");
  editorDiv.placeholder = "Write your chapter content here. Press Enter to start a new paragraph.";

  // Populate editor with existing paragraphs
  function loadParagraphs(content) {
    editorDiv.innerHTML = "";
    if (content && content.length) {
      content.forEach(function (para) {
        let align = "left";
        let cleanText = para;
        if (para.startsWith("[center]")) {
          align = "center";
          cleanText = para.substring(8);
        } else if (para.startsWith("[right]")) {
          align = "right";
          cleanText = para.substring(7);
        } else if (para.startsWith("[left]")) {
          align = "left";
          cleanText = para.substring(6);
        }
        const p = el("p", null, cleanText);
        p.style.textAlign = align;
        editorDiv.appendChild(p);
      });
    } else {
      const p = el("p", null, "");
      editorDiv.appendChild(p);
    }
  }

  loadParagraphs(chapter.content);

  const wordCountEl = el("span", "editor-word-count", "0 words");
  function updateWordCount() {
    const text = editorDiv.textContent.trim();
    const count = text ? text.split(/\s+/).length : 0;
    wordCountEl.textContent = formatNumber(count) + " words";
  }
  editorDiv.addEventListener("input", updateWordCount);

  // Initialize word count
  const initialText = editorDiv.textContent.trim();
  const initialCount = initialText ? initialText.split(/\s+/).length : 0;
  wordCountEl.textContent = formatNumber(initialCount) + " words";

  // Draft key & auto-save
  const draftKey = "kathasangam_draft_" + ctx.ui.editingChapterId;
  let autoSaveTimer = null;
  function triggerAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function () {
      const paragraphs = [];
      const nodes = Array.from(editorDiv.childNodes);
      nodes.forEach(function (node) {
        const text = node.textContent.trim();
        if (!text) return;
        let align = "left";
        if (node.nodeType === 1) {
          align = node.style.textAlign || "left";
        }
        if (align === "center") {
          paragraphs.push("[center]" + text);
        } else if (align === "right") {
          paragraphs.push("[right]" + text);
        } else if (align === "left") {
          paragraphs.push("[left]" + text);
        } else {
          paragraphs.push(text);
        }
      });

      const draftData = {
        title: titleInput.value,
        content: paragraphs.join("\n\n"),
        timestamp: Date.now()
      };
      localStorage.setItem(draftKey, JSON.stringify(draftData));
    }, 800);
  }
  titleInput.addEventListener("input", triggerAutoSave);
  editorDiv.addEventListener("input", triggerAutoSave);

  // Restore draft banner
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(draftKey));
  } catch (e) {}

  let banner = null;
  // Get string representation of existing content to compare with draft
  const currentTextString = (chapter.content || []).join("\n\n");
  if (cached && (cached.title !== chapter.title || cached.content !== currentTextString)) {
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
      const paras = cached.content.split(/\n\s*\n/);
      loadParagraphs(paras);
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

  // File import/extract handler
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
        const text = evt.target.result;
        const paras = text ? text.split(/\n\s*\n/) : [];
        loadParagraphs(paras.map(function (p) { return p.trim(); }));
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
              const paras = result.value ? result.value.split(/\n\s*\n/) : [];
              loadParagraphs(paras.map(function (p) { return p.trim(); }));
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

  // Align toolbar buttons and listeners
  const alignLeftBtn = button("Align Left", "btn btn-sm");
  const alignCenterBtn = button("Align Center", "btn btn-sm");
  const alignRightBtn = button("Align Right", "btn btn-sm");

  function setActiveAlign(activeBtn) {
    alignLeftBtn.classList.remove("active");
    alignCenterBtn.classList.remove("active");
    alignRightBtn.classList.remove("active");
    activeBtn.classList.add("active");
  }

  // Set default initial active button
  alignLeftBtn.classList.add("active");

  alignLeftBtn.addEventListener("click", function (e) {
    e.preventDefault();
    document.execCommand("justifyLeft", false, null);
    setActiveAlign(alignLeftBtn);
    triggerAutoSave();
  });
  alignCenterBtn.addEventListener("click", function (e) {
    e.preventDefault();
    document.execCommand("justifyCenter", false, null);
    setActiveAlign(alignCenterBtn);
    triggerAutoSave();
  });
  alignRightBtn.addEventListener("click", function (e) {
    e.preventDefault();
    document.execCommand("justifyRight", false, null);
    setActiveAlign(alignRightBtn);
    triggerAutoSave();
  });

  function checkCurrentAlignment() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      let container = range.startContainer;
      while (container && container !== editorDiv) {
        if (container.nodeType === 1) { // ELEMENT_NODE
          const align = container.style.textAlign || "left";
          if (align === "center") {
            setActiveAlign(alignCenterBtn);
            return;
          } else if (align === "right") {
            setActiveAlign(alignRightBtn);
            return;
          } else if (align === "left") {
            setActiveAlign(alignLeftBtn);
            return;
          }
        }
        container = container.parentNode;
      }
    }
    // Fallback/Default
    setActiveAlign(alignLeftBtn);
  }

  editorDiv.addEventListener("keyup", checkCurrentAlignment);
  editorDiv.addEventListener("mouseup", checkCurrentAlignment);
  editorDiv.addEventListener("focus", checkCurrentAlignment);

  const alignToolbar = el("div", "editor-align-toolbar", [
    alignLeftBtn,
    alignCenterBtn,
    alignRightBtn
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
      el("div", "field", [
        el("span", null, "Text Alignment"),
        alignToolbar
      ]),
      el("div", "field", [
        el("span", null, "Chapter Content"),
        editorDiv
      ]),
      wordCountEl,
      actionsRow
    ])
  ]);

  ctx.view.appendChild(editorPanel);
}
