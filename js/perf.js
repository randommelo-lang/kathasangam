// Performance Monitoring & Mobile Network Timing Tracker for KathaSangam
// Tracks Core Web Vitals (LCP, FCP, CLS, FID/INP), Network conditions, and Route timings.

var vitals = {
  fcp: null,
  lcp: null,
  cls: 0,
  fid: null,
  ttfb: null
};

var routeTimings = [];
var interactionTimings = [];
var routeStarts = {};
var networkInfo = {
  effectiveType: "unknown",
  downlink: null,
  rtt: null,
  saveData: false,
  isSlow: false
};

var isInitialized = false;

export function updateNetworkInfo() {
  if (
    typeof navigator !== "undefined" &&
    (navigator.connection || navigator.mozConnection || navigator.webkitConnection)
  ) {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    networkInfo.effectiveType = conn.effectiveType || "4g";
    networkInfo.downlink = conn.downlink !== undefined ? conn.downlink : null;
    networkInfo.rtt = conn.rtt !== undefined ? conn.rtt : null;
    networkInfo.saveData = !!conn.saveData;
    networkInfo.isSlow =
      networkInfo.saveData ||
      networkInfo.effectiveType === "slow-2g" ||
      networkInfo.effectiveType === "2g" ||
      networkInfo.effectiveType === "3g";
  } else {
    networkInfo.effectiveType = "4g";
    networkInfo.isSlow = false;
  }
  return networkInfo;
}

export function isLowBandwidth() {
  updateNetworkInfo();
  return networkInfo.isSlow;
}

export function initPerfMonitoring() {
  if (isInitialized) return;
  isInitialized = true;

  updateNetworkInfo();

  if (typeof navigator !== "undefined") {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.addEventListener) {
      conn.addEventListener("change", function () {
        updateNetworkInfo();
      });
    }
  }

  if (typeof window === "undefined" || !window.performance) return;

  // Track TTFB via navigation timing
  try {
    var navEntries = window.performance.getEntriesByType("navigation");
    if (navEntries && navEntries.length > 0) {
      var nav = navEntries[0];
      vitals.ttfb = Math.round(nav.responseStart - nav.requestStart);
    }
  } catch (e) {
    // ignore
  }

  if (typeof PerformanceObserver === "undefined") return;

  // 1. Paint timing (FCP)
  try {
    var paintObserver = new PerformanceObserver(function (entryList) {
      entryList.getEntries().forEach(function (entry) {
        if (entry.name === "first-contentful-paint") {
          vitals.fcp = Math.round(entry.startTime);
        }
      });
    });
    paintObserver.observe({ type: "paint", buffered: true });
  } catch (e) {
    // Observer type not supported
  }

  // 2. Largest Contentful Paint (LCP)
  try {
    var lcpObserver = new PerformanceObserver(function (entryList) {
      var entries = entryList.getEntries();
      if (entries.length > 0) {
        var lastEntry = entries[entries.length - 1];
        vitals.lcp = Math.round(lastEntry.startTime);
      }
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
  } catch (e) {
    // Observer type not supported
  }

  // 3. Cumulative Layout Shift (CLS)
  try {
    var clsObserver = new PerformanceObserver(function (entryList) {
      entryList.getEntries().forEach(function (entry) {
        if (!entry.hadRecentInput) {
          vitals.cls = parseFloat((vitals.cls + entry.value).toFixed(4));
        }
      });
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });
  } catch (e) {
    // Observer type not supported
  }

  // 4. First Input Delay (FID)
  try {
    var fidObserver = new PerformanceObserver(function (entryList) {
      entryList.getEntries().forEach(function (entry) {
        vitals.fid = Math.round(entry.processingStart - entry.startTime);
      });
    });
    fidObserver.observe({ type: "first-input", buffered: true });
  } catch (e) {
    // Observer type not supported
  }
}

export function markRouteStart(viewName) {
  if (typeof window === "undefined" || !window.performance) return;
  routeStarts[viewName] = window.performance.now();
}

export function markRouteEnd(viewName) {
  if (typeof window === "undefined" || !window.performance) return;
  var start = routeStarts[viewName];
  if (start !== undefined) {
    var duration = Math.round(window.performance.now() - start);
    var record = {
      view: viewName,
      durationMs: duration,
      timestamp: Date.now(),
      network: networkInfo.effectiveType
    };
    routeTimings.push(record);
    if (routeTimings.length > 30) {
      routeTimings.shift();
    }
    delete routeStarts[viewName];
    return duration;
  }
  return null;
}

export function trackInteraction(name, durationOrFn) {
  var duration = 0;
  if (typeof durationOrFn === "function") {
    var start =
      typeof window !== "undefined" && window.performance ? window.performance.now() : Date.now();
    try {
      durationOrFn();
    } finally {
      var end =
        typeof window !== "undefined" && window.performance ? window.performance.now() : Date.now();
      duration = Math.round(end - start);
    }
  } else if (typeof durationOrFn === "number") {
    duration = Math.round(durationOrFn);
  }

  var record = {
    name: name,
    durationMs: duration,
    timestamp: Date.now()
  };
  interactionTimings.push(record);
  if (interactionTimings.length > 30) {
    interactionTimings.shift();
  }
  return duration;
}

export function getMetrics() {
  updateNetworkInfo();
  return {
    vitals: Object.assign({}, vitals),
    network: Object.assign({}, networkInfo),
    routeTimings: routeTimings.slice(),
    interactionTimings: interactionTimings.slice()
  };
}

export function resetMetrics() {
  vitals.fcp = null;
  vitals.lcp = null;
  vitals.cls = 0;
  vitals.fid = null;
  vitals.ttfb = null;
  routeTimings = [];
  interactionTimings = [];
  routeStarts = {};
}

// Auto-initialize if running in browser
if (typeof window !== "undefined") {
  initPerfMonitoring();
  window.perfMetrics = {
    getMetrics: getMetrics,
    updateNetworkInfo: updateNetworkInfo,
    isLowBandwidth: isLowBandwidth,
    markRouteStart: markRouteStart,
    markRouteEnd: markRouteEnd,
    trackInteraction: trackInteraction,
    resetMetrics: resetMetrics
  };
}
