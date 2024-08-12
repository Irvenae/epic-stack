import { default as defaultConfig } from '@epic-web/config/eslint'
import stylisticJs from '@stylistic/eslint-plugin-js'
import unusedImports from "eslint-plugin-unused-imports";

/** @type {import("eslint").Linter.Config} */
export default [
  ...defaultConfig,
  {
    plugins: {
      '@stylistic/js': stylisticJs,
      'unused-imports': unusedImports,
    },
    rules: {
      indent: ['error', 2],
      '@stylistic/js/indent': ['error', 2],
      "unused-imports/no-unused-imports": "error",
    },
  },
]
