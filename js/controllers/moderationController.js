export function handleModerationClick(ctx, action, target, e) {
  if (action === "resolveReport" || action === "escalateReport") {
    var newStatus = action === "resolveReport" ? "resolved" : "escalated";
    ctx.apiPatch("/reports/" + target.dataset.id, { status: newStatus }).then(function (r) {
      ctx.notify(r.message);
      return ctx.api("/reports");
    }).then(function (reps) {
      ctx.state.reports = reps;
      ctx.render();
    });
    return true;
  }
  if (action === "scan") {
    ctx.notify("Text scan completed. No blocked terms found.");
    return true;
  }
  if (action === "exportQueue") {
    ctx.notify("Queue export prepared in memory for this prototype.");
    return true;
  }
  return false;
}
