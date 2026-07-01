import { goToSlide, moveCarousel, startCarouselAuto } from "../views/discover.js";

export function handleDiscoverClick(ctx, action, target, e) {
  if (action === "toggleFilterDrawer") {
    ctx.ui.showFilterDrawer = !ctx.ui.showFilterDrawer;
    ctx.render();
    return true;
  }
  if (action === "filter") {
    ctx.ui.filterType = target.dataset.value;
    ctx.render();
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
  return false;
}
