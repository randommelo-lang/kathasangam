import { state } from "../state.js";
import { el, svgEl, makeTipIcon } from "../components.js";
import { apiPost } from "../api.js";

let razorpaySdkPromise = null;

function makeShieldIcon() {
  return svgEl("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: "fee-shield-icon-svg"
  }, [
    svgEl("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" })
  ]);
}

function makeSuccessBadgeIcon() {
  return svgEl("svg", {
    width: "48",
    height: "48",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--accent)",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: "celebration-success-icon"
  }, [
    svgEl("circle", { cx: "12", cy: "12", r: "10" }),
    svgEl("polyline", { points: "9 12 12 15 16 10" })
  ]);
}

export function loadRazorpaySdk() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window context"));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (razorpaySdkPromise) return razorpaySdkPromise;

  razorpaySdkPromise = new Promise(function (resolve, reject) {
    const existing = document.getElementById("razorpay-sdk-script");
    if (existing) {
      existing.addEventListener("load", function () { resolve(window.Razorpay); });
      existing.addEventListener("error", function (e) { reject(e); });
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-sdk-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = function () {
      resolve(window.Razorpay);
    };
    script.onerror = function () {
      razorpaySdkPromise = null;
      reject(new Error("Unable to connect to Razorpay payment gateway. Please check your network."));
    };
    document.head.appendChild(script);
  });

  return razorpaySdkPromise;
}

export function showDonationSuccessModal(amount, authorName, storyTitle) {
  var overlay = el("div", "custom-modal-overlay active");
  var box = el("div", "custom-modal-box celebration-modal-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");

  var iconWrap = el("div", "celebration-icon-wrap", [makeSuccessBadgeIcon()]);
  var title = el("h3", "custom-modal-title", "Thank You for Supporting!");
  var msg = el(
    "p",
    "custom-modal-message",
    "Your tip of ₹" + amount + " to " + (authorName || "the author") + (storyTitle ? " for \"" + storyTitle + "\"" : "") + " has been confirmed! 95% was directly added to the creator's wallet."
  );

  var actions = el("div", "custom-modal-actions");
  var closeBtn = el("button", "custom-btn btn-primary", "Wonderful, Close");
  closeBtn.type = "button";
  actions.appendChild(closeBtn);

  box.appendChild(iconWrap);
  box.appendChild(title);
  box.appendChild(msg);
  box.appendChild(actions);
  overlay.appendChild(box);

  document.body.appendChild(overlay);
  closeBtn.focus();

  function dismiss() {
    overlay.classList.remove("active");
    setTimeout(function () { overlay.remove(); }, 200);
  }

  closeBtn.addEventListener("click", dismiss);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) dismiss();
  });
}

