import { el, list, progress, formatDate } from "../components.js?v=auth-tabs-20260619-v29";
import { storyGrid, storyCardSkeleton, readingListCardSkeleton, emptyState } from "./shared.js?v=auth-tabs-20260619-v29";

export function renderLibrary(ctx) {
  ctx = ctx || this;

  if (!ctx.state.user) {
    ctx.view.appendChild(
      el("div", "empty", [
        el("h3", null, "Access Restricted"),
        el("p", null, "Please sign in to view your library, bookmarks, and reading lists."),
        el("button", { 
          class: "btn primary", 
          style: "margin-top: 15px;",
          onclick: function() { ctx.openAuthModal(); }
        }, "Sign In")
      ])
    );
    return;
  }

  // Load bookmark IDs silently if not loaded yet
  if (ctx.state.user && ctx.state.bookmarkIds === null) {
    ctx.api("/bookmarks/ids")
      .then(ids => {
        ctx.state.bookmarkIds = ids;
      })
      .catch(err => console.error("Error loading bookmark IDs:", err));
  }

  const activeTab = ctx.ui.activeLibraryTab || "bookmarks";

  // Build the tab buttons
  const tabButtons = el("div", "library-tabs", [
    el("button", {
      class: `library-tab-btn${activeTab === "bookmarks" ? " active" : ""}`,
      onclick: function() {
        ctx.ui.activeLibraryTab = "bookmarks";
        ctx.render();
      }
    }, "Bookmarks"),
    el("button", {
      class: `library-tab-btn${activeTab === "reading-lists" ? " active" : ""}`,
      onclick: function() {
        ctx.ui.activeLibraryTab = "reading-lists";
        ctx.ui.activeReadingListId = null; // Reset detailed view
        ctx.render();
      }
    }, "Reading Lists")
  ]);

  // Build the main tab content container
  const mainContentEl = el("div", "library-main-content");

  if (activeTab === "bookmarks") {
    mainContentEl.appendChild(
      el("div", "toolbar", [
        el("h2", null, "Bookmarks")
      ])
    );

    if (ctx.state.bookmarks === null) {
      const loadingEl = el("div", "story-grid", [
        storyCardSkeleton(),
        storyCardSkeleton(),
        storyCardSkeleton()
      ]);
      mainContentEl.appendChild(loadingEl);
      ctx.api("/bookmarks")
        .then(data => {
          ctx.state.bookmarks = data;
          ctx.render();
        })
        .catch(err => {
          console.error("Failed to load bookmarks:", err);
          loadingEl.innerHTML = "";
          loadingEl.appendChild(el("div", "empty", "Failed to load bookmarks."));
        });
    } else {
      mainContentEl.appendChild(
        ctx.state.bookmarks.length ? storyGrid(ctx, ctx.state.bookmarks) : emptyState(
          "Your bookmarks shelf is empty",
          "Bookmark stories from their details pages to save them here for quick access later.",
          el("button", {
            class: "btn primary",
            onclick: function() { window.location.hash = "discover"; }
          }, "Browse Stories"),
          "M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"
        )
      );
    }

  } else if (activeTab === "reading-lists") {
    if (ctx.state.readingLists === null) {
      const loadingEl = el("div", "reading-lists-container", [
        readingListCardSkeleton(),
        readingListCardSkeleton()
      ]);
      mainContentEl.appendChild(loadingEl);
      ctx.api("/reading-lists")
        .then(data => {
          ctx.state.readingLists = data;
          ctx.render();
        })
        .catch(err => {
          console.error("Failed to load reading lists:", err);
          loadingEl.innerHTML = "";
          loadingEl.appendChild(el("div", "empty", "Failed to load reading lists."));
        });
    } else if (ctx.ui.activeReadingListId) {
      // Detailed view of a reading list
      const listId = ctx.ui.activeReadingListId;
      const detail = ctx.state.activeReadingListDetail;

      if (!detail || detail.id !== listId) {
        const loadingEl = el("div", "story-grid", [
          storyCardSkeleton(),
          storyCardSkeleton(),
          storyCardSkeleton()
        ]);
        mainContentEl.appendChild(loadingEl);
        ctx.api(`/reading-lists/${listId}`)
          .then(data => {
            ctx.state.activeReadingListDetail = data;
            ctx.render();
          })
          .catch(err => {
            console.error("Failed to load reading list details:", err);
            loadingEl.innerHTML = "";
            loadingEl.appendChild(el("div", "empty", "Failed to load reading list details."));
          });
      } else {
        // Render detailed header and stories
        mainContentEl.appendChild(
          el("div", { style: "margin-bottom: 20px; display: flex; flex-direction: column; gap: 8px;" }, [
            el("button", {
              class: "btn text-btn back-btn",
              style: "align-self: flex-start; margin-bottom: 10px; padding: 0;",
              onclick: function() {
                ctx.ui.activeReadingListId = null;
                ctx.state.activeReadingListDetail = null;
                ctx.render();
              }
            }, "← Back to Reading Lists"),
            el("div", { style: "display: flex; align-items: center; gap: 12px;" }, [
              el("h2", { style: "margin: 0;" }, detail.name),
              el("span", `badge-status ${detail.is_private ? "private" : "public"}`, detail.is_private ? "Private" : "Public")
            ]),
            detail.description ? el("p", { style: "margin: 0; color: var(--text-muted); font-size: 0.9rem;" }, detail.description) : null,
            el("span", "mini-meta", `Curated by ${detail.username} · ${detail.stories.length} stories`)
          ])
        );

        mainContentEl.appendChild(
          detail.stories.length ? storyGrid(ctx, detail.stories) : emptyState(
            "This playlist is empty",
            "Browse stories on the discovery feed and add them to this playlist.",
            el("button", {
              class: "btn primary",
              onclick: function() { window.location.hash = "discover"; }
            }, "Discover Stories"),
            "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
          )
        );
      }
    } else {
      // General view of reading lists
      const toolbar = el("div", "toolbar", [
        el("h2", null, "Reading Playlists"),
        el("button", {
          class: "btn primary",
          onclick: function() {
            ctx.ui.showCreateListForm = !ctx.ui.showCreateListForm;
            ctx.render();
          }
        }, ctx.ui.showCreateListForm ? "Cancel" : "Create List")
      ]);
      mainContentEl.appendChild(toolbar);

      if (ctx.ui.showCreateListForm) {
        const nameInput = el("input", { type: "text", class: "form-control", placeholder: "Name", required: true, style: "margin-bottom: 10px; width: 100%; background: var(--surface-3); border: 1px solid rgba(255,255,255,0.1); color: var(--text); padding: 8px 12px; border-radius: 4px;" });
        const descInput = el("textarea", { class: "form-control", placeholder: "Description (optional)", style: "margin-bottom: 10px; width: 100%; height: 60px; background: var(--surface-3); border: 1px solid rgba(255,255,255,0.1); color: var(--text); padding: 8px 12px; border-radius: 4px;" });
        const privateCheck = el("input", { type: "checkbox", id: "isPrivateList", style: "margin-right: 8px;" });
        
        const createForm = el("form", {
          style: "background: var(--surface-2); padding: 20px; border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius); margin-bottom: 20px;",
          onsubmit: function(e) {
            e.preventDefault();
            const name = nameInput.value.trim();
            const description = descInput.value.trim();
            const is_private = privateCheck.checked;

            ctx.apiPost("/reading-lists", { name, description: description || null, is_private })
              .then(newList => {
                ctx.ui.showCreateListForm = false;
                ctx.state.readingLists.unshift(newList);
                ctx.render();
              })
              .catch(err => {
                console.error("Failed to create reading list:", err);
                ctx.notify("Error: " + (err.message || err));
              });
          }
        }, [
          el("h3", { style: "margin-top: 0; margin-bottom: 15px; font-size: 1.1rem;" }, "New Reading List"),
          nameInput,
          descInput,
          el("div", { style: "display: flex; align-items: center; margin-bottom: 15px;" }, [
            privateCheck,
            el("label", { for: "isPrivateList", style: "font-size: 0.9rem; color: var(--text);" }, "Make this list private")
          ]),
          el("button", { type: "submit", class: "btn primary" }, "Create")
        ]);
        mainContentEl.appendChild(createForm);
      }

      const listsContainer = el("div", "reading-lists-container");
      if (ctx.state.readingLists.length === 0) {
        listsContainer.appendChild(
          emptyState(
            "No reading playlists yet",
            "Create a reading playlist to organize your favorite serialized novels and comics.",
            el("button", {
              class: "btn primary",
              onclick: function() {
                ctx.ui.showCreateListForm = true;
                ctx.render();
              }
            }, "Create List"),
            "M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0-2-.9-2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"
          )
        );
      } else {
        ctx.state.readingLists.forEach(list => {
          const isOwner = list.user_id === ctx.state.user.id;
          
          const deleteBtn = isOwner ? el("button", {
            class: "btn text-btn danger-text",
            style: "margin-left: auto; z-index: 10;",
            onclick: function(e) {
              e.stopPropagation();
              window.showConfirm({
                title: "Delete Reading List",
                message: `Are you sure you want to delete "${list.name}"?`,
                confirmText: "Delete",
                danger: true,
                onConfirm: function () {
                ctx.apiDelete(`/reading-lists/${list.id}`)
                  .then(() => {
                    ctx.state.readingLists = ctx.state.readingLists.filter(l => l.id !== list.id);
                    ctx.render();
                  })
                  .catch(err => {
                    console.error("Failed to delete reading list:", err);
                    ctx.notify("Error: " + (err.message || err));
                  });
                }
              });
            }
          }, "Delete") : null;

          const card = el("div", {
            class: "reading-list-card",
            onclick: function() {
              ctx.ui.activeReadingListId = list.id;
              ctx.state.activeReadingListDetail = null;
              ctx.render();
            }
          }, [
            el("div", "reading-list-card-details", [
              el("div", "reading-list-card-title-row", [
                el("h3", "reading-list-card-title", list.name),
                el("span", `badge-status ${list.is_private ? "private" : "public"}`, list.is_private ? "Private" : "Public")
              ]),
              list.description ? el("p", "reading-list-card-desc", list.description) : null,
              el("span", "reading-list-card-meta", `Curated by ${list.username} · ${formatDate(list.created_at)}`)
            ])
          ]);

          if (deleteBtn) card.appendChild(deleteBtn);
          listsContainer.appendChild(card);
        });
      }
      mainContentEl.appendChild(listsContainer);
    }
  }

  // Assemble layouts
  ctx.view.appendChild(el("div", "layout-two", [
    el("section", null, [
      tabButtons,
      mainContentEl
    ]),
    el("aside", null, [
      el("section", "panel", [
        el("h2", { style: "display: flex; align-items: center; gap: 8px; width: 100%;" }, (function () {
          var headerChildren = [
            el("span", "icon icon-bell"),
            document.createTextNode("Notifications")
          ];
          if (ctx.state.notifications && ctx.state.notifications.length > 0) {
            var clearAllBtn = el("button", {
              style: "background: none; border: none; color: var(--accent); font-size: 0.8rem; cursor: pointer; padding: 0; margin-left: auto;"
            }, "Clear All");
            clearAllBtn.addEventListener("click", function () {
              ctx.apiDelete("/notifications").then(function () {
                ctx.state.notifications = [];
                ctx.updateHeroNotificationUI();
                ctx.render();
              }).catch(function (err) {
                console.error("Failed to clear notifications:", err);
              });
            });
            headerChildren.push(clearAllBtn);
          }
          return headerChildren;
        })()),
        list(ctx.state.notifications, "activity-list", function (n) {
          var itemContent = [
            el("div", { style: "display: flex; align-items: start; gap: 10px;" }, [
              el("span", { class: "icon icon-bell", style: "color: var(--accent); flex-shrink: 0; margin-top: 2px;" }),
              el("span", null, n.message || "")
            ])
          ];

          var liAttrs = { class: "activity-item" };
          if (n.story_id && n.chapter_sort_order !== null && n.chapter_sort_order !== undefined) {
            liAttrs["style"] = "cursor: pointer;";
            liAttrs["data-action"] = "openNotificationChapterFromLibrary";
            liAttrs["data-story-id"] = n.story_id;
            liAttrs["data-sort-order"] = n.chapter_sort_order;
            liAttrs["data-notif-id"] = n.id;
          } else {
            liAttrs["style"] = "cursor: pointer;";
            liAttrs["data-action"] = "clearGeneralNotificationFromLibrary";
            liAttrs["data-notif-id"] = n.id;
          }

          return el("li", liAttrs, itemContent);
        })
      ]),
      el("section", "panel", [
        el("h2", null, "Progress"),
        list(ctx.state.bookmarks || [], "activity-list", function (s) {
          var progPercent = ctx.calculateStoryProgressPercent(s);
          return el("li", "activity-item", [
            el("strong", null, s.title),
            progress(progPercent),
            el("span", "mini-meta", progPercent + "% read")
          ]);
        })
      ])
    ])
  ]));
}
