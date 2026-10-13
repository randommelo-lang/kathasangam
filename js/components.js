export function calculateStars(story) {
  if (!story) return "New";
  if (typeof story.rating === "number" && (story.ratings_count || 0) > 0) {
    return story.rating.toFixed(1);
  }
  if (!story.views || story.views < 5) return "New";
  const ratio = (story.likes || 0) / story.views;
  const rating = 3.5 + ratio * 3.0;
  return Math.min(5.0, Math.max(1.0, rating)).toFixed(1);
}

export function getStoryRatingInfo(story) {
  if (!story) return { score: null, label: "Unrated", isTrustworthy: false, count: 0 };
  if (typeof story.rating === "number" && (story.ratings_count || 0) > 0) {
    const score = story.rating.toFixed(1);
    const count = story.ratings_count;
    return {
      score: score,
      label: "★ " + score + " (" + count + " " + (count === 1 ? "rating" : "ratings") + ")",
      isTrustworthy: true,
      count: count
    };
  }
  const views = story.views || 0;
  const likes = story.likes || 0;
  if (views < 5) {
    return {
      score: null,
      label: "New · Not enough ratings yet",
      isTrustworthy: false,
      count: views
    };
  }
  const ratio = likes / views;
  const score = Math.min(5.0, Math.max(1.0, 3.5 + ratio * 3.0)).toFixed(1);
  return {
    score: score,
    label: "★ " + score + " (" + views + " reads)",
    isTrustworthy: true,
    count: views
  };
}

export function generateChartData(story, metric) {
  metric = metric || "reads";
  const data = [];
  
  function getVal(ch) {
    if (metric === "likes") return ch.likes || 0;
    if (metric === "words") return ch.words || 0;
    return ch.reads || 0;
  }

  if (!story || !story.chapters || story.chapters.length < 1) {
    return data;
  }

  let maxVal = 0;
  story.chapters.forEach(function (ch) {
    const val = getVal(ch);
    if (val > maxVal) maxVal = val;
  });
  const stepX = story.chapters.length > 1 ? 300 / Math.max(1, story.chapters.length - 1) : 0;
  story.chapters.forEach(function (ch, idx) {
    const x = story.chapters.length > 1 ? idx * stepX : 150;
    const val = getVal(ch);
    let y = maxVal > 0 ? 85 - (val / maxVal) * 70 : 85;
    data.push({
      x: Math.round(x),
      y: Math.round(y),
      value: val,
      label: ch.title || ("Chapter " + (idx + 1))
    });
  });
  return data;
}

export function svgEl(tag, attrs, children) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      n.setAttribute(k, attrs[k]);
    });
  }
  if (children) {
    if (Array.isArray(children)) {
      children.forEach(function (c) {
        if (typeof c === "string" || typeof c === "number") {
          n.appendChild(document.createTextNode(String(c)));
        } else if (c) {
          n.appendChild(c);
        }
      });
    } else {
      if (typeof children === "string" || typeof children === "number") {
        n.appendChild(document.createTextNode(String(children)));
      } else if (children) {
        n.appendChild(children);
      }
    }
  }
  return n;
}

export function makeCalendarIcon(className = "icon") {
  return svgEl("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: className
  }, [
    svgEl("rect", { x: "3", y: "4", width: "18", height: "18", rx: "2", ry: "2" }),
    svgEl("line", { x1: "16", y1: "2", x2: "16", y2: "6" }),
    svgEl("line", { x1: "8", y1: "2", x2: "8", y2: "6" }),
    svgEl("line", { x1: "3", y1: "10", x2: "21", y2: "10" })
  ]);
}

export function makeCollaboratorsIcon(className = "icon") {
  return svgEl("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: className
  }, [
    svgEl("path", { d: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" }),
    svgEl("circle", { cx: "9", cy: "7", r: "4" }),
    svgEl("path", { d: "M23 21v-2a4 4 0 0 0-3-3.87" }),
    svgEl("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" })
  ]);
}

export function makeDiscussionIcon(className = "icon") {
  return svgEl("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: className
  }, [
    svgEl("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" })
  ]);
}

