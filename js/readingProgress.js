import { state, ui } from "./state.js";
import { apiPost } from "./api.js";

let ctx = null;

export function getStoryReadingProgress(storyId) {
  var prog = null;
  if (state.user && state.progress) {
    prog = state.progress.find(function (p) { return p.story_id === storyId; });
  } else {
    try {
      var anonProg = JSON.parse(localStorage.getItem("kathasangam_anon_progress") || "{}");
      prog = anonProg[storyId];
    } catch (e) {}
  }
  return prog;
}

export function saveReadingProgress(storyId, chapterId, pageIndex) {
  if (state.user) {
    apiPost("/progress", {
      story_id: storyId,
      chapter_id: chapterId,
      page_index: pageIndex
    }).then(function () {
      if (!state.progress) state.progress = [];
      var existing = state.progress.find(function (p) { return p.story_id === storyId; });
      if (existing) {
        existing.chapter_id = chapterId;
        existing.page_index = pageIndex;
        existing.updated_at = new Date().toISOString();
      } else {
        state.progress.push({
          story_id: storyId,
          chapter_id: chapterId,
          page_index: pageIndex,
          updated_at: new Date().toISOString()
        });
      }
    }).catch(function (err) {
      console.warn("Failed to update remote progress:", err);
    });
  } else {
    try {
      var anonProg = JSON.parse(localStorage.getItem("kathasangam_anon_progress") || "{}");
      anonProg[storyId] = {
        chapter_id: chapterId,
        page_index: pageIndex,
        updated_at: new Date().toISOString()
      };
      localStorage.setItem("kathasangam_anon_progress", JSON.stringify(anonProg));
    } catch (e) {
      console.warn("Failed to save anonymous progress:", e);
    }
  }
}

export function syncCurrentProgress() {
  if (!ctx) return;
  var story = ctx.getCurrentStory();
  if (!story || !story.id) return;
  var chapter = ctx.getCurrentChapter(story);
  if (!chapter || !chapter.id) return;

  var pageIndex = 0;
  if (story.type === "Chitrānk") {
    if (ui.readerMode === "pages") {
      pageIndex = ui.currentComicPageIndex;
    }
  } else {
    if (ui.readerMode === "pages") {
      pageIndex = ui.currentTextPageIndex;
    }
  }
  saveReadingProgress(story.id, chapter.id, pageIndex);
}

export function calculateStoryProgressPercent(story) {
  if (!story.chapters || !story.chapters.length) return 0;
  var progressData = getStoryReadingProgress(story.id);
  if (!progressData) return 0;
  var chIdx = story.chapters.findIndex(function (c) { return c.id === progressData.chapter_id; });
  if (chIdx === -1) return 0;

  var totalChapters = story.chapters.length;
  var pageProgress = 0;
  var chapter = story.chapters[chIdx];
  if (chapter) {
    var pageIdx = progressData.page_index || 0;
    if (story.type === "Chitrānk" && chapter.pages && chapter.pages.length) {
      pageProgress = (pageIdx + 1) / chapter.pages.length;
    } else if (chapter.content && chapter.content.length && ctx) {
      var pages = ctx.paginateText(chapter.content);
      if (pages.length) {
        pageProgress = (pageIdx + 1) / pages.length;
      }
    } else {
      pageProgress = 1.0;
    }
  } else {
    pageProgress = 1.0;
  }

  var val = ((chIdx + pageProgress) / totalChapters) * 100;
  return Math.round(Math.max(0, Math.min(100, val)));
}

export function calculateActiveReaderProgress(story) {
  if (!story.chapters || !story.chapters.length) return 0;
  var totalChapters = story.chapters.length;
  var currentChapterIndex = ui.currentChapterIndex;

  var pageProgress = 0;
  var chapter = story.chapters[currentChapterIndex];
  if (chapter) {
    if (ui.readerMode === "pages") {
      if (story.type === "Chitrānk" && chapter.pages && chapter.pages.length) {
        pageProgress = (ui.currentComicPageIndex + 1) / chapter.pages.length;
      } else if (chapter.content && chapter.content.length && ctx) {
        var pages = ctx.paginateText(chapter.content);
        if (pages.length) {
          pageProgress = (ui.currentTextPageIndex + 1) / pages.length;
        } else {
          pageProgress = 1.0;
        }
      } else {
        pageProgress = 1.0;
      }
    } else {
      pageProgress = (ui.currentScrollProgress !== undefined && ui.currentScrollProgress !== null) ? ui.currentScrollProgress : 0;
    }
  }

  var val = ((currentChapterIndex + pageProgress) / totalChapters) * 100;
  return Math.round(Math.max(0, Math.min(100, val)));
}

export function initReadingProgress(context) {
  ctx = context;
}
