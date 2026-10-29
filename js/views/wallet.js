import { button, el, formatDate } from "../components.js";
import { api, apiPost, apiPut } from "../api.js";

function formatCurrency(amount) {
  var num = Number(amount) || 0;
  return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderUpiModal(currentUpi, onSave) {
  var previousActive = document.activeElement;
  var overlay = el("div", "custom-modal-overlay active");
  var box = el("div", "custom-modal-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");

  var title = el("h3", "custom-modal-title", "Set Payout UPI ID");
  var desc = el("p", "custom-modal-message", "Enter the UPI ID where you want to receive your withdrawal disbursements (e.g. yourname@okhdfcbank or 9876543210@paytm).");

  var errorDiv = el("div", "support-error-msg");
  errorDiv.hidden = true;

  var inputEl = el("input", {
    type: "text",
    class: "support-text-input",
    placeholder: "username@bank",
    value: currentUpi || "",
    style: "width: 100%; margin: 12px 0;"
  });

  var actions = el("div", "custom-modal-actions");
  var cancelBtn = el("button", "custom-btn btn-cancel", "Cancel");
  cancelBtn.type = "button";
  var saveBtn = el("button", "custom-btn btn-primary", "Save UPI ID");
  saveBtn.type = "button";

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);

  box.appendChild(title);
  box.appendChild(desc);
  box.appendChild(inputEl);
  box.appendChild(errorDiv);
  box.appendChild(actions);
  overlay.appendChild(box);

  document.body.appendChild(overlay);
  inputEl.focus();

  function dismiss() {
    overlay.classList.remove("active");
    setTimeout(function () {
      overlay.remove();
      if (previousActive && typeof previousActive.focus === "function") previousActive.focus();
    }, 200);
  }

  cancelBtn.addEventListener("click", dismiss);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) dismiss(); });

  saveBtn.addEventListener("click", async function () {
    var val = inputEl.value.trim();
    if (!val.includes("@") || val.length < 3 || val.includes(" ")) {
      errorDiv.textContent = "Please enter a valid UPI ID (e.g. username@bank).";
      errorDiv.hidden = false;
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      await apiPut("/wallet/payout-upi", { payout_upi_id: val });
      dismiss();
      if (typeof onSave === "function") onSave(val);
    } catch (err) {
      errorDiv.textContent = (err && err.message) || "Failed to update UPI ID.";
      errorDiv.hidden = false;
      saveBtn.disabled = false;
      saveBtn.textContent = "Save UPI ID";
    }
  });
}

function renderWithdrawModal(walletData, onComplete) {
  var previousActive = document.activeElement;
  var overlay = el("div", "custom-modal-overlay active");
  var box = el("div", "custom-modal-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");

  var minAmount = walletData.min_withdrawal_amount || 100;
  var balance = walletData.balance || 0;
  var upi = walletData.payout_upi_id;

  var title = el("h3", "custom-modal-title", "Withdraw Earnings to UPI");
  var desc = el("p", "custom-modal-message", "Request a direct bank payout via UPI. Available balance: " + formatCurrency(balance));

  var errorDiv = el("div", "support-error-msg");
  errorDiv.hidden = true;

  var amountLabel = el("label", { class: "support-field-label" }, "Withdrawal Amount (Min " + formatCurrency(minAmount) + "):");
  var amountInput = el("input", {
    type: "number",
    class: "support-text-input",
    placeholder: String(minAmount),
    min: String(minAmount),
    max: String(balance),
    value: String(Math.floor(balance)),
    style: "width: 100%; margin: 6px 0 16px 0;"
  });

  var upiLabel = el("label", { class: "support-field-label" }, "Destination Payout UPI ID:");
  var upiInput = el("input", {
    type: "text",
    class: "support-text-input",
    placeholder: "username@bank",
    value: upi || "",
    style: "width: 100%; margin: 6px 0 16px 0;"
  });

  var note = el("p", "mini-meta", "Disbursements are reviewed and processed directly to your UPI ID within 24-48 hours.");

  var actions = el("div", "custom-modal-actions");
  var cancelBtn = el("button", "custom-btn btn-cancel", "Cancel");
  cancelBtn.type = "button";
  var confirmBtn = el("button", "custom-btn btn-primary", "Submit Request");
  confirmBtn.type = "button";

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);

  box.appendChild(title);
  box.appendChild(desc);
  box.appendChild(amountLabel);
  box.appendChild(amountInput);
  box.appendChild(upiLabel);
  box.appendChild(upiInput);
  box.appendChild(note);
  box.appendChild(errorDiv);
  box.appendChild(actions);
  overlay.appendChild(box);

  document.body.appendChild(overlay);
  amountInput.focus();

  function dismiss() {
    overlay.classList.remove("active");
    setTimeout(function () {
      overlay.remove();
      if (previousActive && typeof previousActive.focus === "function") previousActive.focus();
    }, 200);
  }

  cancelBtn.addEventListener("click", dismiss);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) dismiss(); });

  confirmBtn.addEventListener("click", async function () {
    var amt = parseFloat(amountInput.value);
    var targetUpi = upiInput.value.trim();

    if (isNaN(amt) || amt < minAmount) {
      errorDiv.textContent = "Minimum withdrawal amount is " + formatCurrency(minAmount) + ".";
      errorDiv.hidden = false;
      return;
    }
    if (amt > balance) {
      errorDiv.textContent = "Requested amount exceeds your available balance of " + formatCurrency(balance) + ".";
      errorDiv.hidden = false;
      return;
    }
    if (!targetUpi.includes("@") || targetUpi.length < 3 || targetUpi.includes(" ")) {
      errorDiv.textContent = "Please enter a valid destination UPI ID.";
      errorDiv.hidden = false;
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Submitting...";

    try {
      await apiPost("/wallet/payout-request", {
        amount: amt,
        payout_upi_id: targetUpi
      });
      dismiss();
      if (typeof onComplete === "function") onComplete(amt, targetUpi);
    } catch (err) {
      errorDiv.textContent = (err && err.message) || "Failed to submit withdrawal request.";
      errorDiv.hidden = false;
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Submit Request";
    }
  });
}