/**
 * Creates an animated dots-horizontal SVG icon.
 * Supports AnimatedIconProps and AnimatedIconHandle for imperative animation control.
 * @param {import("./globals.js").AnimatedIconProps} [props]
 * @returns {SVGSVGElement & { handle: import("./globals.js").AnimatedIconHandle }}
 */
export function makeAnimatedDotsHorizontalIcon(props) {
  props = props || {};
  const size = props.size !== undefined ? props.size : 20;
  const color = props.color || "currentColor";
  const strokeWidth = props.strokeWidth !== undefined ? props.strokeWidth : 2;
  const className = props.className || "";

  const sizeStr = typeof size === "number" ? size + "px" : size;

  const svg = svgEl("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: sizeStr,
    height: sizeStr,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    "stroke-width": String(strokeWidth),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: ("animated-dots-icon " + className).trim()
  }, [
    svgEl("path", { stroke: "none", d: "M0 0h24v24H0z", fill: "none" }),
    svgEl("circle", { class: "dot dot-1", cx: "5", cy: "12", r: "1", fill: color }),
    svgEl("circle", { class: "dot dot-2", cx: "12", cy: "12", r: "1", fill: color }),
    svgEl("circle", { class: "dot dot-3", cx: "19", cy: "12", r: "1", fill: color })
  ]);

  const handle = {
    startAnimation: function () {
      svg.classList.add("animating");
    },
    stopAnimation: function () {
      svg.classList.remove("animating");
    }
  };

  svg.addEventListener("mouseenter", function () {
    handle.startAnimation();
  });

  svg.addEventListener("mouseleave", function () {
    handle.stopAnimation();
  });

  svg.handle = handle;
  return svg;
}

/**
 * Creates an animated send-horizontal SVG icon.
 * Supports AnimatedIconProps and AnimatedIconHandle for imperative animation control.
 * @param {import("./globals.js").AnimatedIconProps} [props]
 * @returns {SVGSVGElement & { handle: import("./globals.js").AnimatedIconHandle }}
 */
export function makeAnimatedSendHorizontalIcon(props) {
  props = props || {};
  const size = props.size !== undefined ? props.size : 18;
  const color = props.color || "currentColor";
  const strokeWidth = props.strokeWidth !== undefined ? props.strokeWidth : 2;
  const className = props.className || "";

  const sizeStr = typeof size === "number" ? size + "px" : size;

  const svg = svgEl("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: sizeStr,
    height: sizeStr,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    "stroke-width": String(strokeWidth),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: ("animated-send-icon " + className).trim()
  }, [
    svgEl("path", { class: "send-body", d: "M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z" }),
    svgEl("path", { class: "send-line", d: "M6 12h16" })
  ]);

  const handle = {
    startAnimation: function () {
      svg.classList.add("animating");
    },
    stopAnimation: function () {
      svg.classList.remove("animating");
    }
  };

  svg.addEventListener("animationend", function () {
    handle.stopAnimation();
  });

  svg.handle = handle;
  return svg;
}

export function iconButton(text, className, data, iconName, disabled) {
  const btn = el("button", className || "btn");
  btn.type = "button";
  if (disabled) btn.disabled = true;
  if (data) {
    Object.keys(data).forEach(function (k) {
      if (k.startsWith("aria-") || k.startsWith("data-") || k === "role" || k === "title" || k === "tabindex") {
        btn.setAttribute(k, data[k]);
      } else {
        btn.dataset[k] = data[k];
      }
    });
  }
  if (iconName) {
    btn.appendChild(el("span", "icon " + iconName));
    btn.appendChild(document.createTextNode(" "));
  }
  if (text) {
    btn.appendChild(document.createTextNode(text));
    if (!btn.getAttribute("aria-label")) {
      btn.setAttribute("aria-label", text);
    }
  }
  if (!text && data && data.action && !btn.getAttribute("aria-label")) {
    btn.setAttribute("aria-label", accessibleActionName(data.action, data));
  }
  return btn;
}

