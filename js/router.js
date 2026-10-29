const ABOUT_SECTIONS = [
  "mission-vision",
  "platform-guide",
  "rules-guidelines",
  "open-source-stack",
  "community-channels"
];

export function getRoute() {
  var rawHash = window.location.hash.replace(/^#/, "");
  var cleanHash = rawHash.split("?")[0].split("#")[0] || "discover";
  if (cleanHash === "about" || ABOUT_SECTIONS.indexOf(cleanHash) !== -1 || cleanHash.startsWith("about/")) {
    return "about";
  }
  return cleanHash || "discover";
}

export function hydrateGenres(ctx) {
  var selected = ctx.genreFilter.value || "all";
  ctx.genreFilter.innerHTML = '<option value="all">All genres</option>';
  var allGenres = (ctx.state.genreOptions || []).slice();
  if (ctx.state.stories) {
    ctx.state.stories.forEach(function (s) {
      if (s.genre) {
        s.genre.split(",").forEach(function (g) {
          var trimmed = g.trim();
          if (trimmed && allGenres.indexOf(trimmed) === -1) {
            allGenres.push(trimmed);
          }
        });
      }
    });
  }
  allGenres = Array.from(new Set(allGenres)).sort();
  ctx.state.genreOptions = allGenres;

  allGenres.forEach(function (g) {
    const o = document.createElement("option");
    o.value = g;
    o.textContent = g;
    ctx.genreFilter.appendChild(o);
  });
  ctx.genreFilter.value = allGenres.indexOf(selected) !== -1 ? selected : "all";
}

import { markRouteStart, markRouteEnd } from "./perf.js";

export function render(ctx) {
  var route = getRoute();
  if (route) {
    ctx.ui.currentView = route;
  }
  markRouteStart(ctx.ui.currentView);
  const allowed = ["discover", "library", "reader", "studio", "moderation", "editor", "profile", "settings", "story", "achievements", "wallet", "about"];
  if (allowed.indexOf(ctx.ui.currentView) === -1) {
    ctx.ui.currentView = "discover";
    if (window.location.hash.replace(/^#/, "").split("?")[0] !== "discover") {
      window.location.hash = "discover";
    }
  }

  if (ctx.ui.currentView === "achievements") {
    ctx.ui.currentView = "profile";
    ctx.ui.profileSubTab = "achievements";
  }

  if (ctx.ui.currentView !== "reader" && document.fullscreenElement) {
    document.exitFullscreen().catch(function () {});
  }

  const canModerate = ctx.canModerateRole();
  const moderationLink = document.querySelector('[data-nav="moderation"]');
  if (moderationLink) {
    moderationLink.hidden = !canModerate;
    
    // Update counter badge
    var badge = moderationLink.querySelector('.nav-badge');
    var openCount = ctx.state.stats ? (ctx.state.stats.open_reports || 0) : 0;
    if (openCount > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        moderationLink.appendChild(badge);
      }
      badge.textContent = openCount;
    } else {
      if (badge) {
        badge.remove();
      }
    }
  }
  if (ctx.ui.currentView === "moderation" && !canModerate) {
    ctx.ui.currentView = "discover";
    window.location.hash = "discover";
  }

  document.querySelectorAll("[data-nav]").forEach(function (link) {
    link.classList.toggle("active", link.dataset.nav === ctx.ui.currentView);
  });
  document.querySelectorAll("[data-mobile-nav]").forEach(function (link) {
    link.classList.toggle("active", link.dataset.mobileNav === ctx.ui.currentView);
  });
  ctx.pageTitle.textContent = {
    discover: "Discover",
    library: "Library",
    reader: "Reader",
    studio: "Author Studio",
    moderation: "Moderation",
    editor: "Chapter Editor",
    profile: "Profile",
    settings: "Settings",
    story: "Story Details",
    wallet: "Creator Wallet",
    about: "About KathaSangam"
  }[ctx.ui.currentView];

  var savedScrollY = (typeof window !== "undefined") ? window.scrollY : 0;
  ctx.view.innerHTML = "";
  if (ctx.ui.currentView === "discover") ctx.renderDiscover();
  if (ctx.ui.currentView === "library") ctx.renderLibrary();
  if (ctx.ui.currentView === "reader") {
    if (savedScrollY > 0) ctx.ui._savedScrollY = savedScrollY;
    ctx.renderReader();
  }
  if (ctx.ui.currentView === "studio") ctx.renderStudio();
  if (ctx.ui.currentView === "moderation") ctx.renderModeration();
  if (ctx.ui.currentView === "editor") ctx.renderEditor();
  if (ctx.ui.currentView === "profile" || ctx.ui.currentView === "settings") ctx.renderProfileSettings();
  if (ctx.ui.currentView === "story") ctx.renderStoryDetails();
  if (ctx.ui.currentView === "wallet") ctx.renderWallet();
  if (ctx.ui.currentView === "about") {
    ctx.renderAbout();
    var rawHash = (typeof window !== "undefined" && window.location.hash) ? window.location.hash.replace(/^#/, "") : "";
    var sectionId = rawHash.split("?")[0].split("#")[0];
    if (ABOUT_SECTIONS.indexOf(sectionId) !== -1) {
      setTimeout(function () {
        var sectionEl = document.getElementById(sectionId);
        if (sectionEl) sectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }
  markRouteEnd(ctx.ui.currentView);
}