export function openSupportModal(options) {
  options = options || {};
  var storyId = options.storyId;
  var storyTitle = options.storyTitle || "Story";
  var authorName = options.authorName || "Creator";
  var previousActiveElement = document.activeElement;

  var selectedAmount = 50;
  var presetAmounts = [20, 50, 100, 500];

  var overlay = el("div", "custom-modal-overlay support-modal-overlay");
  var box = el("div", "custom-modal-box support-modal-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");

  var titleId = "support-modal-title-" + Math.random().toString(16).slice(2);
  box.setAttribute("aria-labelledby", titleId);

  // Header
  var header = el("div", "support-modal-header", [
    el("div", "support-header-badge", [
      makeTipIcon("support-badge-icon"),
      el("span", null, "Creator Tip")
    ]),
    el("h3", { id: titleId, class: "custom-modal-title" }, "Support " + authorName),
    el("p", "support-modal-subtitle", "Fuel the next chapter of \"" + storyTitle + "\" with a direct UPI tip.")
  ]);

  // Amount Chips
  var chipContainer = el("div", "support-preset-chips");
  var chipElements = [];

  function updateActiveChip(amount) {
    selectedAmount = amount;
    chipElements.forEach(function (c) {
      c.classList.toggle("active", c.dataset.amount === String(amount));
    });
    if (customInput) {
      if (presetAmounts.indexOf(amount) !== -1) {
        customInput.value = "";
      } else {
        customInput.value = String(amount);
      }
    }
    updatePayButtonText();
  }

  presetAmounts.forEach(function (amt) {
    var chip = el(
      "button",
      {
        type: "button",
        class: "support-chip" + (amt === selectedAmount ? " active" : "") + (amt === 50 ? " popular" : ""),
        "data-amount": String(amt),
        "aria-label": "Select ₹" + amt + " tip"
      },
      [
        amt === 50 ? el("span", "chip-badge", "Popular") : null,
        el("span", "chip-val", "₹" + amt)
      ].filter(Boolean)
    );
    chip.addEventListener("click", function () {
      updateActiveChip(amt);
    });
    chipElements.push(chip);
    chipContainer.appendChild(chip);
  });

  // Custom Amount input
  var customWrap = el("div", "support-custom-wrap", [
    el("label", { class: "support-field-label", for: "support-custom-input" }, "Or enter custom amount:"),
    el("div", "support-input-group", [
      el("span", "support-input-prefix", "₹"),
      el("input", {
        type: "number",
        id: "support-custom-input",
        class: "support-custom-input",
        placeholder: "Custom amount (min ₹10)",
        min: "10",
        max: "50000",
        step: "1"
      })
    ])
  ]);
  var customInput = customWrap.querySelector("#support-custom-input");
  customInput.addEventListener("input", function () {
    var val = parseInt(customInput.value, 10);
    if (!isNaN(val) && val > 0) {
      selectedAmount = val;
      chipElements.forEach(function (c) { c.classList.remove("active"); });
    }
    updatePayButtonText();
  });

  // Donor Details
  var defaultDonorName = (state.profile && state.profile.username) || (state.user && state.user.email ? state.user.email.split("@")[0] : "");
  var nameField = el("div", "support-field-group", [
    el("label", { class: "support-field-label", for: "support-donor-name" }, "Your Display Name (Optional):"),
    el("input", {
      type: "text",
      id: "support-donor-name",
      class: "support-text-input",
      placeholder: "e.g. Reader, Friendly Ghost...",
      value: defaultDonorName,
      maxlength: "50"
    })
  ]);

  var noteField = el("div", "support-field-group", [
    el("label", { class: "support-field-label", for: "support-donor-note" }, "Supporter Message (Optional):"),
    el("textarea", {
      id: "support-donor-note",
      class: "support-text-input support-textarea",
      placeholder: "Add an encouraging message for the author...",
      maxlength: "200",
      rows: "2"
    })
  ]);

  // Fee disclosure
  var feeNote = el("div", "support-fee-note", [
    makeShieldIcon(),
    el("span", null, "95% directly credited to the creator's wallet · 5% platform fee")
  ]);

  // Error message placeholder
  var errorMsg = el("div", "support-error-msg");
  errorMsg.hidden = true;

  // Actions
  var actions = el("div", "custom-modal-actions support-modal-actions");
  var cancelBtn = el("button", "custom-btn btn-cancel", "Cancel");
  cancelBtn.type = "button";

  var payBtn = el("button", "custom-btn btn-primary support-pay-btn", "Proceed to Pay ₹" + selectedAmount);
  payBtn.type = "button";

  function updatePayButtonText() {
    payBtn.textContent = "Proceed to Pay ₹" + (selectedAmount > 0 ? selectedAmount : "...");
  }

  actions.appendChild(cancelBtn);
  actions.appendChild(payBtn);

  box.appendChild(header);
  box.appendChild(chipContainer);
  box.appendChild(customWrap);
  box.appendChild(nameField);
  box.appendChild(noteField);
  box.appendChild(feeNote);
  box.appendChild(errorMsg);
  box.appendChild(actions);
  overlay.appendChild(box);

  document.body.appendChild(overlay);

  setTimeout(function () {
    overlay.classList.add("active");
    payBtn.focus();
  }, 10);

  function cleanUp() {
    document.removeEventListener("keydown", handleKeyDown);
    overlay.classList.remove("active");
    setTimeout(function () {
      overlay.remove();
      if (previousActiveElement && typeof previousActiveElement.focus === "function") {
        previousActiveElement.focus();
      }
    }, 200);
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      cleanUp();
    }
  }
  document.addEventListener("keydown", handleKeyDown);

  cancelBtn.addEventListener("click", cleanUp);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) cleanUp();
  });

  // Handle Pay Action
  payBtn.addEventListener("click", async function () {
    errorMsg.hidden = true;
    errorMsg.textContent = "";

    var amountVal = selectedAmount;
    if (isNaN(amountVal) || amountVal < 10) {
      errorMsg.textContent = "Please enter an amount of at least ₹10.";
      errorMsg.hidden = false;
      return;
    }
    if (amountVal > 50000) {
      errorMsg.textContent = "Maximum single donation is ₹50,000.";
      errorMsg.hidden = false;
      return;
    }

    var donorNameInput = box.querySelector("#support-donor-name");
    var donorNoteInput = box.querySelector("#support-donor-note");
    var donorName = donorNameInput ? donorNameInput.value.trim() : "";
    var donorMessage = donorNoteInput ? donorNoteInput.value.trim() : "";

    payBtn.disabled = true;
    payBtn.textContent = "Connecting to Gateway...";

    try {
      // 1. Create order on backend
      var orderRes = await apiPost("/stories/" + storyId + "/tip", {
        amount: amountVal,
        donor_name: donorName || null,
        donor_message: donorMessage || null
      });

      if (!orderRes || !orderRes.order_id) {
        throw new Error("Failed to initialize payment order.");
      }

      var orderId = orderRes.order_id;
      var isSimulation = orderId.startsWith("order_sim_") || !orderRes.key_id;

      if (isSimulation) {
        // Fallback test simulation mode: confirm immediately
        payBtn.textContent = "Verifying Test Payment...";
        var verifyRes = await apiPost("/stories/" + storyId + "/tip/verify", {
          order_id: orderId,
          payment_id: "pay_sim_" + Date.now(),
          signature: "sim_signature",
          donor_name: donorName || null,
          donor_message: donorMessage || null
        });

        cleanUp();
        showDonationSuccessModal(amountVal, authorName, storyTitle);
        document.dispatchEvent(new CustomEvent("tip:completed", { detail: { storyId: storyId, amount: amountVal } }));
        return;
      }

      // 2. Load Razorpay JS SDK
      await loadRazorpaySdk();

      if (!window.Razorpay) {
        throw new Error("Razorpay Checkout failed to initialize.");
      }

      // 3. Launch Razorpay Standard Checkout modal
      var rzpOptions = {
        key: orderRes.key_id,
        amount: orderRes.amount,
        currency: orderRes.currency || "INR",
        name: "KathaSangam",
        description: "Support " + (orderRes.story_title || storyTitle),
        order_id: orderId,
        prefill: {
          name: donorName || (state.profile && state.profile.username) || "",
          email: (state.user && state.user.email) || "",
          contact: (state.profile && state.profile.phone) || (state.user && state.user.phone) || "9876543210"
        },
        notes: {
          story_id: storyId,
          donor_message: donorMessage
        },
        theme: {
          color: "#e65100"
        },
        modal: {
          ondismiss: function () {
            payBtn.disabled = false;
            updatePayButtonText();
          }
        },
        handler: async function (response) {
          try {
            payBtn.textContent = "Verifying Payment...";
            await apiPost("/stories/" + storyId + "/tip/verify", {
              order_id: response.razorpay_order_id || orderId,
              payment_id: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              donor_name: donorName || null,
              donor_message: donorMessage || null
            });

            cleanUp();
            showDonationSuccessModal(amountVal, authorName, storyTitle);
            document.dispatchEvent(new CustomEvent("tip:completed", { detail: { storyId: storyId, amount: amountVal } }));
          } catch (verifyErr) {
            console.error("Verification failed:", verifyErr);
            errorMsg.textContent = "Payment was received but verification failed: " + (verifyErr.message || "Unknown error");
            errorMsg.hidden = false;
            payBtn.disabled = false;
            updatePayButtonText();
          }
        }
      };

      var rzp = new window.Razorpay(rzpOptions);
      rzp.on("payment.failed", function (resp) {
        console.error("Razorpay payment failed:", resp.error);
        errorMsg.textContent = "Payment failed: " + (resp.error && resp.error.description ? resp.error.description : "Transaction declined");
        errorMsg.hidden = false;
        payBtn.disabled = false;
        updatePayButtonText();
      });

      rzp.open();
    } catch (err) {
      console.error("Payment initiation error:", err);
      errorMsg.textContent = (err && err.message) || "Unable to initiate payment. Please try again.";
      errorMsg.hidden = false;
      payBtn.disabled = false;
      updatePayButtonText();
    }
  });
}
