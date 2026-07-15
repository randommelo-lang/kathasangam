import { analyticsMetricBox, button, el, formatDate, formatNumber, generateChartData, generateChapterReadsChart, calculateRetentionFunnel, calculateGenreAverages, iconButton, progress, quickActionTile, svgEl, makeCalendarIcon, makeCollaboratorsIcon, makeDiscussionIcon } from "../components.js";
import { storyGrid, storyCardSkeleton } from "./shared.js";

export function renderStudio(ctx) {
  ctx = ctx || this;

  // Reactively fetch pending invites if not loaded/stale
  if (ctx.state.user && ctx.state.pendingInvitesUserId !== ctx.state.user.id) {
    ctx.state.pendingInvitesUserId = ctx.state.user.id;
    ctx.api("/collaborations/invites")
      .then(function (invites) {
        ctx.state.pendingInvites = invites;
        ctx.render();
      })
      .catch(function (err) {
        console.error("Failed to load invites:", err);
      });
  }

  // Reactively fetch internal notes for active story if selection changed
  var activeStory = ctx.getCurrentStudioStory();
  if (activeStory && activeStory.id && ctx.state.internalNotesStoryId !== activeStory.id) {
    ctx.state.internalNotesStoryId = activeStory.id;
    ctx.state.internalNotes = []; // Clear current notes to avoid flicker
    ctx.api("/stories/" + activeStory.id + "/internal-notes")
      .then(function (notes) {
        ctx.state.internalNotes = notes;
        ctx.render();
      })
      .catch(function (err) {
        console.error("Failed to load internal notes:", err);
      });
  }

  if (ctx.state.stories === null) {
    ctx.view.appendChild(
      el("div", "story-grid", [
        storyCardSkeleton(),
        storyCardSkeleton()
      ])
    );
    return;
  }

  var userStories = ctx.state.stories.filter(function (s) {
    if (!ctx.state.user) return false;
    if (s.author_id === ctx.state.user.id) return true;
    return s.collaborators && s.collaborators.some(function (c) {
      return c.user_id === ctx.state.user.id && c.status === "accepted";
    });
  });
  var active = userStories.find(function (s) { return s.id === ctx.ui.currentStoryId; }) || userStories[0];

  if (active && active.id && ctx.ui.currentStoryId !== active.id) {
    ctx.ui.currentStoryId = active.id;
  }

  // 1. Studio Header Toolbar
  var headerBtn = iconButton("New Story", "btn primary orange-glow-btn", { action: "openStoryModal" }, "icon-plus");
  
  // Dropdown to switch stories if they have multiple
  var storySelector = null;
  if (userStories.length > 1 && active) {
    storySelector = el("select", "auth-role-badge-select");
    storySelector.style.marginLeft = "16px";
    storySelector.style.padding = "6px 12px";
    storySelector.style.fontSize = "0.9rem";
    storySelector.style.border = "1px solid rgba(255,255,255,0.15)";
    storySelector.style.borderRadius = "4px";
    storySelector.style.backgroundColor = "rgba(25,25,25,0.8)";
    storySelector.style.color = "var(--text)";
    
    userStories.forEach(function (s) {
      var opt = el("option", null, s.title);
      opt.value = s.id;
      opt.selected = (s.id === active.id);
      storySelector.appendChild(opt);
    });
    
    storySelector.addEventListener("change", function (e) {
      ctx.ui.currentStoryId = e.target.value;
      ctx.render();
    });
  }

  var headerTitleArea = el("div", null, [
    el("div", null, [
      el("h2", null, "Studio Overview"),
      el("p", null, "Manage your series, outline chapters, and track metrics")
    ])
  ]);
  if (storySelector) {
    headerTitleArea.appendChild(el("div", { style: "margin-top: 10px; display: flex; align-items: center;" }, [
      el("span", { style: "font-size: 0.85rem; color: var(--text-muted);" }, "Active Series:"),
      storySelector
    ]));
  }

  var headerToolbar = el("div", "studio-header-toolbar", [
    headerTitleArea,
    headerBtn
  ]);

  // 2. Middle Column Components
  var middleColumnChildren = [];
  middleColumnChildren.push(headerToolbar);

  // Render pending invites banner at the top of studio if user has invitations
  if (ctx.state.pendingInvites && ctx.state.pendingInvites.length > 0) {
    ctx.state.pendingInvites.forEach(function (invite) {
      var inviteCard = el("div", "studio-invite-banner", [
        el("div", "studio-invite-text", [
          el("span", { style: "font-size: 1.2rem; margin-right: 8px;" }, "📩"),
          el("strong", null, invite.ownerUsername),
          " invited you to collaborate as a ",
          el("span", "studio-invite-role-badge", invite.role),
          " on their story ",
          el("strong", null, invite.storyTitle)
        ]),
        el("div", "studio-invite-actions", [
          button("Accept", "btn btn-sm success", { action: "acceptInvite", id: invite.collaborationId }),
          button("Decline", "btn btn-sm danger", { action: "declineInvite", id: invite.collaborationId })
        ])
      ]);
      middleColumnChildren.push(inviteCard);
    });
  }

  if (active) {
    // Active Story Card
    var coverEl = el("div", "studio-active-cover");
    if (active.cover) {
      var isUrlOrGradient = active.cover.startsWith("url") || active.cover.startsWith("linear-gradient") || active.cover.startsWith("radial-gradient");
      coverEl.style.backgroundImage = isUrlOrGradient ? active.cover : "url('" + active.cover + "')";
    } else {
      coverEl.style.background = "linear-gradient(135deg, #333, #111)";
    }

    var activeCard = el("div", "studio-story-active-card", [
      coverEl,
      el("div", "studio-active-details", [
        el("span", { class: "studio-active-badge", "data-type": active.type }, active.type),
        el("div", "studio-active-title-row", [
          el("h3", null, active.title),
          el("span", "studio-status-ongoing", active.status || "Ongoing")
        ]),
        el("div", "studio-active-subtitle", "By " + active.author + " · " + (active.genre || "General")),
        el("p", "studio-active-synopsis", active.description || "No description provided."),
        
        // Stats Row: Views, Likes, Followers
        el("div", "studio-stats-row", [
          el("div", "studio-stat-item", [
            el("span", "icon icon-eye"),
            el("div", "studio-stat-val", [
              el("strong", null, formatNumber(active.views)),
              el("span", null, "Views")
            ])
          ]),
          el("div", "studio-stat-item", [
            el("span", "icon icon-heart"),
            el("div", "studio-stat-val", [
              el("strong", null, formatNumber(active.likes)),
              el("span", null, "Likes")
            ])
          ]),
          el("div", "studio-stat-item", [
            el("span", "icon icon-users"),
            el("div", "studio-stat-val", [
              el("strong", null, formatNumber(active.followers)),
              el("span", null, "Followers")
            ])
          ])
        ]),

        // Progress Bar
        (function() {
          var progressVal = active.progress;
          if (!progressVal && active.chapters) {
            progressVal = active.status === "completed" ? 100 : Math.min(95, active.chapters.length * 10);
          }
          if (!progressVal) progressVal = 0;
          return el("div", "studio-progress-container", [
            el("div", "studio-progress-header", [
              el("span", null, "Story Completion Progress"),
              el("span", null, progressVal + "%")
            ]),
            el("div", "studio-progress-bar-bg", [
              (function() {
                var fill = el("div", "studio-progress-bar-fill");
                fill.style.width = progressVal + "%";
                return fill;
              })()
            ])
          ]);
        })(),

        el("div", "studio-btn-row", [
          iconButton("Continue Writing", "btn primary orange-glow-btn", { action: "continueWriting" }, "icon-pencil"),
          iconButton("Edit Settings", "btn", { action: "editStorySettings", id: active.id }, "icon-gear"),
          iconButton("View Story", "btn", { action: "openStory", id: active.id }, "icon-book"),
          iconButton("", "btn danger", { action: "deleteStory", id: active.id }, "icon-trash")
        ])
      ])
    ]);

    middleColumnChildren.push(activeCard);

    // Timeline / Chapter Plan
    var timelineItems = [];
    if (active.chapters && active.chapters.length) {
      timelineItems = active.chapters.map(function (ch, i) {
        var isCurrent = (ctx.ui.currentChapterIndex === i);
        var itemClass = "timeline-item" + (isCurrent ? " active-chapter" : "");
        var statusClass = "badge-status " + (ch.status === "published" ? "published" : ch.status === "scheduled" ? "scheduled" : "draft");
        
        var detailParts = ["Updated " + (ch.updated_at ? formatDate(ch.updated_at) : "recently") + " · " + (ch.access || "Free")];
        
        var detailsChildren = [
          el("strong", null, ch.title),
          el("span", null, detailParts.join(""))
        ];
        
        // Show scheduled date below title
        if (ch.status === "scheduled" && ch.scheduledAt) {
          var schedDate = new Date(ch.scheduledAt);
          var formatted = schedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " at " + schedDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
          detailsChildren.push(el("span", "schedule-date-label", [makeCalendarIcon("icon icon-sm"), " " + formatted]));
        }
        
        // Build action buttons
        var actionButtons = [
          el("span", "timeline-words", (ch.words || "0") + " words"),
          el("span", statusClass, ch.status)
        ];
        
        // Schedule / Reschedule button
        if (ch.status === "draft" || ch.status === "scheduled") {
          actionButtons.push(
            button(ch.status === "scheduled" ? "⏰" : makeCalendarIcon("icon icon-sm"), "btn btn-sm schedule-btn", { action: "openScheduleModal", id: ch.id, scheduledAt: ch.scheduledAt || "" })
          );
        }
        // Publish Now button (for draft and scheduled)
        if (ch.status !== "published") {
          actionButtons.push(
            button("▶", "btn btn-sm publish-now-btn", { action: "publishNow", id: ch.id })
          );
        }
        // Cancel Schedule (for scheduled)
        if (ch.status === "scheduled") {
          actionButtons.push(
            button("✕", "btn btn-sm danger", { action: "cancelSchedule", id: ch.id })
          );
        }
        
        actionButtons.push(
          iconButton("", "btn btn-sm", { action: "editChapter", id: ch.id }, "icon-edit"),
          iconButton("", "btn btn-sm", { action: "openChapter", index: String(i) }, "icon-book"),
          iconButton("", "btn btn-sm danger", { action: "deleteChapter", id: ch.id }, "icon-trash")
        );
        
        return el("li", itemClass, [
          el("div", "timeline-badge", String(i + 1)),
          el("div", "timeline-details", detailsChildren),
          el("div", "timeline-actions", actionButtons)
        ]);
      });
    }

    var chapterPlanPanel = el("section", "panel", [
      el("div", "toolbar", [
        el("h2", null, "Chapter Plan Timeline"),
        iconButton("New Chapter", "btn btn-sm primary", { action: "newChapter" }, "icon-plus")
      ]),
      timelineItems.length ? el("ul", "timeline-list", timelineItems) : el("div", "empty", "No chapters found. Click 'New Chapter' to begin writing!")
    ]);

    middleColumnChildren.push(chapterPlanPanel);

    // Upcoming Schedule Panel
    var scheduledChapters = [];
    if (active.chapters && active.chapters.length) {
      scheduledChapters = active.chapters.filter(function(ch) {
        return ch.status === "scheduled" && ch.scheduledAt;
      }).sort(function(a, b) {
        return new Date(a.scheduledAt) - new Date(b.scheduledAt);
      });
    }
    if (scheduledChapters.length > 0) {
      var scheduleItems = scheduledChapters.map(function(ch) {
        var schedDate = new Date(ch.scheduledAt);
        var now = new Date();
        var diffMs = schedDate - now;
        var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        var diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var countdown = diffMs > 0 ? (diffDays > 0 ? diffDays + "d " + diffHours + "h" : diffHours + "h") : "Publishing soon...";
        var formatted = schedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " at " + schedDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        
        return el("div", "upcoming-schedule-card", [
          el("div", "upcoming-schedule-info", [
            el("strong", null, ch.title),
            el("span", "upcoming-schedule-date", [makeCalendarIcon("icon icon-sm"), " " + formatted])
          ]),
          el("div", "upcoming-schedule-right", [
            el("span", "upcoming-countdown-badge", countdown),
            button("Cancel", "btn btn-sm danger", { action: "cancelSchedule", id: ch.id })
          ])
        ]);
      });

      var upcomingPanel = el("section", "panel upcoming-schedule-panel", [
        el("div", "toolbar", [
          el("h2", null, [makeCalendarIcon(), " Upcoming Schedule"]),
          el("span", "mini-meta", scheduledChapters.length + " scheduled")
        ]),
        el("div", "upcoming-schedule-list", scheduleItems)
      ]);

      middleColumnChildren.push(upcomingPanel);
    }

    // Collaborators Panel
    var collaboratorsList = active.collaborators || [];
    var isOwner = (ctx.state.user && active.author_id === ctx.state.user.id);
    
    var collabItems = collaboratorsList.map(function (c) {
      var badgeClass = "badge-status " + (c.status === "accepted" ? "published" : "draft");
      
      var removeBtn = null;
      if (ctx.state.user) {
        if (isOwner) {
          removeBtn = button("Remove", "btn btn-sm danger", { action: "removeCollaborator", storyId: active.id, userId: c.user_id });
        } else if (c.user_id === ctx.state.user.id) {
          removeBtn = button("Leave Story", "btn btn-sm danger", { action: "removeCollaborator", storyId: active.id, userId: c.user_id });
        }
      }

      var avatarEl = el("div", "collab-avatar", c.username.substring(0, 2).toUpperCase());
      if (c.avatar_url) {
        avatarEl.style.backgroundImage = "url('" + c.avatar_url + "')";
        avatarEl.innerText = "";
      }

      return el("div", "collab-item-row", [
        el("div", "collab-info", [
          avatarEl,
          el("div", "collab-name-role", [
            el("strong", null, c.username),
            el("span", "collab-role-label", c.role === "co-writer" ? "Co-Writer" : "Editor")
          ])
        ]),
        el("div", "collab-status-actions", [
          el("span", badgeClass, c.status === "accepted" ? "Accepted" : "Invited"),
          removeBtn
        ].filter(Boolean))
      ]);
    });

    var inviteForm = null;
    if (isOwner) {
      inviteForm = el("form", { "data-form": "inviteForm", style: "margin-top: 16px; display: flex; gap: 8px; align-items: flex-end;" }, [
        el("div", { style: "flex: 1;" }, [
          el("label", { style: "display: block; font-size: 0.82rem; margin-bottom: 4px; color: var(--text-muted);" }, "Invite Collaborator"),
          el("input", {
            type: "text",
            name: "username",
            placeholder: "Enter username...",
            required: true,
            style: "width: 100%; padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: var(--text);"
          })
        ]),
        el("div", { style: "width: 130px;" }, [
          el("label", { style: "display: block; font-size: 0.82rem; margin-bottom: 4px; color: var(--text-muted);" }, "Role"),
          el("select", {
            name: "role",
            style: "width: 100%; padding: 8px 12px; background: rgba(0,0,0,0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: var(--text);"
          }, [
            el("option", { value: "co-writer" }, "Co-Writer"),
            el("option", { value: "editor" }, "Editor")
          ])
        ]),
        el("button", { type: "submit", class: "btn primary orange-glow-btn", style: "padding: 8px 16px;" }, "Invite")
      ]);
    }

    var collaboratorsPanel = el("section", "panel collaborators-panel", [
      el("div", "toolbar", [
        el("h2", null, [makeCollaboratorsIcon(), " Story Collaborators"]),
        el("span", "mini-meta", collaboratorsList.length + " total")
      ]),
      el("div", "collab-list", collabItems.length > 0 ? collabItems : el("p", { style: "color: var(--text-muted); font-size: 0.9rem;" }, "No collaborators added yet.")),
      inviteForm
    ].filter(Boolean));

    // Workspace Discussion Panel
    var notesList = ctx.state.internalNotes || [];
    
    var noteItems = notesList.map(function (n) {
      var isNoteAuthor = (ctx.state.user && n.authorId === ctx.state.user.id);
      var deleteNoteBtn = null;
      if (isNoteAuthor || isOwner) {
        deleteNoteBtn = button("×", "btn-delete-note", { action: "deleteInternalNote", storyId: active.id, noteId: n.id });
      }

      var avatarEl = el("div", "note-avatar", n.authorName.substring(0, 2).toUpperCase());
      if (n.authorAvatar) {
        avatarEl.style.backgroundImage = "url('" + n.authorAvatar + "')";
        avatarEl.innerText = "";
      }

      // Format date
      var noteDate = new Date(n.createdAt);
      var formattedDate = noteDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + noteDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

      var chapterBadge = null;
      if (n.chapterId) {
        var associatedChapter = active.chapters && active.chapters.find(function (ch) { return ch.id === n.chapterId; });
        if (associatedChapter) {
          chapterBadge = el("span", "note-chapter-badge", associatedChapter.title);
        }
      }

      return el("div", "note-bubble-row", [
        avatarEl,
        el("div", "note-bubble-content", [
          el("div", "note-header", [
            el("span", "note-author-name", n.authorName),
            chapterBadge,
            el("span", "note-timestamp", formattedDate)
          ].filter(Boolean)),
          el("p", "note-text", n.content),
          deleteNoteBtn
        ].filter(Boolean))
      ]);
    });

    // Chapter dropdown options for Note Form
    var noteChapterOptions = [
      el("option", { value: "" }, "General Story Note")
    ];
    if (active.chapters && active.chapters.length) {
      active.chapters.forEach(function (ch) {
        var opt = el("option", null, ch.title);
        opt.value = ch.id;
        noteChapterOptions.push(opt);
      });
    }

    var noteForm = el("form", { "data-form": "noteForm", style: "margin-top: 16px;" }, [
      el("div", { style: "display: flex; gap: 8px; margin-bottom: 8px;" }, [
        el("select", {
          name: "chapterId",
          style: "flex: 1; padding: 6px 12px; background: rgba(0,0,0,0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: var(--text); font-size: 0.85rem;"
        }, noteChapterOptions),
        el("button", { type: "submit", class: "btn primary orange-glow-btn", style: "padding: 6px 16px; font-size: 0.85rem;" }, "Post Note")
      ]),
      el("textarea", {
        name: "content",
        placeholder: "Write a note or review comment...",
        required: true,
        rows: 2,
        style: "width: 100%; padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: var(--text); font-size: 0.9rem; resize: vertical;"
      })
    ]);

    var internalNotesPanel = el("section", "panel internal-notes-panel", [
      el("div", "toolbar", [
        el("h2", null, [makeDiscussionIcon(), " Workspace Discussion"]),
        el("span", "mini-meta", notesList.length + " notes")
      ]),
      el("div", "note-list-scroll", noteItems.length > 0 ? noteItems : el("p", { style: "color: var(--text-muted); font-size: 0.9rem;" }, "No discussion notes yet. Start the conversation!")),
      noteForm
    ]);

    middleColumnChildren.push(collaboratorsPanel);
    middleColumnChildren.push(internalNotesPanel);
  } else {
    // Welcome placeholder card for first story
    var welcomeCard = el("section", "panel", [
      el("h3", { style: "font-size: 1.4rem; margin-bottom: 8px;" }, "Welcome to Author Studio!"),
      el("p", { style: "color: var(--text-muted); margin-bottom: 16px;" }, "Create your first story to unlock the chapter workspace, analytics tracking, and layout features."),
      iconButton("Create a Story Now", "btn primary orange-glow-btn", { action: "openStoryModal" }, "icon-plus")
    ]);
    middleColumnChildren.push(welcomeCard);
  }

  // Always render stories grid at bottom if they have stories
  if (userStories.length) {
    var storiesPanel = el("section", "panel", [
      el("h2", null, "My Stories"),
      storyGrid(ctx, userStories, { manage: true })
    ]);
    middleColumnChildren.push(storiesPanel);
  }

  // 3. Right Column Components
  var rightColumnChildren = [];

  if (active) {
    // SVG Chart Container construction
    var chartGradientId = "studioChartGrad-" + Math.random().toString(36).substring(2, 9);
    
    var gradient = svgEl("linearGradient", { id: chartGradientId, x1: "0", y1: "0", x2: "0", y2: "1" }, [
      svgEl("stop", { offset: "0%", "stop-color": "#f36b15", "stop-opacity": "0.4" }),
      svgEl("stop", { offset: "100%", "stop-color": "#f36b15", "stop-opacity": "0" })
    ]);
    
    var defs = svgEl("defs", null, [gradient]);
    
    var activeMetric = ctx.ui.activeChartMetric || "reads";
    var metricLabel = "reads";
    if (activeMetric === "likes") metricLabel = "likes";
    else if (activeMetric === "words") metricLabel = "words";

    var ptsData;
    if (activeMetric === "reads") {
      ptsData = generateChapterReadsChart(active);
    } else {
      ptsData = generateChartData(active, activeMetric);
    }
    var lineD = ptsData.length ? "M " + ptsData.map(function(p) { return p.x + " " + p.y; }).join(" L ") : "M 0 85";
    var areaD = lineD + " L 300 100 L 0 100 Z";

    var areaPath = svgEl("path", {
      d: areaD,
      fill: "url(#" + chartGradientId + ")",
      stroke: "none"
    });
    
    var linePath = svgEl("path", {
      d: lineD,
      fill: "none",
      stroke: "#f36b15",
      "stroke-width": "3",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    });

    var grid1 = svgEl("line", { x1: "0", y1: "25", x2: "300", y2: "25", class: "chart-grid-line", "stroke-dasharray": "4 4" });
    var grid2 = svgEl("line", { x1: "0", y1: "50", x2: "300", y2: "50", class: "chart-grid-line", "stroke-dasharray": "4 4" });
    var grid3 = svgEl("line", { x1: "0", y1: "75", x2: "300", y2: "75", class: "chart-grid-line", "stroke-dasharray": "4 4" });

    var pts = ptsData.map(function (pt) {
      var circle = svgEl("circle", {
        cx: String(pt.x),
        cy: String(pt.y),
        class: "chart-point-circle",
        tabindex: "0",
        role: "button",
        "aria-label": pt.label + ": " + formatNumber(pt.value) + " " + metricLabel,
        style: "cursor: pointer; outline: none;"
      });

      function showTooltip(isFocus) {
        circle.classList.add("active");
        if (isFocus) {
          circle.classList.add("active-focus");
        } else {
          circle.classList.remove("active-focus");
        }
        
        var tooltip = document.getElementById("chart-tooltip");
        if (!tooltip) {
          tooltip = el("div", { id: "chart-tooltip", class: "chart-tooltip" });
          document.body.appendChild(tooltip);
        }
        
        tooltip.innerHTML = "";
        tooltip.appendChild(el("div", "tooltip-title", pt.label));
        tooltip.appendChild(el("div", "tooltip-value", formatNumber(pt.value) + " " + metricLabel));
        
        tooltip.style.opacity = "1";
        tooltip.style.transform = "translate(-50%, -100%) scale(1)";
        
        var rect = circle.getBoundingClientRect();
        tooltip.style.left = (window.scrollX + rect.left + rect.width / 2) + "px";
        tooltip.style.top = (window.scrollY + rect.top - 8) + "px";
      }

      function hideTooltip() {
        circle.classList.remove("active");
        circle.classList.remove("active-focus");
        
        var tooltip = document.getElementById("chart-tooltip");
        if (tooltip) {
          tooltip.style.opacity = "0";
          tooltip.style.transform = "translate(-50%, -100%) scale(0.9)";
        }
      }

      circle.addEventListener("mouseenter", function () { showTooltip(false); });
      circle.addEventListener("mouseleave", hideTooltip);
      circle.addEventListener("focus", function () { showTooltip(true); });
      circle.addEventListener("blur", hideTooltip);
      circle.addEventListener("click", function (e) {
        e.preventDefault();
        circle.focus();
        showTooltip(true);
      });
      circle.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          showTooltip(true);
        }
      });

      return circle;
    });

    var activeTab = ctx.ui.activeAnalyticsTab || "trend";
    var displayContainer;

    if (activeTab === "retention") {
      var funnelData = calculateRetentionFunnel(active);
      if (funnelData.length === 0) {
        displayContainer = el("div", "analytics-empty-state", [
          el("span", "icon icon-lg icon-users"),
          el("p", null, "No reader data yet."),
          el("span", "analytics-empty-hint", "Retention data appears once your chapters have reads.")
        ]);
      } else {
        var funnelItems = funnelData.map(function (pt) {
          var barFill = el("div", { class: "retention-bar-fill", style: "width: " + pt.retention + "%;" });
          var barTrack = el("div", "retention-bar-track", [barFill]);
          
          var headerInfo = el("div", "retention-item-header", [
            el("span", "retention-item-title", pt.title),
            el("span", "retention-item-reads", formatNumber(pt.reads) + " reads")
          ]);

          var pctText = el("span", "retention-item-pct", pt.retention + "%");
          var rightPartChildren = [pctText];
          if (pt.highDropOff) {
            rightPartChildren.push(el("span", "badge-status draft retention-alert-badge", "⚠️ High drop-off (>20%)"));
          }
          var rightPart = el("div", "retention-item-right", rightPartChildren);

          var barRow = el("div", "retention-bar-row", [
            barTrack,
            rightPart
          ]);

          return el("div", "retention-item", [
            headerInfo,
            barRow
          ]);
        });
        
        displayContainer = el("div", "analytics-retention-list", funnelItems);
      }

    } else if (activeTab === "genre") {
      var genreData = calculateGenreAverages(ctx.state.stories);
      if (genreData.length === 0) {
        displayContainer = el("div", "analytics-empty-state", [
          el("span", "icon icon-lg icon-book"),
          el("p", null, "No genre data available."),
          el("span", "analytics-empty-hint", "Publish stories to see genre comparisons.")
        ]);
      } else {
        var maxAvg = Math.max.apply(Math, genreData.map(function (g) { return g.avgViews; })) || 10;
        var barWidth = 30;
        var barGap = 20;
        var startX = 30;
        var chartContent = [];
        
        var genreGradientId = "genreChartGrad-" + Math.random().toString(36).substring(2, 9);
        var genreGradient = svgEl("linearGradient", { id: genreGradientId, x1: "0", y1: "0", x2: "0", y2: "1" }, [
          svgEl("stop", { offset: "0%", "stop-color": "#f36b15", "stop-opacity": "0.8" }),
          svgEl("stop", { offset: "100%", "stop-color": "#f36b15", "stop-opacity": "0.2" })
        ]);
        var defaultGradientId = "defaultGenreGrad-" + Math.random().toString(36).substring(2, 9);
        var defaultGradient = svgEl("linearGradient", { id: defaultGradientId, x1: "0", y1: "0", x2: "0", y2: "1" }, [
          svgEl("stop", { offset: "0%", "stop-color": "rgba(255,255,255,0.2)", "stop-opacity": "0.6" }),
          svgEl("stop", { offset: "100%", "stop-color": "rgba(255,255,255,0.05)", "stop-opacity": "0.1" })
        ]);
        
        chartContent.push(svgEl("defs", null, [genreGradient, defaultGradient]));
        
        genreData.slice(0, 5).forEach(function (g, idx) {
          var isActiveGenre = (active.genre && g.genre.toLowerCase() === active.genre.toLowerCase());
          var barHeight = (g.avgViews / maxAvg) * 60;
          var x = startX + idx * (barWidth + barGap);
          var y = 80 - barHeight;
          
          var rect = svgEl("rect", {
            x: String(x),
            y: String(y),
            width: String(barWidth),
            height: String(barHeight),
            rx: "4",
            class: isActiveGenre ? "genre-bar-active" : "genre-bar-inactive",
            fill: "url(#" + (isActiveGenre ? genreGradientId : defaultGradientId) + ")",
            "stroke-width": isActiveGenre ? "2" : "1"
          });
          
          var valText = svgEl("text", {
            x: String(x + barWidth / 2),
            y: String(y - 6),
            "text-anchor": "middle",
            fill: isActiveGenre ? "#f36b15" : "var(--text-muted)",
            "font-size": "7",
            "font-weight": isActiveGenre ? "bold" : "normal"
          }, [formatNumber(g.avgViews)]);
          
          var labelText = svgEl("text", {
            x: String(x + barWidth / 2),
            y: "92",
            "text-anchor": "middle",
            fill: isActiveGenre ? "#f36b15" : "var(--text)",
            "font-size": "7",
            "font-weight": isActiveGenre ? "bold" : "normal"
          }, [g.genre + (isActiveGenre ? " ★" : "")]);
          
          chartContent.push(rect, valText, labelText);
        });
        
        chartContent.push(svgEl("line", { x1: "10", y1: "80", x2: "290", y2: "80", class: "chart-axis-line" }));
        
        var genreSvg = svgEl("svg", {
          viewBox: "0 0 300 100",
          class: "svg-chart"
        }, chartContent);
        
        displayContainer = el("div", "svg-chart-container", [genreSvg]);
      }

    } else {
      if (ptsData.length === 0) {
        displayContainer = el("div", "analytics-empty-state", [
          el("span", "icon icon-lg icon-eye"),
          el("p", null, "No chapter data to chart yet."),
          el("span", "analytics-empty-hint", "Add chapters with reads to see the trend chart.")
        ]);
      } else {
        var chartSvg = svgEl("svg", {
          viewBox: "0 0 300 100",
          class: "svg-chart"
        }, [defs, grid1, grid2, grid3, areaPath, linePath].concat(pts));

        displayContainer = el("div", "svg-chart-container", [chartSvg]);
      }
    }



    // Metric cards — real data only, no fabricated trends
    var viewsBox = analyticsMetricBox("Views", formatNumber(active.views), "All-time total");
    viewsBox.classList.add("interactive");
    viewsBox.setAttribute("tabindex", "0");
    viewsBox.setAttribute("role", "button");
    viewsBox.setAttribute("aria-label", "Show reads per chapter chart");
    if (activeMetric === "reads") viewsBox.classList.add("active");
    viewsBox.addEventListener("click", function () {
      ctx.ui.activeChartMetric = "reads";
      ctx.render();
    });
    viewsBox.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        viewsBox.click();
      }
    });

    var likesBox = analyticsMetricBox("Likes", formatNumber(active.likes), "All-time total");
    likesBox.classList.add("interactive");
    likesBox.setAttribute("tabindex", "0");
    likesBox.setAttribute("role", "button");
    likesBox.setAttribute("aria-label", "Show likes per chapter chart");
    if (activeMetric === "likes") likesBox.classList.add("active");
    likesBox.addEventListener("click", function () {
      ctx.ui.activeChartMetric = "likes";
      ctx.render();
    });
    likesBox.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        likesBox.click();
      }
    });

    var totalWords = active.chapters.reduce(function (sum, ch) { return sum + (ch.words || 0); }, 0);
    var wordsBox = analyticsMetricBox("Word Count", formatNumber(totalWords), active.chapters.length + " chapters");
    wordsBox.classList.add("interactive");
    wordsBox.setAttribute("tabindex", "0");
    wordsBox.setAttribute("role", "button");
    wordsBox.setAttribute("aria-label", "Show words per chapter chart");
    if (activeMetric === "words") wordsBox.classList.add("active");
    wordsBox.addEventListener("click", function () {
      ctx.ui.activeChartMetric = "words";
      ctx.render();
    });
    wordsBox.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        wordsBox.click();
      }
    });

    var followersBox = analyticsMetricBox("Followers", formatNumber(active.followers), "All-time total");

    var totalChapters = active.chapters.length;
    var chaptersBox = analyticsMetricBox("Total Chapters", formatNumber(totalChapters), totalChapters > 0 ? (active.chapters.filter(function(c) { return c.status === 'published'; }).length + " published") : "None yet");

    var engagementVal = active.views > 0 ? ((active.likes / active.views) * 100).toFixed(1) + "%" : "—";
    var engagementBox = analyticsMetricBox("Engagement", engagementVal, active.views > 0 ? "Likes / Views" : "No views yet");

    // Analytics sub-tabs switcher
    var tabTrendBtn = el("button", "analytics-tab-btn" + (activeTab === "trend" ? " active" : ""), "Metrics Trend");
    tabTrendBtn.addEventListener("click", function () {
      ctx.ui.activeAnalyticsTab = "trend";
      ctx.render();
    });

    var tabRetentionBtn = el("button", "analytics-tab-btn" + (activeTab === "retention" ? " active" : ""), "Reader Retention");
    tabRetentionBtn.addEventListener("click", function () {
      ctx.ui.activeAnalyticsTab = "retention";
      ctx.render();
    });

    var tabGenreBtn = el("button", "analytics-tab-btn" + (activeTab === "genre" ? " active" : ""), "Genre Analytics");
    tabGenreBtn.addEventListener("click", function () {
      ctx.ui.activeAnalyticsTab = "genre";
      ctx.render();
    });

    var tabsSwitcher = el("div", "analytics-tabs-switcher", [
      tabTrendBtn,
      tabRetentionBtn,
      tabGenreBtn
    ]);

    // Analytics Overview Card with SVG Chart or sub-list
    var analyticsPanel = el("section", "panel", [
      el("h2", null, "Analytics Overview"),
      
      el("div", "analytics-grid", [
        viewsBox,
        likesBox,
        wordsBox,
        followersBox,
        chaptersBox,
        engagementBox
      ]),
      
      tabsSwitcher,
      displayContainer
    ]);
    rightColumnChildren.push(analyticsPanel);
  }

  // Quick Actions Panel
  var actionsGrid = [
    quickActionTile("icon-pencil", "New Chapter", "newChapter"),
    quickActionTile("icon-document", "Quick Draft", "quickDraft"),
    quickActionTile("icon-book", "Story Notes", "storyNotes"),
    quickActionTile("icon-image", "Upload Cover", "uploadCover")
  ];
  if (active && active.cover && !active.cover.startsWith("linear-gradient") && !active.cover.startsWith("radial-gradient")) {
    actionsGrid.push(quickActionTile("icon-trash", "Delete Cover", "deleteCover"));
  }

  var quickActionsPanel = el("section", "panel", [
    el("h2", null, "Quick Actions"),
    el("div", "quick-actions-grid", actionsGrid)
  ]);
  rightColumnChildren.push(quickActionsPanel);

  // 4. Assemble main layout
  var gridLayout = el("div", "studio-grid-layout", [
    el("div", "studio-main", middleColumnChildren),
    el("div", "studio-aside", rightColumnChildren)
  ]);

  ctx.view.appendChild(gridLayout);
}
