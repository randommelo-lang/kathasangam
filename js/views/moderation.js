import { button, el, list, formatDate } from "../components.js";

function findReportTargetContext(ctx, targetType, targetId) {
  if (!ctx.state.stories) return null;
  targetType = String(targetType || "").toLowerCase();
  
  if (targetType === "story") {
    var story = ctx.state.stories.find(function (s) { return s.id === targetId; });
    if (story) {
      return {
        name: story.title,
        link: "#story?id=" + story.id,
        parentName: null,
        preview: story.description || "No description provided.",
        authorId: story.author_id
      };
    }
  } else if (targetType === "chapter") {
    for (var i = 0; i < ctx.state.stories.length; i++) {
      var story = ctx.state.stories[i];
      if (story.chapters) {
        var chapter = story.chapters.find(function (c) { return c.id === targetId; });
        if (chapter) {
          var previewText = "";
          if (chapter.content && chapter.content.length) {
            previewText = chapter.content.slice(0, 3).join("\n\n");
            if (chapter.content.length > 3) {
              previewText += "\n\n...";
            }
          } else if (chapter.pages && chapter.pages.length) {
            previewText = "[Comic Chapter: " + chapter.pages.length + " pages]";
          } else {
            previewText = "Empty chapter content.";
          }
          return {
            name: chapter.title,
            link: "#story?id=" + story.id,
            parentName: story.title,
            preview: previewText,
            authorId: story.author_id
          };
        }
      }
    }
  } else if (targetType === "comment") {
    for (var i = 0; i < ctx.state.stories.length; i++) {
      var story = ctx.state.stories[i];
      if (story.chapters) {
        for (var j = 0; j < story.chapters.length; j++) {
          var chapter = story.chapters[j];
          if (chapter.comments) {
            var comment = chapter.comments.find(function (com) { return com.id === targetId; });
            if (comment) {
              return {
                name: "Comment by " + comment.user,
                link: "#story?id=" + story.id,
                parentName: story.title + " > " + chapter.title,
                preview: comment.text,
                authorId: comment.user_id
              };
            }
          }
        }
      }
    }
  }
  return null;
}

function renderPagination(currentPage, totalItems, limit, pageChangeAction) {
  var totalPages = Math.ceil(totalItems / limit);
  if (totalPages <= 1) return null;

  var buttons = [];
  
  var prevBtn = el("button", { 
    class: "pagination-btn", 
    "data-action": pageChangeAction, 
    "data-page": currentPage - 1, 
    disabled: currentPage === 1 
  }, "◀ Prev");
  buttons.push(prevBtn);

  for (var i = 1; i <= totalPages; i++) {
    var pageBtn = el("button", {
      class: "pagination-btn" + (i === currentPage ? " active" : ""),
      "data-action": pageChangeAction,
      "data-page": i,
      disabled: i === currentPage
    }, String(i));
    buttons.push(pageBtn);
  }

  var nextBtn = el("button", {
    class: "pagination-btn",
    "data-action": pageChangeAction,
    "data-page": currentPage + 1,
    disabled: currentPage === totalPages
  }, "Next ▶");
  buttons.push(nextBtn);

  return el("div", "pagination-container", buttons);
}

