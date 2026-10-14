import { state } from "../state.js";
import { el } from "../components.js";

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
    var tocBar = el("div", "about-toc-bar", [
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
        "India's decentralized storytelling platform for original serialized fiction, web novels, and Chitrānk webcomics. Built for writers, artists, and passionate readers across the nation."
      ),
      tocBar
    ]);
    wrapper.appendChild(hero);

  // ── Section 1: Mission & Formats ──
  var missionSection = el("section", { class: "about-section", id: "mission-vision" }, [
    el("div", "section-heading-wrap", [
      el("span", "section-tag", "01 / Overview"),
      el("h2", "about-subheading", "Mission & Vision")
    ]),
    el("blockquote", "about-manifesto-quote", 
      "\"India is a land of ten thousand voices and ancient literary traditions. KathaSangam provides a modern, fast, and accessible digital sanctuary for serialized storytellers writing in Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Malayalam, Kannada, Punjabi, English, and beyond.\""
    ),
    el("div", "about-grid-2", [
      el("div", "about-card highlight-card", [
        el("div", "card-label-badge", "National Reach"),
        el("h3", null, "Stories Across India"),
        el("p", null, 
          "Whether you are crafting an epic historical fantasy, a tender monsoon romance, or a pulse-pounding cyberpunk thriller set in Neo-Bengaluru, KathaSangam is designed from the ground up for your voice."
        ),
        el("p", { style: "margin-top: 10px; color: var(--muted); font-size: 0.9rem;" },
          "Authors publish serialized fiction in original scripts, reaching readers in their mother tongue with complete creative freedom."
        )
      ]),
      el("div", "about-card highlight-card", [
        el("div", "card-label-badge", "Creator Economy"),
        el("h3", null, "Direct Creator Support"),
        el("p", null,
          "We believe storytellers deserve fair compensation for their craft. Through our Razorpay-powered creator wallet, readers can directly tip their favorite writers and comic illustrators via UPI, RuPay, and Cards."
        ),
        el("p", { style: "margin-top: 10px; color: var(--accent); font-weight: 500; font-size: 0.9rem;" },
          "95% goes directly to the creator. The remaining 5% covers platform hosting and payment gateway infrastructure. Supporters receive an exclusive Supporter badge in chapter discussions."
        )
      ])
    ]),

    el("h3", { class: "about-inner-subheading", style: "margin-top: 36px; margin-bottom: 16px;" }, "Two Distinct Storytelling Formats"),

    el("div", "about-grid-2", [
      el("div", "about-format-card web-novel-card", [
        el("div", "format-header", [
          el("span", "format-badge", "Format 01"),
          el("h3", null, "Web Novels"),
        ]),
        el("p", null, 
          "Serialized prose fiction designed for chapters that drop on schedule. Readers enjoy customized serif and sans-serif fonts, dark/sepia reading palettes, paragraph-level commenting, and instant cross-device progress synchronization."
        ),
        el("ul", "about-bullet-list", [
          el("li", null, "Comfortable pagination and continuous scroll reading modes"),
          el("li", null, "Full-screen distraction-free reading canvas"),
          el("li", null, "Direct chapter navigation and reading playlist integration")
        ])
      ]),

      el("div", "about-format-card chitrank-card", [
        el("div", "format-header", [
          el("span", "format-badge chitrank-badge", "Format 02"),
          el("h3", null, "Chitrānk (चित्रांक)"),
        ]),
        el("p", null,
          "Visual webcomics, graphic serials, and manga crafted for vertical scrolling and tap-to-turn reading. Artists can upload high-resolution comic pages, set episode covers, and interact with visual art enthusiasts."
        ),
        el("ul", "about-bullet-list", [
          el("li", null, "Seamless vertical webtoon scroll or fit-to-screen page modes"),
          el("li", null, "High-fidelity responsive zoom and full-bleed image displays"),
          el("li", null, "Optimized for mobile touch gestures and desktop monitors alike")
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
    el("p", "about-section-desc", "Everything you need to know to get the most out of reading, publishing, and community features."),

    el("div", "about-grid-3", [
      el("div", "about-feature-box", [
        el("div", "feature-num", "01"),
        el("h4", null, "Customizable Reader"),
        el("p", null, "Switch themes (Light, Sepia, Dark, Night), adjust font sizes from 14px to 28px, choose from Sans, Serif, Dyslexic, and Monospace typefaces, and toggle Fullscreen mode anytime.")
      ]),
      el("div", "about-feature-box", [
        el("div", "feature-num", "02"),
        el("h4", null, "Library & Playlists"),
        el("p", null, "Bookmark active stories to track reading progress automatically. Follow creators to receive release notifications. Build custom public or private Reading Playlists to organize your favorites.")
      ]),
      el("div", "about-feature-box", [
        el("div", "feature-num", "03"),
        el("h4", null, "Notification Center"),
        el("p", null, "Stay updated when followed authors publish new chapters. Notifications stay in your history for 3 months so you never lose track, and clicking marks them read while taking you right to the new chapter.")
      ]),
      el("div", "about-feature-box", [
        el("div", "feature-num", "04"),
        el("h4", null, "Author Studio"),
        el("p", null, "Draft stories in a distraction-free editor with autosave, rich text formatting, and instant word count metrics. Import existing manuscript files (.docx and .pdf) with a single click.")
      ]),
      el("div", "about-feature-box", [
        el("div", "feature-num", "05"),
        el("h4", null, "Creator Tipping"),
        el("p", null, "Send direct tips to writers and illustrators starting at ₹10 using UPI, Cards, or NetBanking. 95% goes directly to the creator's wallet, and supporters get golden Supporter badges in comments.")
      ]),
      el("div", "about-feature-box", [
        el("div", "feature-num", "06"),
        el("h4", null, "Community Moderation"),
        el("p", null, "Report content or comments that breach community standards. Our trusted moderation team reviews flags promptly to maintain a respectful, inspiring environment for all readers.")
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
    el("p", "about-section-desc", "To maintain KathaSangam as a safe, respectful, and vibrant creative home, all users are expected to follow these standards:"),

    el("div", "rules-list", [
      el("div", "rule-card", [
        el("div", "rule-badge", "Rule 01"),
        el("div", "rule-content", [
          el("h4", null, "100% Intellectual Property & Copyright Ownership"),
          el("p", null, "Creators retain all copyright and IP rights to their stories, artwork, and characters. KathaSangam makes no claim of ownership over your creative work. Plagiarism, scraping, or reposting someone else's work without permission is strictly prohibited and results in immediate account suspension.")
        ])
      ]),

      el("div", "rule-card", [
        el("div", "rule-badge", "Rule 02"),
        el("div", "rule-content", [
          el("h4", null, "Accurate Content Ratings & NSFW Labeling"),
          el("p", null, "Authors must accurately categorize their works (All Ages, Teen 13+, or Mature 18+). Stories containing violence, mature themes, or adult content must enable the Mature toggle in Story Settings so younger audiences and sensitive readers can browse safely.")
        ])
      ]),

      el("div", "rule-card", [
        el("div", "rule-badge", "Rule 03"),
        el("div", "rule-content", [
          el("h4", null, "Constructive & Civil Discussions"),
          el("p", null, "Critique and artistic discussion are warmly encouraged. However, hate speech, religious hostility, harassment, personal attacks, doxxing, or defamation against creators or fellow readers will not be tolerated. Keep comment sections focused on the story and characters.")
        ])
      ]),

      el("div", "rule-card", [
        el("div", "rule-badge", "Rule 04"),
        el("div", "rule-content", [
          el("h4", null, "No Spam or Commercial Promotion"),
          el("p", null, "Automated bots, repetitive spam comments, misleading story descriptions, link farming, and unauthorized commercial advertising are prohibited.")
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
        el("p", null, "A blazing-fast, memory-safe backend framework engineered for concurrency, zero memory leaks, and high throughput under high concurrent reader loads.")
      ]),
      el("div", "tech-card", [
        el("div", "tech-tag", "Async Runtime"),
        el("h4", null, "Tokio & SQLx"),
        el("p", null, "Event-driven asynchronous I/O with compile-time verified database queries, preventing SQL syntax errors and vulnerabilities before code ever reaches production.")
      ]),
      el("div", "tech-card", [
        el("div", "tech-tag", "Database & Auth"),
        el("h4", null, "PostgreSQL & Supabase"),
        el("p", null, "Rock-solid relational persistence with Row Level Security (RLS), ACID transactions, and secure JSON Web Token authentication.")
      ]),
      el("div", "tech-card", [
        el("div", "tech-tag", "Client Document Engine"),
        el("h4", null, "Mammoth.js"),
        el("p", null, "Client-side .docx manuscript parsing that converts Word documents into clean, semantic HTML without transmitting sensitive drafts through unencrypted channels.")
      ]),
      el("div", "tech-card", [
        el("div", "tech-tag", "Visual Rendering"),
        el("h4", null, "PDF.js"),
        el("p", null, "Mozilla's open-source HTML5 PDF technology powering in-browser visual comic previewing and manuscript rendering.")
      ]),
      el("div", "tech-card", [
        el("div", "tech-tag", "Typography"),
        el("h4", null, "Inter & JetBrains Mono"),
        el("p", null, "Crafted by Rasmus Andersson (Inter) and JetBrains (JetBrains Mono) for unmatched readability across mobile displays, high-DPI screens, and code blocks.")
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
          el("span", "social-open-icon", { innerHTML: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"></path><path d="M7 7h10v10"></path></svg>' })
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
          el("span", "social-open-icon", { innerHTML: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"></path><path d="M7 7h10v10"></path></svg>' })
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
          el("span", "social-open-icon", { innerHTML: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"></path><path d="M7 7h10v10"></path></svg>' })
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
          el("span", "social-open-icon", { innerHTML: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"></path><path d="M7 7h10v10"></path></svg>' })
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
          el("span", "social-open-icon", { innerHTML: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"></path><path d="M7 7h10v10"></path></svg>' })
        ]),
        el("h3", "social-card-name", "Support Email"),
        el("p", "social-card-desc", "Have questions regarding creator onboarding, payment inquiries, or feedback? Drop us a line directly."),
        el("span", "social-card-action", social.email || "contact@kathasangam.co.in")
      ])
    ])
  ]);
  wrapper.appendChild(socialSection);

  container.appendChild(wrapper);
}