function accessibleActionName(action, data) {
  var names = {
    carouselPrev: "Previous featured story",
    carouselNext: "Next featured story",
    carouselToggle: "Toggle automatic slide changes",
    deleteChapter: "Delete chapter",
    deleteStory: "Delete story",
    editChapter: "Edit chapter",
    nextChapter: "Next chapter",
    openChapter: "Read chapter",
    openParagraphComments: "Show comments for this paragraph",
    openStoryModal: "Create a story",
    previousChapter: "Previous chapter"
  };
  if (names[action]) return names[action];
  var readable = String(action || "Action")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
  return readable.charAt(0).toUpperCase() + readable.slice(1);
}

export function analyticsMetricBox(label, value, subtitle) {
  var children = [
    el("span", null, label),
    el("strong", null, String(value))
  ];
  if (subtitle) {
    children.push(el("em", "analytics-metric-subtitle", subtitle));
  }
  return el("div", "analytics-metric-box", children);
}

export function quickActionTile(iconName, label, action) {
  const tile = el("div", "quick-action-tile", [
    el("span", "icon icon-lg " + iconName),
    el("span", null, label)
  ]);
  tile.dataset.action = action;
  tile.setAttribute("tabindex", "0");
  tile.setAttribute("role", "button");
  tile.setAttribute("aria-label", label);
  tile.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tile.click();
    }
  });
  return tile;
}

export function metric(label, value) {
  return el("div", "metric", [el("span", null, label), el("strong", null, String(value))]);
}

export function progress(value) {
  const s = el("span", "progress-shell", el("span", "progress-bar"));
  s.firstElementChild.style.setProperty("--progress", value + "%");
  return s;
}

export function form(name, children) {
  const n = el("form", "form-grid", children);
  n.dataset.form = name;
  return n;
}

export function field(label, control) {
  const id = "field-" + Math.random().toString(16).slice(2);
  control.id = id;
  control.setAttribute("aria-label", label);
  return el("label", "field", [el("span", null, label), control]);
}

export function input(type, value, attrs) {
  const n = document.createElement("input");
  n.type = type;
  n.value = value;
  applyAttrs(n, attrs);
  return n;
}

export function textarea(name, value) {
  const n = document.createElement("textarea");
  n.name = name;
  n.value = value;
  return n;
}

export function select(name, options, selectedValue) {
  const n = document.createElement("select");
  n.name = name;
  n.id = name;
  options.forEach(function (p) {
    const o = document.createElement("option");
    o.value = p[0];
    o.textContent = p[1];
    if (selectedValue !== undefined && p[0] === selectedValue) {
      o.selected = true;
    }
    n.appendChild(o);
  });
  return n;
}

export function button(text, className, data, disabled) {
  const n = document.createElement("button");
  n.type = "button";
  n.className = className == null ? "btn" : className;
  if (Array.isArray(text)) {
    text.forEach(function (t) {
      if (typeof t === "string" || typeof t === "number") {
        n.appendChild(document.createTextNode(String(t)));
      } else if (t) {
        n.appendChild(t);
      }
    });
  } else if (typeof text === "string" || typeof text === "number") {
    n.textContent = String(text);
  } else if (text) {
    n.appendChild(text);
  }
  if (data) {
    Object.keys(data).forEach(function (k) {
      if (k.startsWith("aria-") || k.startsWith("data-") || k === "role" || k === "title" || k === "tabindex") {
        n.setAttribute(k, data[k]);
      } else {
        n.dataset[k] = data[k];
      }
    });
  }
  if (disabled) n.disabled = true;
  if (!n.textContent.trim() && !n.getAttribute("aria-label") && data && data.action) {
    var context = n.closest && n.closest(".story-card");
    var storyTitle = context && context.querySelector("h2") && context.querySelector("h2").textContent.trim();
    var readableAction = accessibleActionName(data.action, data);
    n.setAttribute("aria-label", readableAction + (storyTitle ? " — " + storyTitle : ""));
  }
  return n;
}

export function submitButton(text, className) {
  const n = document.createElement("button");
  n.type = "submit";
  n.className = className || "btn";
  n.textContent = text;
  return n;
}

export function segmentButton(text, value, activeValue, action) {
  var active = activeValue === value;
  var n = button(text, active ? "active" : "", { action: action || "filter", value: value });
  n.setAttribute("aria-pressed", String(active));
  return n;
}

