import { startApp } from './app';

// Boot when DOM is ready
function boot(): void {
  startApp().catch((err) => {
    console.error('Failed to start Equatoria Idle:', err);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
