(() => {
  const resolveMedia = () => {
    let $media = document.querySelector("[mcx-media]");
    if ($media === null) {
      const $allMedia = Array.from(document.querySelectorAll("video, audio"));
      $media =
        $allMedia.find(($item) => !$item.paused && !$item.ended) ||
        $allMedia.find(($item) => !$item.ended) ||
        $allMedia[0] ||
        null;
      if ($media !== null && $media.getAttribute("mcx-media") === null) {
        $media.toggleAttribute("mcx-media", true);
      }
    }
    return $media;
  };

  const sendHookState = async () => {
    const $media = resolveMedia();
    if ($media === null) {
      return;
    }
    await browser.runtime.sendMessage({
      type: "@hook",
      media: {
        paused: $media.paused,
        muted: $media.muted,
        volume: $media.volume,
        currentTime: $media.currentTime,
        duration: $media.duration,
      },
    });
  };

  let $script = document.querySelector("script#mcx-inject");
  if ($script === null) {
    window.addEventListener("hook", sendHookState);
  } else {
    $script.remove();
    $script = undefined;
  }
  $script = document.createElement("script");
  $script.id = "mcx-inject";
  $script.src = browser.runtime.getURL("media.js");
  document.head.appendChild($script);

  // Push immediate state for already-tagged media so popup can initialize controls correctly.
  void sendHookState();
})();
