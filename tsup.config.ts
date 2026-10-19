import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // Declarations come from tsc (dist/types): a single bundled .d.ts was too large to build reliably as a git dependency.
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['zod', '@ts-rest/core'],
});
