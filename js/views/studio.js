import { analyticsMetricBox, button, calculateStars, el, formatDate, formatNumber, generateChartData, iconButton, progress, quickActionTile, svgEl } from "../components.js?v=a11y-focus-20260613-v28";
import { storyGrid, storyCardSkeleton } from "./shared.js?v=a11y-focus-20260613-v28";

export function renderStudio(ctx) {
  ctx = ctx || this;

  if (ctx.state.stories === null) {
    ctx.view.appendChild(
      el("div", "story-grid", [
        storyCardSkeleton(),
        storyCardSkeleton()
      ])
    );
    return;
  }

  var userStories = ctx.state.stories.filter(function (s) {
    return ctx.state.user && s.author_id === ctx.state.user.id;
  });
  var active = userStories.find(function (s) { return s.id === ctx.ui.currentStoryId; }) || userStories[0];

  if (active && active.id && ctx.ui.currentStoryId !== active.id) {
    ctx.ui.currentStoryId = active.id;
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
      ctx.ui.currentStoryId = e.target.value;
      ctx.render();
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
      var isUrlOrGradient = active.cover.startsWith("url") || active.cover.startsWith("linear-gradient") || active.cover.startsWith("radial-gradient");
      coverEl.style.backgroundImage = isUrlOrGradient ? active.cover : "url('" + active.cover + "')";
    } else {
      coverEl.style.background = "linear-gradient(135deg, #333, #111)";
    }

    var activeCard = el("div", "studio-story-active-card", [
      coverEl,
      el("div", "studio-active-details", [
        el("span", { class: "studio-active-badge", "data-type": active.type }, active.type),
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

        el("div", "studio-btn-row", [
          iconButton("Continue Writing", "btn primary orange-glow-btn", { action: "continueWriting" }, "icon-pencil"),
          iconButton("Edit Settings", "btn", { action: "editStorySettings", id: active.id }, "icon-gear"),
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
        var isCurrent = (ctx.ui.currentChapterIndex === i);
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
            iconButton("", "btn btn-sm", { action: "editChapter", id: ch.id }, "icon-edit"),
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
      storyGrid(ctx, userStories, { manage: true })
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
    
    var activeMetric = ctx.ui.activeChartMetric || "reads";
    var ptsData = generateChartData(active, activeMetric);
    var lineD = ptsData.length ? "M " + ptsData.map(function(p) { return p.x + " " + p.y; }).join(" L ") : "M 0 85";
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
      var circle = svgEl("circle", {
        cx: String(pt.x),
        cy: String(pt.y),
        r: "4",
        fill: "#111",
        stroke: "#f36b15",
        "stroke-width": "2",
        style: "cursor: pointer; transition: all 0.2s ease;"
      });

      circle.addEventListener("mouseenter", function () {
        circle.setAttribute("r", "6");
        circle.setAttribute("fill", "#f36b15");
        
        var tooltip = document.getElementById("chart-tooltip");
        if (!tooltip) {
          tooltip = el("div", { id: "chart-tooltip", class: "chart-tooltip" });
          document.body.appendChild(tooltip);
        }
        
        var metricLabel = "reads";
        if (activeMetric === "likes") metricLabel = "likes";
        else if (activeMetric === "words") metricLabel = "words";
        
        tooltip.innerHTML = '<div class="tooltip-title">' + pt.label + '</div>' +
                            '<div class="tooltip-value">' + formatNumber(pt.value) + ' ' + metricLabel + '</div>';
        
        tooltip.style.opacity = "1";
        tooltip.style.transform = "translate(-50%, -100%) scale(1)";
        
        var rect = circle.getBoundingClientRect();
        tooltip.style.left = (window.scrollX + rect.left + rect.width / 2) + "px";
        tooltip.style.top = (window.scrollY + rect.top - 8) + "px";
      });

      circle.addEventListener("mouseleave", function () {
        circle.setAttribute("r", "4");
        circle.setAttribute("fill", "#111");
        
        var tooltip = document.getElementById("chart-tooltip");
        if (tooltip) {
          tooltip.style.opacity = "0";
          tooltip.style.transform = "translate(-50%, -100%) scale(0.9)";
        }
      });

      return circle;
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

    // Interactive metric cards
    var viewsBox = analyticsMetricBox("Views (Reads)", formatNumber(active.views), viewsTrend, true);
    viewsBox.classList.add("interactive");
    viewsBox.setAttribute("tabindex", "0");
    viewsBox.setAttribute("role", "button");
    viewsBox.setAttribute("aria-label", "Show views chart");
    if (activeMetric === "reads") viewsBox.classList.add("active");
    viewsBox.addEventListener("click", function () {
      ctx.ui.activeChartMetric = "reads";
      ctx.render();
    });
    viewsBox.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        viewsBox.click();
      }
    });

    var likesBox = analyticsMetricBox("Likes", formatNumber(active.likes), likesTrend, true);
    likesBox.classList.add("interactive");
    likesBox.setAttribute("tabindex", "0");
    likesBox.setAttribute("role", "button");
    likesBox.setAttribute("aria-label", "Show likes chart");
    if (activeMetric === "likes") likesBox.classList.add("active");
    likesBox.addEventListener("click", function () {
      ctx.ui.activeChartMetric = "likes";
      ctx.render();
    });
    likesBox.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        likesBox.click();
      }
    });

    var totalWords = active.chapters.reduce(function (sum, ch) { return sum + (ch.words || 0); }, 0);
    var wordsTrend = totalWords > 0 ? "+" + (totalWords % 17 + 5).toFixed(0) + " words" : "Stable";
    var wordsBox = analyticsMetricBox("Word Count", formatNumber(totalWords), wordsTrend, true);
    wordsBox.classList.add("interactive");
    wordsBox.setAttribute("tabindex", "0");
    wordsBox.setAttribute("role", "button");
    wordsBox.setAttribute("aria-label", "Show word count chart");
    if (activeMetric === "words") wordsBox.classList.add("active");
    wordsBox.addEventListener("click", function () {
      ctx.ui.activeChartMetric = "words";
      ctx.render();
    });
    wordsBox.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        wordsBox.click();
      }
    });

    var followersBox = analyticsMetricBox("Followers", formatNumber(active.followers), followersTrend, true);
    var starsBox = analyticsMetricBox("Rating (Stars)", starsVal, starsTrend, true);

    var totalChapters = active.chapters.length;
    var chaptersTrend = totalChapters > 0 ? "Published" : "No chapters";
    var chaptersBox = analyticsMetricBox("Total Chapters", formatNumber(totalChapters), chaptersTrend, true);

    var engagementVal = active.views > 0 ? ((active.likes / active.views) * 100).toFixed(1) + "%" : "0.0%";
    var engagementTrend = active.views > 0 ? "Likes/Views ratio" : "No activity";
    var engagementBox = analyticsMetricBox("Engagement Rate", engagementVal, engagementTrend, true);

    // Analytics Overview Card with SVG Chart
    var analyticsPanel = el("section", "panel", [
      el("h2", null, "Analytics Overview"),
      
      el("div", "analytics-grid", [
        viewsBox,
        likesBox,
        wordsBox,
        followersBox,
        starsBox,
        chaptersBox,
        engagementBox
      ]),
      
      chartContainer
    ]);
    rightColumnChildren.push(analyticsPanel);
  }

  // Quick Actions Panel
  var actionsGrid = [
    quickActionTile("icon-pencil", "New Chapter", "newChapter"),
    quickActionTile("icon-document", "Quick Draft", "quickDraft"),
    quickActionTile("icon-book", "Story Notes", "storyNotes"),
    quickActionTile("icon-image", "Upload Cover", "uploadCover")
  ];
  if (active && active.cover && !active.cover.startsWith("linear-gradient") && !active.cover.startsWith("radial-gradient")) {
    actionsGrid.push(quickActionTile("icon-trash", "Delete Cover", "deleteCover"));
  }

  var quickActionsPanel = el("section", "panel", [
    el("h2", null, "Quick Actions"),
    el("div", "quick-actions-grid", actionsGrid)
  ]);
  rightColumnChildren.push(quickActionsPanel);

  // 4. Assemble main layout
  var gridLayout = el("div", "studio-grid-layout", [
    el("div", "studio-main", middleColumnChildren),
    el("div", "studio-aside", rightColumnChildren)
  ]);

  ctx.view.appendChild(gridLayout);
}
