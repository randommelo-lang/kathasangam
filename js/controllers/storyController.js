import { state } from "../state.js";
import { storyForm, storySettingsForm } from "../views/profile.js";

let ctx = null;
let previousStoryModalFocus = null;
let storyModalKeyHandler = null;

function activateStoryModal() {
  previousStoryModalFocus = document.activeElement;
  var dialog = document.querySelector("#storyModal [role='dialog']");
  if (!dialog) return;
  storyModalKeyHandler = function (event) {
    if (event.key === "Escape") { event.preventDefault(); closeStoryModal(); return; }
    if (event.key !== "Tab") return;
    var focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
      .filter(function (node) { return !node.hidden && node.getClientRects().length; });
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
    else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
  };
  document.addEventListener("keydown", storyModalKeyHandler);
  var first = dialog.querySelector('input:not([type="hidden"]), button, select, textarea');
  if (first) first.focus();
}

export function openStoryModal() {
  if (!state.user) {
    if (ctx && ctx.openAuthModal) {
      ctx.openAuthModal();
    }
    if (ctx) ctx.notify("Please log in to create a story.");
    return;
  }
  var title = document.getElementById("storyModalTitle");
  if (title) {
    title.textContent = "Create New Story";
  }
  var subtitle = document.querySelector("#storyModal .auth-modal-subtitle");
  if (subtitle) {
    subtitle.textContent = "Start your series on KathaSangam";
  }
  var content = document.getElementById("storyModalContent");
  if (content) {
    content.innerHTML = "";
    content.appendChild(storyForm());
  }
  var storyModal = document.getElementById("storyModal");
  if (storyModal) {
    storyModal.hidden = false;
  }
  document.body.style.overflow = "hidden";
  activateStoryModal();
}

export function openStorySettingsModal(storyId) {
  var story = state.stories.find(function (s) { return s.id === storyId; });
  if (!story) return;

  var title = document.getElementById("storyModalTitle");
  if (title) {
    title.textContent = "Story Settings";
  }
  var subtitle = document.querySelector("#storyModal .auth-modal-subtitle");
  if (subtitle) {
    subtitle.textContent = "Update your series metadata and preferences";
  }
  var content = document.getElementById("storyModalContent");
  if (content) {
    content.innerHTML = "";
    content.appendChild(storySettingsForm(story));
  }
  var storyModal = document.getElementById("storyModal");
  if (storyModal) {
    storyModal.hidden = false;
  }
  document.body.style.overflow = "hidden";
  activateStoryModal();
}

export function closeStoryModal() {
  if (storyModalKeyHandler) document.removeEventListener("keydown", storyModalKeyHandler);
  storyModalKeyHandler = null;
  var storyModal = document.getElementById("storyModal");
  if (storyModal) {
    storyModal.hidden = true;
  }
  document.body.style.overflow = "";
  if (previousStoryModalFocus && typeof previousStoryModalFocus.focus === "function") previousStoryModalFocus.focus();
  previousStoryModalFocus = null;
}

export function handleStoryClick(context, action, target, e) {
  if (action === "toggleStoryChapterSort") {
    context.ui.storyChapterSort = (context.ui.storyChapterSort === "desc") ? "asc" : "desc";
    context.render();
    return true;
  }
  if (action === "clearStoryChapterSearch") {
    context.ui.storyChapterSearch = "";
    context.render();
    return true;
  }
  if (action === "loadMoreStoryChapters") {
    context.ui.storyChapterLimit = (context.ui.storyChapterLimit || 30) + 30;
    context.render();
    return true;
  }
  if (action === "rateStory") {
    if (!context.state.user) {
      context.openAuthModal();
      context.notify("Please log in to rate this story.", "info");
      return true;
    }
    var storyId = target.dataset.storyId;
    var ratingVal = parseInt(target.dataset.rating, 10);
    if (!storyId || !ratingVal || ratingVal < 1 || ratingVal > 5) return true;

    var story = (context.state.stories || []).find(function (s) { return s.id === storyId; });
    var prevRating = story ? story.user_rating : null;
    var prevAvg = story ? story.rating : null;
    var prevCount = story ? story.ratings_count : 0;

    // Optimistic update
    if (story) {
      story.user_rating = ratingVal;
    }
    context.render();

    context.apiPost("/stories/" + storyId + "/rate", { rating: ratingVal })
      .then(function (res) {
        if (story) {
          story.rating = res.average_rating;
          story.ratings_count = res.ratings_count;
          story.user_rating = res.user_rating;
          if (res.distribution) {
            story.rating_distribution = res.distribution;
          }
        }
        context.render();
        context.notify("Rated " + ratingVal + " / 5 stars! Thank you for rating.", "success");
      })
      .catch(function (err) {
        console.error("Failed to submit rating:", err);
        if (story) {
          story.user_rating = prevRating;
          story.rating = prevAvg;
          story.ratings_count = prevCount;
        }
        context.render();
        context.notify((err && err.message) || "Failed to submit rating.", "error");
      });
    return true;
  }
  return false;
}

var storyChapterSearchTimer = null;
export function handleStoryInput(context, action, target, e) {
  if (action === "storyChapterSearch") {
    var val = target.value;
    clearTimeout(storyChapterSearchTimer);
    storyChapterSearchTimer = setTimeout(function () {
      context.ui.storyChapterSearch = val;
      context.render();
      var searchEl = context.view.querySelector(".chapter-search-input");
      if (searchEl) {
        searchEl.focus();
        searchEl.setSelectionRange(searchEl.value.length, searchEl.value.length);
      }
    }, 60);
    return true;
  }
  return false;
}

export function initStoryController(context) {
  ctx = context;
}

