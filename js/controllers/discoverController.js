import { goToSlide, moveCarousel, startCarouselAuto, toggleCarouselAuto } from "../views/discover.js";

export function handleDiscoverClick(ctx, action, target, e) {
  if (action === "openSignIn") { ctx.openAuthModal(); return true; }
  if (action === "retryStories") {
    ctx.loadDiscoveryPage(true);
    return true;
  }
  if (action === "loadMoreStories") {
    ctx.loadDiscoveryPage(false);
    return true;
  }
  if (action === "carouselToggle") {
    toggleCarouselAuto();
    return true;
  }
  if (action === "toggleFilterDrawer") {
    ctx.ui.showFilterDrawer = !ctx.ui.showFilterDrawer;
    ctx.render();
    return true;
  }
  if (action === "filter") {
    ctx.ui.filterType = target.dataset.value;
    ctx.loadDiscoveryPage(true);
    return true;
  }
  if (action === "toggleOnboardingGuide") {
    ctx.ui.showOnboardingModal = !ctx.ui.showOnboardingModal;
    if (ctx.ui.showOnboardingModal) {
      ctx.ui.onboardingStep = 0;
    }
    ctx.render();
    return true;
  }
  if (action === "nextOnboardingStep") {
    ctx.ui.onboardingStep = Math.min(2, (ctx.ui.onboardingStep || 0) + 1);
    ctx.render();
    return true;
  }
  if (action === "prevOnboardingStep") {
    ctx.ui.onboardingStep = Math.max(0, (ctx.ui.onboardingStep || 0) - 1);
    ctx.render();
    return true;
  }
  if (action === "goToOnboardingStep") {
    ctx.ui.onboardingStep = Number(target.dataset.step) || 0;
    ctx.render();
    return true;
  }
  if (action === "dismissOnboardingGuide") {
    localStorage.setItem("kathasangam_onboarding_dismissed", "true");
    ctx.ui.showOnboardingModal = false;
    ctx.render();
    return true;
  }
  if (action === "filterAndCloseOnboarding") {
    localStorage.setItem("kathasangam_onboarding_dismissed", "true");
    ctx.ui.showOnboardingModal = false;
    ctx.ui.filterType = target.dataset.value;
    ctx.loadDiscoveryPage(true);
    return true;
  }
  if (action === "removeFilter") {
    var facet = target.dataset.facet;
    var searchInput = document.getElementById("searchInput");
    if (facet === "q" && searchInput) searchInput.value = "";
    if (facet === "genre" && ctx.genreFilter) ctx.genreFilter.value = "all";
    if (facet === "type") ctx.ui.filterType = "all";
    if (facet === "status") ctx.ui.filterStatus = "all";
    if (facet === "language") ctx.ui.filterLanguage = "all";
    if (facet === "recency") ctx.ui.filterRecency = "all";
    if (facet === "sort") ctx.ui.filterSort = "newest";
    ctx.loadDiscoveryPage(true);
    return true;
  }
  if (action === "clearAllFilters") {
    var searchInput = document.getElementById("searchInput");
    if (searchInput) searchInput.value = "";
    if (ctx.genreFilter) ctx.genreFilter.value = "all";
    ctx.ui.filterType = "all";
    ctx.ui.filterStatus = "all";
    ctx.ui.filterLanguage = "all";
    ctx.ui.filterRecency = "all";
    ctx.ui.filterSort = "newest";
    ctx.loadDiscoveryPage(true);
    return true;
  }
  if (action === "carouselPrev") {
    moveCarousel(-1);
    startCarouselAuto();
    return true;
  }
  if (action === "carouselNext") {
    moveCarousel(1);
    startCarouselAuto();
    return true;
  }
  if (action === "carouselDot") {
    goToSlide(Number(target.dataset.index));
    return true;
  }
  if (action === "viewAllTrending") {
    ctx.ui.filterSort = "reads";
    ctx.loadDiscoveryPage(true);
    return true;
  }
  if (action === "openStory") {
    if (e && e.target && e.target.closest("a[href]")) return false;
    var storyId = target.dataset.id || (target.closest("[data-id]") && target.closest("[data-id]").dataset.id);
    if (storyId) {
      window.location.hash = "story?id=" + storyId;
      return true;
    }
  }
  return false;
}
