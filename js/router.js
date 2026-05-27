export function getRoute() {
  return window.location.hash.replace("#", "") || "discover";
}

export function hydrateGenres(ctx) {
  ctx.genreFilter.innerHTML = '<option value="all">All genres</option>';
  const genres = ctx.unique(ctx.state.stories.map(function (s) { return s.genre; })).sort();
  genres.forEach(function (g) {
    const o = document.createElement("option");
    o.value = g;
    o.textContent = g;
    ctx.genreFilter.appendChild(o);
  });
}

export function render(ctx) {
  const allowed = ["discover", "library", "reader", "studio", "moderation", "editor"];
  if (allowed.indexOf(ctx.ui.currentView) === -1) ctx.ui.currentView = "discover";

  const canModerate = ctx.canModerateRole();
  const moderationLink = document.querySelector('[data-nav="moderation"]');
  if (moderationLink) moderationLink.hidden = !canModerate;
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
    editor: "Chapter Editor"
  }[ctx.ui.currentView];

  ctx.view.innerHTML = "";
  if (ctx.ui.currentView === "discover") ctx.renderDiscover();
  if (ctx.ui.currentView === "library") ctx.renderLibrary();
  if (ctx.ui.currentView === "reader") ctx.renderReader();
  if (ctx.ui.currentView === "studio") ctx.renderStudio();
  if (ctx.ui.currentView === "moderation") ctx.renderModeration();
  if (ctx.ui.currentView === "editor") ctx.renderEditor();
}
