/* Local generated photo plates. Load/decode once; rendering and weather stay in the browser. */
(() => {
  'use strict';
  const images = new Map();
  const pending = new Map();
  const valid = new Set(['sunny', 'rain', 'snow', 'fog', 'storm']);
  window.WindowPhotoScenery = Object.freeze({
    peek(weather) { return images.get(weather); },
    load(weather) {
      if (!valid.has(weather)) return Promise.reject(new Error('Unknown photographic weather'));
      if (images.has(weather)) return Promise.resolve(images.get(weather));
      if (pending.has(weather)) return pending.get(weather);
      const promise = new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = async () => {
          try { await image.decode(); images.set(weather, image); resolve(image); }
          catch (error) { pending.delete(weather); reject(error); }
        };
        image.onerror = () => { pending.delete(weather); reject(new Error('Photo asset unavailable')); };
        image.src = `assets/${weather}.png`;
      });
      pending.set(weather, promise);
      return promise;
    }
  });
})();
