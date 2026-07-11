function fetchReportsPage(ctx) {
  var filter = ctx.ui.reportFilter || "open";
  var page = ctx.ui.reportsPage || 1;
  var limit = ctx.ui.reportsLimit || 5;
  var offset = (page - 1) * limit;
  var search = ctx.ui.reportSearch || "";
  var sort = ctx.ui.reportSort || "newest";
  var targetType = ctx.ui.reportTargetType || "all";
  var severity = ctx.ui.reportSeverity || "all";

  var url = "/reports?status=" + encodeURIComponent(filter) +
            "&limit=" + limit +
            "&offset=" + offset +
            "&search=" + encodeURIComponent(search) +
            "&sort=" + encodeURIComponent(sort) +
            "&target_type=" + encodeURIComponent(targetType) +
            "&severity=" + encodeURIComponent(severity);

  return Promise.all([
    ctx.api(url),
    ctx.api("/stats").catch(function () { return { published: 0, views: 0, followers: 0, open_reports: 0 }; })
  ]).then(function (results) {
    var reps = results[0];
    var stats = results[1];
    ctx.state.stats = stats;

    var repsArray = (reps && reps.items) || [];
    repsArray.items = repsArray;
    repsArray.total = (reps && reps.total) || repsArray.length;
    ctx.state.reports = repsArray;
    ctx.render();
  });
}

function fetchLogsPage(ctx) {
  var page = ctx.ui.auditLogsPage || 1;
  var limit = ctx.ui.auditLogsLimit || 10;
  var offset = (page - 1) * limit;

  var url = "/reports/logs?limit=" + limit + "&offset=" + offset;
  if (ctx.ui.auditLogModeratorId && ctx.ui.auditLogModeratorId !== "all") {
    url += "&moderator_id=" + encodeURIComponent(ctx.ui.auditLogModeratorId);
  }
  if (ctx.ui.auditLogAction && ctx.ui.auditLogAction !== "all") {
    url += "&action=" + encodeURIComponent(ctx.ui.auditLogAction);
  }
  if (ctx.ui.auditLogStartDate) {
    url += "&start_date=" + encodeURIComponent(ctx.ui.auditLogStartDate);
  }
  if (ctx.ui.auditLogEndDate) {
    url += "&end_date=" + encodeURIComponent(ctx.ui.auditLogEndDate);
  }



  var moderatorsPromise = ctx.state.logModerators 
    ? Promise.resolve(ctx.state.logModerators)
    : ctx.api("/reports/logs/moderators").catch(function () { return []; });

  return Promise.all([
    ctx.api(url),
    moderatorsPromise
  ]).then(function (results) {
    ctx.state.auditLogs = results[0];
    ctx.state.logModerators = results[1];
    ctx.render();
  });
}

