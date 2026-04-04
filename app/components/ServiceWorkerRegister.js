'use client';

import { useEffect } from 'react';

/**
 * ServiceWorkerRegister
 * Registers the PWA service worker on mount.
 * Must be a client component since it uses browser APIs.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const register = async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none',
          });

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (
                  newWorker.state === 'installed' &&
                  navigator.serviceWorker.controller
                ) {
                  // New content available — could show an update toast here
                  console.info('[CrisisGrid SW] Update available.');
                }
              });
            }
          });
        } catch (err) {
          console.warn('[CrisisGrid SW] Registration failed:', err);
        }
      };

      // Register after page is fully loaded
      if (document.readyState === 'complete') {
        register();
      } else {
        window.addEventListener('load', register, { once: true });
      }
    }
  }, []);

  return null; // No UI
}
