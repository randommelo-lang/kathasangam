import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "backend/target/**", "js/vendor/**"]
  },
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser
    },
    rules: {
      "no-constant-condition": "error",
      "no-debugger": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error"
    }
  }
];
