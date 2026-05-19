(() => {
  if (document.querySelector("[mcx-media]") === null) {
    const $allMedia = Array.from(document.querySelectorAll("video, audio"));
    const $playing = $allMedia.find(($item) => !$item.paused && !$item.ended);
    if ($playing !== undefined) {
      $playing.toggleAttribute("mcx-media", true);
      window.dispatchEvent(new Event("hook"));
      return;
    }
  }

  if (window.__mcxMediaPatched === true) {
    return;
  }

  window.__mcxMediaPatched = true;
  ["play", "pause"].forEach((method) => {
    const originalMethod = HTMLMediaElement.prototype[method];
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