function renderReviewQueue(ctx, canMod) {
  var filter = ctx.ui.reportFilter || "open";
  var reportsObj = ctx.state.reports || { items: [], total: 0 };
  var reports = reportsObj.items || [];
  var totalReports = reportsObj.total || 0;
  var reportsPage = ctx.ui.reportsPage || 1;
  var limit = ctx.ui.reportsLimit || 5;
  
  var filterTabs = el("div", "segmented-controls moderation-filter-tabs", [
    button("All", filter === "all" ? "btn active" : "btn", { action: "setReportFilter", value: "all" }),
    button("Open", filter === "open" ? "btn active" : "btn", { action: "setReportFilter", value: "open" }),
    button("Escalated", filter === "escalated" ? "btn active" : "btn", { action: "setReportFilter", value: "escalated" }),
    button("Resolved", filter === "resolved" ? "btn active" : "btn", { action: "setReportFilter", value: "resolved" })
  ]);

  var filterBar = el("div", "moderation-filter-bar searchbar", [
    el("input", {
      type: "text",
      id: "queue-search-input",
      placeholder: "Search by reason or title...",
      value: ctx.ui.reportSearch || "",
      "data-action": "changeSearch"
    }),
    el("select", {
      id: "queue-type-select",
      "data-action": "changeTargetType"
    }, [
      el("option", { value: "all", selected: (ctx.ui.reportTargetType || "all") === "all" }, "All Types"),
      el("option", { value: "story", selected: ctx.ui.reportTargetType === "story" }, "Stories"),
      el("option", { value: "chapter", selected: ctx.ui.reportTargetType === "chapter" }, "Chapters"),
      el("option", { value: "comment", selected: ctx.ui.reportTargetType === "comment" }, "Comments")
    ]),
    el("select", {
      id: "queue-severity-select",
      "data-action": "changeSeverity"
    }, [
      el("option", { value: "all", selected: (ctx.ui.reportSeverity || "all") === "all" }, "All Severities"),
      el("option", { value: "low", selected: ctx.ui.reportSeverity === "low" }, "Low"),
      el("option", { value: "medium", selected: ctx.ui.reportSeverity === "medium" }, "Medium"),
      el("option", { value: "high", selected: ctx.ui.reportSeverity === "high" }, "High")
    ]),
    el("select", {
      id: "queue-sort-select",
      "data-action": "changeSort"
    }, [
      el("option", { value: "newest", selected: (ctx.ui.reportSort || "newest") === "newest" }, "Newest First"),
      el("option", { value: "oldest", selected: ctx.ui.reportSort === "oldest" }, "Oldest First")
    ]),
    (ctx.ui.reportSearch || (ctx.ui.reportTargetType && ctx.ui.reportTargetType !== "all") || (ctx.ui.reportSeverity && ctx.ui.reportSeverity !== "all") || (ctx.ui.reportSort && ctx.ui.reportSort !== "newest")) ? 
      button("Reset", "btn btn-sm secondary-btn reset-filters-btn", { action: "resetReportFilters" }) : null
  ].filter(Boolean));

  var selectedReports = ctx.ui.selectedReports || {};
  var selectedIds = Object.keys(selectedReports).filter(function (id) {
    return selectedReports[id];
  });

  var bulkActionBar = null;
  if (selectedIds.length > 0) {
    bulkActionBar = el("div", "bulk-action-bar panel", [
      el("span", "selected-count", selectedIds.length + " report(s) selected"),
      el("div", "bulk-buttons", [
        button("Batch Resolve", "btn success btn-sm", { action: "bulkResolvePrompt" }),
        button("Batch Escalate", "btn warn btn-sm", { action: "bulkEscalatePrompt" }),
        button("Clear Selection", "btn secondary btn-sm", { action: "clearSelection" })
      ])
    ]);
  }

  var listContent;
  if (reports.length) {
    listContent = el("div", null, [
      bulkActionBar,
      list(reports, "report-list", function (r) {
        var targetCtx = findReportTargetContext(ctx, r.target_type, r.target_id);
        var targetEl;
        if (targetCtx) {
          targetEl = el("a", { class: "report-target-link", href: targetCtx.link }, [
            el("strong", null, r.target_type.toUpperCase() + ": " + targetCtx.name),
            targetCtx.parentName ? el("span", "report-target-parent", " (under " + targetCtx.parentName + ")") : null
          ].filter(Boolean));
        } else {
          targetEl = el("span", "report-target-fallback", r.target_type.toUpperCase() + ": " + r.target_id + " (Content unavailable)");
        }

        var showButtons = r.status === "open";

        var isExpanded = ctx.ui.expandedReports && ctx.ui.expandedReports[r.id];
        var previewEl = null;
        if (targetCtx && targetCtx.preview && isExpanded) {
          previewEl = el("div", "report-content-preview", [
            el("div", "preview-header", "Reported Content Preview"),
            el("pre", "preview-body", targetCtx.preview)
          ]);
        }

        var isChecked = !!selectedReports[r.id];
        var checkboxWrapper = null;
        if (canMod && showButtons) {
          checkboxWrapper = el("div", "report-checkbox-wrapper", [
            el("input", {
              type: "checkbox",
              class: "report-select-checkbox",
              "data-id": r.id,
              checked: isChecked,
              "data-action": "toggleSelectReport"
            })
          ]);
        }

        var itemContent = el("div", "report-item-content", [
          targetEl,
          el("div", "report-reason", [
            el("strong", null, "Reason: "),
            el("span", null, r.reason)
          ]),
          el("div", "report-reporter", [
            el("strong", null, (r.report_count > 1 ? "Reporters: " : "Reporter: ")),
            el("span", null, r.reporter_username || "Anonymous")
          ]),
          el("div", "report-badge-row", [
            r.status === "open" ? el("select", { class: "report-severity-select", "data-id": r.id, "data-action": "changeReportSeverity", disabled: !canMod }, [
              el("option", { value: "low", selected: r.severity === "low" }, "Low"),
              el("option", { value: "medium", selected: r.severity === "medium" }, "Medium"),
              el("option", { value: "high", selected: r.severity === "high" }, "High")
            ]) : el("span", "report-badge severity-" + r.severity, r.severity),
            el("span", "report-badge status-" + r.status, r.status),
            el("span", "report-count-badge", (r.report_count || 1) + " report" + ((r.report_count || 1) > 1 ? "s" : "")),
            targetCtx && targetCtx.preview ? button(isExpanded ? "Hide Preview ▲" : "Show Preview ▼", "btn btn-sm text-btn", { action: "toggleReportPreview", id: r.id }) : null
          ].filter(Boolean)),
          previewEl,
          showButtons ? el("div", "button-row", [
            button("Resolve", "btn success", { action: "resolveReport", id: r.id }, !canMod),
            button("Escalate", "btn warn", { action: "escalateReport", id: r.id }, !canMod),
            button("Remove Content", "btn danger", { action: "removeReportedContent", id: r.id, targetType: r.target_type, targetId: r.target_id }, !canMod),
            targetCtx && targetCtx.authorId && targetCtx.authorId !== ctx.state.user.id ? button("Ban User", "btn danger", { action: "banUserPrompt", authorId: targetCtx.authorId, authorName: targetCtx.name }, !canMod) : null
          ].filter(Boolean)) : null
        ].filter(Boolean));

        return el("li", "report-item", [
          checkboxWrapper,
          itemContent
        ].filter(Boolean));
      }),
      renderPagination(reportsPage, totalReports, limit, "changeReportsPage")
    ].filter(Boolean));
  } else {
    listContent = el("div", "empty", "No reports found.");
  }

  return el("div", "moderation-queue-container", [
    el("div", "toolbar", [
      el("h2", null, "Review Queue"),
      filterTabs
    ]),
    filterBar,
    listContent
  ]);
}

