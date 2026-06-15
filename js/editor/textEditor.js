import { button, el, formatNumber } from "../components.js?v=a11y-focus-20260613-v28";
import { getDraftKey, loadDraft, setupAutosave, showRecoveryBanner } from "./autosave.js?v=a11y-focus-20260613-v28";
import { importTextFile } from "./importers.js?v=a11y-focus-20260613-v28";

export function saveTextChapter(ctx, title, paragraphs, status) {
  const payload = {
    title: title,
    content: paragraphs,
    status: status
  };

  const draftKey = getDraftKey(ctx.ui.editingChapterId);
  ctx.apiPut("/chapters/" + ctx.ui.editingChapterId, payload).then(function () {
    localStorage.removeItem(draftKey);
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

export function renderTextEditor(ctx, story, chapter) {
  const draftKey = getDraftKey(ctx.ui.editingChapterId);
  const cached = loadDraft(draftKey);

  const titleInput = el("input", "editor-title-input");
  titleInput.type = "text";
  titleInput.value = chapter.title;
  titleInput.placeholder = "Chapter Title";

  const editorDiv = el("div", "editor-textarea");
  editorDiv.contentEditable = "true";
  editorDiv.setAttribute("role", "textbox");
  editorDiv.placeholder = "Write your chapter content here. Press Enter to start a new paragraph.";

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
        p.classList.add("align-" + align);
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

  // Autosave setup
  const getDraftData = () => {
    const paragraphs = [];
    const nodes = Array.from(editorDiv.childNodes);
    nodes.forEach(function (node) {
      const text = node.textContent.trim();
      if (!text) return;
      let align = "left";
      if (node.nodeType === 1) {
        if (node.classList.contains("align-center")) {
          align = "center";
        } else if (node.classList.contains("align-right")) {
          align = "right";
        } else if (node.classList.contains("align-left")) {
          align = "left";
        } else {
          align = node.style.textAlign || "left";
        }
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

    return {
      title: titleInput.value,
      content: paragraphs.join("\n\n"),
      timestamp: Date.now()
    };
  };

  const titleInputList = [titleInput, editorDiv];
  const triggerAutoSave = setupAutosave(titleInputList, draftKey, getDraftData);

  // Recovery banner check
  const currentTextString = (chapter.content || []).join("\n\n");
  const isChanged = cached && (cached.title !== chapter.title || cached.content !== currentTextString);

  const banner = showRecoveryBanner({
    ctx,
    draftKey,
    cached,
    currentTitle: chapter.title,
    isChanged,
    onRestore: function (restoredData) {
      titleInput.value = restoredData.title;
      const paras = restoredData.content.split(/\n\s*\n/);
      loadParagraphs(paras);
      updateWordCount();
    }
  });

  const uploadStatus = el("span", "mini-meta", "");
  const fileInput = el("input", "text-doc-file-input");
  fileInput.type = "file";
  fileInput.accept = ".docx,.txt,.pdf";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    importTextFile(file, uploadStatus, function (paras) {
      loadParagraphs(paras);
      updateWordCount();
      triggerAutoSave();
    });
  });

  const uploadBtn = el("label", "btn", [
    el("span", "icon icon-document"),
    " Extract from DOCX / TXT / PDF"
  ]);
  uploadBtn.style.cursor = "pointer";
  uploadBtn.appendChild(fileInput);

  const uploadSection = el("div", "editor-upload-section", [
    uploadBtn,
    uploadStatus
  ]);

  const alignLeftBtn = button("Align Left", "btn btn-sm");
  const alignCenterBtn = button("Align Center", "btn btn-sm");
  const alignRightBtn = button("Align Right", "btn btn-sm");

  function setActiveAlign(activeBtn) {
    alignLeftBtn.classList.remove("active");
    alignCenterBtn.classList.remove("active");
    alignRightBtn.classList.remove("active");
    activeBtn.classList.add("active");
  }

  alignLeftBtn.classList.add("active");

  function setSelectedParagraphsAlignment(align) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const children = Array.from(editorDiv.childNodes);
    let alignedAny = false;

    children.forEach(node => {
      if (node.nodeType === 1) { // ELEMENT_NODE
        if (range.intersectsNode(node)) {
          node.style.textAlign = "";
          node.classList.remove("align-left", "align-center", "align-right");
          node.classList.add("align-" + align);
          alignedAny = true;
        }
      }
    });

    if (!alignedAny) {
      let node = range.startContainer;
      while (node && node !== editorDiv) {
        if (node.parentNode === editorDiv && node.nodeType === 1) {
          node.style.textAlign = "";
          node.classList.remove("align-left", "align-center", "align-right");
          node.classList.add("align-" + align);
          alignedAny = true;
          break;
        }
        node = node.parentNode;
      }
    }
    triggerAutoSave();
  }

  alignLeftBtn.addEventListener("click", function (e) {
    e.preventDefault();
    setSelectedParagraphsAlignment("left");
    setActiveAlign(alignLeftBtn);
  });
  alignCenterBtn.addEventListener("click", function (e) {
    e.preventDefault();
    setSelectedParagraphsAlignment("center");
    setActiveAlign(alignCenterBtn);
  });
  alignRightBtn.addEventListener("click", function (e) {
    e.preventDefault();
    setSelectedParagraphsAlignment("right");
    setActiveAlign(alignRightBtn);
  });

  function checkCurrentAlignment() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      let container = range.startContainer;
      while (container && container !== editorDiv) {
        if (container.nodeType === 1) { // ELEMENT_NODE
          let align = "left";
          if (container.classList.contains("align-center")) {
            align = "center";
          } else if (container.classList.contains("align-right")) {
            align = "right";
          } else if (container.classList.contains("align-left")) {
            align = "left";
          } else if (container.style.textAlign) {
            align = container.style.textAlign;
          }
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
