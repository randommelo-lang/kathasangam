import { button, el, formatNumber, metric, segmentButton, select, svgEl } from "../components.js";
import { storyCard, storyCardSkeleton, emptyState } from "./shared.js";
import { state } from "../state.js";

var carouselIndex = 0;
var carouselTimer = null;
var carouselPaused = false;

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
  var track = document.querySelector(".carousel-track");
  if (!track || track.children.length < 2 || carouselPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.hidden) return;
  carouselTimer = setInterval(function () { moveCarousel(1); }, 5000);
}

export function toggleCarouselAuto() {
  carouselPaused = !carouselPaused;
  var button = document.querySelector("[data-action='carouselToggle']");
  if (button) {
    button.textContent = carouselPaused ? "Play slides" : "Pause slides";
    button.setAttribute("aria-pressed", String(carouselPaused));
    button.setAttribute("aria-label", carouselPaused ? "Resume automatic slide changes" : "Pause automatic slide changes");
  }
  startCarouselAuto();
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
  Array.from(t.children).forEach(function (slide, index) {
    slide.setAttribute("aria-hidden", index === carouselIndex ? "false" : "true");
    slide.inert = index !== carouselIndex;
  });
  document.querySelectorAll(".carousel-dot").forEach(function (d, j) {
    d.classList.toggle("active", j === carouselIndex);
    d.setAttribute("aria-current", j === carouselIndex ? "true" : "false");
  });
}

