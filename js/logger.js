
const IS_DEBUG = (() => {
  try {
    const h = window.location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "";
  } catch {
    return false;
  }
})();

function noop() {}

export const log = {
  /** Debug-level messages — only printed in local development. */
  debug: IS_DEBUG ? console.log.bind(console) : noop,

  /** Warnings — always printed (actionable issues). */
  warn: console.warn.bind(console),

  /** Errors — always printed. */
  error: console.error.bind(console),
};