function getAuditActionClass(action, details) {
  var actionStr = String(action || "").toLowerCase();
  var newStatus = String((details && details.new_status) || "").toLowerCase();
  
  if (actionStr === "status_update_resolved" || newStatus === "resolved" || actionStr.includes("resolve") || actionStr.includes("approve")) {
    return "audit-resolved";
  }
  if (actionStr === "status_update_escalated" || newStatus === "escalated" || actionStr === "severity_update" || actionStr === "auto_scan_escalation" || actionStr.includes("escalat") || actionStr.includes("severity")) {
    return "audit-escalated";
  }
  if (actionStr.includes("delete") || actionStr.includes("ban") || actionStr.includes("remove")) {
    return "audit-destructive";
  }
  return "audit-info";
}

function formatAuditDate(v) {
  if (!v) return "recently";
  var d = new Date(v);
  if (isNaN(d.getTime())) return "recently";
  var day = String(d.getDate()).padStart(2, '0');
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var year = d.getFullYear();
  var hours = String(d.getHours()).padStart(2, '0');
  var minutes = String(d.getMinutes()).padStart(2, '0');
  return day + "-" + month + "-" + year + " " + hours + ":" + minutes;
}

function renderAuditLogsFilterBar(ctx) {
  var activeMod = ctx.ui.auditLogModeratorId || "all";
  var activeAction = ctx.ui.auditLogAction || "all";
  var activeStart = ctx.ui.auditLogStartDate || "";
  var activeEnd = ctx.ui.auditLogEndDate || "";

  var moderators = ctx.state.logModerators || [];
  
  var modOptions = [
    el("option", { value: "all" }, "All Moderators")
  ];
  moderators.forEach(function (m) {
    modOptions.push(el("option", { value: m.id }, m.username));
  });
  
  var modSelect = el("select", {
    "data-action": "changeAuditLogModerator",
    id: "audit-moderator-select"
  }, modOptions);
  modSelect.value = activeMod;

  var actionOptions = [
    el("option", { value: "all" }, "All Action Types"),
    el("option", { value: "ban_user" }, "Ban User"),
    el("option", { value: "severity_update" }, "Update Severity"),
    el("option", { value: "status_update_resolved" }, "Resolve Report"),
    el("option", { value: "status_update_escalated" }, "Escalate Report"),
    el("option", { value: "delete_story" }, "Delete Story"),
    el("option", { value: "delete_chapter" }, "Delete Chapter"),
    el("option", { value: "delete_comment" }, "Delete Comment")
  ];
  var actionSelect = el("select", {
    "data-action": "changeAuditLogAction",
    id: "audit-action-select"
  }, actionOptions);
  actionSelect.value = activeAction;

  var startInput = el("input", {
    type: "date",
    "data-action": "changeAuditLogStartDate",
    id: "audit-start-date-input",
    value: activeStart
  });

  var endInput = el("input", {
    type: "date",
    "data-action": "changeAuditLogEndDate",
    id: "audit-end-date-input",
    value: activeEnd
  });

  var hasFilters = (activeMod !== "all") || (activeAction !== "all") || activeStart || activeEnd;
  var resetBtn = hasFilters ? button("Reset", "btn btn-sm secondary-btn reset-filters-btn", { action: "resetAuditLogFilters" }) : null;

  return el("div", "audit-logs-filter-bar searchbar", [
    modSelect,
    actionSelect,
    startInput,
    endInput,
    resetBtn
  ].filter(Boolean));
}