export function renderOnboardingModal(ctx) {
  var isDismissed = localStorage.getItem("kathasangam_welcome_popup_v1") === "true" ||
                    localStorage.getItem("kathasangam_onboarding_dismissed") === "true";
  if (ctx.ui.showOnboardingModal === false || ctx.ui.showWelcomeModal === false || (ctx.ui.showOnboardingModal === undefined && ctx.ui.showWelcomeModal === undefined && isDismissed)) {
    return null;
  }

  var backdrop = el("div", {
    class: "onboarding-modal-backdrop welcome-modal-backdrop",
    id: "onboardingModalBackdrop",
    role: "presentation"
  });

  var modal = el("div", {
    class: "onboarding-modal welcome-modal",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "onboardingModalTitle",
    "aria-describedby": "onboardingModalSubtitle"
  });

  var header = el("div", "onboarding-modal-header", [
    el("div", null, [
      el("h2", { class: "onboarding-modal-title", id: "onboardingModalTitle" }, "Welcome to KathaSangam"),
      el("p", { class: "onboarding-modal-subtitle", id: "onboardingModalSubtitle" }, "India's decentralized storytelling platform for original serialized fiction, web novels, and Chitrānk webcomics across India.")
    ]),
    el("button", {
      class: "onboarding-modal-close",
      "aria-label": "Close welcome summary",
      title: "Close welcome summary",
      "data-action": "dismissOnboardingGuide"
    }, "✕")
  ]);
  modal.appendChild(header);

  var body = el("div", "onboarding-modal-body", [
    el("div", "onboarding-step-card", [
      el("div", "onboarding-feature-list", [
        el("div", "onboarding-feature-item", [
          el("span", "onboarding-feature-icon", {
            innerHTML: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M6 6h10"></path><path d="M6 10h10"></path></svg>'
          }),
          el("div", "onboarding-feature-text", [
            el("strong", null, "Web Novels & Chitrānk: "),
            document.createTextNode("Immerse yourself in serialized prose fiction and visual webcomics with customizable reading themes and vertical scroll.")
          ])
        ]),
        el("div", "onboarding-feature-item", [
          el("span", "onboarding-feature-icon", {
            innerHTML: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path><path d="M12 18V6"></path></svg>'
          }),
          el("div", "onboarding-feature-text", [
            el("strong", null, "Direct Creator Support: "),
            document.createTextNode("Tip creators directly with 95% payout via UPI and Cards, earning dedicated Supporter badges in discussions.")
          ])
        ]),
        el("div", "onboarding-feature-item", [
          el("span", "onboarding-feature-icon", {
            innerHTML: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>'
          }),
          el("div", "onboarding-feature-text", [
            el("strong", null, "Stories Across India: "),
            document.createTextNode("Discover vernacular and English serialized fiction crafted by diverse creators across the nation.")
          ])
        ])
      ])
    ])
  ]);
  modal.appendChild(body);

  var social = (state && state.socialLinks) || {
    nyburs: "https://www.nyburs.com/home",
    vync: "https://vync.live/",
    twitter: "https://twitter.com/kathasangam",
    github: "https://github.com/randommelo-lang/kathasangam"
  };

  var socialRow = el("div", {
    class: "onboarding-social-strip",
    style: "display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; background: rgba(255, 255, 255, 0.03); border-top: 1px solid var(--line); font-size: 0.82rem; flex-wrap: wrap; gap: 8px;"
  }, [
    el("div", { style: "display: flex; align-items: center; gap: 10px; color: var(--muted); flex-wrap: wrap;" }, [
      document.createTextNode("Official Channels:"),
      el("a", { href: social.nyburs || "https://www.nyburs.com/home", target: "_blank", rel: "noopener noreferrer", style: "display: inline-flex; align-items: center; gap: 4px; color: #0ea5e9; font-weight: 600; text-decoration: none;" }, [
        el("img", { src: "icons/Nyburs.svg", alt: "", width: "16", height: "16", style: "display: block;" }),
        document.createTextNode("Nyburs")
      ]),
      el("span", null, "•"),
      el("a", { href: social.vync || "https://vync.live/", target: "_blank", rel: "noopener noreferrer", style: "display: inline-flex; align-items: center; gap: 4px; color: #a855f7; font-weight: 600; text-decoration: none;" }, [
        el("img", { src: "icons/Vync.svg", alt: "", width: "16", height: "16", style: "display: block;" }),
        document.createTextNode("Vync")
      ]),
      el("span", null, "•"),
      el("a", { href: social.twitter || "https://twitter.com/kathasangam", target: "_blank", rel: "noopener noreferrer", style: "display: inline-flex; align-items: center; gap: 4px; color: var(--ink); font-weight: 600; text-decoration: none;" }, [
        el("img", { src: "icons/twitter-x-icon.svg", alt: "", width: "16", height: "16", class: "welcome-social-icon-filter", style: "display: block;" }),
        document.createTextNode("X")
      ]),
      el("span", null, "•"),
      el("a", { href: social.github || "https://github.com/randommelo-lang/kathasangam", target: "_blank", rel: "noopener noreferrer", style: "display: inline-flex; align-items: center; gap: 4px; color: #22c55e; font-weight: 600; text-decoration: none;" }, [
        el("img", { src: "icons/github-icon.svg", alt: "", width: "16", height: "16", class: "welcome-social-icon-filter", style: "display: block;" }),
        document.createTextNode("GitHub")
      ])
    ])
  ]);
  modal.appendChild(socialRow);

  var footer = el("div", "onboarding-modal-footer", [
    button("Start Reading", "btn text-btn", { action: "dismissOnboardingGuide", "aria-label": "Start reading" }),
    button("Explore Full About →", "btn primary onboarding-next-btn", { action: "openAboutFromOnboarding", "aria-label": "Explore full about section" })
  ]);
  modal.appendChild(footer);

  backdrop.appendChild(modal);

  backdrop.addEventListener("click", function (e) {
    if (e.target === backdrop) {
      localStorage.setItem("kathasangam_welcome_popup_v1", "true");
      localStorage.setItem("kathasangam_onboarding_dismissed", "true");
      ctx.ui.showOnboardingModal = false;
      ctx.ui.showWelcomeModal = false;
      ctx.render();
    }
  });

  return backdrop;
}

function createChip(label, facet, ariaLabel) {
  var chip = el("span", "filter-chip", [
    el("span", null, label),
    el("button", {
      class: "filter-chip-remove",
      "data-action": "removeFilter",
      "data-facet": facet,
      "aria-label": ariaLabel,
      title: ariaLabel
    }, "✕")
  ]);
  chip.dataset.facet = facet;
  return chip;
}

