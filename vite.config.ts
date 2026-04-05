import { defineConfig } from 'vite';

function resolveBasePath(): string {
  if (!process.env.GITHUB_ACTIONS) {
    return '/';
  }

  const repository = process.env.GITHUB_REPOSITORY;
  const repositoryName = repository?.split('/')[1];

  return repositoryName ? `/${repositoryName}/` : '/';
}

export default defineConfig({
  root: '.',
  base: resolveBasePath(),
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3000,
  },
});
