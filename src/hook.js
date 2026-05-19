(() => {
  if (window.listeners === undefined) {
    window.listeners = {};
    ["play", "pause", "volumechange", "timeupdate", "durationchange", "loadedmetadata", "seeking", "seeked"].forEach((type) => {
      if (!(type in window.listeners))
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

  if (window.$media === undefined) {
    window.$media = document.querySelector("[mcx-media]");
    for (const [type, listener] of Object.entries(window.listeners)) {
      window.$media.addEventListener(type, listener);
    }
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
