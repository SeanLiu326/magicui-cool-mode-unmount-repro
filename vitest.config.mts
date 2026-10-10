import { resolve } from 'node:path';

const repo = process.env.MAGICUI_REPO;
if (!repo) throw new Error('Set MAGICUI_REPO to the Magic UI checkout path.');
const modules = resolve(process.cwd(), 'node_modules');

export default {
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@magicui/cool-mode': resolve(repo, 'apps/www/registry/magicui/cool-mode.tsx'),
      '@': resolve(repo, 'apps/www'),
      'react-test-renderer': resolve(modules, 'react-test-renderer/index.js'),
      'react/jsx-dev-runtime': resolve(modules, 'react/jsx-dev-runtime.js'),
      'react/jsx-runtime': resolve(modules, 'react/jsx-runtime.js'),
      react: resolve(modules, 'react/index.js'),
      jsdom: resolve(modules, 'jsdom/lib/api.js'),
      vitest: resolve(modules, 'vitest/dist/index.js'),
    },
  },
  test: { root: import.meta.dirname, include: ['repro.test.ts'], environment: 'node', maxWorkers: 1 },
};
