import { renderComicEditor, saveComicChapter } from "./editor/comicEditor.js";
import { renderTextEditor, saveTextChapter } from "./editor/textEditor.js";

function setEditorFeedback(message, type) {
  const panel = document.querySelector(".editor-panel");
  if (!panel) return;
  const existing = panel.querySelectorAll(".form-feedback");
  existing.forEach(function (e) { e.remove(); });
  
  if (!message) return;
  
  const feedback = document.createElement("p");
  feedback.className = "form-feedback " + (type || "info");
  feedback.textContent = message;
  
  const actionsRow = panel.querySelector(".editor-actions-row");
  if (actionsRow) {
    actionsRow.parentNode.insertBefore(feedback, actionsRow);
  } else {
    panel.appendChild(feedback);
  }
}

export function saveChapterFromEditor(ctx, status) {
  const titleEl = document.querySelector(".editor-title-input");
  if (!titleEl) return;

  setEditorFeedback("", "");

  const newTitle = titleEl.value.trim();
  if (!newTitle) {
    setEditorFeedback("Chapter title cannot be empty. Please check your input and try again.", "error");
    return;
  }

  const story = ctx.getCurrentStudioStory();
  const isComic = story && story.type === "Chitrānk";

  if (isComic) {
    saveComicChapter(ctx, newTitle, status);
  } else {
    const contentEl = document.querySelector(".editor-textarea");
    if (!contentEl) return;

    const paragraphs = [];
    const nodes = Array.from(contentEl.childNodes);
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

    saveTextChapter(ctx, newTitle, paragraphs, status);
  }
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
  if (isComic) {
    renderComicEditor(ctx, story, chapter);
  } else {
    renderTextEditor(ctx, story, chapter);
  }
}
