import { el, svgEl } from "../components.js";

let legalModalKeyHandler = null;
let previousActiveElement = null;

function makeCloseIcon() {
  return svgEl("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  }, [
    svgEl("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
    svgEl("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
  ]);
}

const TAB_DATA = {
  terms: {
    title: "Terms of Service",
    subtitle: "Creator rights, platform standards, and user commitments",
    content: [
      {
        heading: "1. 100% Creator Ownership & Intellectual Property",
        body: "At KathaSangam, creators retain full, exclusive intellectual property, copyright, and moral rights to all their original novels, comics, characters, and manuscripts. KathaSangam does not claim ownership or licensing beyond the non-exclusive technical permission needed to display your story to readers on the website and app."
      },
      {
        heading: "2. Content Guidelines & Age Ratings",
        body: "Authors must select accurate age ratings (All ages, 13+, 16+, 18+) during story creation and editing. Any story featuring adult themes, explicit violence, or sensitive content must have the 18+ toggle enabled so readers and parents can filter appropriately."
      },
      {
        heading: "3. Creator Tipping & Monetization",
        body: "Readers may support creators through direct tipping. 95% of every tip goes directly to the creator's wallet. The remaining 5% covers payment gateway fees and server infrastructure. Creators can request payouts via UPI once eligible thresholds are met."
      },
      {
        heading: "4. Code of Conduct & Prohibited Uses",
        body: "Plagiarism, scraping, impersonation, hate speech, harassment, religious discrimination, and commercial spamming are strictly prohibited. Violating these standards will lead to immediate story takedown and permanent account termination."
      }
    ]
  },
  privacy: {
    title: "Privacy Policy",
    subtitle: "How KathaSangam protects and respects your personal data",
    content: [
      {
        heading: "1. Information We Collect",
        body: "We only collect essential information required to operate KathaSangam: your email address, username, reading history, saved bookmarks, and reading progress. We do not track you across other websites or sell your personal information."
      },
      {
        heading: "2. Data Protection & Encryption",
        body: "All communications between your device and KathaSangam are encrypted with industry-standard TLS/HTTPS. Passwords and credentials are cryptographically hashed using Argon2 and handled securely by Supabase Authentication."
      },
      {
        heading: "3. Your Rights & Data Ownership (DPDP Act & GDPR)",
        body: "Under India's Digital Personal Data Protection Act (DPDP) and GDPR, you have full ownership over your information. You can export a full copy of your account data or permanently delete your account and all associated records anytime directly in Profile Settings."
      },
      {
        heading: "4. Cookies & Local Storage",
        body: "We use local storage and session tokens strictly to keep you logged in and to remember your reading preferences (themes, font sizes, filter states). No third-party tracking or advertising cookies are utilized."
      }
    ]
  },
  takedown: {
    title: "Copyright & Takedown Policy",
    subtitle: "DMCA compliance, IP protection, and reporting procedures",
    content: [
      {
        heading: "1. Respect for Copyright Holders",
        body: "KathaSangam strictly complies with the Indian Copyright Act, 1957, and the Digital Millennium Copyright Act (DMCA). We promptly respond to clear, legitimate notices of alleged copyright infringement."
      },
      {
        heading: "2. Filing a Copyright Takedown Notice",
        body: "If you believe your copyrighted work has been published on KathaSangam without authorization, please send a written takedown notice to our designated copyright team at kathasangam@zohomail.in with the following details:\n\n• Identification of the copyrighted work claimed to have been infringed.\n• The exact URL or story ID of the material you claim is infringing.\n• Your contact information (name, address, telephone number, and email).\n• A statement that you have a good faith belief that the disputed use is not authorized by the copyright owner.\n• A statement under penalty of perjury that the information in your notice is accurate and that you are the copyright owner or authorized to act on their behalf.\n• Your physical or electronic signature."
      },
      {
        heading: "3. Counter-Notifications & Repeat Infringers",
        body: "If an author believes their content was removed by mistake or misidentification, they may file a formal counter-notice. Accounts that repeatedly infringe on third-party copyrights will be permanently barred from publishing on KathaSangam."
      }
    ]
  },
  guidelines: {
    title: "Community Guidelines",
    subtitle: "Fostering an inspiring and inclusive home for Indian literature",
    content: [
      {
        heading: "1. Celebrate Vernacular Storytelling",
        body: "We welcome stories written in Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Malayalam, Kannada, Punjabi, English, and other regional languages. Be respectful of different cultures, dialects, and writing styles."
      },
      {
        heading: "2. Constructive Criticism",
        body: "Readers are encouraged to leave encouraging, constructive feedback in chapter discussions. Focus on plot, character development, pacing, and artwork rather than personal insults."
      },
      {
        heading: "3. Community Safety & Reporting",
        body: "If you encounter rule violations or abusive behavior, please use the in-app Report button on any story or comment. Our moderation team investigates reports within 24 hours."
      }
    ]
  },
  contact: {
    title: "Contact & Support",
    subtitle: "We are here to help creators and readers alike",
    content: [
      {
        heading: "Official Support Inquiries",
        body: "For creator onboarding assistance, technical troubleshooting, payment inquiries, or feedback, you can reach our team directly at:\n\n• General & Creator Support: kathasangam@zohomail.in\n• Platform Inquiries: contact@kathasangam.co.in\n\nWe aim to respond to all inquiries within 24 to 48 hours."
      },
      {
        heading: "Official Social Channels",
        body: "Connect with us across our official community channels:\n\n• Twitter / X: @KathaSaangam (https://x.com/kathasaangam)\n• GitHub: https://github.com/randommelo-lang/kathasangam\n• Nyburs Community: https://www.nyburs.com/kathasangam\n• Vync Live: https://vync.live/profile/kathasangam"
      }
    ]
  }
};

export function openLegalModal(activeTab = "terms") {
  if (typeof document === "undefined") return;

  var existing = document.getElementById("legalModalBackdrop");
  if (existing) existing.remove();

  previousActiveElement = document.activeElement;

  var backdrop = el("div", { class: "auth-modal-backdrop legal-modal-backdrop", id: "legalModalBackdrop" });
  var modal = el("div", {
    class: "auth-modal legal-modal",
    role: "dialog",
    "aria-labelledby": "legalModalTitle",
    "aria-modal": "true"
  });

  var header = el("div", "legal-modal-header", [
    el("div", "legal-modal-title-group", [
      el("h2", { id: "legalModalTitle", class: "legal-modal-title" }, TAB_DATA[activeTab].title),
      el("p", { id: "legalModalSubtitle", class: "legal-modal-subtitle" }, TAB_DATA[activeTab].subtitle)
    ]),
    el("button", {
      type: "button",
      class: "auth-modal-close legal-modal-close",
      "aria-label": "Close legal dialog",
      id: "legalModalCloseBtn"
    }, [makeCloseIcon()])
  ]);

  var tabsNav = el("nav", { class: "legal-tabs-nav", "aria-label": "Legal sections" }, [
    el("button", { type: "button", class: "legal-tab-btn" + (activeTab === "terms" ? " active" : ""), "data-tab": "terms" }, "Terms"),
    el("button", { type: "button", class: "legal-tab-btn" + (activeTab === "privacy" ? " active" : ""), "data-tab": "privacy" }, "Privacy"),
    el("button", { type: "button", class: "legal-tab-btn" + (activeTab === "takedown" ? " active" : ""), "data-tab": "takedown" }, "Copyright / Takedown"),
    el("button", { type: "button", class: "legal-tab-btn" + (activeTab === "guidelines" ? " active" : ""), "data-tab": "guidelines" }, "Guidelines"),
    el("button", { type: "button", class: "legal-tab-btn" + (activeTab === "contact" ? " active" : ""), "data-tab": "contact" }, "Contact")
  ]);

  var contentBody = el("div", "legal-modal-body");

  function renderTabContent(tabKey) {
    var data = TAB_DATA[tabKey] || TAB_DATA.terms;
    document.getElementById("legalModalTitle").textContent = data.title;
    document.getElementById("legalModalSubtitle").textContent = data.subtitle;

    contentBody.innerHTML = "";
    data.content.forEach(function (section) {
      var secEl = el("div", "legal-section-block", [
        el("h3", "legal-section-heading", section.heading),
        el("p", "legal-section-text", section.body)
      ]);
      contentBody.appendChild(secEl);
    });

    tabsNav.querySelectorAll(".legal-tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.tab === tabKey);
    });
  }

  tabsNav.addEventListener("click", function (e) {
    var btn = e.target.closest(".legal-tab-btn");
    if (!btn) return;
    renderTabContent(btn.dataset.tab);
  });

  modal.appendChild(header);
  modal.appendChild(tabsNav);
  modal.appendChild(contentBody);
  backdrop.appendChild(modal);

  function closeModal() {
    if (legalModalKeyHandler) {
      document.removeEventListener("keydown", legalModalKeyHandler);
      legalModalKeyHandler = null;
    }
    backdrop.remove();
    document.body.style.overflow = "";
    if (previousActiveElement && typeof previousActiveElement.focus === "function") {
      previousActiveElement.focus();
    }
  }

  backdrop.addEventListener("click", function (e) {
    if (e.target === backdrop || e.target.closest("#legalModalCloseBtn")) {
      closeModal();
    }
  });

  legalModalKeyHandler = function (e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
  };
  document.addEventListener("keydown", legalModalKeyHandler);

  document.body.appendChild(backdrop);
  document.body.style.overflow = "hidden";

  renderTabContent(activeTab);
  var firstBtn = tabsNav.querySelector(".legal-tab-btn.active") || modal.querySelector("button");
  if (firstBtn) firstBtn.focus();
}