export function renderActiveFilterChips(ctx) {
  var searchInput = document.getElementById("searchInput");
  var q = (searchInput && searchInput.value.trim()) || "";
  var genre = (ctx.genreFilter && ctx.genreFilter.value !== "all" && ctx.genreFilter.value) || "";
  var type = (ctx.ui.filterType && ctx.ui.filterType !== "all" && ctx.ui.filterType) || "";
  var status = (ctx.ui.filterStatus && ctx.ui.filterStatus !== "all" && ctx.ui.filterStatus) || "";
  var lang = (ctx.ui.filterLanguage && ctx.ui.filterLanguage !== "all" && ctx.ui.filterLanguage) || "";
  var recency = (ctx.ui.filterRecency && ctx.ui.filterRecency !== "all" && ctx.ui.filterRecency) || "";
  var sort = (ctx.ui.filterSort && ctx.ui.filterSort !== "newest" && ctx.ui.filterSort) || "";

  var chips = [];
  if (q) chips.push(createChip("Search: \"" + q + "\"", "q", "Remove search filter"));
  if (type) chips.push(createChip("Format: " + type, "type", "Remove format filter"));
  if (genre) chips.push(createChip("Genre: " + genre, "genre", "Remove genre filter"));
  if (status) {
    var statusLabels = { ongoing: "Ongoing", completed: "Completed", published: "Published" };
    chips.push(createChip("Status: " + (statusLabels[status] || status), "status", "Remove status filter"));
  }
  if (lang) {
    var formattedLang = lang.charAt(0).toUpperCase() + lang.slice(1);
    chips.push(createChip("Language: " + formattedLang, "language", "Remove language filter"));
  }
  if (recency) {
    var recencyLabels = { "7d": "Past 7 Days", "30d": "Past 30 Days", "90d": "Past 90 Days", "1y": "Past Year" };
    chips.push(createChip("Updated: " + (recencyLabels[recency] || recency), "recency", "Remove recency filter"));
  }
  if (sort) {
    var sortLabels = { relevance: "Relevance", newest: "Newest", reads: "Most Reads", likes: "Most Likes", rating: "Highest Rated" };
    chips.push(createChip("Sort: " + (sortLabels[sort] || sort), "sort", "Remove sort order"));
  }

  if (!chips.length) return null;

  var container = el("div", { class: "active-filter-chips", role: "region", "aria-label": "Active search and filter tags" });
  chips.forEach(function (chip) { container.appendChild(chip); });

  var clearAllBtn = el("button", {
    class: "filter-clear-all-btn",
    "data-action": "clearAllFilters",
    "aria-label": "Reset all active filters",
    title: "Clear all filters"
  }, "Clear all filters");
  container.appendChild(clearAllBtn);

  return container;
}

export function renderRecommendedSection(ctx) {
  var recData = ctx.state.recommendations;
  if (!recData || !recData.items || !recData.items.length) return null;

  var headline = recData.headline || "Recommended For You";
  var reason = recData.reason || "";
  var isPersonalized = !!recData.isPersonalized;

  // Only render as a shelf if personalized. General community trending is rendered in the TRENDY sidebar.
  if (!isPersonalized) return null;

  var container = el("section", { class: "recommended-shelf", "aria-label": headline, role: "region" }, [
    el("div", "shelf-header", [
      el("div", null, [
        el("div", "shelf-title-row", [
          el("h2", "shelf-title", headline),
          el("span", "badge badge-accent badge-pill", "Personalized")
        ]),
        reason ? el("p", "shelf-subtitle mini-meta", reason) : null
      ])
    ]),
    el("div", { class: "story-grid recommended-grid" },
      recData.items.slice(0, 4).map(function (s) {
        return storyCard(ctx, s);
      })
    )
  ]);
  return container;
}

