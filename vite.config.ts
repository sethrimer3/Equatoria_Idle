import { defineConfig } from 'vite';

function resolveBasePath(mode: string): string {
  if (mode === 'desktop' || process.env.EQUATORIA_DESKTOP === '1') {
    return './';
  }

  if (!process.env.GITHUB_ACTIONS) {
    return '/';
  }

  const repository = process.env.GITHUB_REPOSITORY;
  const repositoryName = repository?.split('/')[1];

  return repositoryName ? `/${repositoryName}/` : '/';
}

export default defineConfig(({ mode }) => ({
  root: '.',
  base: resolveBasePath(mode),
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3000,
  },
}));
