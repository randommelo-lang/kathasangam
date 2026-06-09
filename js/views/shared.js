import { button, el, formatNumber, iconButton, progress } from "../components.js?v=comic-fit-20260609-v27";

export function storyGrid(ctx, stories, options) {
  var g = el("section", "story-grid");
  stories.forEach(function (s) {
    g.appendChild(storyCard(ctx, s, options));
  });
  return g;
}

export function storyCard(ctx, story, options) {
  options = options || {};
  var tpl = document.getElementById("storyCardTemplate");
  var card = tpl.content.firstElementChild.cloneNode(true);
  var coverVal = story.cover;
  if (coverVal && !coverVal.startsWith("url") && !coverVal.startsWith("linear-gradient") && !coverVal.startsWith("radial-gradient")) {
    coverVal = "url('" + coverVal + "')";
  }
  card.querySelector(".cover-art").style.setProperty("--cover", coverVal);
  card.querySelector(".cover-badge").textContent = story.type;

  var openButton = card.querySelector(".cover-button");
  openButton.dataset.action = options.manage ? "manageStory" : "openStory";
  openButton.dataset.id = story.id;
  openButton.setAttribute("aria-label", (options.manage ? "Manage " : "Open ") + story.title);

  var genres = (story.genre || "").split(",").map(function (g) { return g.trim(); }).filter(Boolean);
  var metaContainer = card.querySelector(".story-meta");
  metaContainer.innerHTML = "";
  metaContainer.appendChild(document.createTextNode(genres.join(", ") + " / "));
  var authorLink = el("a", "story-author-link", story.author);
  authorLink.href = "#profile?username=" + encodeURIComponent(story.author);
  metaContainer.appendChild(authorLink);
  metaContainer.appendChild(document.createTextNode(" / " + formatNumber(story.views) + " reads"));
  var titleEl = card.querySelector("h2");
  titleEl.textContent = story.title;
  titleEl.dataset.action = "openStory";
  titleEl.dataset.id = story.id;
  card.querySelector("p").textContent = story.description;

  var tags = card.querySelector(".tag-row");
  genres.forEach(function (g) {
    tags.appendChild(el("span", "tag", g));
  });

  // Progress indicators
  var progressData = ctx.getStoryReadingProgress(story.id);
  var readBtnText = "Read";
  if (progressData && story.chapters && story.chapters.length) {
    var chIdx = story.chapters.findIndex(function (c) { return c.id === progressData.chapter_id; });
    if (chIdx !== -1) {
      readBtnText = "Resume (Ch. " + (chIdx + 1) + ")";
      var percent = ctx.calculateStoryProgressPercent(story);
      var progressEl = el("div", "story-progress-row", [
        progress(percent),
        el("span", "mini-meta", percent + "% read")
      ]);
      card.querySelector(".story-body").insertBefore(progressEl, tags);
    } else {
      readBtnText = "Resume";
    }
  }

  var actions = card.querySelector(".story-actions");
  if (options.manage) {
    actions.appendChild(iconButton("Manage", "btn success", { action: "manageStory", id: story.id }, "icon-gear"));
    actions.appendChild(iconButton(readBtnText, "btn", { action: "openStory", id: story.id }, "icon-book"));
    actions.appendChild(iconButton("Delete", "btn danger", { action: "deleteStory", id: story.id }, "icon-trash", !canDeleteStory(ctx, story)));
  } else {
    actions.appendChild(button(readBtnText, "btn primary", { action: "openStory", id: story.id }));
    actions.appendChild(button(ctx.state.library.indexOf(story.id) === -1 ? "Follow" : "Following", "btn", { action: "follow", id: story.id }));
  }

  return card;
}

export function canDeleteStory(ctx, story) {
  if (ctx.state.role === "admin") return true;
  if (ctx.state.role === "author") {
    if (story.author === "You") return true;
    if (ctx.state.user && story.author_id === ctx.state.user.id) return true;
    var currentUsername = ctx.state.profile ? ctx.state.profile.username : "";
    return !!(currentUsername && story.author === currentUsername);
  }
  return false;
}