function renderAuditLogs(ctx) {
  var logsObj = ctx.state.auditLogs || { items: [], total: 0 };
  var logs = logsObj.items || [];
  var totalLogs = logsObj.total || 0;
  var logsPage = ctx.ui.auditLogsPage || 1;
  var limit = ctx.ui.auditLogsLimit || 10;

  var filterBar = renderAuditLogsFilterBar(ctx);
  var listContent;

  if (!logs.length) {
    listContent = el("div", "empty", "No audit logs found.");
  } else {
    var itemsList = list(logs, "report-list", function (log) {
      var actionText = log.action;
      if (log.details && log.details.new_status) {
        actionText = "Changed status to " + log.details.new_status;
      } else if (log.action === "auto_scan_escalation") {
        actionText = "Auto-scan: Escalated to high severity";
      }
      
      if (actionText && actionText.includes("_")) {
        actionText = actionText.replace(/_/g, " ");
        actionText = actionText.charAt(0).toUpperCase() + actionText.slice(1);
      }

      var dateStr = log.created_at ? formatAuditDate(log.created_at) : "recently";
      
      var targetInfo = log.target_type;
      var targetLinkEl = null;
      if (log.details && log.details.target_type && log.details.target_id) {
        var targetCtx = findReportTargetContext(ctx, log.details.target_type, log.details.target_id);
        if (targetCtx) {
          targetLinkEl = el("a", { class: "report-target-link", href: targetCtx.link }, 
            log.details.target_type.toUpperCase() + ": " + targetCtx.name
          );
        } else {
          targetLinkEl = el("span", "report-target-fallback", 
            log.details.target_type.toUpperCase() + ": " + log.details.target_id + " (Content unavailable)"
          );
        }
      } else {
        targetLinkEl = el("span", "report-target-fallback", 
          String(log.target_type).toUpperCase() + ": " + log.target_id
        );
      }

      var noteText = (log.details && log.details.note) ? log.details.note : "";
      var auditClass = getAuditActionClass(log.action, log.details);

      return el("div", "report-item audit-log-item " + auditClass, [
        el("div", "audit-header", [
          el("span", "audit-moderator", [
            el("strong", null, "Moderator: "),
            el("span", null, log.moderator_name || log.moderator_id || "System")
          ]),
          el("span", "audit-date", dateStr)
        ]),
        el("div", "audit-action-row", [
          el("span", "report-badge audit-badge " + auditClass, actionText),
          targetLinkEl
        ]),
        noteText ? el("div", "audit-note", [
          el("strong", null, "Note: "),
          el("span", null, noteText)
        ]) : null
      ].filter(Boolean));
    });

    listContent = el("div", "audit-logs-list-wrapper", [
      itemsList,
      renderPagination(logsPage, totalLogs, limit, "changeLogsPage")
    ]);
  }

  return el("div", "audit-logs-container panel", [
    el("h2", null, "Moderator Audit Logs"),
    filterBar,
    listContent
  ]);
}