export function renderTrendingSidebar(ctx) {
  var allStories = (ctx.state.stories || []).slice();
  if (!allStories.length && !ctx.state.recommendations) return null;

  var pool = allStories.slice();
  if (ctx.state.recommendations && ctx.state.recommendations.items) {
    ctx.state.recommendations.items.forEach(function (s) {
      if (s && s.id && !pool.some(function (p) { return p.id === s.id; })) {
        pool.push(s);
      }
    });
  }

  var topStories = pool
    .filter(function (s) { return s.status && s.status !== "draft" && s.status !== "unpublished"; })
    .sort(function (a, b) { return (b.views || 0) - (a.views || 0); })
    .slice(0, 5);

  if (!topStories.length) return null;

  var aside = el("aside", { class: "trending-sidebar", "aria-label": "TRENDY Stories" });

  var header = el("div", "trending-header", [
    el("h2", "trending-heading", "TRENDY"),
    el("button", {
      type: "button",
      class: "trending-view-all-btn",
      "data-action": "viewAllTrending",
      "aria-label": "View all trendy stories"
    }, [
      document.createTextNode("View All "),
      el("span", { class: "trending-chevron", "aria-hidden": "true" }, "›")
    ])
  ]);
  aside.appendChild(header);

  var list = el("div", { class: "trending-list", role: "list" });

  topStories.forEach(function (story, index) {
    var rank = index + 1;
    var rankClass = rank === 1 ? "trending-rank-1" : (rank === 2 ? "trending-rank-2" : (rank === 3 ? "trending-rank-3" : "trending-rank-other"));

    var coverWrap = el("div", "trending-cover-wrap");
    var rawCover = story.cover || "";
    var isImgUrl = rawCover && (rawCover.startsWith("http://") || rawCover.startsWith("https://") || rawCover.startsWith("/uploads/") || rawCover.startsWith("data:") || rawCover.startsWith("blob:"));
    if (isImgUrl) {
      var img = el("img", {
        class: "trending-cover",
        src: rawCover,
        alt: (story.title || "Story") + " cover",
        loading: "lazy",
        width: "52",
        height: "72"
      });
      img.addEventListener("error", function () {
        img.style.display = "none";
        coverWrap.appendChild(el("div", "trending-cover-fallback", (story.title || "S").charAt(0).toUpperCase()));
      });
      coverWrap.appendChild(img);
    } else {
      coverWrap.appendChild(el("div", "trending-cover-fallback", (story.title || "S").charAt(0).toUpperCase()));
    }

    var rankEl = el("span", "trending-rank " + rankClass, String(rank));

    var viewsCount = formatNumber(story.views || 0);
    var info = el("div", "trending-info", [
      el("span", "trending-title", story.title || "Untitled"),
      el("span", "trending-author", story.author || "Unknown"),
      el("span", "trending-views", [
        svgEl("svg", {
          viewBox: "0 0 24 24",
          fill: "currentColor",
          class: "trending-flame-icon",
          "aria-hidden": "true"
        }, [
          svgEl("path", { d: "M12 23c6.075 0 11-4.925 11-11 0-5.04-3.41-9.3-8.08-10.63a.5.5 0 0 0-.61.54c.2 2.37-.62 4.67-2.26 6.32C10.74 9.53 9 11.23 9 13.5c0 .35.04.7.12 1.03-1.46-.86-2.58-2.29-3.03-3.99a.5.5 0 0 0-.82-.24C3.86 11.83 3 14.32 3 17c0 3.31 2.69 6 6 6h3z" })
        ]),
        document.createTextNode(viewsCount)
      ])
    ]);

    var item = el("div", {
      class: "trending-item",
      role: "listitem",
      tabindex: "0",
      "data-action": "openStory",
      "data-id": story.id,
      "aria-label": (story.title || "Story") + " by " + (story.author || "Unknown")
    }, [
      coverWrap,
      rankEl,
      info
    ]);

    item.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.hash = "story?id=" + story.id;
      }
    });

    list.appendChild(item);
  });

  aside.appendChild(list);
  return aside;
}

