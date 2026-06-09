import { button, el, list } from "../components.js?v=comic-fit-20260609-v27";

export function renderModeration(ctx) {
  ctx = ctx || this;
  var canMod = ctx.canModerateRole();
  ctx.view.appendChild(el("div", "layout-two", [
    el("section", "panel", [
      el("div", "toolbar", [
        el("h2", null, "Review queue"),
        el("div", "mini-meta", canMod ? "Role has queue access" : "Switch role to moderate")
      ]),
      ctx.state.reports.length ? list(ctx.state.reports, "report-list", function (r) {
        return el("li", "report-item", [
          el("strong", null, r.target),
          el("span", "mini-meta", r.reason + " / " + r.severity + " / " + r.status),
          el("div", "button-row", [
            button("Resolve", "btn success", { action: "resolveReport", id: r.id }, !canMod || r.status !== "open"),
            button("Escalate", "btn warn", { action: "escalateReport", id: r.id }, !canMod || r.status !== "open")
          ])
        ]);
      }) : el("div", "empty", "No reports in queue.")
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