export function renderModeration(ctx) {
  ctx = ctx || this;
  var canMod = ctx.canModerateRole();
  
  var activeTab = ctx.ui.activeModerationTab || "queue";
  var topTabSwitcher = el("div", "studio-tabs moderation-tabs", [
    button("Review Queue", activeTab === "queue" ? "btn active" : "btn", { action: "setModerationTab", value: "queue" }),
    button("Audit Logs", activeTab === "logs" ? "btn active" : "btn", { action: "setModerationTab", value: "logs" })
  ]);

  var mainContent;
  if (activeTab === "logs") {
    mainContent = renderAuditLogs(ctx);
  } else {
    mainContent = el("section", "panel", [
      renderReviewQueue(ctx, canMod)
    ]);
  }

  ctx.view.appendChild(el("div", "layout-two", [
    el("div", "moderation-main-content", [
      topTabSwitcher,
      mainContent
    ]),
    el("aside", null, [
      el("section", "panel", [
        el("h2", null, "Rules & Guidelines"),
        list([
          "Don't use AI as your Final product. AI tools are permitted for brainstorming and outlining, but all final prose, dialogue, and artwork must be human-crafted.",
          "No piracy, plagiarism, or unauthorized distribution of intellectual property. All uploaded works must be original or appropriately licensed.",
          "No harassment, hate speech, doxxing, threats, or abusive conduct toward any community member.",
          "Sensitive or mature content must be marked as NSFW using the story creation form. NSFW stories are blurred or hidden for underage users and guests.",
          "All moderation actions (removals, warnings, bans) are audited and logged. Users can submit appeals for review."
        ], "activity-list", function (t) {
          return el("li", "activity-item", t);
        })
      ]),
      el("section", "panel", [
        el("h2", null, "Content controls"),
        el("div", "button-row", [
          button("Run text scan", "btn", { action: "scan" }),
          button("Export queue", "btn", { action: "exportQueue" })
        ])
      ])
    ])
  ]));
}
