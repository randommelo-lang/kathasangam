export function calculateStars(story) {
  if (!story || !story.views) return "5.0";
  const ratio = story.likes / story.views;
  const rating = 4.0 + ratio * 10;
  return Math.min(5.0, Math.max(1.0, rating)).toFixed(1);
}

export function generateChartData(story) {
  const pointsCount = 7;
  const data = [];
  if (story.chapters && story.chapters.length >= 2) {
    let maxReads = 0;
    story.chapters.forEach(function (ch) {
      if (ch.reads > maxReads) maxReads = ch.reads;
    });
    const stepX = 300 / Math.max(1, story.chapters.length - 1);
    story.chapters.forEach(function (ch, idx) {
      const x = idx * stepX;
      let y = 85;
      if (maxReads > 0) {
        y = 85 - (ch.reads / maxReads) * 70;
      } else {
        y = 75 - (idx * 7) % 30;
      }
      data.push({ x: Math.round(x), y: Math.round(y) });
    });
  } else {
    let seed = 0;
    if (story.id) {
      for (let i = 0; i < story.id.length; i++) {
        seed += story.id.charCodeAt(i);
      }
    }
    const stepX = 300 / (pointsCount - 1);
    for (let idx = 0; idx < pointsCount; idx++) {
      const x = idx * stepX;
      const sineVal = Math.sin(seed + idx * 0.95) * 28;
      const y = 60 + sineVal;
      data.push({ x: Math.round(x), y: Math.round(Math.min(85, Math.max(15, y))) });
    }
  }
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
        n.appendChild(c);
      });
    } else {
      n.appendChild(children);
    }
  }
  return n;
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

export function analyticsMetricBox(label, value, trend, isUp) {
  const trendClass = isUp ? "analytics-trend-up" : "analytics-trend-down";
  const trendSymbol = isUp ? "^ " : "v ";
  return el("div", "analytics-metric-box", [
    el("span", null, label),
    el("strong", null, String(value)),
    el("em", trendClass, trendSymbol + trend)
  ]);
}

export function quickActionTile(iconName, label, action) {
  const tile = el("div", "quick-action-tile", [
    el("span", "icon icon-lg " + iconName),
    el("span", null, label)
  ]);
  tile.dataset.action = action;
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

export function select(name, options) {
  const n = document.createElement("select");
  n.name = name;
  options.forEach(function (p) {
    const o = document.createElement("option");
    o.value = p[0];
    o.textContent = p[1];
    n.appendChild(o);
  });
  return n;
}

export function button(text, className, data, disabled) {
  const n = document.createElement("button");
  n.type = "button";
  n.className = className == null ? "btn" : className;
  n.textContent = text;
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
    else node.setAttribute(k, attrs[k]);
  });
}
