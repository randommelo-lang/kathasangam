export function getRoute() {
  var hash = window.location.hash.replace("#", "");
  return hash.split("?")[0] || "discover";
}

export function hydrateGenres(ctx) {
  ctx.genreFilter.innerHTML = '<option value="all">All genres</option>';
  
  var allGenres = [];
  if (!ctx.state.stories) return;
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
  allGenres.sort();

  allGenres.forEach(function (g) {
    const o = document.createElement("option");
    o.value = g;
    o.textContent = g;
    ctx.genreFilter.appendChild(o);
  });
}

export function render(ctx) {
  const allowed = ["discover", "library", "reader", "studio", "moderation", "editor", "profile", "settings", "story", "messages"];
  if (allowed.indexOf(ctx.ui.currentView) === -1) ctx.ui.currentView = "discover";

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
    messages: "Messages"
  }[ctx.ui.currentView];

  ctx.view.innerHTML = "";
  if (ctx.ui.currentView === "discover") ctx.renderDiscover();
  if (ctx.ui.currentView === "library") ctx.renderLibrary();
  if (ctx.ui.currentView === "reader") ctx.renderReader();
  if (ctx.ui.currentView === "studio") ctx.renderStudio();
  if (ctx.ui.currentView === "moderation") ctx.renderModeration();
  if (ctx.ui.currentView === "editor") ctx.renderEditor();
  if (ctx.ui.currentView === "profile" || ctx.ui.currentView === "settings") ctx.renderProfileSettings();
  if (ctx.ui.currentView === "story") ctx.renderStoryDetails();
  if (ctx.ui.currentView === "messages") ctx.renderMessages();
}
