import { state } from "../state.js";
import { el } from "../components.js";

function externalArrowIcon() {
  return el("span", {
    class: "social-open-icon",
    "aria-hidden": "true",
    innerHTML: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"></path><path d="M7 7h10v10"></path></svg>'
  });
}

function makeRuleCard(numberLabel, severityText, severityClass, title, description, bullets) {
  var contentChildren = [
    el("div", "rule-header-row", [
      el("h4", null, title),
      el("span", "rule-severity-tag " + severityClass, severityText)
    ]),
    el("p", null, description)
  ];
  if (bullets && bullets.length) {
    contentChildren.push(
      el("ul", "rule-bullets", bullets.map(function (b) {
        return el("li", null, b);
      }))
    );
  }
  return el("article", "rule-card " + severityClass + "-border", [
    el("div", "rule-badge", numberLabel),
    el("div", "rule-content", contentChildren)
  ]);
}

export function renderAbout(ctx) {
  ctx = ctx || this;
  var container = ctx.view;
  if (!container) return;
  container.innerHTML = "";

  var social = state.socialLinks || {
    nyburs: "https://www.nyburs.com/home",
    vync: "https://vync.live/",
    twitter: "https://twitter.com/kathasangam",
    github: "https://github.com/randommelo-lang/kathasangam",
    email: "contact@kathasangam.co.in"
  };

  var wrapper = el("div", "about-page-wrapper about-md-document");

  // ── Document Header ──
  var tocBar = el("nav", { class: "about-toc-bar", "aria-label": "About page sections" }, [
    el("button", { type: "button", class: "toc-pill", "data-target": "mission-vision" }, "Mission & Formats"),
    el("button", { type: "button", class: "toc-pill", "data-target": "platform-guide" }, "Platform Guide"),
    el("button", { type: "button", class: "toc-pill", "data-target": "rules-guidelines" }, "Rules & Guidelines"),
    el("button", { type: "button", class: "toc-pill", "data-target": "open-source-stack" }, "Open Source Stack"),
    el("button", { type: "button", class: "toc-pill", "data-target": "community-channels" }, "Community Channels")
  ]);

  tocBar.addEventListener("click", function (e) {
    var pill = e.target.closest(".toc-pill");
    if (!pill) return;
    e.preventDefault();
    var targetId = pill.dataset.target || (pill.getAttribute("href") || "").replace(/^#/, "");
    if (!targetId) return;
    var targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  var hero = el("header", "about-hero about-doc-header", [
    el("div", "about-hero-badge", "Celebrating Indian Literature & Visual Art"),
    el("h1", "about-hero-title", [
      document.createTextNode("About "),
      el("span", "text-gradient", "KathaSangam")
    ]),
    el("p", "about-hero-subtitle",
      "India's independent storytelling sanctuary for original serialized fiction, web novels, and Chitrānk webcomics. Built for writers, illustrators, and passionate readers across every region and script."
    ),
    el("div", "about-hero-actions", [
      el("a", { class: "btn primary about-cta-btn", href: "#discover" }, "Explore Stories →"),
      el("a", { class: "btn secondary about-cta-btn", href: "#studio" }, "Open Author Studio")
    ]),
    el("div", "about-pillars-strip", [
      el("div", "about-pillar-item", [
        el("span", "pillar-value", "10+ Scripts"),
        el("span", "pillar-label", "Indic & English voices")
      ]),
      el("div", "about-pillar-item", [
        el("span", "pillar-value", "100% Creator IP"),
        el("span", "pillar-label", "You own every word & panel")
      ]),
      el("div", "about-pillar-item", [
        el("span", "pillar-value", "2 Formats"),
        el("span", "pillar-label", "Web Novels & Chitrānk")
      ]),
      el("div", "about-pillar-item", [
        el("span", "pillar-value", "Open Source"),
        el("span", "pillar-label", "Fast, private & transparent")
      ])
    ]),
    tocBar
  ]);
  wrapper.appendChild(hero);

  // ── Section 1: Mission & Formats ──
  var scriptChips = [
    "हिंदी (Hindi)", "বাংলা (Bengali)", "தமிழ் (Tamil)", "తెలుగు (Telugu)",
    "मराठी (Marathi)", "ગુજરાતી (Gujarati)", "മലയാളം (Malayalam)",
    "ಕನ್ನಡ (Kannada)", "ਪੰਜਾਬੀ (Punjabi)", "English"
  ];

  var missionSection = el("section", { class: "about-section", id: "mission-vision" }, [
    el("div", "section-heading-wrap", [
      el("span", "section-tag", "01 / Overview"),
      el("h2", "about-subheading", "Mission & Vision")
    ]),
    el("blockquote", "about-manifesto-quote",
      "\"India is a land of ten thousand voices and living literary traditions. KathaSangam provides a modern, fast, and accessible digital home for serialized storytellers writing in Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Malayalam, Kannada, Punjabi, English, and beyond.\""
    ),
    el("div", "about-scripts-bar", scriptChips.map(function (lang) {
      return el("span", "about-script-chip", lang);
    })),
    el("div", "about-grid-2", [
      el("div", "about-card highlight-card", [
        el("div", "card-label-badge", "National Reach"),
        el("h3", null, "Stories Across India"),
        el("p", null,
          "Whether you are crafting an epic historical fantasy, a tender monsoon romance, a slice-of-life campus tale, or a pulse-pounding cyberpunk thriller set in Neo-Bengaluru, KathaSangam is built from the ground up for your voice."
        ),
        el("p", { class: "about-card-subnote" },
          "Authors publish serialized fiction in original scripts with zero gatekeeping, reaching readers across India in their mother tongue."
        )
      ]),
      el("div", "about-card highlight-card", [
        el("div", "card-label-badge", "Community Spirit"),
        el("h3", null, "Creator Appreciation & Gifts"),
        el("p", null,
          "We believe storytellers deserve recognition and support for their craft. A dedicated reader gifting and appreciation system is in development to celebrate writers and Chitrānk artists."
        ),
        el("p", { class: "about-card-accent-note" },
          "Coming Soon: Reader gifts, milestone awards, and supporter badges in chapter discussions."
        )
      ])
    ]),

    el("h3", { class: "about-inner-subheading", style: "margin-top: 36px; margin-bottom: 16px;" }, "Two Distinct Storytelling Formats"),

    el("div", "about-grid-2", [
      el("div", "about-format-card web-novel-card", [
        el("div", "format-header", [
          el("span", "format-badge", "Format 01"),
          el("h3", null, "Web Novels")
        ]),
        el("p", null,
          "Serialized prose fiction crafted for chapters that release on your schedule. Readers enjoy tailored Indic and Latin typography, Light/Sepia/Dark palettes, paragraph-level commenting, and instant cross-device progress sync."
        ),
        el("ul", "about-bullet-list", [
          el("li", null, "Balanced paginated reading (~15 lines per page) with swipe & side-button navigation, plus continuous scroll"),
          el("li", null, "Distraction-free fullscreen reading canvas with custom font size, line height, and column width"),
          el("li", null, "Direct chapter navigator, bookmarks, and curated reading playlists")
        ])
      ]),

      el("div", "about-format-card chitrank-card", [
        el("div", "format-header", [
          el("span", "format-badge chitrank-badge", "Format 02"),
          el("h3", null, "Chitrānk (चित्रांक)")
        ]),
        el("p", null,
          "Visual webcomics, graphic serials, and manga designed for both vertical webtoon scrolling and seamless two-page spreads. Artists can upload high-resolution comic panels, import PDFs, and build vibrant visual worlds."
        ),
        el("ul", "about-bullet-list", [
          el("li", null, "Seamless vertical scroll or zero-gap double-page flip modes"),
          el("li", null, "Responsive panel fit (Narrow, Standard, Wide, Full) and contained zoom controls"),
          el("li", null, "Built for mobile touch gestures as well as wide desktop monitors")
        ])
      ])
    ])
  ]);
  wrapper.appendChild(missionSection);

  wrapper.appendChild(el("hr", "about-section-divider"));

  // ── Section 2: Platform Guide ──
  var guideSection = el("section", { class: "about-section", id: "platform-guide" }, [
    el("div", "section-heading-wrap", [
      el("span", "section-tag", "02 / Architecture & Tools"),
      el("h2", "about-subheading", "Platform Guide & Features")
    ]),
    el("p", "about-section-desc", "Everything you need to read comfortably, publish effortlessly, and grow with the community."),

    el("div", "about-grid-3", [
      el("div", "about-feature-box", [
        el("div", "feature-num", "01"),
        el("h4", null, "Customizable Reader"),
        el("p", null, "Switch between Light, Sepia, and Dark themes, tune text size (16px–32px), choose Sans, Serif, Mono, Devanagari, Tamil, or Bengali fonts, and switch between balanced Pages or continuous Scroll mode.")
      ]),
      el("div", "about-feature-box", [
        el("div", "feature-num", "02"),
        el("h4", null, "Library & Playlists"),
        el("p", null, "Bookmark active stories to sync reading progress automatically across devices. Follow authors for release alerts and curate public or private Reading Playlists.")
      ]),
      el("div", "about-feature-box", [
        el("div", "feature-num", "03"),
        el("h4", null, "Notification Center"),
        el("p", null, "Get notified when followed authors drop new chapters or reply to your comments. Notifications stay accessible for 3 months and route you straight to the latest chapter.")
      ]),
      el("div", "about-feature-box", [
        el("div", "feature-num", "04"),
        el("h4", null, "Author Studio & Scheduling"),
        el("p", null, "Write in a distraction-free chapter workspace with cloud autosave, scheduled auto-publishing, co-author collaboration, analytics, and one-click .docx/.pdf manuscript import.")
      ]),
      el("div", "about-feature-box", [
        el("div", "feature-num", "05"),
        el("h4", null, "Creator Tipping & Gifting (Coming Soon)"),
        el("p", null, "Show appreciation for your favorite authors with upcoming digital gifts, awards, and exclusive supporter badges in chapter discussions.")
      ]),
      el("div", "about-feature-box", [
        el("div", "feature-num", "06"),
        el("h4", null, "Account Security & Moderation"),
        el("p", null, "Protect your account with Two-Factor Authentication (2FA), export your data anytime, and flag rule violations for prompt review by our moderation team.")
      ])
    ])
  ]);
  wrapper.appendChild(guideSection);

  wrapper.appendChild(el("hr", "about-section-divider"));

  // ── Section 3: Rules & Guidelines ──
  var rulesSection = el("section", { class: "about-section", id: "rules-guidelines" }, [
    el("div", "section-heading-wrap", [
      el("span", "section-tag", "03 / Standards & Safety"),
      el("h2", "about-subheading", "Platform Rules & Community Guidelines")
    ]),
    el("p", "about-section-desc", "KathaSangam is built on mutual respect, creative freedom, and reader safety. Every author, artist, and reader agrees to uphold these clear, fair community standards:"),

    el("div", "rules-ethos-banner", [
      el("span", "rules-ethos-title", "Our Guiding Principle"),
      el("p", null, "Create boldly, label content honestly, credit collaborators fairly, and treat fellow readers and writers with dignity. Rules are enforced transparently and proportionally.")
    ]),

    el("div", "rules-list", [
      makeRuleCard(
        "Rule 01",
        "Creator Rights",
        "severity-accent",
        "100% Intellectual Property & Copyright Ownership",
        "Creators retain full copyright and ownership over their original stories, illustrations, and characters. KathaSangam never claims ownership of your work.",
        [
          "Only publish original work, licensed adaptations, or properly attributed public domain classics.",
          "Plagiarism, unauthorized translations, scraping, or re-uploading another creator's work results in content removal and account suspension."
        ]
      ),

      makeRuleCard(
        "Rule 02",
        "Required",
        "severity-warn",
        "Accurate Content Ratings & NSFW Labeling",
        "Honest ratings help readers of all ages discover stories safely. Authors must select the accurate age rating in Story Settings before publishing:",
        [
          "All Ages: Suitable for every reader; no graphic violence, profanity, or mature themes.",
          "13+ (Teen): Mild action, fantasy combat, or light romantic themes.",
          "16+ (Young Adult): Intense drama, darker themes, or moderate violence without explicit content.",
          "18+ (Mature): Graphic violence or adult themes — requires enabling the Mature / NSFW toggle so younger readers are protected."
        ]
      ),

      makeRuleCard(
        "Rule 03",
        "Community Standard",
        "severity-info",
        "Constructive & Civil Discussions",
        "Thoughtful literary critique, chapter theories, and fan discussions are the heartbeat of KathaSangam. Disagreement is welcome; cruelty is not.",
        [
          "Critique the story, pacing, or craft — never attack the author or fellow readers personally.",
          "Hate speech, caste/religious/regional hostility, slurs, harassment, dogpiling, or doxxing are strictly prohibited."
        ]
      ),

      makeRuleCard(
        "Rule 04",
        "Platform Integrity",
        "severity-info",
        "No Spam, Engagement Manipulation, or Commercial Abuse",
        "Keep discovery shelves, ratings, and comment threads authentic for everyone.",
        [
          "Do not post repetitive self-promotion, unrelated links, or automated bot comments in other creators' chapters.",
          "Artificially inflating reads, likes, or ratings via bots or coordinated alt accounts is prohibited."
        ]
      ),

      makeRuleCard(
        "Rule 05",
        "Transparency",
        "severity-accent",
        "Originality, AI Disclosure & Collaborator Credit",
        "Readers value authenticity and knowing the people behind the work.",
        [
          "If generative AI tools were substantially used to write prose or generate comic panels, disclose this honestly in your story description or author notes.",
          "Credit co-authors, editors, and illustrators properly using Author Studio's Collaborators feature."
        ]
      ),

      makeRuleCard(
        "Rule 06",
        "Safety",
        "severity-warn",
        "Account Integrity & Responsible Use",
        "Help keep KathaSangam reliable and secure for all creators and readers.",
        [
          "Do not create alternate accounts to evade bans, harass blocked users, or bypass rate limits.",
          "We strongly recommend enabling Two-Factor Authentication (2FA) in Account Settings to protect your manuscripts and profile."
        ]
      ),

      makeRuleCard(
        "Rule 07",
        "Zero Tolerance",
        "severity-danger",
        "Strictly Prohibited & Illegal Content",
        "Certain categories of content are never permitted on KathaSangam under any rating or fictional framing:",
        [
          "Zero tolerance for sexual exploitation or abuse of minors (CSAM), non-consensual sexual content, or incest.",
          "Zero tolerance for encouragement of self-harm/suicide, credible threats of real-world violence, or illegal activity — violations result in immediate permanent bans."
        ]
      )
    ]),

    // Moderation & Appeals Process Strip
    el("div", "moderation-process-box", [
      el("h3", "moderation-process-title", "How Moderation & Appeals Work"),
      el("div", "moderation-steps-grid", [
        el("div", "moderation-step", [
          el("span", "mod-step-num", "Step 01"),
          el("h4", null, "Report & Context Review"),
          el("p", null, "Use the Report button on any story, chapter, or comment. Our moderators review flagged items in full context rather than auto-banning blindly.")
        ]),
        el("div", "moderation-step", [
          el("span", "mod-step-num", "Step 02"),
          el("h4", null, "Proportional Action"),
          el("p", null, "Minor rating or tagging issues receive a notice to fix. Repeated or severe violations lead to content removal, temporary restriction, or permanent suspension.")
        ]),
        el("div", "moderation-step", [
          el("span", "mod-step-num", "Step 03"),
          el("h4", null, "Fair Appeals"),
          el("p", null, [
            document.createTextNode("Think a decision was made in error? Reach out to "),
            el("a", { href: "mailto:" + (social.email || "contact@kathasangam.co.in"), class: "about-inline-link" }, social.email || "contact@kathasangam.co.in"),
            document.createTextNode(" with your username and story/report details for a human second review.")
          ])
        ])
      ])
    ])
  ]);
  wrapper.appendChild(rulesSection);

  wrapper.appendChild(el("hr", "about-section-divider"));

  // ── Section 4: Open Source Technology Stack ──
  var stackSection = el("section", { class: "about-section", id: "open-source-stack" }, [
    el("div", "section-heading-wrap", [
      el("span", "section-tag", "04 / Infrastructure"),
      el("h2", "about-subheading", "Open Source Technology & Attribution")
    ]),
    el("p", "about-section-desc", "KathaSangam is built with high-performance, modern open-source software. We gratefully acknowledge the following foundational projects and tools:"),

    el("div", "tech-grid", [
      el("div", "tech-card", [
        el("div", "tech-tag", "Backend Engine"),
        el("h4", null, "Rust & Axum"),
        el("p", null, "A blazing-fast, memory-safe backend framework engineered for concurrency, zero memory leaks, and high throughput under heavy reader loads.")
      ]),
      el("div", "tech-card", [
        el("div", "tech-tag", "Async Runtime"),
        el("h4", null, "Tokio & SQLx"),
        el("p", null, "Event-driven asynchronous I/O with parameterized PostgreSQL queries and automated migrations, keeping data safe and responses fast.")
      ]),
      el("div", "tech-card", [
        el("div", "tech-tag", "Database & Auth"),
        el("h4", null, "PostgreSQL & Supabase"),
        el("p", null, "Rock-solid relational persistence with Row Level Security (RLS), ACID transactions, TOTP 2FA, and secure JWT authentication.")
      ]),
      el("div", "tech-card", [
        el("div", "tech-tag", "Client Document Engine"),
        el("h4", null, "Mammoth.js"),
        el("p", null, "Lazy-loaded client-side .docx manuscript parsing that converts Word documents into clean text right inside your browser.")
      ]),
      el("div", "tech-card", [
        el("div", "tech-tag", "Visual Rendering"),
        el("h4", null, "PDF.js"),
        el("p", null, "Mozilla's open-source HTML5 PDF technology powering on-demand in-browser comic extraction and manuscript import.")
      ]),
      el("div", "tech-card", [
        el("div", "tech-tag", "Typography"),
        el("h4", null, "Inter, JetBrains Mono & Noto"),
        el("p", null, "Crafted for crisp readability across English, Devanagari, Tamil, and Bengali scripts on both mobile displays and high-DPI desktops.")
      ]),
      el("div", "tech-card", [
        el("div", "tech-tag", "Motion & UI Icons"),
        el("h4", null, el("a", {
          href: "https://github.com/itshover/itshover",
          target: "_blank",
          rel: "noopener noreferrer",
          style: "color: inherit; text-decoration: none;"
        }, "itshover")),
        el("p", null, "An open-source library of motion-first animated icons and interactive UI vectors crafted for modern, fluid web user experiences.")
      ])
    ])
  ]);
  wrapper.appendChild(stackSection);

  wrapper.appendChild(el("hr", "about-section-divider"));

  // ── Section 5: Official Community & Social Media Channels ──
  var socialSection = el("section", { class: "about-section", id: "community-channels" }, [
    el("div", "section-heading-wrap", [
      el("span", "section-tag", "05 / Connect"),
      el("h2", "about-subheading", "Official Community & Social Media Channels")
    ]),
    el("p", "about-section-desc", "Join our growing community across India, stay updated on chapter releases, connect with creators, and share your feedback:"),

    el("div", "social-grid", [
      // Nyburs
      el("a", {
        class: "social-channel-card nyburs-card",
        href: social.nyburs || "https://www.nyburs.com/home",
        target: "_blank",
        rel: "noopener noreferrer"
      }, [
        el("div", "social-card-top", [
          el("div", "social-brand-icon", [
            el("img", {
              src: "icons/Nyburs.svg",
              alt: "Nyburs",
              class: "social-brand-img",
              width: "28",
              height: "28"
            })
          ]),
          externalArrowIcon()
        ]),
        el("h3", "social-card-name", "Nyburs"),
        el("p", "social-card-desc", "Connect with local storytelling circles, participate in regional literary communities, and discover vernacular Indian readers."),
        el("span", "social-card-action", "Visit Nyburs Community →")
      ]),

      // Vync
      el("a", {
        class: "social-channel-card vync-card",
        href: social.vync || "https://vync.live/",
        target: "_blank",
        rel: "noopener noreferrer"
      }, [
        el("div", "social-card-top", [
          el("div", "social-brand-icon", [
            el("img", {
              src: "icons/Vync.svg",
              alt: "Vync",
              class: "social-brand-img",
              width: "28",
              height: "28"
            })
          ]),
          externalArrowIcon()
        ]),
        el("h3", "social-card-name", "Vync"),
        el("p", "social-card-desc", "Join live conversation rooms, real-time discussion stages, and talk directly with fellow readers during new chapter drops."),
        el("span", "social-card-action", "Join on Vync Live →")
      ]),

      // Twitter / X
      el("a", {
        class: "social-channel-card twitter-card",
        href: social.twitter || "https://twitter.com/kathasangam",
        target: "_blank",
        rel: "noopener noreferrer"
      }, [
        el("div", "social-card-top", [
          el("div", "social-brand-icon", [
            el("img", {
              src: "icons/twitter-x-icon.svg",
              alt: "Twitter / X",
              class: "social-brand-img",
              width: "24",
              height: "24"
            })
          ]),
          externalArrowIcon()
        ]),
        el("h3", "social-card-name", "Twitter / X"),
        el("p", "social-card-desc", "Catch official platform announcements, daily chapter spotlights, featured author highlights, and release notes."),
        el("span", "social-card-action", "Follow @KathaSangam →")
      ]),

      // GitHub
      el("a", {
        class: "social-channel-card github-card",
        href: social.github || "https://github.com/randommelo-lang/kathasangam",
        target: "_blank",
        rel: "noopener noreferrer"
      }, [
        el("div", "social-card-top", [
          el("div", "social-brand-icon", [
            el("img", {
              src: "icons/github-icon.svg",
              alt: "GitHub",
              class: "social-brand-img",
              width: "26",
              height: "26"
            })
          ]),
          externalArrowIcon()
        ]),
        el("h3", "social-card-name", "GitHub"),
        el("p", "social-card-desc", "Explore our open-source codebase, review our database schemas, report bugs, and propose new features."),
        el("span", "social-card-action", "View Repository →")
      ]),

      // Support Email
      el("a", {
        class: "social-channel-card email-card",
        href: "mailto:" + (social.email || "contact@kathasangam.co.in")
      }, [
        el("div", "social-card-top", [
          el("div", "social-brand-icon", [
            el("img", {
              src: "icons/gmail-icon.svg",
              alt: "Support Email",
              class: "social-brand-img",
              width: "26",
              height: "26"
            })
          ]),
          externalArrowIcon()
        ]),
        el("h3", "social-card-name", "Support Email"),
        el("p", "social-card-desc", "Have questions regarding creator onboarding, moderation appeals, or feedback? Drop us a line directly."),
        el("span", "social-card-action", social.email || "contact@kathasangam.co.in")
      ])
    ])
  ]);
  wrapper.appendChild(socialSection);

  container.appendChild(wrapper);
}