export function list(items, className, renderItem) {
  const n = el("ul", className);
  items.forEach(function (item, i) {
    n.appendChild(renderItem(item, i));
  });
  return n;
}

export function el(tag, className, children) {
  const n = document.createElement(tag);
  if (className && typeof className === "object") {
    applyAttrs(n, className);
  } else if (className) {
    n.className = className;
  }
  if (children !== undefined && children !== null) {
    if (Array.isArray(children)) {
      children.filter(Boolean).forEach(function (c) {
        append(n, c);
      });
    } else {
      append(n, children);
    }
  }
  return n;
}

export function unique(items) {
  return items.filter(function (v, i) {
    return items.indexOf(v) === i;
  });
}

export {
  t,
  formatNumber,
  formatDate,
  formatDateDDMMYYYY,
  formatDateTime,
  formatTime,
  formatRelativeTime,
  normalizeStoryType,
  isChitrank,
  formatStoryType,
  normalizeLanguage,
  normalizeGenre,
  normalizeStoryStatus,
  normalizeChapterStatus,
  CANONICAL_GENRES,
  CANONICAL_LANGUAGES,
  CANONICAL_STORY_STATUSES,
  CANONICAL_CHAPTER_STATUSES
} from "./i18n.js";

export function showConfirm(options) {
  var title = options.title || "Confirm";
  var message = options.message || "Are you sure?";
  var confirmText = options.confirmText || "Confirm";
  var cancelText = options.cancelText || "Cancel";
  var isDanger = options.isDanger !== false;

  return new Promise(function (resolve) {
    var previousActiveElement = document.activeElement;

    var overlay = el("div", "custom-modal-overlay");
    var box = el("div", "custom-modal-box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    
    var titleId = "confirm-dialog-title-" + Math.random().toString(16).slice(2);
    var descId = "confirm-dialog-desc-" + Math.random().toString(16).slice(2);
    box.setAttribute("aria-labelledby", titleId);
    box.setAttribute("aria-describedby", descId);

    var h3 = el("h3", "custom-modal-title", title);
    h3.id = titleId;
    
    var p = el("p", "custom-modal-message", message);
    p.id = descId;
    
    var actions = el("div", "custom-modal-actions");
    
    var cancelBtn = el("button", "custom-btn btn-cancel", cancelText);
    cancelBtn.type = "button";
    
    var confirmBtn = el("button", "custom-btn " + (isDanger ? "btn-danger" : "btn-primary"), confirmText);
    confirmBtn.type = "button";
    
    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    
    box.appendChild(h3);
    box.appendChild(p);
    box.appendChild(actions);
    overlay.appendChild(box);
    
    document.body.appendChild(overlay);
    
    // Animate in and focus default button
    setTimeout(function () {
      overlay.classList.add("active");
      if (isDanger) {
        cancelBtn.focus();
      } else {
        confirmBtn.focus();
      }
    }, 10);
    
    var cleanUp = function (value) {
      document.removeEventListener("keydown", handleKeyDown);
      overlay.classList.remove("active");
      setTimeout(function () {
        overlay.remove();
        var prevEl = /** @type {HTMLElement | null} */ (previousActiveElement);
        if (prevEl && typeof prevEl.focus === "function") {
          prevEl.focus();
        }
        resolve(value);
        if (value && typeof options.onConfirm === "function") {
          options.onConfirm();
        }
      }, 200);
    };

    var handleKeyDown = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanUp(false);
      } else if (e.key === "Tab") {
        var focusables = [cancelBtn, confirmBtn];
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };
    
    document.addEventListener("keydown", handleKeyDown);
    
    cancelBtn.addEventListener("click", function () { cleanUp(false); });
    confirmBtn.addEventListener("click", function () { cleanUp(true); });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) cleanUp(false);
    });
  });
}


function append(parent, child) {
  if (child == null) return;
  if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(document.createTextNode(String(child)));
  } else if (child instanceof Node) {
    parent.appendChild(child);
  }
}

