module.exports = {
  root: true,
  env: { es2024: true, node: true, browser: true },
  parserOptions: { ecmaVersion: "latest", sourceType: "script" },
  ignorePatterns: [
    "node_modules/**",
    "tools_local/**",
    "config/**",
    "build-output/**",
    "dist/**",
    "out/**",
    ".vscode/**",
  ],
  rules: {
    "no-unused-vars": ["warn", { args: "after-used", ignoreRestSiblings: true }],
    "no-unreachable": "warn",
    "no-constant-condition": ["warn", { checkLoops: false }]
  }
};
