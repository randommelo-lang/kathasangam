import { el } from "../components.js";

export async function renderWallet(ctx) {
  ctx.view.innerHTML = "";
  var notice = el("section", "panel", [
    el("h2", null, "Creator Monetization & Gifting (Coming Soon)"),
    el("p", null, "Creator Wallet and tipping features are currently paused while platform payment and tax compliance policies are being updated."),
    el("p", "mini-meta", "Stay tuned! An updated appreciation and gifting system will be announced soon."),
    el("a", { class: "btn primary", href: "#discover", style: "display: inline-block; margin-top: 16px;" }, "← Back to Discover")
  ]);
  ctx.view.appendChild(notice);
}
