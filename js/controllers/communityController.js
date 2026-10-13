import { el } from "../components.js";
import { readingListCardSkeleton } from "../views/shared.js";

export function handleCommunityClick(ctx, action, target, e) {
  ctx = ctx || this;

  if (action === "bookmarkStory") {
    if (!ctx.state.user) {
      ctx.openAuthModal();
      return true;
    }
    const storyId = target.dataset.storyId;
    if (!storyId) return true;

    const prevBookmarkIds = (ctx.state.bookmarkIds || []).slice();
    const isBookmarked = prevBookmarkIds.indexOf(storyId) !== -1;
    ctx.state.bookmarkIds = isBookmarked
      ? prevBookmarkIds.filter(function (id) { return id !== storyId; })
      : prevBookmarkIds.concat([storyId]);
    ctx.state.bookmarks = null;
    ctx.render();

    const doBookmark = function () {
      ctx.apiPost("/bookmarks", { story_id: storyId })
        .then(function (res) {
          ctx.notify(isBookmarked ? "Bookmark removed." : "Story bookmarked!", "success");
        })
        .catch(function (err) {
          console.error("Bookmark toggle failed:", err);
          ctx.state.bookmarkIds = prevBookmarkIds;
          ctx.state.bookmarks = null;
          ctx.render();
          ctx.notify((err.message || "Failed to update bookmark.") + " Action reverted.", "error", {
            onRetry: doBookmark
          });
        });
    };
    doBookmark();
    return true;
  }

  if (action === "likeStory") {
    if (!ctx.state.user) {
      ctx.openAuthModal();
      return true;
    }
    const storyId = target.dataset.storyId;
    if (!storyId) return true;

    const prevLikedStoryIds = (ctx.state.likedStoryIds || []).slice();
    const isLiked = prevLikedStoryIds.indexOf(storyId) !== -1;
    ctx.state.likedStoryIds = isLiked
      ? prevLikedStoryIds.filter(function (id) { return id !== storyId; })
      : prevLikedStoryIds.concat([storyId]);

    const story = ctx.state.stories ? ctx.state.stories.find(function (s) { return s.id === storyId; }) : null;
    const prevLikes = story ? (story.likes || 0) : 0;
    if (story) {
      story.likes = isLiked ? Math.max(0, prevLikes - 1) : prevLikes + 1;
    }
    ctx.render();

    const doLike = function () {
      ctx.apiPost("/stories/" + storyId + "/like")
        .then(function (res) {
          if (story && typeof res.likes === "number") {
            story.likes = res.likes;
            ctx.render();
          }
          if (res.liked && typeof ctx.recordLikeGiven === "function") {
            ctx.recordLikeGiven();
          }
          ctx.notify(res.liked ? "Story liked!" : "Story unliked.", "success");
        })
        .catch(function (err) {
          console.error("Like toggle failed:", err);
          ctx.state.likedStoryIds = prevLikedStoryIds;
          if (story) story.likes = prevLikes;
          ctx.render();
          ctx.notify((err.message || "Failed to update like.") + " Action reverted.", "error", {
            onRetry: doLike
          });
        });
    };
    doLike();
    return true;
  }


  if (action === "openAddToReadingListModal") {
    if (!ctx.state.user) {
      ctx.openAuthModal();
      return true;
    }
    const storyId = target.dataset.storyId;
    if (!storyId) return true;

    openAddToReadingListModal(ctx, storyId);
    return true;
  }

  return false;
}

export function handleCommunitySubmit(ctx, formName, formEl, e) {
  return false;
}

