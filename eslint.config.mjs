import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "src/wasm/pkg/**", "src/contracts/generated/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // TypeScript already enforces unused declarations in the product source.
      "@typescript-eslint/no-unused-vars": "off",
      // Forward-declared listeners/tasks intentionally close over their later assignment.
      "prefer-const": "off",
    },
  },
);
