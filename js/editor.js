import { renderComicEditor, saveComicChapter } from "./editor/comicEditor.js?v=a11y-focus-20260613-v28";
import { renderTextEditor, saveTextChapter } from "./editor/textEditor.js?v=a11y-focus-20260613-v28";

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
