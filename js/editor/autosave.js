import { button, el, formatDate } from "../components.js?v=a11y-focus-20260613-v28";

export function getDraftKey(chapterId) {
  return "kathasangam_draft_" + chapterId;
}

export function saveDraft(draftKey, data) {
  localStorage.setItem(draftKey, JSON.stringify(data));
}

export function removeDraft(draftKey) {
  localStorage.removeItem(draftKey);
}

export function loadDraft(draftKey) {
  try {
    return JSON.parse(localStorage.getItem(draftKey));
  } catch (e) {
    return null;
  }
}

export function setupAutosave(inputElements, draftKey, getDraftData, delay = 800) {
  let timer = null;
  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const data = getDraftData();
      saveDraft(draftKey, data);
    }, delay);
  };
  inputElements.forEach(el => {
    if (el) el.addEventListener("input", trigger);
  });
  return trigger;
}

export function showRecoveryBanner({
  ctx,
  draftKey,
  cached,
  currentTitle,
  isChanged,
  onRestore,
  onDiscard
}) {
  if (!cached) return null;
  if (!isChanged) return null;

  const restoreBtn = button("Restore Draft", "btn primary btn-sm");
  const discardBtn = button("Discard", "btn danger btn-sm");

  const bannerText = "We found a newer unsaved draft from " + formatDate(cached.timestamp) + ". ";
  const banner = el("div", "editor-recovery-banner", [
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
    onRestore(cached);
    banner.style.display = "none";
    ctx.notify("Draft restored.");
  });

  discardBtn.addEventListener("click", function () {
    removeDraft(draftKey);
    banner.style.display = "none";
    ctx.notify("Draft discarded.");
    if (onDiscard) onDiscard();
  });

  return banner;
}
