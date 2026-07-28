import { button, el, formatNumber, metric, segmentButton, select } from "../components.js";
import { storyCard, storyCardSkeleton, emptyState } from "./shared.js";

var carouselIndex = 0;
var carouselTimer = null;

function countPublished(ctx) {
  return ctx.state.stories.filter(function (s) { return s.status && s.status !== "draft" && s.status !== "unpublished"; }).length;
}

function totalViews(ctx) {
  return ctx.state.stories.reduce(function (a, s) { return a + s.views; }, 0);
}

function totalFollowers(ctx) {
  return ctx.state.stories.reduce(function (a, s) { return a + s.followers; }, 0);
}

function countOpenReports(ctx) {
  if (ctx.state.stats && typeof ctx.state.stats.open_reports === "number") {
    return ctx.state.stats.open_reports;
  }
  var reportsObj = ctx.state.reports || { items: [], total: 0 };
  var reports = Array.isArray(reportsObj) ? reportsObj : (reportsObj.items || []);
  return reports.filter(function (r) { return r.status === "open"; }).length;
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

  if (ctx.state.stories === null) {
    // Render the skeleton layout!
    
    // 1. Hero Carousel skeleton
    const carousel = el("section", "hero-carousel skeleton-hero skeleton");
    ctx.view.appendChild(carousel);
    
    
    // 3. Filter Toolbar placeholder
    ctx.view.appendChild(el("div", "toolbar", [
      el("div", "segmented", [
        el("button", { class: "btn disabled", disabled: true }, "All"),
        el("button", { class: "btn disabled", disabled: true }, "Web Novel"),
        el("button", { class: "btn disabled", disabled: true }, "Chitrānk")
      ])
    ]));
    
    // 4. Story grid skeleton
    const grid = el("section", "story-grid");
    for (let i = 0; i < 4; i++) {
      grid.appendChild(storyCardSkeleton());
    }
    ctx.view.appendChild(grid);
    return;
  }

  var stories = ctx.filteredStories();
  var featured = ctx.state.stories.filter(function (s) { return s.status && s.status !== "draft" && s.status !== "unpublished"; }).slice(0, 3);

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
    bg.style.backgroundImage = coverVal;
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
  // Filter toolbar
  var filterBtn = el("button", "btn secondary filter-toggle-btn" + (ctx.ui.showFilterDrawer ? " active" : ""), ctx.ui.showFilterDrawer ? "Filters ▴" : "Filters ▾");
  filterBtn.dataset.action = "toggleFilterDrawer";

  ctx.view.appendChild(el("div", "toolbar", [
    el("div", "segmented", [
      segmentButton("All", "all", ctx.ui.filterType),
      segmentButton("Web Novel", "Web Novel", ctx.ui.filterType),
      segmentButton("Chitrānk", "Chitrānk", ctx.ui.filterType)
    ]),
    el("div", { style: "display: flex; align-items: center; gap: 12px;" }, [
      filterBtn,
      el("div", "mini-meta", stories.length + " results")
    ])
  ]));

  if (ctx.ui.showFilterDrawer) {
    var drawer = el("div", "filter-drawer", [
      el("div", "filter-group", [
        el("label", null, "Status"),
        select("filterStatus", [
          ["all", "All Statuses"],
          ["ongoing", "Ongoing / Active"],
          ["completed", "Completed"],
          ["published", "Published"]
        ], ctx.ui.filterStatus || "all")
      ]),
      el("div", "filter-group", [
        el("label", null, "Language"),
        select("filterLanguage", [
          ["all", "All Languages"],
          ["english", "English"],
          ["nepali", "Nepali"],
          ["hindi", "Hindi"]
        ], ctx.ui.filterLanguage || "all")
      ]),
      el("div", "filter-group", [
        el("label", null, "Sort By"),
        select("filterSort", [
          ["newest", "Newest First"],
          ["reads", "Most Reads"],
          ["likes", "Most Likes"],
          ["rating", "Highest Rated"]
        ], ctx.ui.filterSort || "newest")
      ])
    ]);

    drawer.querySelectorAll("select").forEach(function (sel) {
      sel.addEventListener("change", function (e) {
        ctx.ui[e.target.name] = e.target.value;
        ctx.render();
      });
    });

    ctx.view.appendChild(drawer);
  }

  // Story grid
  var grid = el("section", "story-grid");
  grid.id = "storyGrid";
  stories.forEach(function (story) {
    grid.appendChild(storyCard(ctx, story));
  });
  ctx.view.appendChild(stories.length ? grid : emptyState(
    "No stories found",
    "We couldn't find any stories matching your filters or search keywords. Try adjusting your query.",
    el("button", {
      class: "btn primary",
      onclick: function() {
        const searchInput = document.getElementById("searchInput");
        if (searchInput) searchInput.value = "";
        const genreFilter = document.getElementById("genreFilter");
        if (genreFilter) genreFilter.value = "all";
        ctx.ui.filterType = "all";
        ctx.ui.filterStatus = "all";
        ctx.ui.filterLanguage = "all";
        ctx.ui.filterSort = "newest";
        ctx.render();
      }
    }, "Reset Filters"),
    "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
  ));
}
