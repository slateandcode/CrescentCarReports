import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // `.netlify/` holds generated edge/server build artifacts (vendored Deno std,
  // the Next server handler) — not our source. Linting it floods the report with
  // hundreds of irrelevant errors, so ignore it like the other build outputs.
  // `scratch/` holds throwaway art/PDF generation experiments (not shipped, not
  // tracked); `.netlify/` holds generated build artifacts. Neither is source.
  globalIgnores(['.next/**', 'out/**', 'build/**', '.netlify/**', 'scratch/**', 'next-env.d.ts']),
  {
    rules: {
      // Honour the codebase's intentional-discard conventions: `_`-prefixed names
      // and rest-sibling drops (e.g. `const { adminOnly: _x, ...rest } = item`).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
])

export default eslintConfig