function applyAttrs(node, attrs) {
  if (!attrs) return;
  Object.keys(attrs).forEach(function (k) {
    if (k === "action") node.dataset.action = attrs[k];
    else if (k === "id") {
      node.dataset.id = attrs[k];
      node.setAttribute("id", attrs[k]);
    }
    else if (k === "storyId") node.dataset.storyId = attrs[k];
    else if (k === "required") node.required = true;
    else if (k === "disabled") {
      if (attrs[k]) node.disabled = true;
      else node.removeAttribute("disabled");
    }
    else if (k.indexOf("on") === 0) node[k] = attrs[k];
    else node.setAttribute(k, attrs[k]);
  });
}

export function generateChapterReadsChart(story) {
  const data = [];
  if (!story || !story.chapters || story.chapters.length < 1) {
    return data;
  }

  let maxVal = 0;
  story.chapters.forEach(function (ch) {
    const val = ch.reads || 0;
    if (val > maxVal) maxVal = val;
  });

  if (maxVal === 0) return data;

  const stepX = story.chapters.length > 1 ? 300 / (story.chapters.length - 1) : 150;
  story.chapters.forEach(function (ch, idx) {
    const x = story.chapters.length > 1 ? idx * stepX : 150;
    const val = ch.reads || 0;
    const y = maxVal > 0 ? 85 - (val / maxVal) * 70 : 85;
    data.push({
      x: Math.round(x),
      y: Math.round(y),
      value: val,
      label: ch.title || ("Ch. " + (idx + 1))
    });
  });
  return data;
}

export function calculateRetentionFunnel(story) {
  const data = [];
  if (!story || !story.chapters || story.chapters.length === 0) {
    return data;
  }

  const firstChapterReads = story.chapters[0].reads || 0;
  if (firstChapterReads === 0) return data;

  story.chapters.forEach((ch, idx) => {
    let retention = 100;
    let dropOff = 0;
    const currentReads = ch.reads || 0;

    if (idx > 0) {
      retention = firstChapterReads > 0 ? (currentReads / firstChapterReads) * 100 : 0;
      const prevReads = story.chapters[idx - 1].reads || 0;
      dropOff = prevReads > 0 ? ((prevReads - currentReads) / prevReads) * 100 : 0;
      if (dropOff < 0) dropOff = 0;
    }

    data.push({
      chapterIndex: idx,
      title: ch.title || ("Chapter " + (idx + 1)),
      reads: currentReads,
      retention: Math.min(100, Math.round(retention)),
      dropOff: Math.round(dropOff),
      highDropOff: dropOff > 20
    });
  });
  return data;
}

export function calculateGenreAverages(stories) {
  const genres = {};
  if (stories && stories.length > 0) {
    stories.forEach(s => {
      const g = s.genre || "General";
      if (!genres[g]) {
        genres[g] = { totalViews: 0, count: 0 };
      }
      genres[g].totalViews += s.views || 0;
      genres[g].count += 1;
    });
  }

  const list = Object.keys(genres).map(g => ({
    genre: g,
    avgViews: Math.round(genres[g].totalViews / genres[g].count),
    count: genres[g].count
  }));

  return list.sort((a, b) => b.avgViews - a.avgViews);
}

export function setFormFeedback(container, message, type) {
  if (!container) return;
  var existing = container.querySelectorAll(".form-feedback");
  existing.forEach(function (e) { e.remove(); });

  if (!message) return;

  var feedback = document.createElement("p");
  feedback.className = "form-feedback " + (type || "info");
  feedback.setAttribute("role", type === "error" ? "alert" : "status");
  feedback.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
  feedback.textContent = message;

  var submitBtn = container.querySelector("button[type='submit']");
  var actionsRow = container.querySelector(".editor-actions-row, .settings-field-row, .settings-field-row-wrap");
  if (submitBtn) {
    submitBtn.parentNode.insertBefore(feedback, submitBtn);
  } else if (actionsRow) {
    actionsRow.parentNode.insertBefore(feedback, actionsRow);
  } else {
    container.appendChild(feedback);
  }
}

export function setButtonLoading(btn, isLoading, loadingText) {
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = loadingText || "Saving...";
  } else {
    btn.disabled = false;
    if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
      delete btn.dataset.originalText;
    }
  }
}