export async function renderWallet(ctx) {
  var renderUserId = ctx.state.user && ctx.state.user.id;
  var currentView = ctx.ui.currentView;

  ctx.view.innerHTML = "";

  if (!ctx.state.user) {
    var guestPanel = el("section", "panel", [
      el("h2", null, "Creator Wallet"),
      el("p", null, "Please log in to view your creator wallet, track tips, and withdraw funds."),
      button("Log In / Register", "btn primary", {
        action: "loginPrompt"
      })
    ]);
    ctx.view.appendChild(guestPanel);
    if (ctx.openAuthModal) ctx.openAuthModal();
    return;
  }

  // Loading State
  var loadingEl = el("div", "panel", [
    el("h2", null, "Creator Wallet & Earnings"),
    el("p", "mini-meta", "Loading your wallet data...")
  ]);
  ctx.view.appendChild(loadingEl);

  try {
    var [walletData, transactions, authorTips] = await Promise.all([
      api("/wallet"),
      api("/wallet/transactions").catch(function () { return []; }),
      api("/author/tips").then(function (res) { return (res && res.items) || []; }).catch(function () { return []; })
    ]);

    // F-036: Verify user and view have not changed during async fetch before modifying DOM
    if (!ctx.state.user || ctx.state.user.id !== renderUserId || ctx.ui.currentView !== currentView) {
      return;
    }

    ctx.view.innerHTML = "";

    // 1. Header
    var headerSection = el("div", "wallet-header-section", [
      el("div", "wallet-title-wrap", [
        el("h1", "wallet-page-title", "Creator Wallet & Earnings"),
        el("p", "wallet-subtitle", "Reader tips from your stories, transparent 5% platform fee, and direct UPI withdrawals.")
      ])
    ]);
    ctx.view.appendChild(headerSection);

    // 2. Stats Row
    var balanceVal = Number(walletData.balance) || 0;
    var totalEarnedVal = Number(walletData.total_earned) || 0;
    var totalWithdrawnVal = Number(walletData.total_withdrawn) || 0;
    var feePercent = Number(walletData.platform_fee_percent) || 5;

    var withdrawBtn = el("button", {
      type: "button",
      class: "btn primary btn-sm wallet-withdraw-btn",
      disabled: balanceVal < (walletData.min_withdrawal_amount || 100)
    }, "Withdraw Funds");

    withdrawBtn.addEventListener("click", function () {
      renderWithdrawModal(walletData, function (amt, targetUpi) {
        if (ctx.notify) {
          ctx.notify("Payout request of " + formatCurrency(amt) + " submitted to " + targetUpi + "!", "success");
        }
        renderWallet(ctx);
      });
    });

    var balanceCard = el("div", "wallet-stat-card balance-card", [
      el("div", "stat-card-label", "Available Balance"),
      el("div", "stat-card-value balance-value", formatCurrency(balanceVal)),
      el("div", "stat-card-actions", [
        withdrawBtn,
        balanceVal < (walletData.min_withdrawal_amount || 100)
          ? el("span", "mini-meta", "Min withdrawal: " + formatCurrency(walletData.min_withdrawal_amount || 100))
          : null
      ].filter(Boolean))
    ]);

    var earnedCard = el("div", "wallet-stat-card", [
      el("div", "stat-card-label", "Total Net Earnings"),
      el("div", "stat-card-value", formatCurrency(totalEarnedVal)),
      el("span", "mini-meta", "95% creator share (" + feePercent + "% platform fee)")
    ]);

    var withdrawnCard = el("div", "wallet-stat-card", [
      el("div", "stat-card-label", "Total Disbursed"),
      el("div", "stat-card-value", formatCurrency(totalWithdrawnVal)),
      el("span", "mini-meta", "Completed UPI bank transfers")
    ]);

    var statsGrid = el("div", "wallet-stats-grid", [
      balanceCard,
      earnedCard,
      withdrawnCard
    ]);
    ctx.view.appendChild(statsGrid);

    // 3. Payout Settings Banner
    var currentUpi = walletData.payout_upi_id;
    var editUpiBtn = el("button", { type: "button", class: "btn secondary btn-sm" }, currentUpi ? "Edit UPI ID" : "Set Up UPI ID");

    editUpiBtn.addEventListener("click", function () {
      renderUpiModal(currentUpi, function (newUpi) {
        if (ctx.notify) ctx.notify("Payout UPI updated to " + newUpi, "success");
        renderWallet(ctx);
      });
    });

    var upiBanner = el("div", "wallet-upi-banner panel", [
      el("div", "upi-banner-info", [
        el("div", "upi-brand-badge", "UPI"),
        el("div", null, [
          el("strong", null, "Payout Destination (UPI)"),
          el("p", "mini-meta", currentUpi
            ? "Your withdrawals will be disbursed to: " + currentUpi
            : "No UPI ID configured yet. Add your UPI ID to request payouts."
          )
        ])
      ]),
      editUpiBtn
    ]);
    ctx.view.appendChild(upiBanner);

    // 4. Ledger & Tips Tab Switcher
    var activeTab = ctx.ui.walletActiveTab || "ledger";

    var tabSwitcher = el("div", "studio-tabs wallet-tabs", [
      button("Wallet Ledger (" + transactions.length + ")", activeTab === "ledger" ? "btn active" : "btn", {
        action: "setWalletTab",
        value: "ledger"
      }),
      button("Story Supporter Tips (" + authorTips.length + ")", activeTab === "tips" ? "btn active" : "btn", {
        action: "setWalletTab",
        value: "tips"
      })
    ]);

    tabSwitcher.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        ctx.ui.walletActiveTab = btn.dataset.value;
        renderWallet(ctx);
      });
    });

    var tableContainer = el("div", "wallet-table-container panel");

    if (activeTab === "ledger") {
      if (!transactions || transactions.length === 0) {
        tableContainer.appendChild(el("div", "empty", "No wallet transactions yet. When readers tip your stories, credits will appear here."));
      } else {
        var table = el("table", "wallet-history-table", [
          el("thead", null, [
            el("tr", null, [
              el("th", null, "Date"),
              el("th", null, "Type"),
              el("th", null, "Gross"),
              el("th", null, "Fee (5%)"),
              el("th", null, "Net"),
              el("th", null, "Status"),
              el("th", null, "Description")
            ])
          ]),
          el("tbody", null, transactions.map(function (tx) {
            var isCredit = tx.type === "tip_received";
            var statusClass = tx.status === "completed" ? "badge-success" : (tx.status === "pending" ? "badge-pending" : "badge-danger");
            return el("tr", null, [
              el("td", "table-cell-date", formatDate(tx.created_at)),
              el("td", null, el("span", { class: "wallet-tx-type " + (isCredit ? "credit" : "debit") }, isCredit ? "Tip Credit" : "Withdrawal")),
              el("td", null, formatCurrency(tx.gross_amount)),
              el("td", "text-muted", isCredit ? formatCurrency(tx.platform_fee) : "—"),
              el("td", null, el("strong", { class: isCredit ? "credit-text" : "debit-text" }, (isCredit ? "+" : "-") + formatCurrency(tx.net_amount))),
              el("td", null, el("span", { class: "badge " + statusClass }, tx.status)),
              el("td", "table-cell-desc", tx.description || "—")
            ]);
          }))
        ]);
        tableContainer.appendChild(table);
      }
    } else {
      if (!authorTips || authorTips.length === 0) {
        tableContainer.appendChild(el("div", "empty", "No reader tips received yet. Keep writing and sharing great stories!"));
      } else {
        var tipsList = el("div", "supporter-tips-list", authorTips.map(function (item) {
          return el("div", "supporter-tip-card", [
            el("div", "supporter-tip-header", [
              el("div", null, [
                el("strong", "supporter-name", item.donor_name || "Anonymous Reader"),
                el("span", "mini-meta", " on \"" + item.story_title + "\" · " + formatDate(item.created_at))
              ]),
              el("div", "supporter-amount-pill", formatCurrency(item.gross_amount))
            ]),
            item.donor_message ? el("p", "supporter-note-text", "“" + item.donor_message + "”") : null,
            el("div", "supporter-net-meta", "Added to wallet: " + formatCurrency(item.net_amount) + " (after 5% platform fee)")
          ].filter(Boolean));
        }));
        tableContainer.appendChild(tipsList);
      }
    }

    ctx.view.appendChild(tabSwitcher);
    ctx.view.appendChild(tableContainer);
  } catch (err) {
    console.error("Wallet loading error:", err);
    ctx.view.innerHTML = "";
    ctx.view.appendChild(el("div", "panel", [
      el("h2", null, "Creator Wallet"),
      el("p", "error", "Failed to load wallet data: " + (err.message || String(err))),
      button("Retry", "btn primary", {
        action: "reloadWallet"
      })
    ]));
  }
}
