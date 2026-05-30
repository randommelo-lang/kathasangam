import { button, el, formatNumber, metric, segmentButton } from "../components.js?v=studio-20260529-preferences-v21";
import { storyCard } from "./shared.js?v=studio-20260529-preferences-v21";

var carouselIndex = 0;
var carouselTimer = null;

function countPublished(ctx) {
  return ctx.state.stories.filter(function (s) { return s.status === "published"; }).length;
}

function totalViews(ctx) {
  return ctx.state.stories.reduce(function (a, s) { return a + s.views; }, 0);
}

function totalFollowers(ctx) {
  return ctx.state.stories.reduce(function (a, s) { return a + s.followers; }, 0);
}

function countOpenReports(ctx) {
  return ctx.state.reports.filter(function (r) { return r.status === "open"; }).length;
}

export function startCarouselAuto() {
  clearInterval(carouselTimer);
  carouselTimer = setInterval(function () { moveCarousel(1); }, 5000);
}

export function moveCarousel(dir) {
  var t = document.querySelector(".carousel-track");
  if (!t) return;
  carouselIndex = (carouselIndex + dir + t.children.length) % t.children.length;
  applyCarouselPosition();
}

export function goToSlide(i) {
  carouselIndex = i;
  applyCarouselPosition();
  startCarouselAuto();
}

function applyCarouselPosition() {
  var t = document.querySelector(".carousel-track");
  if (!t) return;
  t.style.transform = "translateX(-" + (carouselIndex * 100) + "%)";
  document.querySelectorAll(".carousel-dot").forEach(function (d, j) {
    d.classList.toggle("active", j === carouselIndex);
  });
}

export function renderDiscover(ctx) {
  ctx = ctx || this;
  var stories = ctx.filteredStories();
  var featured = ctx.state.stories.slice(0, 3);

  // Hero Carousel
  var carousel = el("section", "hero-carousel");
  var track = el("div", "carousel-track");
  featured.forEach(function (story) {
    var slide = el("div", "carousel-slide");
    var coverVal = story.cover;
    if (coverVal && !coverVal.startsWith("url") && !coverVal.startsWith("linear-gradient") && !coverVal.startsWith("radial-gradient")) {
      coverVal = "url('" + coverVal + "')";
    }
    var bg = el("div", "cover-bg");
    bg.style.background = coverVal;
    slide.appendChild(bg);
    slide.appendChild(el("p", "carousel-eyebrow", story.genre + " · " + story.type));
    slide.appendChild(el("h2", "carousel-title", story.title));
    slide.appendChild(el("p", "carousel-desc", story.description));
    var carouselMeta = el("div", "carousel-meta");
    var authorLink = el("a", "story-author-link", story.author);
    authorLink.href = "#profile?username=" + encodeURIComponent(story.author);
    carouselMeta.appendChild(authorLink);
    carouselMeta.appendChild(document.createTextNode(" · " + formatNumber(story.views) + " reads · " + formatNumber(story.followers) + " followers"));
    slide.appendChild(carouselMeta);
    var progressData = ctx.getStoryReadingProgress(story.id);
    var readBtnText = "Read now";
    if (progressData && story.chapters && story.chapters.length) {
      var chIdx = story.chapters.findIndex(function (c) { return c.id === progressData.chapter_id; });
      if (chIdx !== -1) {
        readBtnText = "Resume (Ch. " + (chIdx + 1) + ")";
      } else {
        readBtnText = "Resume";
      }
    }

    slide.appendChild(el("div", "button-row", [
      button(readBtnText, "btn primary", { action: "openStory", id: story.id }),
      button(ctx.state.library.indexOf(story.id) === -1 ? "Follow" : "Following", "btn", { action: "follow", id: story.id })
    ]));
    track.appendChild(slide);
  });
  carousel.appendChild(track);
  
  var dots = el("div", "carousel-dots");
  featured.forEach(function (_, i) {
    var dot = el("button", "carousel-dot" + (i === 0 ? " active" : ""));
    dot.dataset.action = "carouselDot";
    dot.dataset.index = String(i);
    dots.appendChild(dot);
  });
  carousel.appendChild(dots);
  
  var prev = el("button", "carousel-arrow prev", "‹");
  prev.dataset.action = "carouselPrev";
  var next = el("button", "carousel-arrow next", "›");
  next.dataset.action = "carouselNext";
  
  carousel.appendChild(prev);
  carousel.appendChild(next);
  ctx.view.appendChild(carousel);
  startCarouselAuto();

  // Stats
  var s = ctx.state.stats || {};
  ctx.view.appendChild(el("div", "stats-row", [
    metric("Published", s.published || countPublished(ctx)),
    metric("Total reads", formatNumber(s.views || totalViews(ctx))),
    metric("Followers", formatNumber(s.followers || totalFollowers(ctx))),
    metric("Open reports", s.open_reports || countOpenReports(ctx))
  ]));

  // Filter toolbar
  ctx.view.appendChild(el("div", "toolbar", [
    el("div", "segmented", [
      segmentButton("All", "all", ctx.ui.filterType),
      segmentButton("Web Novel", "Web Novel", ctx.ui.filterType),
      segmentButton("Chitrānk", "Chitrānk", ctx.ui.filterType)
    ]),
    el("div", "mini-meta", stories.length + " results")
  ]));

  // Story grid
  var grid = el("section", "story-grid");
  grid.id = "storyGrid";
  stories.forEach(function (story) {
    grid.appendChild(storyCard(ctx, story));
  });
  ctx.view.appendChild(stories.length ? grid : el("div", "empty", "No stories match the current search."));
}
