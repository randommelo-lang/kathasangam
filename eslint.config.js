import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "backend/target/**", "js/vendor/**"]
  },
  {
    files: ["js/auth/**/*.js", "js/auth.js", "js/achievements.js", "js/i18n.js", "js/perf.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser
    },
    rules: {
      "no-constant-condition": "error",
      "no-debugger": "error",
      "no-unreachable": "error"
    }
  }
];
