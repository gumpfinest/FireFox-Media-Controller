// Page-script entry point: tags media nodes and emits hook events for state sync.
(() => {
  // On first load, tag an already-playing media element so controls work immediately.
  if (document.querySelector("[mcx-media]") === null) {
    const $allMedia = Array.from(document.querySelectorAll("video, audio"));
    const $playing = $allMedia.find(($item) => !$item.paused && !$item.ended);
    if ($playing !== undefined) {
      $playing.toggleAttribute("mcx-media", true);
      window.dispatchEvent(new Event("hook"));
      return;
    }
  }

  // Prevent patching media prototypes more than once per page.
  if (window.__mcxMediaPatched === true) {
    return;
  }

  window.__mcxMediaPatched = true;
  // Intercept play/pause so newly active media is tagged and state is reported.
  ["play", "pause"].forEach((method) => {
    const originalMethod = HTMLMediaElement.prototype[method];
    // Wrapped method keeps original behavior but adds tagging + hook emission.
    HTMLMediaElement.prototype[method] = function () {
      const value = originalMethod.apply(this, arguments);
      if (this.getAttribute("mcx-media") === null) {
        if (!document.contains(this) && document.body !== null) {
          document.body.append(this);
        }
        this.toggleAttribute("mcx-media", true);
      }
      window.dispatchEvent(new Event("hook"));
      return value;
    };
  });
})();
