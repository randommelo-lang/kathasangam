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
        parentName: null
      };
    }
  } else if (targetType === "chapter") {
    for (var i = 0; i < ctx.state.stories.length; i++) {
      var story = ctx.state.stories[i];
      if (story.chapters) {
        var chapter = story.chapters.find(function (c) { return c.id === targetId; });
        if (chapter) {
          return {
            name: chapter.title,
            link: "#story?id=" + story.id,
            parentName: story.title
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
                name: '"' + comment.text + '" (by ' + comment.user + ')',
                link: "#story?id=" + story.id,
                parentName: story.title + " > " + chapter.title
              };
            }
          }
        }
      }
    }
  }
  return null;
}

function renderReviewQueue(ctx, canMod) {
  var filter = ctx.ui.reportFilter || "open";
  var reports = ctx.state.reports || [];
  
  var filteredReports = reports.filter(function (r) {
    if (filter === "all") return true;
    return r.status === filter;
  });
  
  var filterTabs = el("div", "segmented-controls moderation-filter-tabs", [
    button("All", filter === "all" ? "btn active" : "btn", { action: "setReportFilter", value: "all" }),
    button("Open", filter === "open" ? "btn active" : "btn", { action: "setReportFilter", value: "open" }),
    button("Escalated", filter === "escalated" ? "btn active" : "btn", { action: "setReportFilter", value: "escalated" }),
    button("Resolved", filter === "resolved" ? "btn active" : "btn", { action: "setReportFilter", value: "resolved" })
  ]);

  var listContent;
  if (filteredReports.length) {
    listContent = list(filteredReports, "report-list", function (r) {
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

      return el("li", "report-item", [
        targetEl,
        el("div", "report-reason", r.reason),
        el("div", "report-badge-row", [
          el("span", "report-badge severity-" + r.severity, r.severity),
          el("span", "report-badge status-" + r.status, r.status)
        ]),
        showButtons ? el("div", "button-row", [
          button("Resolve", "btn success", { action: "resolveReport", id: r.id }, !canMod),
          button("Escalate", "btn warn", { action: "escalateReport", id: r.id }, !canMod)
        ]) : null
      ].filter(Boolean));
    });
  } else {
    listContent = el("div", "empty", "No reports found for this status.");
  }

  return el("div", "moderation-queue-container", [
    el("div", "toolbar", [
      el("h2", null, "Review Queue"),
      filterTabs
    ]),
    listContent
  ]);
}

function renderAuditLogs(ctx) {
  var logs = ctx.state.auditLogs || [];
  if (!logs.length) {
    return el("div", "empty", "No audit logs found.");
  }
  
  return el("div", "audit-logs-container panel", [
    el("h2", null, "Moderator Audit Logs"),
    el("div", "audit-table-wrapper", [
      el("table", "audit-logs-table", [
        el("thead", null, [
          el("tr", null, [
            el("th", null, "Moderator"),
            el("th", null, "Action"),
            el("th", null, "Target Context"),
            el("th", null, "Date")
          ])
        ]),
        el("tbody", null, logs.map(function (log) {
          var actionText = log.action;
          if (log.details && log.details.new_status) {
            actionText = "Changed status to " + log.details.new_status;
          }
          
          var dateStr = log.created_at ? formatDate(log.created_at) : "recently";
          
          var targetInfo = log.target_type;
          if (log.details && log.details.target_type && log.details.target_id) {
            var targetCtx = findReportTargetContext(ctx, log.details.target_type, log.details.target_id);
            if (targetCtx) {
              targetInfo = log.details.target_type.toUpperCase() + ": " + targetCtx.name;
            } else {
              targetInfo = log.details.target_type.toUpperCase() + ": " + log.details.target_id;
            }
          }
          
          return el("tr", null, [
            el("td", "log-moderator", log.moderator_name || log.moderator_id || "System"),
            el("td", "log-action", actionText),
            el("td", "log-target", targetInfo),
            el("td", "log-date", dateStr)
          ]);
        }))
      ])
    ])
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
        el("h2", null, "Guidelines"),
        list([
          "No harassment, hate, doxxing, or threats.",
          "No piracy, plagiarism, or unauthorized uploads.",
          "Sensitive content must be tagged before publication.",
          "Moderation actions are logged for appeal review."
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