export function renderDiscover(ctx) {
  ctx = ctx || this;

  if (ctx.state.stories === null) {
    // Render the skeleton layout!
    
    // 1. Hero Carousel skeleton
    const carousel = el("section", "hero-carousel skeleton-hero skeleton");
    ctx.view.appendChild(carousel);
    
    // 2. Filter Toolbar placeholder
    var aboutBtnSkeleton = el("a", {
      class: "btn secondary icon-btn about-nav-btn",
      href: "#about",
      "aria-label": "About KathaSangam",
      title: "About KathaSangam",
      style: "display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; text-decoration: none; border-radius: var(--radius-sm, 8px);"
    }, [
      svgEl("svg", {
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      }, [
        svgEl("circle", { cx: "12", cy: "12", r: "10" }),
        svgEl("line", { x1: "12", y1: "16", x2: "12", y2: "12" }),
        svgEl("line", { x1: "12", y1: "8", x2: "12.01", y2: "8" })
      ])
    ]);

    const toolbar = el("div", "toolbar", [
      el("div", "segmented", [
        el("button", { class: "btn disabled", disabled: true }, "All"),
        el("button", { class: "btn disabled", disabled: true }, "Web Novel"),
        el("button", { class: "btn disabled", disabled: true }, "Chitrānk")
      ]),
      aboutBtnSkeleton
    ]);
    
    // 3. Story grid skeleton
    const grid = el("section", "story-grid");
    for (let i = 0; i < 4; i++) {
      grid.appendChild(storyCardSkeleton());
    }

    const mainCol = el("div", "discover-main", [toolbar, grid]);
    const sidebarSkeleton = el("aside", { class: "trending-sidebar", "aria-label": "TRENDY Stories" }, [
      el("div", "trending-header", [el("h2", "trending-heading", "TRENDY")]),
      el("div", "trending-list", [
        el("div", "skeleton skeleton-card", { style: "height: 72px;" }),
        el("div", "skeleton skeleton-card", { style: "height: 72px;" }),
        el("div", "skeleton skeleton-card", { style: "height: 72px;" })
      ])
    ]);

    ctx.view.appendChild(el("div", "discover-layout", [mainCol, sidebarSkeleton]));
    var onboardingModal = renderOnboardingModal(ctx);
    if (onboardingModal) {
      ctx.view.appendChild(onboardingModal);
    }
    return;
  }

  var stories = ctx.filteredStories();
  var featured = ctx.state.stories.filter(function (s) { return s.status && s.status !== "draft" && s.status !== "unpublished"; }).slice(0, 3);
  if (carouselIndex >= featured.length) carouselIndex = 0;

  // Hero Carousel
  if (featured.length) {
  var carousel = el("section", { class: "hero-carousel", role: "region", "aria-label": "Featured stories", "aria-roledescription": "carousel" });
  var track = el("div", "carousel-track");
  track.setAttribute("aria-live", "off");
  featured.forEach(function (story, slideIndex) {
    var slide = el("div", { class: "carousel-slide", role: "group", "aria-roledescription": "slide", "aria-label": (slideIndex + 1) + " of " + featured.length, "aria-hidden": slideIndex === carouselIndex ? "false" : "true" });
    slide.inert = slideIndex !== carouselIndex;
    var coverVal = story.cover;
    if (coverVal && !coverVal.startsWith("url") && !coverVal.startsWith("linear-gradient") && !coverVal.startsWith("radial-gradient")) {
      coverVal = "url('" + coverVal + "')";
    }
    var bg = el("div", "cover-bg");
    bg.style.backgroundImage = coverVal;
    
    if (story.isNsfw) {
      var prefs = (state.profile && state.profile.preferences) || {};
      var pref = prefs.nsfw_preference || "blur";
      if (pref === "blur") {
        bg.style.filter = "blur(20px) brightness(0.7)";
      }
    }
    
    slide.appendChild(bg);
    if (story.isNsfw) {
      slide.appendChild(el("span", "badge badge-danger carousel-nsfw-badge", "18+ NSFW"));
    }
    slide.appendChild(el("p", "carousel-eyebrow", story.genre + " · " + story.type));
    slide.appendChild(el("h2", "carousel-title", story.title));
    var descEl = el("p", "carousel-desc");
    var descText = story.description || "";
    if (descText.length > 180) {
      var shortText = descText.slice(0, 160).trim() + "...";
      var shortSpan = el("span", "desc-short", shortText);
      var fullSpan = el("span", "desc-full", descText);
      fullSpan.style.display = "none";
      
      var viewMoreBtn = el("button", {
        class: "view-more-btn",
        "aria-expanded": "false"
      }, "View More");

      var viewLessBtn = el("button", {
        class: "view-less-btn",
        style: "display: none;",
        "aria-expanded": "true"
      }, "View Less");
      
      viewMoreBtn.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        shortSpan.style.display = "none";
        fullSpan.style.display = "inline";
        viewMoreBtn.style.display = "none";
        viewLessBtn.style.display = "inline";
      });

      viewLessBtn.addEventListener("click", function(e) {
        e.preventDefault();
        e.stopPropagation();
        fullSpan.style.display = "none";
        shortSpan.style.display = "inline";
        viewLessBtn.style.display = "none";
        viewMoreBtn.style.display = "inline";
      });
      
      descEl.appendChild(shortSpan);
      descEl.appendChild(fullSpan);
      descEl.appendChild(viewMoreBtn);
      descEl.appendChild(viewLessBtn);
    } else {
      descEl.textContent = descText;
    }
    slide.appendChild(descEl);
    var carouselMeta = el("div", "carousel-meta");
    var authorName = story.author || story.author_name || "Author";
    var authorLink = el("a", "story-author-link", authorName);
    authorLink.href = "#profile?username=" + encodeURIComponent(authorName);
    carouselMeta.appendChild(authorLink);
    carouselMeta.appendChild(document.createTextNode(" · " + formatNumber(story.views) + " reads · " + formatNumber(story.followers) + " followers"));
    slide.appendChild(carouselMeta);
    var progressData = ctx.getStoryReadingProgress(story.id);
    var readBtnText = "Read now";
    var isResume = false;
    if (progressData && story.chapters && story.chapters.length) {
      var chIdx = story.chapters.findIndex(function (c) { return c.id === progressData.chapter_id; });
      if (chIdx !== -1) {
        readBtnText = "Resume (Ch. " + (chIdx + 1) + ")";
        isResume = true;
      } else {
        readBtnText = "Resume";
        isResume = true;
      }
    } else if (progressData) {
      readBtnText = "Resume";
      isResume = true;
    }

    slide.appendChild(el("div", "button-row", [
      button(readBtnText, "btn primary", { action: isResume ? "openReader" : "openStory", id: story.id }),
      button(ctx.state.library.indexOf(story.id) === -1 ? "Follow" : "Following", "btn", { action: "follow", id: story.id })
    ]));
    track.appendChild(slide);
  });
  carousel.appendChild(track);
  
  var dots = el("div", { class: "carousel-dots", role: "group", "aria-label": "Choose featured story" });
  featured.forEach(function (_, i) {
    var dot = el("button", { class: "carousel-dot" + (i === 0 ? " active" : ""), "aria-label": "Show featured story " + (i + 1), "aria-current": i === 0 ? "true" : "false" });
    dot.dataset.action = "carouselDot";
    dot.dataset.index = String(i);
    dots.appendChild(dot);
  });
  carousel.appendChild(dots);
  
  var prev = el("button", { class: "carousel-arrow prev", "aria-label": "Previous featured story" }, "‹");
  prev.dataset.action = "carouselPrev";
  var next = el("button", { class: "carousel-arrow next", "aria-label": "Next featured story" }, "›");
  next.dataset.action = "carouselNext";
  var pause = el("button", { class: "carousel-toggle", "aria-pressed": String(carouselPaused), "aria-label": carouselPaused ? "Resume automatic slide changes" : "Pause automatic slide changes" }, carouselPaused ? "Play slides" : "Pause slides");
  pause.dataset.action = "carouselToggle";
  
  if (featured.length > 1) {
    carousel.appendChild(prev);
    carousel.appendChild(next);
  }
  if (featured.length > 1) carousel.appendChild(pause);
  ctx.view.appendChild(carousel);
  startCarouselAuto();
  }

  // Onboarding Reader Guide Pop-Up Modal (stepped wizard with Next / Finish controls)
  var onboardingModal = renderOnboardingModal(ctx);
  if (onboardingModal) {
    ctx.view.appendChild(onboardingModal);
  }

  // Recommended / Trending stories shelf (based on user reading history or community trending)
  var searchInput = document.getElementById("searchInput");
  var hasActiveFilters = Boolean(
    (searchInput && searchInput.value.trim()) ||
    (ctx.genreFilter && ctx.genreFilter.value !== "all") ||
    (ctx.ui.filterType && ctx.ui.filterType !== "all") ||
    (ctx.ui.filterStatus && ctx.ui.filterStatus !== "all") ||
    (ctx.ui.filterLanguage && ctx.ui.filterLanguage !== "all") ||
    (ctx.ui.filterRecency && ctx.ui.filterRecency !== "all") ||
    (ctx.ui.filterSort && ctx.ui.filterSort !== "newest")
  );

  if (!hasActiveFilters) {
    var recommendedShelf = renderRecommendedSection(ctx);
    if (recommendedShelf) {
      ctx.view.appendChild(recommendedShelf);
    }
  }

  // Filter toolbar
  var filterBtn = el("button", {
    class: "btn secondary filter-toggle-btn" + (ctx.ui.showFilterDrawer ? " active" : ""),
    "aria-expanded": String(!!ctx.ui.showFilterDrawer),
    "aria-controls": "discover-filter-controls",
    "aria-label": "Toggle filter options"
  }, ctx.ui.showFilterDrawer ? "Filters ▴" : "Filters ▾");
  filterBtn.dataset.action = "toggleFilterDrawer";

  var aboutBtn = el("a", {
    class: "btn secondary icon-btn about-nav-btn",
    href: "#about",
    "aria-label": "About KathaSangam",
    title: "About KathaSangam",
    style: "display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; text-decoration: none; border-radius: var(--radius-sm, 8px);"
  }, [
    svgEl("svg", {
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }, [
      svgEl("circle", { cx: "12", cy: "12", r: "10" }),
      svgEl("path", { d: "M12 16v-4" }),
      svgEl("path", { d: "M12 8h.01" })
    ])
  ]);

  var mainCol = el("div", "discover-main");

  mainCol.appendChild(el("div", "toolbar", [
    el("div", { class: "segmented", role: "group", "aria-label": "Filter by story format" }, [
      segmentButton("All", "all", ctx.ui.filterType),
      segmentButton("Web Novel", "Web Novel", ctx.ui.filterType),
      segmentButton("Chitrānk", "Chitrānk", ctx.ui.filterType)
    ]),
    el("div", { style: "display: flex; align-items: center; gap: 10px; flex-wrap: wrap;" }, [
      aboutBtn,
      filterBtn,
      el("div", { class: "mini-meta", role: "status", "aria-live": "polite" }, "Showing " + stories.length + " stories")
    ])
  ]));

  if (ctx.ui.showFilterDrawer) {
    var drawer = el("div", "filter-drawer", [
      el("div", "filter-group", [
        el("label", { for: "drawerGenreSelect" }, "Genre"),
        select("drawerGenreSelect", [["all", "All Genres"]].concat((ctx.state.genreOptions || []).map(function (g) { return [g, g]; })), (ctx.genreFilter && ctx.genreFilter.value) || "all")
      ]),
      el("div", "filter-group", [
        el("label", { for: "filterStatus" }, "Status"),
        select("filterStatus", [
          ["all", "All Statuses"],
          ["ongoing", "Ongoing / Active"],
          ["completed", "Completed"],
          ["published", "Published"]
        ], ctx.ui.filterStatus || "all")
      ]),
      el("div", "filter-group", [
        el("label", { for: "filterLanguage" }, "Language"),
        select("filterLanguage", (function () {
          var seen = new Set();
          var langs = [];
          var rawLangs = (ctx.state.languageOptions || []).slice();
          (ctx.state.stories || []).forEach(function (s) {
            if (s.language && s.language.trim()) rawLangs.push(s.language.trim());
          });
          if (ctx.ui.filterLanguage && ctx.ui.filterLanguage !== "all") {
            rawLangs.push(ctx.ui.filterLanguage);
          }
          rawLangs.forEach(function (l) {
            if (!l) return;
            var val = l.toLowerCase();
            var label = l.charAt(0).toUpperCase() + l.slice(1);
            if (!seen.has(val)) {
              seen.add(val);
              langs.push([val, label]);
            }
          });
          langs.sort(function (a, b) { return a[1].localeCompare(b[1]); });
          return [["all", "All Languages"]].concat(langs);
        })(), ctx.ui.filterLanguage || "all")
      ]),
      el("div", "filter-group", [
        el("label", { for: "filterRecency" }, "Update Recency"),
        select("filterRecency", [
          ["all", "All Time"],
          ["7d", "Past 7 Days"],
          ["30d", "Past 30 Days"],
          ["90d", "Past 90 Days"],
          ["1y", "Past Year"]
        ], ctx.ui.filterRecency || "all")
      ]),
      el("div", "filter-group", [
        el("label", { for: "filterSort" }, "Sort By"),
        select("filterSort", [
          ["relevance", "Relevance"],
          ["newest", "Newest First"],
          ["reads", "Most Reads"],
          ["likes", "Most Likes"],
          ["rating", "Highest Rated"]
        ], ctx.ui.filterSort || "newest")
      ])
    ]);
    drawer.id = "discover-filter-controls";

    drawer.querySelectorAll("select").forEach(function (sel) {
      sel.addEventListener("change", function (e) {
        if (e.target.name === "drawerGenreSelect") {
          if (ctx.genreFilter) ctx.genreFilter.value = e.target.value;
        } else {
          ctx.ui[e.target.name] = e.target.value;
        }
        ctx.loadDiscoveryPage(true);
      });
    });

    mainCol.appendChild(drawer);
  }

  // Active filter chips (removable tags with quick reset)
  var activeFilterChips = renderActiveFilterChips(ctx);
  if (activeFilterChips) {
    mainCol.appendChild(activeFilterChips);
  }

  // Story grid
  var grid = el("section", "story-grid");
  grid.id = "storyGrid";
  stories.forEach(function (story) {
    grid.appendChild(storyCard(ctx, story));
  });

  if (ctx.state.discoveryError && !stories.length) {
    mainCol.appendChild(el("div", { class: "empty-state", role: "alert" }, [
      el("h2", null, "Stories could not be loaded"),
      el("p", null, ctx.state.discoveryError.status === 401
        ? "Your session has expired. Sign in again to continue."
        : (ctx.state.discoveryError.status === 403 ? "Your account does not have permission to view these stories." : "Check your connection and try again.")),
      ctx.state.discoveryError.status === 401
        ? button("Sign in", "btn primary", { action: "openSignIn" })
        : button("Try again", "btn primary", { action: "retryStories" })
    ]));
    ctx.view.appendChild(mainCol);
    return;
  }

  if (stories.length) {
    mainCol.appendChild(grid);
  } else {
    var searchInputEmpty = document.getElementById("searchInput");
    var hasFiltersForEmptyState = Boolean(
      (searchInputEmpty && searchInputEmpty.value.trim()) ||
      (ctx.genreFilter && ctx.genreFilter.value !== "all") ||
      (ctx.ui.filterType && ctx.ui.filterType !== "all") ||
      (ctx.ui.filterStatus && ctx.ui.filterStatus !== "all") ||
      (ctx.ui.filterLanguage && ctx.ui.filterLanguage !== "all") ||
      (ctx.ui.filterRecency && ctx.ui.filterRecency !== "all") ||
      (ctx.ui.filterSort && ctx.ui.filterSort !== "newest")
    );

    if (hasFiltersForEmptyState) {
      mainCol.appendChild(emptyState(
        "No stories found matching your filters",
        "We couldn't find any stories matching your current filters or search keywords. Try clearing some filters or searching for different terms.",
        button("Reset all filters", "btn primary", { action: "clearAllFilters" }),
        "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
      ));
    } else {
      mainCol.appendChild(emptyState(
        "No stories published yet",
        "KathaSangam is ready for original fiction! Be the first creator to publish an original Web Novel or Chitrānk comic.",
        el("a", {
          class: "btn primary",
          href: "#studio",
          role: "button",
          "aria-label": "Go to Author Studio to create a story"
        }, "Go to Author Studio"),
        "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      ));
    }
  }

  if (ctx.state.discoveryLoading) {
    mainCol.appendChild(el("p", { class: "loading-note", role: "status", "aria-live": "polite" }, "Loading stories…"));
  } else if (ctx.state.discoveryError) {
    mainCol.appendChild(el("div", { class: "inline-error", role: "alert" }, [
      el("span", null, ctx.state.discoveryError.status === 401 ? "Your session expired. Sign in again." : "More stories could not be loaded."),
      ctx.state.discoveryError.status === 401
        ? button("Sign in", "btn", { action: "openSignIn" })
        : button("Retry", "btn", { action: "retryStories" })
    ]));
  }
  if (ctx.state.discoveryHasMore && !ctx.state.discoveryLoading) {
    mainCol.appendChild(button("Load more stories", "btn secondary", { action: "loadMoreStories" }));
  }

  var trendingSidebar = renderTrendingSidebar(ctx);
  if (trendingSidebar) {
    var layout = el("div", "discover-layout", [mainCol, trendingSidebar]);
    ctx.view.appendChild(layout);
  } else {
    ctx.view.appendChild(mainCol);
  }
}