export function handleModerationClick(ctx, action, target, e) {
  if (action === "toggleSelectReport") {
    var reportId = target.dataset.id;
    if (!ctx.ui.selectedReports) {
      ctx.ui.selectedReports = {};
    }
    ctx.ui.selectedReports[reportId] = !ctx.ui.selectedReports[reportId];
    ctx.render();
    return true;
  }

  if (action === "clearSelection") {
    ctx.ui.selectedReports = {};
    ctx.render();
    return true;
  }

  if (action === "bulkResolvePrompt" || action === "bulkEscalatePrompt") {
    var newStatus = action === "bulkResolvePrompt" ? "resolved" : "escalated";
    var selectedReports = ctx.ui.selectedReports || {};
    var selectedIds = Object.keys(selectedReports).filter(function (id) {
      return selectedReports[id];
    });

    if (selectedIds.length === 0) {
      ctx.notify("No reports selected.");
      return true;
    }

    var modal = document.getElementById("modNoteModal");
    var form = document.getElementById("modNoteForm");
    var reportIdInput = document.getElementById("modNoteReportId");
    var actionInput = document.getElementById("modNoteAction");
    var noteInput = document.getElementById("modNoteInput");
    var textEl = document.getElementById("modNoteText");
    var cancelBtn = document.getElementById("modNoteCancelBtn");
    var closeBtn = document.getElementById("modNoteClose");
    var submitBtn = document.getElementById("modNoteSubmitBtn");

    if (!modal || !form) {
      // Fallback: submit without note if modal elements are missing
      ctx.apiPost("/reports/bulk", { ids: selectedIds, status: newStatus }).then(function (r) {
        ctx.ui.selectedReports = {};
        ctx.notify(r.message);
        return fetchReportsPage(ctx);
      });
      return true;
    }

    reportIdInput.value = ""; // Not a single report
    actionInput.value = newStatus;
    noteInput.value = "";
    textEl.textContent = "You are about to mark " + selectedIds.length + " report(s) as \"" + newStatus + "\" in bulk. You may add an optional note that will be recorded in their audit logs.";
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm";
    submitBtn.className = newStatus === "resolved" ? "btn success" : "btn warn";

    modal.hidden = false;

    function cleanup() {
      form.removeEventListener("submit", onSubmit);
      cancelBtn.removeEventListener("click", onClose);
      closeBtn.removeEventListener("click", onClose);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onEscape);
    }

    function closeModal() {
      modal.hidden = true;
      cleanup();
    }

    function onClose() { closeModal(); }
    function onBackdrop(ev) { if (ev.target === modal) closeModal(); }
    function onEscape(ev) { if (ev.key === "Escape") closeModal(); }

    function onSubmit(ev) {
      ev.preventDefault();
      var note = noteInput.value.trim();
      submitBtn.disabled = true;
      submitBtn.textContent = newStatus === "resolved" ? "Resolving bulk…" : "Escalating bulk…";

      var payload = { ids: selectedIds, status: newStatus };
      if (note) payload.note = note;

      ctx.apiPost("/reports/bulk", payload)
        .then(function (r) {
          closeModal();
          ctx.ui.selectedReports = {};
          ctx.notify(r.message);
          return fetchReportsPage(ctx);
        })
        .catch(function (err) {
          console.error(err);
          ctx.notify(err.message || "Failed to update reports.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Confirm";
        });
    }

    form.addEventListener("submit", onSubmit);
    cancelBtn.addEventListener("click", onClose);
    closeBtn.addEventListener("click", onClose);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onEscape);

    return true;
  }

  if (action === "resolveReport" || action === "escalateReport") {
    var reportId = target.dataset.id;
    var newStatus = action === "resolveReport" ? "resolved" : "escalated";

    var modal = document.getElementById("modNoteModal");
    var form = document.getElementById("modNoteForm");
    var reportIdInput = document.getElementById("modNoteReportId");
    var actionInput = document.getElementById("modNoteAction");
    var noteInput = document.getElementById("modNoteInput");
    var textEl = document.getElementById("modNoteText");
    var cancelBtn = document.getElementById("modNoteCancelBtn");
    var closeBtn = document.getElementById("modNoteClose");
    var submitBtn = document.getElementById("modNoteSubmitBtn");

    if (!modal || !form) {
      // Fallback: submit without note if modal elements are missing
      ctx.apiPatch("/reports/" + reportId, { status: newStatus }).then(function (r) {
        ctx.notify(r.message);
        return fetchReportsPage(ctx);
      });
      return true;
    }

    reportIdInput.value = reportId;
    actionInput.value = newStatus;
    noteInput.value = "";
    textEl.textContent = "You are about to mark this report as \"" + newStatus + "\". You may add an optional note that will be recorded in the audit log.";
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm";
    submitBtn.className = newStatus === "resolved" ? "btn success" : "btn warn";

    modal.hidden = false;

    function cleanup() {
      form.removeEventListener("submit", onSubmit);
      cancelBtn.removeEventListener("click", onClose);
      closeBtn.removeEventListener("click", onClose);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onEscape);
    }

    function closeModal() {
      modal.hidden = true;
      cleanup();
    }

    function onClose() { closeModal(); }
    function onBackdrop(ev) { if (ev.target === modal) closeModal(); }
    function onEscape(ev) { if (ev.key === "Escape") closeModal(); }

    function onSubmit(ev) {
      ev.preventDefault();
      var note = noteInput.value.trim();
      submitBtn.disabled = true;
      submitBtn.textContent = newStatus === "resolved" ? "Resolving…" : "Escalating…";

      var payload = { status: newStatus };
      if (note) payload.note = note;

      ctx.apiPatch("/reports/" + reportId, payload)
        .then(function (r) {
          closeModal();
          ctx.notify(r.message);
          return fetchReportsPage(ctx);
        })
        .catch(function (err) {
          console.error(err);
          ctx.notify(err.message || "Failed to update report.");
          submitBtn.disabled = false;
          submitBtn.textContent = "Confirm";
        });
    }

    form.addEventListener("submit", onSubmit);
    cancelBtn.addEventListener("click", onClose);
    closeBtn.addEventListener("click", onClose);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onEscape);

    return true;
  }
  if (action === "removeReportedContent") {
    var reportId = target.dataset.id;
    var targetType = target.dataset.targetType;
    var targetId = target.dataset.targetId;

    var modal = document.getElementById("confirmDeleteModal");
    var confirmBtn = document.getElementById("confirmDeleteConfirmBtn");
    var cancelBtn = document.getElementById("confirmDeleteCancelBtn");
    var closeBtn = document.getElementById("confirmDeleteClose");
    var textEl = document.getElementById("confirmDeleteText");

    if (!modal || !confirmBtn || !cancelBtn || !closeBtn || !textEl) {
      ctx.notify("Confirmation modal elements not found.");
      return true;
    }

    // Set text dynamically
    textEl.textContent = "Are you sure you want to permanently delete this " + targetType + "? This action is irreversible and the content will be deleted from the platform.";

    // Show modal
    modal.hidden = false;
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Remove Content";

    function cleanup() {
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onClose);
      closeBtn.removeEventListener("click", onClose);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onEscape);
    }

    function closeModal() {
      modal.hidden = true;
      cleanup();
    }

    function onClose() {
      closeModal();
    }

    function onBackdrop(e) {
      if (e.target === modal) closeModal();
    }

    function onEscape(e) {
      if (e.key === "Escape") closeModal();
    }

    function onConfirm() {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Deleting…";

      var deleteUrl = "";
      if (targetType === "story") {
        deleteUrl = "/stories/" + targetId;
      } else if (targetType === "chapter") {
        deleteUrl = "/chapters/" + targetId;
      } else if (targetType === "comment") {
        deleteUrl = "/comments/" + targetId;
      } else {
        ctx.notify("Unknown target type: " + targetType);
        closeModal();
        return;
      }

      ctx.apiDelete(deleteUrl)
        .catch(function (err) {
          // If the resource is already gone (404), treat it as successfully removed and proceed
          if (err.status === 404 || (err.message && err.message.toLowerCase().indexOf("not found") !== -1)) {
            console.warn("Content already deleted or not found. Resolving report.");
            return;
          }
          throw err;
        })
        .then(function () {
          return ctx.apiPatch("/reports/" + reportId, { status: "resolved" });
        })
        .then(function () {
          closeModal();
          ctx.notify("Content removed and report resolved.");
          return fetchReportsPage(ctx);
        })
        .catch(function (err) {
          console.error(err);
          ctx.notify(err.message || "Failed to remove content.");
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Remove Content";
        });
    }

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onClose);
    closeBtn.addEventListener("click", onClose);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onEscape);

    return true;
  }
  if (action === "toggleReportPreview") {
    ctx.ui.expandedReports = ctx.ui.expandedReports || {};
    var id = target.dataset.id;
    ctx.ui.expandedReports[id] = !ctx.ui.expandedReports[id];
    ctx.render();
    return true;
  }
  if (action === "changeReportsPage") {
    ctx.ui.reportsPage = parseInt(target.dataset.page, 10) || 1;
    fetchReportsPage(ctx);
    return true;
  }
  if (action === "changeLogsPage") {
    ctx.ui.auditLogsPage = parseInt(target.dataset.page, 10) || 1;
    fetchLogsPage(ctx);
    return true;
  }
  if (action === "setReportFilter") {
    ctx.ui.reportFilter = target.dataset.value;
    ctx.ui.reportsPage = 1;
    fetchReportsPage(ctx);
    return true;
  }
  if (action === "resetAuditLogFilters") {
    ctx.ui.auditLogModeratorId = "all";
    ctx.ui.auditLogAction = "all";
    ctx.ui.auditLogStartDate = "";
    ctx.ui.auditLogEndDate = "";
    ctx.ui.auditLogsPage = 1;
    fetchLogsPage(ctx);
    return true;
  }
  if (action === "setModerationTab") {
    ctx.ui.activeModerationTab = target.dataset.value;
    if (ctx.ui.activeModerationTab === "logs") {
      ctx.ui.auditLogsPage = 1;
      fetchLogsPage(ctx);
    } else {
      ctx.ui.reportsPage = 1;
      fetchReportsPage(ctx);
    }
    return true;
  }
  if (action === "scan") {
    var originalText = target.textContent;
    target.disabled = true;
    target.textContent = "Scanning…";

    ctx.apiPost("/moderation/scan")
      .then(function (res) {
        target.disabled = false;
        target.textContent = originalText;

        var modal = document.getElementById("textScanResultsModal");
        var closeBtn = document.getElementById("textScanClose");
        var okBtn = document.getElementById("textScanOkBtn");
        var summaryEl = document.getElementById("textScanSummaryText");
        var listEl = document.getElementById("textScanDetailsList");

        if (!modal || !summaryEl || !listEl) {
          ctx.notify("Text scan completed. Scanned " + res.reports_scanned + " items, escalated " + res.reports_escalated);
          return fetchReportsPage(ctx);
        }

        summaryEl.textContent = "Scanned " + res.reports_scanned + " open report(s). Automatically escalated " + res.reports_escalated + " report(s) to HIGH severity.";
        listEl.innerHTML = "";

        if (res.details && res.details.length) {
          res.details.forEach(function (det) {
            var li = document.createElement("li");
            li.style.marginBottom = "8px";
            li.innerHTML = "Report ID: <code style='font-family: monospace; color: var(--brand);'>" + det.report_id.slice(0,8) + "…</code> targetting <strong>" + det.target_type.toUpperCase() + "</strong> matches keyword: <span class='report-badge severity-high' style='font-size: 0.7rem; font-weight:bold;'>" + det.matched_term.toUpperCase() + "</span>";
            listEl.appendChild(li);
          });
        } else {
          var li = document.createElement("li");
          li.textContent = "No flagged profanity or abusive keywords matched in any open reported contents.";
          li.style.color = "var(--muted-ink)";
          listEl.appendChild(li);
        }

        modal.hidden = false;

        function closeScan() {
          modal.hidden = true;
          closeBtn.removeEventListener("click", closeScan);
          okBtn.removeEventListener("click", closeScan);
          fetchReportsPage(ctx);
        }

        closeBtn.addEventListener("click", closeScan);
        okBtn.addEventListener("click", closeScan);
      })
      .catch(function (err) {
        console.error(err);
        ctx.notify(err.message || "Text scan failed.");
        target.disabled = false;
        target.textContent = originalText;
      });
    return true;
  }
  if (action === "exportQueue") {
    ctx.api("/reports?limit=1000&offset=0")
      .then(function (res) {
        var reps = res.items || [];
        if (!reps.length) {
          ctx.notify("No reports in the queue to export.");
          return;
        }

        var headers = ["Report ID", "Reporter ID", "Target Type", "Target ID", "Reason", "Status", "Severity"];
        var csvRows = [headers.join(",")];
        reps.forEach(function (r) {
          var row = [
            r.id,
            r.reporter_id || "Anonymous",
            r.target_type,
            r.target_id,
            '"' + (r.reason || "").replace(/"/g, '""') + '"',
            r.status,
            r.severity
          ];
          csvRows.push(row.join(","));
        });

        var csvContent = csvRows.join("\n");
        var blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        var link = document.createElement("a");
        var url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "moderation_reports_queue.csv");
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        ctx.notify("Reports queue exported successfully!");
      })
      .catch(function (err) {
        console.error(err);
        ctx.notify(err.message || "Failed to export reports queue.");
      });
    return true;
  }
  if (action === "banUserPrompt") {
    var authorId = target.dataset.authorId;
    var authorName = target.dataset.authorName;

    var modal = document.getElementById("banUserModal");
    var form = document.getElementById("banUserForm");
    var targetInput = document.getElementById("banTargetUserId");
    var textEl = document.getElementById("banUserText");
    var reasonInput = document.getElementById("banReason");
    var cancelBtn = document.getElementById("banUserCancelBtn");
    var closeBtn = document.getElementById("banUserClose");
    var submitBtn = document.getElementById("banUserSubmitBtn");

    if (!modal || !form || !targetInput || !textEl || !reasonInput) {
      ctx.notify("Ban user modal elements not found.");
      return true;
    }

    targetInput.value = authorId;
    reasonInput.value = "";
    textEl.textContent = "Are you sure you want to ban user '" + authorName + "'? Once banned, the user will be immediately blocked from logging in or performing any actions on KathaSangam.";

    modal.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Ban User";

    function cleanup() {
      form.removeEventListener("submit", onSubmit);
      cancelBtn.removeEventListener("click", onClose);
      closeBtn.removeEventListener("click", onClose);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onEscape);
    }

    function closeModal() {
      modal.hidden = true;
      cleanup();
    }

    function onClose() {
      closeModal();
    }

    function onBackdrop(e) {
      if (e.target === modal) closeModal();
    }

    function onEscape(e) {
      if (e.key === "Escape") closeModal();
    }

    function onSubmit(e) {
      e.preventDefault();
      var reason = reasonInput.value.trim();
      if (!reason) {
        ctx.notify("Please provide a reason for the ban.");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Banning…";

      ctx.apiPost("/moderation/ban", {
        user_id: authorId,
        reason: reason
      })
      .then(function () {
        closeModal();
        ctx.notify("User banned successfully.");
        return fetchReportsPage(ctx);
      })
      .catch(function (err) {
        console.error(err);
        ctx.notify(err.message || "Failed to ban user.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Ban User";
      });
    }

    form.addEventListener("submit", onSubmit);
    cancelBtn.addEventListener("click", onClose);
    closeBtn.addEventListener("click", onClose);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onEscape);

    return true;
  }
  if (action === "resetReportFilters") {
    ctx.ui.reportSearch = "";
    ctx.ui.reportTargetType = "all";
    ctx.ui.reportSeverity = "all";
    ctx.ui.reportSort = "newest";
    ctx.ui.reportsPage = 1;
    fetchReportsPage(ctx);
    return true;
  }
  return false;
}

