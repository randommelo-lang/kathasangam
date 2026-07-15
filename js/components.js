export function calculateStars(story) {
  if (!story || !story.views) return "5.0";
  const ratio = story.likes / story.views;
  const rating = 4.0 + ratio * 10;
  return Math.min(5.0, Math.max(1.0, rating)).toFixed(1);
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

export function iconButton(text, className, data, iconName, disabled) {
  const btn = el("button", className || "btn");
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
    n.textContent = text;
  } else if (text) {
    n.appendChild(text);
  }
  if (data) {
    Object.keys(data).forEach(function (k) {
      n.dataset[k] = data[k];
    });
  }
  if (disabled) n.disabled = true;
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
  return button(text, activeValue === value ? "active" : "", { action: action || "filter", value: value });
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

export function formatNumber(v) {
  return new Intl.NumberFormat("en", { notation: v > 9999 ? "compact" : "standard" }).format(v);
}

export function formatDate(v) {
  if (!v) return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(v));
}

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
        if (previousActiveElement && typeof previousActiveElement.focus === "function") {
          previousActiveElement.focus();
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
  if (typeof child === "string" || typeof child === "number") {
    parent.appendChild(document.createTextNode(String(child)));
  } else {
    parent.appendChild(child);
  }
}

function applyAttrs(node, attrs) {
  if (!attrs) return;
  Object.keys(attrs).forEach(function (k) {
    if (k === "action") node.dataset.action = attrs[k];
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
