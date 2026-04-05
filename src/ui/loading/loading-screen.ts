/**
 * Loading screen — displays company logo while essential assets load.
 */

import { LOGO_PATH } from '../../render/assets/asset-paths';
import { loadImage } from '../../render/assets/asset-loader';

export interface LoadingScreen {
  /** The loading screen DOM element. */
  readonly element: HTMLElement;
  /** Fade out and remove the loading screen. Returns a promise that resolves when complete. */
  fadeOut(): Promise<void>;
}

/**
 * Create the loading screen and begin loading the logo.
 * The returned promise resolves when the logo is loaded (or after a timeout).
 */
export async function createLoadingScreen(): Promise<LoadingScreen> {
  const overlay = document.createElement('div');
  overlay.className = 'loading-screen';

  const logoContainer = document.createElement('div');
  logoContainer.className = 'loading-logo-container';

  const logoImg = document.createElement('img');
  logoImg.className = 'loading-logo';
  logoImg.alt = 'Gravy Thyme';

  const loadingText = document.createElement('div');
  loadingText.className = 'loading-text';
  loadingText.textContent = 'Loading...';

  logoContainer.appendChild(logoImg);
  overlay.appendChild(logoContainer);
  overlay.appendChild(loadingText);

  // Try to load the logo
  try {
    const img = await Promise.race([
      loadImage(LOGO_PATH),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    logoImg.src = img.src;
  } catch {
    // If logo fails, just show text
    logoImg.style.display = 'none';
  }

  // Show for at least 1.5 seconds for branding
  await new Promise(resolve => setTimeout(resolve, 1500));

  return {
    element: overlay,
    fadeOut(): Promise<void> {
      return new Promise(resolve => {
        overlay.classList.add('loading-screen--fade-out');
        overlay.addEventListener('transitionend', () => {
          overlay.remove();
          resolve();
        }, { once: true });
        // Fallback in case transition doesn't fire
        setTimeout(() => {
          overlay.remove();
          resolve();
        }, 1000);
      });
    },
  };
}