export function handleModerationInput(ctx, action, target, e) {
  if (action === "changeReportSeverity") {
    var reportId = target.dataset.id;
    var newSeverity = target.value;
    
    ctx.apiPatch("/reports/" + reportId + "/severity", { severity: newSeverity })
      .then(function () {
        ctx.notify("Severity updated to " + newSeverity);
        return fetchReportsPage(ctx);
      })
      .catch(function (err) {
        console.error(err);
        ctx.notify(err.message || "Failed to update severity.");
      });
    return true;
  }
  if (action === "changeSearch") {
    ctx.ui.reportSearch = target.value;
    if (e.type === "change") {
      ctx.ui.reportsPage = 1;
      fetchReportsPage(ctx);
    }
    return true;
  }
  if (action === "changeTargetType") {
    ctx.ui.reportTargetType = target.value;
    if (e.type === "change") {
      ctx.ui.reportsPage = 1;
      fetchReportsPage(ctx);
    }
    return true;
  }
  if (action === "changeSeverity") {
    ctx.ui.reportSeverity = target.value;
    if (e.type === "change") {
      ctx.ui.reportsPage = 1;
      fetchReportsPage(ctx);
    }
    return true;
  }
  if (action === "changeSort") {
    ctx.ui.reportSort = target.value;
    if (e.type === "change") {
      ctx.ui.reportsPage = 1;
      fetchReportsPage(ctx);
    }
    return true;
  }
  if (action === "changeAuditLogModerator") {
    ctx.ui.auditLogModeratorId = target.value;
    ctx.ui.auditLogsPage = 1;
    fetchLogsPage(ctx);
    return true;
  }
  if (action === "changeAuditLogAction") {
    ctx.ui.auditLogAction = target.value;
    ctx.ui.auditLogsPage = 1;
    fetchLogsPage(ctx);
    return true;
  }
  if (action === "changeAuditLogStartDate") {
    ctx.ui.auditLogStartDate = target.value;
    ctx.ui.auditLogsPage = 1;
    fetchLogsPage(ctx);
    return true;
  }
  if (action === "changeAuditLogEndDate") {
    ctx.ui.auditLogEndDate = target.value;
    ctx.ui.auditLogsPage = 1;
    fetchLogsPage(ctx);
    return true;
  }
  return false;
}
