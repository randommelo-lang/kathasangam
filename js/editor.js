import { button, el, formatDate, formatNumber } from "./components.js?v=comic-fit-20260609-v27";

export function saveChapterFromEditor(ctx, status) {
  const titleEl = document.querySelector(".editor-title-input");
  if (!titleEl) return;

  const newTitle = titleEl.value.trim();
  if (!newTitle) {
    ctx.notify("Chapter title cannot be empty.");
    return;
  }

  const story = ctx.getCurrentStudioStory();
  const isComic = story && story.type === "Chitrānk";

  let payload;
  if (isComic) {
    payload = {
      title: newTitle,
      content: [],
      pages: ctx.ui.editingPages || [],
      status: status
    };
  } else {
    const contentEl = document.querySelector(".editor-textarea");
    if (!contentEl) return;

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

    payload = {
      title: newTitle,
      content: paragraphs,
      status: status
    };
  }

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

  const isComic = story.type === "Chitrānk";
  const draftKey = "kathasangam_draft_" + ctx.ui.editingChapterId;

  const titleInput = el("input", "editor-title-input");
  titleInput.type = "text";
  titleInput.value = chapter.title;
  titleInput.placeholder = "Chapter Title";

  let banner = null;
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(draftKey));
  } catch (e) {}

  if (isComic) {
    ctx.ui.editingPages = JSON.parse(JSON.stringify(chapter.pages || []));

    // Draft key & auto-save for comic
    let autoSaveTimer = null;
    function triggerAutoSave() {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(function () {
        const draftData = {
          title: titleInput.value,
          pages: ctx.ui.editingPages,
          timestamp: Date.now()
        };
        localStorage.setItem(draftKey, JSON.stringify(draftData));
      }, 800);
    }
    titleInput.addEventListener("input", triggerAutoSave);

    const currentPagesString = JSON.stringify(chapter.pages || []);
    const cachedPagesString = JSON.stringify(cached ? cached.pages || [] : []);
    if (cached && (cached.title !== chapter.title || cachedPagesString !== currentPagesString)) {
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
        ctx.ui.editingPages = JSON.parse(JSON.stringify(cached.pages || []));
        renderPagesGrid();
        banner.style.display = "none";
        ctx.notify("Draft restored.");
      });

      discardBtn.addEventListener("click", function () {
        localStorage.removeItem(draftKey);
        banner.style.display = "none";
        ctx.notify("Draft discarded.");
      });
    }

    // PDF extraction for Comic
    const uploadStatus = el("span", "mini-meta", "");

    async function processPdfFile(file) {
      if (!file) return;
      uploadStatus.textContent = "Processing " + file.name + "...";

      const reader = new FileReader();
      reader.onload = async function (evt) {
        const arrayBuffer = evt.target.result;
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js?v=comic-fit-20260609-v27";
          try {
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdf.numPages;
            let compressedCount = 0;
            
            for (let i = 1; i <= numPages; i++) {
              uploadStatus.textContent = "Rendering page " + i + " of " + numPages + "...";
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d");
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              
              await page.render({ canvasContext: context, viewport: viewport }).promise;
              
              const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
              
              uploadStatus.textContent = "Uploading page " + i + " of " + numPages + "...";
              
              const formData = new FormData();
              formData.append("file", blob, `page_${i}.png`);
              
              const resp = await ctx.api("/upload/image", { method: "POST", body: formData });
              const bgUrl = `url('${resp.url}')`;
              
              if (resp.url.toLowerCase().endsWith(".webp") || resp.url.toLowerCase().includes(".webp")) {
                compressedCount++;
              }
              
              ctx.ui.editingPages.push({
                label: "Page " + (ctx.ui.editingPages.length + 1),
                bg: bgUrl
              });
              renderPagesGrid();
              triggerAutoSave();
            }
            let compInfo = compressedCount > 0 ? " (Compressed to WebP)" : " (Original format)";
            uploadStatus.textContent = "Extracted " + numPages + " page(s) from " + file.name + compInfo;
          } catch (err) {
            console.error(err);
            uploadStatus.textContent = "Extraction failed: " + err.message;
          }
        } else {
          uploadStatus.textContent = "PDF.js library is not loaded.";
        }
      };
      reader.readAsArrayBuffer(file);
    }

    async function uploadImageFiles(files) {
      if (!files.length) return;
      uploadStatus.textContent = "Uploading images...";
      let compressedCount = 0;
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        uploadStatus.textContent = "Uploading image " + (i + 1) + " of " + files.length + "...";
        const formData = new FormData();
        formData.append("file", file);
        try {
          const resp = await ctx.api("/upload/image", { method: "POST", body: formData });
          const bgUrl = `url('${resp.url}')`;
          
          if (resp.url.toLowerCase().endsWith(".webp") || resp.url.toLowerCase().includes(".webp")) {
            compressedCount++;
          }
          
          ctx.ui.editingPages.push({
            label: "Page " + (ctx.ui.editingPages.length + 1),
            bg: bgUrl
          });
          renderPagesGrid();
          triggerAutoSave();
        } catch (err) {
          console.error(err);
          ctx.notify("Failed to upload " + file.name);
        }
      }
      let compInfo = compressedCount > 0 ? " (Compressed to WebP)" : " (Original format)";
      uploadStatus.textContent = "Uploaded " + files.length + " image(s) successfully" + compInfo;
    }

    const pdfInput = el("input", "comic-pdf-file-input");
    pdfInput.type = "file";
    pdfInput.accept = ".pdf";
    pdfInput.style.display = "none";
    pdfInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      processPdfFile(file);
    });

    const extractPdfBtn = el("label", "btn", [
      el("span", "icon icon-document"),
      " Extract pages from PDF"
    ]);
    extractPdfBtn.style.cursor = "pointer";
    extractPdfBtn.appendChild(pdfInput);

    // Individual image upload
    const imageInput = el("input", "comic-image-file-input");
    imageInput.type = "file";
    imageInput.accept = "image/*";
    imageInput.multiple = true;
    imageInput.style.display = "none";
    imageInput.addEventListener("change", async function (e) {
      const files = Array.from(e.target.files);
      await uploadImageFiles(files);
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

    // File Drag & Drop support for gridContainer
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
          await processPdfFile(pdfFile);
        } else {
          const imageFiles = files.filter(f => f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(f.name));
          if (imageFiles.length) {
            await uploadImageFiles(imageFiles);
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
        labelInput.value = page.label;
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

    const actionsRow = el("div", "editor-actions-row", [
      button("Publish", "btn primary orange-glow-btn", { action: "publishChapter" }),
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
  } else {
    // Populate editor with existing paragraphs
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

    // Auto-save for Web Novel
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

    // Restore draft banner for Web Novel
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
    const fileInput = el("input", "text-doc-file-input");
    fileInput.type = "file";
    fileInput.accept = ".docx,.txt,.pdf";
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
      } else if (file.name.endsWith(".pdf")) {
        reader.onload = function (evt) {
          const arrayBuffer = evt.target.result;
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js?v=comic-fit-20260609-v27";
            window.pdfjsLib.getDocument({ data: arrayBuffer }).promise
              .then(function (pdf) {
                const numPages = pdf.numPages;
                const pagePromises = [];
                for (let i = 1; i <= numPages; i++) {
                  pagePromises.push(
                    pdf.getPage(i).then(function (page) {
                      return page.getTextContent().then(function (textContent) {
                        const lastItems = [];
                        textContent.items.forEach(function (item) {
                          lastItems.push(item.str);
                        });
                        return lastItems.join(" ");
                      });
                    })
                  );
                }
                return Promise.all(pagePromises);
              })
              .then(function (pageTexts) {
                const fullText = pageTexts.join("\n\n");
                const paras = fullText ? fullText.split(/\n\s*\n/) : [];
                loadParagraphs(paras.map(function (p) { return p.trim(); }).filter(Boolean));
                updateWordCount();
                triggerAutoSave();
                uploadStatus.textContent = "Extracted text from " + file.name;
              })
              .catch(function (err) {
                console.error(err);
                uploadStatus.textContent = "Extraction failed: " + err.message;
              });
          } else {
            uploadStatus.textContent = "PDF.js library is not loaded.";
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        uploadStatus.textContent = "Unsupported file format.";
      }
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
}