function openAddToReadingListModal(ctx, storyId) {
  const storyModal = document.getElementById("storyModal");
  const titleEl = document.getElementById("storyModalTitle");
  const contentEl = document.getElementById("storyModalContent");

  if (!storyModal || !titleEl || !contentEl) return;

  titleEl.textContent = "Add to Reading List";
  contentEl.innerHTML = "";
  
  const loadingEl = el("div", { class: "reading-lists-container" }, [
    readingListCardSkeleton(),
    readingListCardSkeleton()
  ]);
  contentEl.appendChild(loadingEl);
  storyModal.hidden = false;

  function renderModalBody() {
    contentEl.innerHTML = "";

    // 1. Fetch playlists
    ctx.api("/reading-lists")
      .then(lists => {
        const userLists = lists.filter(l => l.user_id === ctx.state.user.id);
        
        // 2. Fetch detailed entries of each user playlist in parallel
        Promise.all(userLists.map(l => ctx.api(`/reading-lists/${l.id}`)))
          .then(details => {
            contentEl.innerHTML = "";
            
            // Render list of playlists
            const listContainer = el("div", "reading-list-modal-list");
            
            if (details.length === 0) {
              listContainer.appendChild(
                el("div", { style: "padding: 10px; text-align: center; color: var(--text-muted); font-size: 0.85rem;" }, "You don't have any reading lists yet.")
              );
            } else {
              details.forEach(detail => {
                const isAlreadyIn = detail.stories.some(s => s.id === storyId);
                
                const item = el("div", "reading-list-modal-item", [
                  el("input", {
                    type: "checkbox",
                    checked: isAlreadyIn,
                    style: "cursor: pointer; margin-right: 10px;",
                    onclick: function(e) {
                      e.stopPropagation(); // prevent double toggle
                      toggleEntry(detail.id, isAlreadyIn);
                    }
                  }),
                  el("div", { style: "flex: 1; display: flex; flex-direction: column;" }, [
                    el("span", { style: "font-weight: 600; font-size: 0.95rem; color: var(--text);" }, detail.name),
                    el("span", { class: "mini-meta" }, `${detail.stories.length} stories · ${detail.is_private ? "Private" : "Public"}`)
                  ])
                ]);

                item.onclick = function() {
                  toggleEntry(detail.id, isAlreadyIn);
                };

                listContainer.appendChild(item);
              });
            }

            // Inline creation form
            const newListNameInput = el("input", {
              type: "text",
              class: "form-control",
              placeholder: "Create new reading list...",
              style: "flex: 1; background: var(--surface-3); border: 1px solid rgba(255,255,255,0.1); color: var(--text); padding: 8px 12px; border-radius: 4px;",
              required: true
            });

            const playlistFeedback = el("div", "playlist-modal-feedback");

            const createForm = el("form", {
              style: "display: flex; flex-direction: column; gap: 8px; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;",
              onsubmit: function(e) {
                e.preventDefault();
                playlistFeedback.innerHTML = "";
                const name = newListNameInput.value.trim();
                
                if (!name) {
                  const err = el("p", "form-feedback error", "Playlist name cannot be empty. Please check your input and try again.");
                  playlistFeedback.appendChild(err);
                  return;
                }

                const submitBtn = createForm.querySelector("button[type='submit']");
                if (submitBtn) {
                  submitBtn.disabled = true;
                  submitBtn.textContent = "Adding...";
                }

                ctx.apiPost("/reading-lists", {
                  name: name,
                  description: null,
                  is_private: false
                }).then(newList => {
                  return ctx.apiPost(`/reading-lists/${newList.id}/entries`, { story_id: storyId });
                }).then(() => {
                  ctx.state.readingLists = null; // Invalidate cache
                  renderModalBody();
                }).catch(err => {
                  if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Create & Add";
                  }
                  console.error("Failed to create list and add entry:", err);
                  const errMsg = el("p", "form-feedback error", (err.message || "Failed to create reading list.") + " Please check your input and try again.");
                  playlistFeedback.appendChild(errMsg);
                });
              }
            }, [
              el("div", { style: "display: flex; gap: 8px; width: 100%;" }, [
                newListNameInput,
                el("button", { type: "submit", class: "btn primary" }, "Create & Add")
              ]),
              playlistFeedback
            ]);

            contentEl.appendChild(listContainer);
            contentEl.appendChild(createForm);
          })
          .catch(err => {
            console.error("Failed to load playlist details:", err);
            contentEl.textContent = "Error loading list details.";
          });
      })
      .catch(err => {
        console.error("Failed to load reading lists:", err);
        contentEl.textContent = "Error loading reading lists.";
      });
  }

  function toggleEntry(listId, isAlreadyIn) {
    contentEl.innerHTML = "";
    contentEl.appendChild(el("div", { class: "reading-lists-container" }, [
      readingListCardSkeleton()
    ]));

    const promise = isAlreadyIn
      ? ctx.apiDelete(`/reading-lists/${listId}/entries/${storyId}`)
      : ctx.apiPost(`/reading-lists/${listId}/entries`, { story_id: storyId });

    promise
      .then(() => {
        ctx.state.readingLists = null; // force reload lists next time
        renderModalBody();
      })
      .catch(err => {
        console.error("Failed to toggle playlist entry:", err);
        ctx.notify("Error: " + (err.message || err));
        renderModalBody();
      });
  }

  renderModalBody();
}
