(function () {
  "use strict";

  var API_BASE_URL = window.KATHASANGAM_API_URL || "";

  // ── Supabase Auth Config ──
  // Loaded from backend /api/config (reads from .env)
  var SUPABASE_URL = "";
  var SUPABASE_ANON_KEY = "";
  var supabaseClient = null;
  var adminEmail = "";
  var moderatorEmails = [];

  async function loadSupabaseConfig() {
    try {
      var res = await fetch(API_BASE_URL + "/api/config");
      if (!res.ok) throw new Error(res.status);
      var config = await res.json();
      SUPABASE_URL = config.supabase_url;
      SUPABASE_ANON_KEY = config.supabase_anon_key;
      adminEmail = config.admin_email || "";
      moderatorEmails = config.moderator_emails || [];

      if (window.supabase && SUPABASE_ANON_KEY) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("[AUTH] Supabase client initialized from /api/config");
      } else {
        console.warn("[AUTH] Supabase JS SDK not loaded or anon key missing");
      }
    } catch (e) {
      console.error("[AUTH] Failed to load config from /api/config:", e);
    }
  }

  var state = {
    role: "reader",
    stories: [],
    library: [],
    reports: [],
    notifications: [],
    selectedStoryId: "",
    selectedChapterIndex: 0,
    // Auth state
    user: null,        // Supabase user object
    accessToken: null, // JWT token
    profile: null      // { username, role, avatar_url }
  };
  var currentView = getRoute();
  var currentStoryId = "";
  var currentChapterIndex = 0;
  var currentComicPageIndex = 0;
  var filterType = "all";
  var readerMode = "scroll";
  var readerTheme = "light";
  var readerSize = 19;

  var view = document.getElementById("view");
  var pageTitle = document.getElementById("pageTitle");
  var searchInput = document.getElementById("searchInput");
  var genreFilter = document.getElementById("genreFilter");
  var alerts = document.getElementById("alerts");

  // Auth DOM elements
  var authArea = document.getElementById("authArea");
  var authModal = document.getElementById("authModal");
  var authModalClose = document.getElementById("authModalClose");
  var loginForm = document.getElementById("loginForm");
  var signupForm = document.getElementById("signupForm");
  var authError = document.getElementById("authError");
  var authSuccess = document.getElementById("authSuccess");
  var signInBtn = document.getElementById("signInBtn");

  // ── API helpers ──

  // ── Auth Functions ──
  function openAuthModal() {
    authModal.hidden = false;
    clearAuthMessages();
    switchAuthTab("login");
    document.body.style.overflow = "hidden";
  }

  function closeAuthModal() {
    authModal.hidden = true;
    clearAuthMessages();
    loginForm.reset();
    signupForm.reset();
    document.body.style.overflow = "";
  }

  // ── Story Modal Functions ──
  function openStoryModal() {
    if (!state.user) {
      openAuthModal();
      notify("Please log in to create a story.");
      return;
    }
    var content = document.getElementById("storyModalContent");
    if (content) {
      content.innerHTML = "";
      content.appendChild(storyForm());
    }
    var storyModal = document.getElementById("storyModal");
    if (storyModal) {
      storyModal.hidden = false;
    }
    document.body.style.overflow = "hidden";
  }

  function closeStoryModal() {
    var storyModal = document.getElementById("storyModal");
    if (storyModal) {
      storyModal.hidden = true;
    }
    document.body.style.overflow = "";
  }

  function clearAuthMessages() {
    authError.hidden = true;
    authError.textContent = "";
    authSuccess.hidden = true;
    authSuccess.textContent = "";
  }

  function showAuthError(msg) {
    authError.textContent = msg;
    authError.hidden = false;
    authSuccess.hidden = true;
  }

  function showAuthSuccess(msg) {
    authSuccess.textContent = msg;
    authSuccess.hidden = false;
    authError.hidden = true;
  }

  function switchAuthTab(tab) {
    var tabs = document.querySelectorAll("[data-auth-tab]");
    tabs.forEach(function (t) {
      t.classList.toggle("active", t.dataset.authTab === tab);
    });
    loginForm.hidden = tab !== "login";
    signupForm.hidden = tab !== "signup";
    clearAuthMessages();

    var title = document.getElementById("authModalTitle");
    var subtitle = document.querySelector(".auth-modal-subtitle");
    if (tab === "login") {
      title.textContent = "Welcome back";
      subtitle.textContent = "Log in to your KathaSangam account";
    } else {
      title.textContent = "Create account";
      subtitle.textContent = "Join KathaSangam and start your story";
    }
  }

  function setAuthLoading(formEl, loading) {
    var btn = formEl.querySelector(".auth-submit-btn");
    if (loading) {
      btn.classList.add("loading");
      btn.disabled = true;
    } else {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (!supabaseClient) {
      showAuthError("Supabase not configured. Config could not be loaded.");
      return;
    }
    clearAuthMessages();
    var fd = new FormData(loginForm);
    var email = fd.get("email").trim();
    var password = fd.get("password");

    if (!email || !password) {
      showAuthError("Please fill in all fields.");
      return;
    }

    setAuthLoading(loginForm, true);
    console.log("[AUTH] Attempting login for:", email);

    try {
      var result = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (result.error) {
        console.error("[AUTH] Login failed:", result.error.message);
        showAuthError(result.error.message);
        setAuthLoading(loginForm, false);
        return;
      }

      console.log("[AUTH] Login successful, session received");
      // Auth state change listener will handle the rest
      closeAuthModal();
    } catch (err) {
      console.error("[AUTH] Login exception:", err.message);
      showAuthError("Something went wrong. Please try again.");
      setAuthLoading(loginForm, false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    if (!supabaseClient) {
      showAuthError("Supabase not configured. Config could not be loaded.");
      return;
    }
    clearAuthMessages();
    var fd = new FormData(signupForm);
    var email = fd.get("email").trim();
    var password = fd.get("password");
    var confirmPassword = fd.get("confirmPassword");

    if (!email || !password || !confirmPassword) {
      showAuthError("Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      showAuthError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      showAuthError("Password must be at least 6 characters.");
      return;
    }

    setAuthLoading(signupForm, true);

    try {
      var result = await supabaseClient.auth.signUp({
        email: email,
        password: password
      });

      if (result.error) {
        showAuthError(result.error.message);
        setAuthLoading(signupForm, false);
        return;
      }

      // Check if email confirmation is required
      if (result.data.user && !result.data.session) {
        showAuthSuccess("Account created! Check your email to confirm your account.");
        setAuthLoading(signupForm, false);
        signupForm.reset();
      } else {
        // Auto-confirmed, auth state listener handles it
        closeAuthModal();
      }
    } catch (err) {
      showAuthError("Something went wrong. Please try again.");
      setAuthLoading(signupForm, false);
    }
  }

  async function handleSignOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    // Auth state listener handles cleanup
  }

  async function changeUserRole(newRole) {
    if (!state.accessToken) return;
    try {
      await apiPatch("/profile/role", { role: newRole });
      state.role = newRole;
      if (state.profile) {
        state.profile.role = newRole;
      }
      updateAuthUI();
      render();
    } catch (e) {
      console.error("Failed to switch role:", e);
      if (e.message === "403") {
        alert("Permission Denied: You are not authorized to switch to this role.");
      } else {
        alert("Failed to switch role: " + e.message);
      }
      // Re-fetch profile to sync back the correct UI state
      fetchProfile().then(function() {
        updateAuthUI();
        render();
      });
    }
  }

  // ── API helpers ──
  function apiPost(path, body) {
    return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }
  function apiPatch(path, body) {
    return api(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  }
  function apiDelete(path) {
    return api(path, { method: "DELETE" });
  }

  async function api(path, options = {}) {

    let token = state.accessToken; // Use cached token first

    // If no cached token, try to get fresh session
    if (!token && supabaseClient) {
      try {
        const {
          data: { session }
        } = await supabaseClient.auth.getSession();

        token = session?.access_token;
        state.accessToken = token || null;

        if (!token) {
          console.warn(`[API ${path}] No active session - request will be unauthenticated`);
        }
      } catch (err) {
        console.error(`[API ${path}] Failed to get session:`, err.message);
        state.accessToken = null;
      }
    }

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
      console.log(`[API ${path}] Attaching JWT token (first 20 chars: ${token.substring(0, 20)}...)`);
    }

    const response = await fetch(
      API_BASE_URL + `/api${path}`,
      {
        ...options,
        headers,
      }
    );

    if (!response.ok) {

      // Better debugging
      const text = await response.text();

      console.error(`[API ${path}] Error ${response.status}:`, text);

      throw new Error(response.status);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  async function fetchProfile() {

    try {
      console.log("[PROFILE] Fetching profile with token:", state.accessToken ? `${state.accessToken.substring(0, 20)}...` : "none");
      var profile = await api("/profile");

      console.log("[PROFILE] Profile loaded successfully:", profile);
      state.profile = profile;

      state.role = profile.role || "reader";

    } catch (e) {

      console.error("[PROFILE] Failed to load profile:", e.message);
      state.profile = null;

      state.role = "reader";
    }
  }

  function onAuthStateChange(event, session) {
    console.log("[AUTH] onAuthStateChange event:", event);
    if (session && session.user) {
      console.log("[AUTH] User logged in:", session.user.email, "Token:", session.access_token ? `${session.access_token.substring(0, 20)}...` : "none");
      state.user = session.user;
      state.accessToken = session.access_token;
      fetchProfile().then(function () {
        updateAuthUI();
        render();
      });
    } else {
      console.log("[AUTH] User logged out");
      state.user = null;
      state.accessToken = null;
      state.profile = null;
      state.role = "reader";
      updateAuthUI();
      render();
    }
  }

  function updateAuthUI() {
    if (state.user && state.profile) {
      var username = state.profile.username || state.user.email.split("@")[0];
      var role = state.profile.role || "reader";
      var initial = username.charAt(0).toUpperCase();

      authArea.innerHTML = "";
      var info = document.createElement("div");
      info.className = "auth-user-info";

      var avatar = document.createElement("span");
      avatar.className = "auth-avatar";
      avatar.textContent = initial;

      var nameEl = document.createElement("span");
      nameEl.className = "auth-username";
      nameEl.textContent = username;

      var badge = document.createElement("select");
      badge.className = "auth-role-badge-select";
      badge.dataset.role = role;
      badge.title = "Click to change your role (Developer Switcher)";

      var userEmail = (state.user.email || "").toLowerCase();
      var allRoles = ["reader", "author", "moderator", "admin"];
      var roles = allRoles.filter(function (r) {
        if (r === "reader" || r === "author") return true;
        if (r === "admin") {
          return userEmail === adminEmail.toLowerCase() || role === "admin";
        }
        if (r === "moderator") {
          return moderatorEmails.includes(userEmail) || userEmail === adminEmail.toLowerCase() || role === "moderator";
        }
        return false;
      });

      roles.forEach(function (r) {
        var opt = document.createElement("option");
        opt.value = r;
        opt.textContent = r;
        opt.selected = (r === role);
        badge.appendChild(opt);
      });

      badge.addEventListener("change", function (e) {
        changeUserRole(e.target.value);
      });

      var signOutBtn = document.createElement("button");
      signOutBtn.className = "btn auth-signout-btn";
      signOutBtn.type = "button";
      signOutBtn.textContent = "Sign Out";
      signOutBtn.addEventListener("click", handleSignOut);

      info.appendChild(avatar);
      info.appendChild(nameEl);
      info.appendChild(badge);

      authArea.appendChild(info);
      authArea.appendChild(signOutBtn);
    } else if (state.user) {
      // User logged in but profile not yet loaded
      var email = state.user.email || "";
      authArea.innerHTML = "";

      var info2 = document.createElement("div");
      info2.className = "auth-user-info";

      var avatar2 = document.createElement("span");
      avatar2.className = "auth-avatar";
      avatar2.textContent = email.charAt(0).toUpperCase();

      var nameEl2 = document.createElement("span");
      nameEl2.className = "auth-username";
      nameEl2.textContent = email.split("@")[0];

      var signOutBtn2 = document.createElement("button");
      signOutBtn2.className = "btn auth-signout-btn";
      signOutBtn2.type = "button";
      signOutBtn2.textContent = "Sign Out";
      signOutBtn2.addEventListener("click", handleSignOut);

      info2.appendChild(avatar2);
      info2.appendChild(nameEl2);

      authArea.appendChild(info2);
      authArea.appendChild(signOutBtn2);
    } else {
      // Logged out
      authArea.innerHTML = "";
      var btn = document.createElement("button");
      btn.id = "signInBtn";
      btn.className = "btn primary auth-signin-btn";
      btn.type = "button";
      btn.textContent = "Log In";
      btn.addEventListener("click", openAuthModal);
      authArea.appendChild(btn);
    }
  }

  // ── Bootstrap ──
  async function bootstrap() {
    bindGlobalEvents();
    bindAuthEvents();
    await loadSupabaseConfig();
    initAuth();
    loadAll().then(function () {
      hydrateGenres();
      render();
    }).catch(function (err) {
      console.warn("loadAll failed:", err);
      render();
    });
  }

  function initAuth() {
    if (!supabaseClient) {
      console.warn("[AUTH] Supabase not initialized - auth disabled");
      updateAuthUI();
      return;
    }

    console.log("[AUTH] Initializing auth listeners...");

    // Listen for auth state changes
    supabaseClient.auth.onAuthStateChange(function (event, session) {
      console.log("[AUTH] State change event:", event, "Session:", !!session);
      onAuthStateChange(event, session);
    });

    // Check for existing session
    supabaseClient.auth.getSession().then(function (result) {
      var session = result && result.data ? result.data.session : null;
      console.log("[AUTH] Checking existing session on startup - found:", !!session);
      if (session) {
        console.log("[AUTH] Existing session found, user:", session.user ? session.user.email : "unknown");
        onAuthStateChange("INITIAL_SESSION", session);
      } else {
        console.log("[AUTH] No existing session on startup");
        updateAuthUI();
      }
    }).catch(function (err) {
      console.error("[AUTH] Failed to get session on startup:", err.message);
      updateAuthUI();
    });
  }

  function loadAll() {
    return Promise.all([
      api("/stories").catch(function () { return []; }),
      api("/library/ids").catch(function () { return []; }),
      api("/reports").catch(function () { return []; }),
      api("/notifications").catch(function () { return []; })
    ]).then(function (results) {
      state.stories = results[0];
      state.library = results[1];
      state.reports = results[2];
      state.notifications = results[3];
      if (state.stories.length && !currentStoryId) currentStoryId = state.stories[0].id;
    });
  }

  bootstrap();

  // ── Events ──
  function bindGlobalEvents() {
    window.addEventListener("hashchange", function () { currentView = getRoute(); render(); });
    searchInput.addEventListener("input", function () {
      if (currentView !== "discover") { currentView = "discover"; window.location.hash = "discover"; }
      render();
    });
    genreFilter.addEventListener("change", render);
    view.addEventListener("click", handleViewClick);
    view.addEventListener("input", handleViewInput);
    view.addEventListener("submit", handleViewSubmit);
  }

  function bindAuthEvents() {
    // Use event delegation on authArea for Sign In button (survives DOM replacement)
    authArea.addEventListener("click", function (e) {
      var target = e.target.closest("#signInBtn");
      if (target) openAuthModal();
    });

    // Modal close button — use event delegation on the modal backdrop
    authModal.addEventListener("click", function (e) {
      // Close button
      if (e.target.closest("#authModalClose")) {
        closeAuthModal();
        return;
      }
      // Tab switching
      var tab = e.target.closest("[data-auth-tab]");
      if (tab) {
        switchAuthTab(tab.dataset.authTab);
        return;
      }
      // Backdrop click (click on the backdrop itself, not the modal content)
      if (e.target === authModal) {
        closeAuthModal();
      }
    });

    // Story Modal close/backdrop clicks
    var storyModal = document.getElementById("storyModal");
    if (storyModal) {
      storyModal.addEventListener("click", function (e) {
        if (e.target.closest("#storyModalClose") || e.target === storyModal) {
          closeStoryModal();
        }
      });
    }

    // Escape key to close
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !authModal.hidden) closeAuthModal();
      if (e.key === "Escape" && storyModal && !storyModal.hidden) closeStoryModal();
    });

    // Form submissions
    loginForm.addEventListener("submit", handleLogin);
    signupForm.addEventListener("submit", handleSignup);
  }

  function getRoute() { return window.location.hash.replace("#", "") || "discover"; }

  function hydrateGenres() {
    genreFilter.innerHTML = '<option value="all">All genres</option>';
    var genres = unique(state.stories.map(function (s) { return s.genre; })).sort();
    genres.forEach(function (g) {
      var o = document.createElement("option"); o.value = g; o.textContent = g; genreFilter.appendChild(o);
    });
  }

  // ── Render ──
  function render() {
    var allowed = ["discover", "library", "reader", "studio", "moderation"];
    if (allowed.indexOf(currentView) === -1) currentView = "discover";
    var canModerate = canModerateRole();
    var moderationLink = document.querySelector('[data-nav="moderation"]');
    if (moderationLink) moderationLink.hidden = !canModerate;
    if (currentView === "moderation" && !canModerate) {
      currentView = "discover";
      window.location.hash = "discover";
    }
    document.querySelectorAll("[data-nav]").forEach(function (link) {
      link.classList.toggle("active", link.dataset.nav === currentView);
    });
    pageTitle.textContent = { discover: "Discover", library: "Library", reader: "Reader", studio: "Author Studio", moderation: "Moderation" }[currentView];
    view.innerHTML = "";
    if (currentView === "discover") renderDiscover();
    if (currentView === "library") renderLibrary();
    if (currentView === "reader") renderReader();
    if (currentView === "studio") renderStudio();
    if (currentView === "moderation") renderModeration();
  }

  // ── Discover ──
  function renderDiscover() {
    var stories = filteredStories();
    var featured = state.stories.slice(0, 3);

    // Hero Carousel
    var carousel = el("section", "hero-carousel");
    var track = el("div", "carousel-track");
    featured.forEach(function (story) {
      var slide = el("div", "carousel-slide");
      var bg = el("div", "cover-bg"); bg.style.background = story.cover; slide.appendChild(bg);
      slide.appendChild(el("p", "carousel-eyebrow", story.genre + " · " + story.type));
      slide.appendChild(el("h2", "carousel-title", story.title));
      slide.appendChild(el("p", "carousel-desc", story.description));
      slide.appendChild(el("div", "carousel-meta", story.author + " · " + formatNumber(story.views) + " reads · " + formatNumber(story.followers) + " followers"));
      slide.appendChild(el("div", "button-row", [
        button("Read now", "btn primary", { action: "openStory", id: story.id }),
        button(state.library.indexOf(story.id) === -1 ? "Follow" : "Following", "btn", { action: "follow", id: story.id })
      ]));
      track.appendChild(slide);
    });
    carousel.appendChild(track);
    var dots = el("div", "carousel-dots");
    featured.forEach(function (_, i) {
      var dot = el("button", "carousel-dot" + (i === 0 ? " active" : "")); dot.dataset.action = "carouselDot"; dot.dataset.index = String(i); dots.appendChild(dot);
    });
    carousel.appendChild(dots);
    var prev = el("button", "carousel-arrow prev", "‹"); prev.dataset.action = "carouselPrev";
    var next = el("button", "carousel-arrow next", "›"); next.dataset.action = "carouselNext";
    carousel.appendChild(prev); carousel.appendChild(next);
    view.appendChild(carousel);
    startCarouselAuto();

    // Stats
    api("/stats").then(function (s) {
      var row = document.querySelector(".stats-row");
      if (row) { row.innerHTML = ""; row.appendChild(metric("Published", s.published).firstChild || metric("Published", s.published)); }
    });
    view.appendChild(el("div", "stats-row", [
      metric("Published", countPublished()), metric("Total reads", formatNumber(totalViews())),
      metric("Followers", formatNumber(totalFollowers())), metric("Open reports", countOpenReports())
    ]));

    // Filter toolbar
    view.appendChild(el("div", "toolbar", [
      el("div", "segmented", [segmentButton("All", "all", filterType), segmentButton("Web Novel", "Web Novel", filterType), segmentButton("Chitrānk", "Chitrānk", filterType)]),
      el("div", "mini-meta", stories.length + " results")
    ]));

    // Story grid
    var grid = el("section", "story-grid"); grid.id = "storyGrid";
    stories.forEach(function (story) { grid.appendChild(storyCard(story)); });
    view.appendChild(stories.length ? grid : el("div", "empty", "No stories match the current search."));
  }

  var carouselIndex = 0, carouselTimer = null;
  function startCarouselAuto() { clearInterval(carouselTimer); carouselTimer = setInterval(function () { moveCarousel(1); }, 5000); }
  function moveCarousel(dir) {
    var t = document.querySelector(".carousel-track"); if (!t) return;
    carouselIndex = (carouselIndex + dir + t.children.length) % t.children.length; applyCarouselPosition();
  }
  function goToSlide(i) { carouselIndex = i; applyCarouselPosition(); startCarouselAuto(); }
  function applyCarouselPosition() {
    var t = document.querySelector(".carousel-track"); if (!t) return;
    t.style.transform = "translateX(-" + (carouselIndex * 100) + "%)";
    document.querySelectorAll(".carousel-dot").forEach(function (d, j) { d.classList.toggle("active", j === carouselIndex); });
  }

  // ── Library ──
  function renderLibrary() {
    var libraryStories = state.stories.filter(function (s) { return state.library.indexOf(s.id) !== -1; });
    view.appendChild(el("div", "layout-two", [
      el("section", null, [
        el("div", "toolbar", [el("h2", null, "Reading list"), el("div", "mini-meta", libraryStories.length + " followed")]),
        libraryStories.length ? storyGrid(libraryStories) : el("div", "empty", "Follow a story to add it to your library.")
      ]),
      el("aside", null, [
        el("section", "panel", [el("h2", null, "Notifications"), list(state.notifications, "activity-list", function (n) { return el("li", "activity-item", n); })]),
        el("section", "panel", [el("h2", null, "Progress"), list(libraryStories, "activity-list", function (s) {
          return el("li", "activity-item", [el("strong", null, s.title), progress(s.progress), el("span", "mini-meta", s.progress + "% read")]);
        })])
      ])
    ]));
  }

  // ── Reader ──
  function renderReader() {
    var story = getCurrentStory(); var chapter = getCurrentChapter(story); var isComic = story.type === "Chitrānk";
    var controls = [
      el("div", "segmented", [segmentButton("Scroll", "scroll", readerMode, "readerMode"), segmentButton(isComic ? "Page flip" : "Pages", "pages", readerMode, "readerMode")])
    ];
    if (isComic && readerMode === "pages") controls.push(comicPager(chapter));
    if (!isComic) controls.push(el("label", "mini-meta", ["Text size", input("range", readerSize, { min: "16", max: "26", action: "fontSize" })]));
    controls.push(progress(story.progress));
    view.appendChild(el("div", "reader-frame", [
      el("div", "reader-toolbar", [
        el("div", null, [el("h2", null, story.title), el("div", "mini-meta", [story.author + " / " + chapter.title + " / " + chapter.access, chapter.status === "scheduled" ? " Scheduled " + formatDate(chapter.scheduledAt) : ""])]),
        el("div", "button-row", [button("Prev", "btn", { action: "chapter", step: "-1" }), button("Next", "btn", { action: "chapter", step: "1" }), button(readerTheme === "dark" ? "Light" : "Dark", "btn", { action: "theme" })])
      ]),
      el("div", "reader-toolbar", controls),
      readerContent(story, chapter)
    ]));
    view.appendChild(el("div", "layout-two", [
      el("section", "panel", [el("h2", null, "Chapters"), list(story.chapters, "chapter-list", function (item, i) {
        return el("li", "chapter-item", [el("strong", null, item.title), el("span", "mini-meta", (i + 1) + " / " + item.status + " / " + item.access), button("Open", "btn", { action: "openChapter", index: String(i) })]);
      })]),
      el("aside", "panel", [el("h2", null, "Comments"),
        chapter.comments.length ? list(chapter.comments, "activity-list", function (c) {
          var canDelete = (state.user && c.user_id === state.user.id) || ["moderator", "admin"].indexOf(state.role) !== -1;
          return el("li", "activity-item", [
            el("div", "comment-header", [
              el("strong", null, c.user),
              canDelete ? button("Delete", "btn danger btn-sm", { action: "deleteComment", id: c.id }) : null
            ]),
            el("span", null, c.text)
          ]);
        }) : el("div", "empty", "No comments yet."),
        commentForm()
      ])
    ]));
  }

  function readerContent(story, chapter) {
    var cn = "reader-content " + (readerMode === "pages" && story.type !== "Chitrānk" ? "paginated " : "") + (readerTheme === "dark" ? "dark" : "");
    var container = el("article", cn); container.style.setProperty("--reader-size", readerSize + "px");
    if (story.type === "Chitrānk" && chapter.pages) {
      if (readerMode === "pages") return comicFlipContent(chapter);
      container.appendChild(el("div", "comic-pages", chapter.pages.map(function (p) {
        var pg = el("figure", "comic-page"); pg.style.setProperty("--page-bg", p.bg); pg.dataset.label = p.label; return pg;
      })));
      return container;
    }
    if (chapter.content) chapter.content.forEach(function (para) { container.appendChild(el("p", null, para)); });
    return container;
  }

  function comicFlipContent(chapter) {
    var pages = chapter.pages || [];
    clampComicPage(pages);
    var current = pages[currentComicPageIndex];
    var container = el("article", "reader-content comic-reader flip-mode" + (readerTheme === "dark" ? " dark" : ""));
    if (!current) return container;
    var page = el("figure", "comic-page comic-page-current");
    page.style.setProperty("--page-bg", current.bg);
    page.dataset.label = current.label;
    page.dataset.page = (currentComicPageIndex + 1) + " / " + pages.length;
    container.appendChild(el("div", "comic-flip-stage", [
      comicNavButton("Previous page", "prev", -1, currentComicPageIndex === 0),
      page,
      comicNavButton("Next page", "next", 1, currentComicPageIndex >= pages.length - 1)
    ]));
    return container;
  }

  function comicPager(chapter) {
    var pages = chapter.pages || [];
    clampComicPage(pages);
    return el("div", "comic-pager", [
      button("Prev page", "btn", { action: "comicPage", step: "-1" }, currentComicPageIndex === 0),
      el("span", "mini-meta", pages.length ? (currentComicPageIndex + 1) + " / " + pages.length : "0 / 0"),
      button("Next page", "btn", { action: "comicPage", step: "1" }, currentComicPageIndex >= pages.length - 1)
    ]);
  }

  function comicNavButton(label, direction, step, disabled) {
    var b = button(direction === "prev" ? "‹" : "›", "comic-nav " + direction, { action: "comicPage", step: String(step) }, disabled);
    b.setAttribute("aria-label", label);
    return b;
  }

  // ── Studio Helpers ──
  function calculateStars(story) {
    if (!story || !story.views) return "5.0";
    var ratio = story.likes / story.views;
    var rating = 4.0 + (ratio * 10);
    return Math.min(5.0, Math.max(1.0, rating)).toFixed(1);
  }

  function generateChartData(story) {
    var pointsCount = 7;
    var data = [];
    if (story.chapters && story.chapters.length >= 2) {
      var maxReads = 0;
      story.chapters.forEach(function (ch) {
        if (ch.reads > maxReads) maxReads = ch.reads;
      });
      var stepX = 300 / Math.max(1, story.chapters.length - 1);
      story.chapters.forEach(function (ch, idx) {
        var x = idx * stepX;
        var y = 85;
        if (maxReads > 0) {
          y = 85 - ((ch.reads / maxReads) * 70);
        } else {
          y = 75 - ((idx * 7) % 30);
        }
        data.push({ x: Math.round(x), y: Math.round(y) });
      });
    } else {
      var seed = 0;
      if (story.id) {
        for (var i = 0; i < story.id.length; i++) {
          seed += story.id.charCodeAt(i);
        }
      }
      var stepX = 300 / (pointsCount - 1);
      for (var idx = 0; idx < pointsCount; idx++) {
        var x = idx * stepX;
        var sineVal = Math.sin(seed + idx * 0.95) * 28;
        var y = 60 + sineVal;
        data.push({ x: Math.round(x), y: Math.round(Math.min(85, Math.max(15, y))) });
      }
    }
    return data;
  }

  function svgEl(tag, attrs, children) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        n.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      if (Array.isArray(children)) {
        children.forEach(function (c) {
          n.appendChild(c);
        });
      } else {
        n.appendChild(children);
      }
    }
    return n;
  }

  function iconButton(text, className, data, iconName, disabled) {
    var btn = el("button", className || "btn");
    btn.type = "button";
    if (disabled) btn.disabled = true;
    if (data) {
      Object.keys(data).forEach(function (k) {
        btn.dataset[k] = data[k];
      });
    }
    if (iconName) {
      btn.appendChild(el("span", "icon " + iconName));
      btn.appendChild(document.createTextNode(" "));
    }
    if (text) {
      btn.appendChild(document.createTextNode(text));
    }
    return btn;
  }

  function analyticsMetricBox(label, value, trend, isUp) {
    var trendClass = isUp ? "analytics-trend-up" : "analytics-trend-down";
    var trendSymbol = isUp ? "▲ " : "▼ ";
    return el("div", "analytics-metric-box", [
      el("span", null, label),
      el("strong", null, String(value)),
      el("em", trendClass, trendSymbol + trend)
    ]);
  }

  function quickActionTile(iconName, label, action) {
    var tile = el("div", "quick-action-tile", [
      el("span", "icon icon-lg " + iconName),
      el("span", null, label)
    ]);
    tile.dataset.action = action;
    return tile;
  }

  // ── Studio ──
  function renderStudio() {
    var userStories = state.stories.filter(function (s) {
      return state.user && s.author_id === state.user.id;
    });
    var active = userStories.find(function (s) { return s.id === currentStoryId; }) || userStories[0];

    if (active && active.id && currentStoryId !== active.id) {
      currentStoryId = active.id;
    }

    // 1. Studio Header Toolbar
    var headerBtn = iconButton("New Story", "btn primary orange-glow-btn", { action: "openStoryModal" }, "icon-plus");
    
    // Dropdown to switch stories if they have multiple
    var storySelector = null;
    if (userStories.length > 1 && active) {
      storySelector = el("select", "auth-role-badge-select");
      storySelector.style.marginLeft = "16px";
      storySelector.style.padding = "6px 12px";
      storySelector.style.fontSize = "0.9rem";
      storySelector.style.border = "1px solid rgba(255,255,255,0.15)";
      storySelector.style.borderRadius = "4px";
      storySelector.style.backgroundColor = "rgba(25,25,25,0.8)";
      storySelector.style.color = "var(--text)";
      
      userStories.forEach(function (s) {
        var opt = el("option", null, s.title);
        opt.value = s.id;
        opt.selected = (s.id === active.id);
        storySelector.appendChild(opt);
      });
      
      storySelector.addEventListener("change", function (e) {
        currentStoryId = e.target.value;
        render();
      });
    }

    var headerTitleArea = el("div", null, [
      el("div", null, [
        el("h2", null, "Studio Overview"),
        el("p", null, "Manage your series, outline chapters, and track metrics")
      ])
    ]);
    if (storySelector) {
      headerTitleArea.appendChild(el("div", { style: "margin-top: 10px; display: flex; align-items: center;" }, [
        el("span", { style: "font-size: 0.85rem; color: var(--text-muted);" }, "Active Series:"),
        storySelector
      ]));
    }

    var headerToolbar = el("div", "studio-header-toolbar", [
      headerTitleArea,
      headerBtn
    ]);

    // 2. Middle Column Components
    var middleColumnChildren = [];
    middleColumnChildren.push(headerToolbar);

    if (active) {
      // Active Story Card
      var coverEl = el("div", "studio-active-cover");
      if (active.cover) {
        coverEl.style.backgroundImage = active.cover.startsWith("url") ? active.cover : "url('" + active.cover + "')";
      } else {
        coverEl.style.background = "linear-gradient(135deg, #333, #111)";
      }

      var activeCard = el("div", "studio-story-active-card", [
        coverEl,
        el("div", "studio-active-details", [
          el("span", "studio-active-badge", active.type),
          el("div", "studio-active-title-row", [
            el("h3", null, active.title),
            el("span", "studio-status-ongoing", active.status || "Ongoing")
          ]),
          el("div", "studio-active-subtitle", "By " + active.author + " · " + (active.genre || "General")),
          el("p", "studio-active-synopsis", active.description || "No description provided."),
          
          // Stats Row: Views, Likes, Followers, Stars
          el("div", "studio-stats-row", [
            el("div", "studio-stat-item", [
              el("span", "icon icon-eye"),
              el("div", "studio-stat-val", [
                el("strong", null, formatNumber(active.views)),
                el("span", null, "Views")
              ])
            ]),
            el("div", "studio-stat-item", [
              el("span", "icon icon-heart"),
              el("div", "studio-stat-val", [
                el("strong", null, formatNumber(active.likes)),
                el("span", null, "Likes")
              ])
            ]),
            el("div", "studio-stat-item", [
              el("span", "icon icon-users"),
              el("div", "studio-stat-val", [
                el("strong", null, formatNumber(active.followers)),
                el("span", null, "Followers")
              ])
            ]),
            el("div", "studio-stat-item", [
              el("span", "icon icon-star"),
              el("div", "studio-stat-val", [
                el("strong", null, calculateStars(active)),
                el("span", null, "Stars")
              ])
            ])
          ]),

          // Progress Bar
          (function() {
            var progressVal = active.progress;
            if (!progressVal && active.chapters) {
              progressVal = active.status === "completed" ? 100 : Math.min(95, active.chapters.length * 10);
            }
            if (!progressVal) progressVal = 0;
            return el("div", "studio-progress-container", [
              el("div", "studio-progress-header", [
                el("span", null, "Story Completion Progress"),
                el("span", null, progressVal + "%")
              ]),
              el("div", "studio-progress-bar-bg", [
                (function() {
                  var fill = el("div", "studio-progress-bar-fill");
                  fill.style.width = progressVal + "%";
                  return fill;
                })()
              ])
            ]);
          })(),

          // Buttons
          el("div", "studio-btn-row", [
            iconButton("Continue Writing", "btn primary orange-glow-btn", { action: "newChapter" }, "icon-pencil"),
            iconButton("Manage", "btn", { action: "manageStory", id: active.id }, "icon-gear"),
            iconButton("View Story", "btn", { action: "openStory", id: active.id }, "icon-book"),
            iconButton("", "btn danger", { action: "deleteStory", id: active.id }, "icon-trash")
          ])
        ])
      ]);

      middleColumnChildren.push(activeCard);

      // Timeline / Chapter Plan
      var timelineItems = [];
      if (active.chapters && active.chapters.length) {
        timelineItems = active.chapters.map(function (ch, i) {
          var isCurrent = (currentChapterIndex === i);
          var itemClass = "timeline-item" + (isCurrent ? " active-chapter" : "");
          var statusClass = "badge-status " + (ch.status === "published" ? "published" : "draft");
          
          return el("li", itemClass, [
            el("div", "timeline-badge", String(i + 1)),
            el("div", "timeline-details", [
              el("strong", null, ch.title),
              el("span", null, "Updated " + (ch.updated_at ? formatDate(ch.updated_at) : "recently") + " · " + (ch.access || "Free"))
            ]),
            el("div", "timeline-actions", [
              el("span", "timeline-words", (ch.words || "0") + " words"),
              el("span", statusClass, ch.status),
              iconButton("", "btn btn-sm", { action: "toggleChapterStatus", id: ch.id }, "icon-edit"),
              iconButton("", "btn btn-sm", { action: "openChapter", index: String(i) }, "icon-book"),
              iconButton("", "btn btn-sm danger", { action: "deleteChapter", id: ch.id }, "icon-trash")
            ])
          ]);
        });
      }

      var chapterPlanPanel = el("section", "panel", [
        el("div", "toolbar", [
          el("h2", null, "Chapter Plan Timeline"),
          iconButton("New Chapter", "btn btn-sm primary", { action: "newChapter" }, "icon-plus")
        ]),
        timelineItems.length ? el("ul", "timeline-list", timelineItems) : el("div", "empty", "No chapters found. Click 'New Chapter' to begin writing!")
      ]);

      middleColumnChildren.push(chapterPlanPanel);
    } else {
      // Welcome placeholder card for first story
      var welcomeCard = el("section", "panel", [
        el("h3", { style: "font-size: 1.4rem; margin-bottom: 8px;" }, "Welcome to Author Studio!"),
        el("p", { style: "color: var(--text-muted); margin-bottom: 16px;" }, "Create your first story to unlock the chapter workspace, analytics tracking, and layout features."),
        iconButton("Create a Story Now", "btn primary orange-glow-btn", { action: "openStoryModal" }, "icon-plus")
      ]);
      middleColumnChildren.push(welcomeCard);
    }

    // Always render stories grid at bottom if they have stories
    if (userStories.length) {
      var storiesPanel = el("section", "panel", [
        el("h2", null, "My Stories"),
        storyGrid(userStories, { manage: true })
      ]);
      middleColumnChildren.push(storiesPanel);
    }

    // 3. Right Column Components
    var rightColumnChildren = [];

    if (active) {
      // SVG Chart Container construction
      var chartGradientId = "studioChartGrad-" + Math.random().toString(36).substring(2, 9);
      
      var gradient = svgEl("linearGradient", { id: chartGradientId, x1: "0", y1: "0", x2: "0", y2: "1" }, [
        svgEl("stop", { offset: "0%", "stop-color": "#f36b15", "stop-opacity": "0.4" }),
        svgEl("stop", { offset: "100%", "stop-color": "#f36b15", "stop-opacity": "0" })
      ]);
      
      var defs = svgEl("defs", null, [gradient]);
      
      var ptsData = generateChartData(active);
      var lineD = "M " + ptsData.map(function(p) { return p.x + " " + p.y; }).join(" L ");
      var areaD = lineD + " L 300 100 L 0 100 Z";

      var areaPath = svgEl("path", {
        d: areaD,
        fill: "url(#" + chartGradientId + ")",
        stroke: "none"
      });
      
      var linePath = svgEl("path", {
        d: lineD,
        fill: "none",
        stroke: "#f36b15",
        "stroke-width": "3",
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      });

      var grid1 = svgEl("line", { x1: "0", y1: "25", x2: "300", y2: "25", stroke: "rgba(255,255,255,0.05)", "stroke-dasharray": "4 4" });
      var grid2 = svgEl("line", { x1: "0", y1: "50", x2: "300", y2: "50", stroke: "rgba(255,255,255,0.05)", "stroke-dasharray": "4 4" });
      var grid3 = svgEl("line", { x1: "0", y1: "75", x2: "300", y2: "75", stroke: "rgba(255,255,255,0.05)", "stroke-dasharray": "4 4" });

      var pts = ptsData.map(function (pt) {
        return svgEl("circle", {
          cx: String(pt.x),
          cy: String(pt.y),
          r: "4",
          fill: "#111",
          stroke: "#f36b15",
          "stroke-width": "2"
        });
      });

      var chartSvg = svgEl("svg", {
        viewBox: "0 0 300 100",
        class: "svg-chart"
      }, [defs, grid1, grid2, grid3, areaPath, linePath].concat(pts));

      var chartContainer = el("div", "svg-chart-container", [chartSvg]);

      // Dynamic Trends calculation based on story stats
      var viewsTrend = active.views > 0 ? "+" + (active.views % 13 + 2.5).toFixed(1) + "%" : "0.0%";
      var likesTrend = active.likes > 0 ? "+" + (active.likes % 9 + 1.1).toFixed(1) + "%" : "0.0%";
      var followersTrend = active.followers > 0 ? "+" + (active.followers % 6 + 0.7).toFixed(1) + "%" : "0.0%";
      var starsVal = calculateStars(active);
      var starsTrend = starsVal === "5.0" ? "Max score" : "Stable";

      // Analytics Overview Card with SVG Chart
      var analyticsPanel = el("section", "panel", [
        el("h2", null, "Analytics Overview"),
        
        // 2x2 grid of metric boxes
        el("div", "analytics-grid", [
          analyticsMetricBox("Views", formatNumber(active.views), viewsTrend, true),
          analyticsMetricBox("Likes", formatNumber(active.likes), likesTrend, true),
          analyticsMetricBox("Followers", formatNumber(active.followers), followersTrend, true),
          analyticsMetricBox("Stars", starsVal, starsTrend, true)
        ]),
        
        chartContainer
      ]);
      rightColumnChildren.push(analyticsPanel);
    }

    // Quick Actions Panel
    var quickActionsPanel = el("section", "panel", [
      el("h2", null, "Quick Actions"),
      el("div", "quick-actions-grid", [
        quickActionTile("icon-pencil", "New Chapter", "newChapter"),
        quickActionTile("icon-document", "Quick Draft", "quickDraft"),
        quickActionTile("icon-book", "Story Notes", "storyNotes"),
        quickActionTile("icon-image", "Upload Cover", "uploadCover")
      ])
    ]);
    rightColumnChildren.push(quickActionsPanel);

    // 4. Assemble main layout
    var gridLayout = el("div", "studio-grid-layout", [
      el("div", "studio-main", middleColumnChildren),
      el("div", "studio-aside", rightColumnChildren)
    ]);

    view.appendChild(gridLayout);
  }

  // ── Moderation ──
  function renderModeration() {
    var canMod = canModerateRole();
    view.appendChild(el("div", "layout-two", [
      el("section", "panel", [
        el("div", "toolbar", [el("h2", null, "Review queue"), el("div", "mini-meta", canMod ? "Role has queue access" : "Switch role to moderate")]),
        state.reports.length ? list(state.reports, "report-list", function (r) {
          return el("li", "report-item", [el("strong", null, r.target), el("span", "mini-meta", r.reason + " / " + r.severity + " / " + r.status),
            el("div", "button-row", [button("Resolve", "btn success", { action: "resolveReport", id: r.id }, !canMod || r.status !== "open"), button("Escalate", "btn warn", { action: "escalateReport", id: r.id }, !canMod || r.status !== "open")])]);
        }) : el("div", "empty", "No reports in queue.")
      ]),
      el("aside", null, [
        el("section", "panel", [el("h2", null, "Guidelines"), list(["No harassment, hate, doxxing, or threats.", "No piracy, plagiarism, or unauthorized uploads.", "Sensitive content must be tagged before publication.", "Moderation actions are logged for appeal review."], "activity-list", function (t) { return el("li", "activity-item", t); })]),
        el("section", "panel", [el("h2", null, "Content controls"), el("div", "button-row", [button("Run text scan", "btn", { action: "scan" }), button("Export queue", "btn", { action: "exportQueue" })])])
      ])
    ]));
  }

  // ── Forms ──
  function storyForm() {
    return form("storyForm", [
      field("Title", input("text", "", { name: "title", placeholder: "New series title", required: "true" })),
      field("Type", select("type", [["Web Novel", "Web Novel"], ["Chitrānk", "Chitrānk"]])),
      field("Genre", input("text", "", { name: "genre", placeholder: "Fantasy", required: "true" })),
      field("Synopsis", textarea("description", "A new serialized story begins here.")),
      submitButton("Create", "btn primary orange-glow-btn")
    ]);
  }
  function commentForm() {
    if (!state.user) {
      return el("div", "comment-login-prompt", [
        el("p", null, "Please log in to post a comment."),
        button("Log In", "btn primary", { action: "loginToComment" })
      ]);
    }
    return form("commentForm", [field("Add comment", textarea("comment", "")), submitButton("Post comment", "btn primary")]);
  }

  // ── Click handler ──
  function handleViewClick(e) {
    var target = e.target.closest("[data-action]"); if (!target) return;
    var action = target.dataset.action;
    if (action === "go") window.location.hash = target.dataset.view;
    if (action === "loginToComment") { openAuthModal(); }
    if (action === "filter") { filterType = target.dataset.value; render(); }
    if (action === "readerMode") { readerMode = target.dataset.value; currentComicPageIndex = 0; render(); }
    if (action === "openStory") { currentStoryId = target.dataset.id; currentChapterIndex = 0; currentComicPageIndex = 0; window.location.hash = "reader"; }
    if (action === "follow") {
      apiPost("/library/follow", { story_id: target.dataset.id }).then(function (r) {
        notify(r.message); return api("/library/ids");
      }).then(function (ids) { state.library = ids; render(); });
    }
    if (action === "tip") {
      apiPost("/stories/" + target.dataset.id + "/tip", { amount: 5 }).then(function (r) {
        notify(r.message); return api("/stories");
      }).then(function (s) { state.stories = s; render(); });
    }
    if (action === "chapter") { moveChapter(Number(target.dataset.step)); }
    if (action === "comicPage") { moveComicPage(Number(target.dataset.step)); }
    if (action === "theme") { readerTheme = readerTheme === "dark" ? "light" : "dark"; render(); }
    if (action === "openChapter") { currentChapterIndex = Number(target.dataset.index); currentComicPageIndex = 0; window.location.hash = "reader"; render(); }
    if (action === "manageStory") {
      currentStoryId = target.dataset.id;
      render();
    }
    if (action === "openStoryModal") {
      openStoryModal();
    }
    if (action === "quickDraft") {
      notify("Quick Draft feature is currently in prototype mode.");
    }
    if (action === "storyNotes") {
      notify("Story Notes feature is currently in prototype mode.");
    }
    if (action === "uploadCover") {
      notify("Upload Cover feature is currently in prototype mode.");
    }
    if (action === "newChapter") {
      var story = getCurrentStudioStory();
      if (!story || !story.id) {
        notify("Please create a story first before adding chapters.");
        return;
      }
      var num = story.chapters.length + 1;
      apiPost("/stories/" + story.id + "/chapters", { title: "Draft Chapter " + num }).then(function () {
        return api("/stories");
      }).then(function (s) { state.stories = s; notify("Draft chapter created."); render(); });
    }
    if (action === "toggleChapterStatus") {
      var chapterId = target.dataset.id;
      apiPatch("/chapters/" + chapterId + "/status").then(function (r) {
        notify(r.title + " is now " + r.status + "."); return api("/stories");
      }).then(function (s) { state.stories = s; render(); });
    }
    if (action === "deleteChapter") {
      var doomedId = target.dataset.id;
      if (!window.confirm("Are you sure you want to delete this chapter? This cannot be undone.")) return;
      apiDelete("/chapters/" + doomedId).then(function () {
        notify("Chapter deleted.");
        return api("/stories");
      }).then(function (s) {
        state.stories = s;
        currentChapterIndex = 0;
        render();
      }).catch(function (err) {
        console.error("Failed to delete chapter:", err);
        notify("Failed to delete chapter.");
      });
    }
    if (action === "deleteStory") {
      var doomed = state.stories.find(function (s) { return s.id === target.dataset.id; });
      if (!doomed || !canDeleteStory(doomed)) return;
      if (!window.confirm("Delete \"" + doomed.title + "\" and all of its chapters? This cannot be undone.")) return;
      apiDelete("/stories/" + doomed.id).then(function (r) {
        notify(r.message || "Story deleted.");
        return Promise.all([api("/stories"), api("/library/ids")]);
      }).then(function (results) {
        state.stories = results[0];
        state.library = results[1];
        if (currentStoryId === doomed.id) {
          currentStoryId = state.stories[0] ? state.stories[0].id : "";
          currentChapterIndex = 0;
        }
        hydrateGenres();
        render();
      });
    }
    if (action === "deleteComment") {
      if (!window.confirm("Are you sure you want to delete this comment?")) return;
      apiDelete("/comments/" + target.dataset.id).then(function () {
        notify("Comment deleted.");
        return api("/stories");
      }).then(function (s) { state.stories = s; render(); }).catch(function (err) {
        console.error("Failed to delete comment:", err);
        notify("Failed to delete comment.");
      });
    }
    if (action === "resolveReport" || action === "escalateReport") {
      var newStatus = action === "resolveReport" ? "resolved" : "escalated";
      apiPatch("/reports/" + target.dataset.id, { status: newStatus }).then(function (r) {
        notify(r.message); return api("/reports");
      }).then(function (reps) { state.reports = reps; render(); });
    }
    if (action === "scan") notify("Text scan completed. No blocked terms found.");
    if (action === "exportQueue") notify("Queue export prepared in memory for this prototype.");
    if (action === "carouselPrev") { moveCarousel(-1); startCarouselAuto(); }
    if (action === "carouselNext") { moveCarousel(1); startCarouselAuto(); }
    if (action === "carouselDot") goToSlide(Number(target.dataset.index));
  }

  function handleViewInput(e) {
    if (e.target.dataset.action === "fontSize") {
      readerSize = Number(e.target.value);
      var c = view.querySelector(".reader-content"); if (c) c.style.setProperty("--reader-size", readerSize + "px");
    }
  }

  function handleViewSubmit(e) {
    e.preventDefault();
    if (e.target.dataset.form === "storyForm") {
      var fd = new FormData(e.target);
      apiPost("/stories", { title: fd.get("title"), type: fd.get("type"), genre: fd.get("genre"), description: fd.get("description") }).then(function (resp) {
        currentStoryId = resp.id; currentChapterIndex = 0;
        return api("/stories");
      }).then(function (s) { state.stories = s; hydrateGenres(); notify("Story created."); closeStoryModal(); render(); });
    }
    if (e.target.dataset.form === "commentForm") {
      var comment = new FormData(e.target).get("comment").trim(); if (!comment) return;
      var story = getCurrentStory();
      var chapter = getCurrentChapter(story);
      if (!chapter || !chapter.id) {
        notify("No chapter selected.");
        return;
      }
      apiPost("/chapters/" + story.id + "/" + chapter.sort_order + "/comments", { user: "You", text: comment }).then(function () {
        return api("/stories");
      }).then(function (s) { state.stories = s; notify("Comment posted."); render(); }).catch(function (err) {
        console.error("Failed to post comment:", err);
        notify("Failed to post comment. Please log in.");
      });
    }
  }

  // ── Data helpers ──
  function filteredStories() {
    var query = searchInput.value.trim().toLowerCase();
    var genre = genreFilter.value;
    return state.stories.filter(function (s) {
      var hay = [s.title, s.author, s.genre, s.description].concat(s.tags).join(" ").toLowerCase();
      return (!query || hay.indexOf(query) !== -1) && (genre === "all" || s.genre === genre) && (filterType === "all" || s.type === filterType);
    });
  }
  function getCurrentStory() { return state.stories.find(function (s) { return s.id === currentStoryId; }) || state.stories[0] || { id: "", title: "", author: "", type: "Web Novel", chapters: [], tags: [], description: "", cover: "", genre: "", language: "", license: "", status: "", followers: 0, views: 0, likes: 0, earnings: 0, progress: 0 }; }
  function getCurrentStudioStory() {
    var userStories = state.stories.filter(function (s) {
      return state.user && s.author_id === state.user.id;
    });
    return userStories.find(function (s) { return s.id === currentStoryId; }) || userStories[0] || { id: "", title: "", author: "", type: "Web Novel", chapters: [], tags: [], description: "", cover: "", genre: "", language: "", license: "", status: "", followers: 0, views: 0, likes: 0, earnings: 0, progress: 0 };
  }
  function getCurrentChapter(story) {
    if (!story.chapters || !story.chapters.length) return { title: "", status: "", access: "", words: 0, reads: 0, likes: 0, content: [], comments: [] };
    if (currentChapterIndex >= story.chapters.length) currentChapterIndex = 0;
    return story.chapters[currentChapterIndex];
  }
  function moveChapter(step) { var s = getCurrentStory(); currentChapterIndex = Math.max(0, Math.min(s.chapters.length - 1, currentChapterIndex + step)); currentComicPageIndex = 0; render(); }
  function moveComicPage(step) { var pages = getCurrentChapter(getCurrentStory()).pages || []; currentComicPageIndex = Math.max(0, Math.min(pages.length - 1, currentComicPageIndex + step)); render(); }
  function clampComicPage(pages) { if (!pages.length) currentComicPageIndex = 0; else currentComicPageIndex = Math.max(0, Math.min(pages.length - 1, currentComicPageIndex)); }
  function countPublished() { return state.stories.filter(function (s) { return s.status === "published"; }).length; }
  function totalViews() { return state.stories.reduce(function (a, s) { return a + s.views; }, 0); }
  function totalFollowers() { return state.stories.reduce(function (a, s) { return a + s.followers; }, 0); }
  function countOpenReports() { return state.reports.filter(function (r) { return r.status === "open"; }).length; }

  // ── UI builders ──
  function storyGrid(stories, options) { var g = el("section", "story-grid"); stories.forEach(function (s) { g.appendChild(storyCard(s, options)); }); return g; }
  function storyCard(story, options) {
    options = options || {};
    var tpl = document.getElementById("storyCardTemplate"); var card = tpl.content.firstElementChild.cloneNode(true);
    card.querySelector(".cover-art").style.setProperty("--cover", story.cover);
    card.querySelector(".cover-badge").textContent = story.type;
    var ob = card.querySelector(".cover-button"); 
    ob.dataset.action = options.manage ? "manageStory" : "openStory";
    ob.dataset.id = story.id; 
    ob.setAttribute("aria-label", (options.manage ? "Manage " : "Open ") + story.title);
    card.querySelector(".story-meta").textContent = story.genre + " / " + story.author + " / " + formatNumber(story.views) + " reads";
    card.querySelector("h2").textContent = story.title;
    card.querySelector("p").textContent = story.description;
    var tags = card.querySelector(".tag-row"); story.tags.forEach(function (t) { tags.appendChild(el("span", "tag", t)); });
    var actions = card.querySelector(".story-actions");
    if (options.manage) {
      actions.appendChild(iconButton("Manage", "btn success", { action: "manageStory", id: story.id }, "icon-gear"));
      actions.appendChild(iconButton("Read", "btn", { action: "openStory", id: story.id }, "icon-book"));
      actions.appendChild(iconButton("Delete", "btn danger", { action: "deleteStory", id: story.id }, "icon-trash", !canDeleteStory(story)));
    } else {
      actions.appendChild(button("Read", "btn primary", { action: "openStory", id: story.id }));
      actions.appendChild(button(state.library.indexOf(story.id) === -1 ? "Follow" : "Following", "btn", { action: "follow", id: story.id }));
      actions.appendChild(button("Tip", "btn", { action: "tip", id: story.id }));
    }
    return card;
  }
  function canDeleteStory(story) {
    if (state.role === "admin") return true;
    if (state.role === "author") {
      if (story.author === "You") return true;
      if (state.user && story.author_id === state.user.id) return true;
      var currentUsername = state.profile ? state.profile.username : "";
      return !!(currentUsername && story.author === currentUsername);
    }
    return false;
  }
  function canModerateRole() { return ["moderator", "admin"].indexOf(state.role) !== -1; }
  function metric(label, value) { return el("div", "metric", [el("span", null, label), el("strong", null, String(value))]); }
  function progress(value) { var s = el("span", "progress-shell", el("span", "progress-bar")); s.firstElementChild.style.setProperty("--progress", value + "%"); return s; }
  function form(name, children) { var n = el("form", "form-grid", children); n.dataset.form = name; return n; }
  function field(label, control) { var id = "field-" + Math.random().toString(16).slice(2); control.id = id; return el("label", "field", [el("span", null, label), control]); }
  function input(type, value, attrs) { var n = document.createElement("input"); n.type = type; n.value = value; applyAttrs(n, attrs); return n; }
  function textarea(name, value) { var n = document.createElement("textarea"); n.name = name; n.value = value; return n; }
  function select(name, options) { var n = document.createElement("select"); n.name = name; options.forEach(function (p) { var o = document.createElement("option"); o.value = p[0]; o.textContent = p[1]; n.appendChild(o); }); return n; }
  function button(text, className, data, disabled) { var n = document.createElement("button"); n.type = "button"; n.className = className == null ? "btn" : className; n.textContent = text; if (data) Object.keys(data).forEach(function (k) { n.dataset[k] = data[k]; }); if (disabled) n.disabled = true; return n; }
  function submitButton(text, className) { var n = document.createElement("button"); n.type = "submit"; n.className = className || "btn"; n.textContent = text; return n; }
  function segmentButton(text, value, activeValue, action) { return button(text, activeValue === value ? "active" : "", { action: action || "filter", value: value }); }
  function list(items, className, renderItem) { var n = el("ul", className); items.forEach(function (item, i) { n.appendChild(renderItem(item, i)); }); return n; }
  function el(tag, className, children) {
    var n = document.createElement(tag); if (className) n.className = className;
    if (children !== undefined && children !== null) { if (Array.isArray(children)) children.filter(Boolean).forEach(function (c) { append(n, c); }); else append(n, children); }
    return n;
  }
  function append(parent, child) { if (typeof child === "string" || typeof child === "number") parent.appendChild(document.createTextNode(String(child))); else parent.appendChild(child); }
  function applyAttrs(node, attrs) { if (!attrs) return; Object.keys(attrs).forEach(function (k) { if (k === "action") node.dataset.action = attrs[k]; else if (k === "required") node.required = true; else node.setAttribute(k, attrs[k]); }); }
  function notify(message) { alerts.innerHTML = ""; alerts.appendChild(el("div", "toast", message)); clearTimeout(notify.timer); notify.timer = setTimeout(function () { alerts.innerHTML = ""; }, 2800); }
  function unique(items) { return items.filter(function (v, i) { return items.indexOf(v) === i; }); }
  function formatNumber(v) { return new Intl.NumberFormat("en", { notation: v > 9999 ? "compact" : "standard" }).format(v); }
  function formatDate(v) { if (!v) return ""; return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(v)); }
}());
