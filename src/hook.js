// Page-script entry point: binds media element events to runtime messages.
(() => {
  // Build reusable listeners once; each listener publishes a full media snapshot.
  if (window.listeners === undefined) {
    window.listeners = {};
    ["play", "pause", "volumechange", "timeupdate", "durationchange", "loadedmetadata", "seeking", "seeked"].forEach((type) => {
      if (!(type in window.listeners))
        // Event callback sends current media values so background has a full snapshot.
        window.listeners[type] = async () => {
          const message = {
            type,
            paused: window.$media.paused,
            muted: window.$media.muted,
            volume: window.$media.volume,
            currentTime: window.$media.currentTime,
            duration: window.$media.duration,
          };
          await browser.runtime.sendMessage(message);
        };
    });
  }

  // Attach listeners to the currently tagged media element.
  if (window.$media === undefined) {
    window.$media = document.querySelector("[mcx-media]");
    for (const [type, listener] of Object.entries(window.listeners)) {
      window.$media.addEventListener(type, listener);
    }

    // Background asks for cleanup when tab is unregistered.
    browser.runtime.onMessage.addListener((message) => {
      if (message === "@unhook") {
        const $media = document.querySelector("[mcx-media]");
        if ($media !== null) {
          for (const [type, listener] of Object.entries(window.listeners)) {
            $media.removeEventListener(type, listener);
          }
          $media.toggleAttribute("mcx-media", false);
          window.$media = undefined;
        }
      }
    });
  }
})();
