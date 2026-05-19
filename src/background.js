window.__tabs__ = new Map();

function applyPopupViews(func, args) {
  const views = browser.extension.getViews({ type: "popup" });
  for (const view of views) {
    view[func].apply(view, args);
  }
}

function normalizeVolume(value) {
  const volume = Number(value);
  if (!Number.isFinite(volume)) {
    return 1;
  }
  return Math.max(0, Math.min(1, volume));
}

function normalizeDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return duration;
}

function normalizeCurrentTime(value, duration = 0) {
  const currentTime = Number(value);
  if (!Number.isFinite(currentTime) || currentTime < 0) {
    return 0;
  }
  if (duration > 0) {
    return Math.min(currentTime, duration);
  }
  return currentTime;
}

function mergeMediaState(previous, incoming = {}) {
  const base = previous ?? {};
  const duration = normalizeDuration(incoming.duration ?? base.duration);
  return {
    paused: Boolean(incoming.paused ?? base.paused ?? true),
    muted: Boolean(incoming.muted ?? base.muted ?? false),
    volume: normalizeVolume(incoming.volume ?? base.volume),
    duration,
    currentTime: normalizeCurrentTime(incoming.currentTime ?? base.currentTime, duration),
  };
}

async function readMediaSnapshot(tid) {
  const [media] = await browser.tabs.executeScript(tid, {
    code: `(() => {
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

      if ($media === null) {
        return null;
      }

      return {
        paused: $media.paused,
        muted: $media.muted,
        volume: $media.volume,
        currentTime: $media.currentTime,
        duration: $media.duration,
      };
    })();`,
  });
  return media ?? null;
}

const MEDIA_PROGRESS_EVENTS = new Set(["timeupdate", "durationchange", "loadedmetadata", "seeking", "seeked"]);

async function init(tab) {
  if (typeof tab === "number") {
    tab = await browser.tabs.get(tab);
  }
  const url = new URL(tab.url);
  const thumbnail = await (async () => {
    if (url.hostname.match(/^(www|music)\.youtube\.com$/)) {
      const vid = tab.url.match(/\/(?:watch\?v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/)[1];
      return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
    }
    return (
      await browser.tabs.executeScript(tab.id, {
        code: `document.querySelector("meta[property='og:image']")?.getAttribute("content");`,
      })
    )[0];
  })();
  const color = await (async (src) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        canvas.width = image.width;
        canvas.height = image.height;
        context.drawImage(image, 0, 0, 1, 1);
        resolve(context.getImageData(0, 0, 1, 1).data);
        // returns [r, g, b, a]
      };
      image.src = src;
    });
  })(thumbnail || tab.favIconUrl);
  return {
    id: tab.id,
    wid: tab.windowId,
    media: null,
    title: tab.title,
    favicon: tab.favIconUrl,
    hostname: url.hostname,
    thumbnail: thumbnail,
    color: color,
  };
}

async function register(tid) {
  const tab = await init(tid);
  window.__tabs__.set(tid, tab);
  await browser.browserAction.enable();
  await browser.browserAction.setBadgeText({
    text: String(window.__tabs__.size),
  });
  await browser.tabs.executeScript(tid, { file: "inject.js" });

  const trackedTab = window.__tabs__.get(tid);
  if (trackedTab === undefined) {
    return;
  }

  try {
    const media = await readMediaSnapshot(tid);
    if (media !== null) {
      trackedTab.media = mergeMediaState(trackedTab.media, media);
    }
  } catch (error) {
    console.warn("Unable to read initial media snapshot", error);
  }

  applyPopupViews("add", [trackedTab]);
}

async function unregister(tid) {
  window.__tabs__.delete(tid);
  applyPopupViews("del", [tid]);
  const size = window.__tabs__.size;
  size === 0 && (await browser.browserAction.disable());
  await browser.browserAction.setBadgeText({
    text: size > 0 ? String(size) : null,
  });
  await browser.tabs.sendMessage(tid, "@unhook");
}

browser.browserAction.disable();
browser.browserAction.setBadgeTextColor({ color: "white" });
browser.browserAction.setBadgeBackgroundColor({ color: "gray" });

browser.tabs.query({ audible: true, status: "complete" }).then(async (tabs) => {
  for (const { id } of tabs) {
    await register(id);
  }
});

browser.tabs.onUpdated.addListener(
  async (tid, { audible }) => {
    if (audible && !window.__tabs__.has(tid)) {
      await register(tid);
    }
  },
  { properties: ["audible"] }
);

browser.tabs.onUpdated.addListener(
  async (tid) => {
    if (window.__tabs__.has(tid)) {
      await unregister(tid);
      await new Promise((r) => setTimeout(r, 4500));
      const tab = await browser.tabs.get(tid);
      if (tab.audible) {
        await register(tid);
      }
    }
  },
  { properties: ["url", "status"] }
);

browser.tabs.onUpdated.addListener(
  async (tid, { title }) => {
    if (window.__tabs__.has(tid)) {
      window.__tabs__.get(tid).title = title;
      applyPopupViews("update", [window.__tabs__.get(tid)]);
    }
  },
  { properties: ["title"] }
);

browser.tabs.onUpdated.addListener(
  async (tid, { discarded }) => {
    if (discarded && window.__tabs__.has(tid)) {
      await unregister(tid);
    }
  },
  { properties: ["discarded"] }
);

browser.tabs.onRemoved.addListener(async (tid) => {
  if (window.__tabs__.has(tid)) {
    await unregister(tid);
  }
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  const tid = sender.tab.id;
  const tab = window.__tabs__.get(tid);
  if (tab === undefined) {
    return;
  }

  if (message.type === "@hook") {
    tab.media = mergeMediaState(tab.media, message.media);
    await browser.tabs.executeScript(tid, { file: "hook.js" });
    applyPopupViews("update", [tab]);
  } else if (message.type === "play" || message.type === "pause") {
    const paused = message.type === "play" ? false : true;
    tab.media = mergeMediaState(tab.media, { ...message, paused });
    applyPopupViews("update", [tab]);
  } else if (message.type === "volumechange") {
    tab.media = mergeMediaState(tab.media, message);
    applyPopupViews("syncVolume", [tid, tab.media]);
  } else if (MEDIA_PROGRESS_EVENTS.has(message.type)) {
    tab.media = mergeMediaState(tab.media, message);
    applyPopupViews("syncProgress", [tid, tab.media]);
  } else return;
});
