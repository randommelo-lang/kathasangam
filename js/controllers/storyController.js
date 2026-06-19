import { state } from "../state.js?v=profile-redirect-20260619-v30";
import { storyForm, storySettingsForm } from "../views/profile.js?v=profile-redirect-20260619-v30";

let ctx = null;

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
}

export function closeStoryModal() {
  var storyModal = document.getElementById("storyModal");
  if (storyModal) {
    storyModal.hidden = true;
  }
  document.body.style.overflow = "";
}

export function initStoryController(context) {
  ctx = context;
}
