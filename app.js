const STORAGE_KEY = "werun-stopwatch-state-v1";
const DISPLAY_INTERVAL_MS = 43;
const DEFAULT_LAP_COMMENT = "";

const timeDisplay = document.getElementById("time-display");
const statusDisplay = document.getElementById("status-display");
const startPauseButton = document.getElementById("start-pause-btn");
const lapButton = document.getElementById("lap-btn");
const resetButton = document.getElementById("reset-btn");
const exportCsvButton = document.getElementById("export-csv-btn");
const exportJsonButton = document.getElementById("export-json-btn");
const fullscreenButton = document.getElementById("fullscreen-btn");
const wakeLockButton = document.getElementById("wake-lock-btn");
const offlineBadge = document.getElementById("offline-badge");
const restoreBadge = document.getElementById("restore-badge");
const lapList = document.getElementById("lap-list");
const emptyState = document.getElementById("empty-state");
const lapCount = document.getElementById("lap-count");

let timerId = null;
let wakeLockSentinel = null;
let state = loadState();

function defaultState() {
  return {
    isRunning: false,
    elapsedBeforeStartMs: 0,
    startedAtEpochMs: null,
    laps: [],
    wakeLockEnabled: false,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeLapComment(comment) {
  return String(comment ?? "").trim();
}

function getExportComment(comment) {
  const normalizedComment = normalizeLapComment(comment);
  return normalizedComment === "X" || normalizedComment === "❌"
    ? ""
    : normalizedComment;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultState();
    }

    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      laps: Array.isArray(parsed.laps)
        ? parsed.laps.map((lap, index) => ({
            ...lap,
            index: index + 1,
            comment: normalizeLapComment(lap.comment),
          }))
        : [],
    };
  } catch (error) {
    return defaultState();
  }
}

function persistState() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatTime(ms) {
  const totalCentiseconds = Math.max(0, Math.floor(ms / 10));
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const cc = String(centiseconds).padStart(2, "0");

  return hours > 0 ? `${hh}:${mm}:${ss}.${cc}` : `${mm}:${ss}.${cc}`;
}

function formatExportElapsedTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return `${hours}:${mm}:${ss}`;
}

function getElapsedTime(now = Date.now()) {
  if (!state.isRunning || !state.startedAtEpochMs) {
    return state.elapsedBeforeStartMs;
  }

  return state.elapsedBeforeStartMs + (now - state.startedAtEpochMs);
}

function updateDisplay() {
  timeDisplay.textContent = formatTime(getElapsedTime());
}

function startTicker() {
  stopTicker();
  updateDisplay();
  timerId = window.setInterval(() => {
    updateDisplay();
    persistState();
  }, DISPLAY_INTERVAL_MS);
}

function stopTicker() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function refreshButtons() {
  const hasLaps = state.laps.length > 0;
  startPauseButton.textContent = state.isRunning ? "Pause" : "Start";
  lapButton.disabled = !state.isRunning;
  exportCsvButton.disabled = !hasLaps;
  exportJsonButton.disabled = !hasLaps;
}

function refreshStatus() {
  if (state.isRunning) {
    statusDisplay.textContent = "Running";
    return;
  }

  statusDisplay.textContent = getElapsedTime() > 0 ? "Paused" : "Ready";
}

function updateRestoreBadge(message) {
  restoreBadge.textContent = message;
}

function renderLaps() {
  lapList.innerHTML = "";
  emptyState.hidden = state.laps.length > 0;
  lapCount.textContent = `${state.laps.length} lap${state.laps.length === 1 ? "" : "s"}`;

  state.laps
    .slice()
    .reverse()
    .forEach((lap) => {
      const lapItem = document.createElement("li");
      lapItem.className = "lap-item";
      lapItem.innerHTML = `
        <div class="lap-main">
          <span class="lap-label">Lap ${lap.index}</span>
          <div class="lap-total">${formatTime(lap.elapsedMs)}</div>
          <div class="lap-meta">Split ${formatTime(lap.splitMs)}</div>
          <div class="lap-meta">Date ${lap.recordedAtLabel}</div>
        </div>
        <div class="lap-actions">
          <label class="lap-comment-field">
            <span class="sr-only">Lap ${lap.index} comment</span>
            <input class="lap-comment-input" type="text" value="${escapeHtml(
              lap.comment ?? "",
            )}" placeholder="Comment" />
          </label>
          <button class="btn btn-danger lap-remove-btn" type="button" aria-label="Remove lap ${lap.index}" title="Remove lap">
            🗑️
          </button>
        </div>
      `;
      const commentInput = lapItem.querySelector(".lap-comment-input");
      const removeButton = lapItem.querySelector(".lap-remove-btn");

      commentInput.addEventListener("input", (event) => {
        updateLapComment(lap.index, event.target.value);
      });
      commentInput.addEventListener("blur", () => {
        finalizeLapComment(lap.index);
      });
      removeButton.addEventListener("click", () => {
        removeLap(lap.index);
      });
      lapList.appendChild(lapItem);
    });
}

function refreshAll() {
  updateDisplay();
  refreshStatus();
  refreshButtons();
  renderLaps();
}

function startStopwatch() {
  state.startedAtEpochMs = Date.now();
  state.isRunning = true;
  persistState();
  startTicker();
  refreshStatus();
  refreshButtons();
  updateRestoreBadge("Running session auto-saved");
}

function pauseStopwatch() {
  state.elapsedBeforeStartMs = getElapsedTime();
  state.startedAtEpochMs = null;
  state.isRunning = false;
  persistState();
  stopTicker();
  refreshStatus();
  refreshButtons();
  updateDisplay();
  updateRestoreBadge("Paused session saved locally");
}

function resetStopwatch() {
  stopTicker();
  state = defaultState();
  persistState();
  refreshAll();
  updateRestoreBadge("Session cleared");
}

function addLap() {
  const elapsedMs = getElapsedTime();
  const previousLap = state.laps[state.laps.length - 1];
  const splitMs = previousLap ? elapsedMs - previousLap.elapsedMs : elapsedMs;
  const recordedAt = new Date();

  state.laps.push({
    index: state.laps.length + 1,
    elapsedMs,
    splitMs,
    recordedAtIso: recordedAt.toISOString(),
    recordedAtLabel: recordedAt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    comment: DEFAULT_LAP_COMMENT,
  });

  persistState();
  renderLaps();
  refreshButtons();
  updateRestoreBadge("Lap added to official log");
}

function escapeCsvValue(value) {
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateLapComment(lapIndex, nextComment) {
  state.laps = state.laps.map((lap) =>
    lap.index === lapIndex ? { ...lap, comment: nextComment } : lap,
  );
  persistState();
}

function finalizeLapComment(lapIndex) {
  state.laps = state.laps.map((lap) =>
    lap.index === lapIndex
      ? { ...lap, comment: normalizeLapComment(lap.comment) }
      : lap,
  );
  persistState();
  renderLaps();
}

function removeLap(lapIndex) {
  state.laps = state.laps
    .filter((lap) => lap.index !== lapIndex)
    .map((lap, index) => ({
      ...lap,
      index: index + 1,
    }));
  persistState();
  renderLaps();
  refreshButtons();
  updateRestoreBadge(`Lap ${lapIndex} removed from official log`);
}

function triggerDownload(filename, blob) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return "unavailable";
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();

  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1000);

  return "downloaded";
}

async function exportFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const file =
    typeof File === "function"
      ? new File([blob], filename, { type: mimeType })
      : null;

  const canShareFile =
    file &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (typeof navigator.canShare !== "function" ||
      navigator.canShare({ files: [file] }));

  if (canShareFile) {
    try {
      await navigator.share({
        files: [file],
        title: filename,
      });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  return triggerDownload(filename, blob);
}

function isInAppBrowser() {
  const userAgent = navigator.userAgent || "";
  return /FBAN|FBAV|FB_IAB|FB4A|FBIOS|MessengerForiOS|Instagram/i.test(
    userAgent,
  );
}

function getExternalBrowserHref() {
  const currentUrl = window.location.href;
  const userAgent = navigator.userAgent || "";

  if (/Android/i.test(userAgent)) {
    const url = new URL(currentUrl);
    return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;end`;
  }

  if (/iPhone|iPad|iPod/i.test(userAgent) && currentUrl.startsWith("https://")) {
    return `googlechrome://${currentUrl.replace(/^https:\/\//, "")}`;
  }

  return currentUrl;
}

function renderExternalBrowserGate() {
  document.body.innerHTML = `
    <main class="external-browser-gate">
      <section class="external-browser-panel">
        <img class="brand-logo" src="./assets/logo.png" alt="WeRun logo" width="220" height="66" />
        <p class="eyebrow">Browser шаардлагатай</p>
        <h1>Messenger/Facebook browser дотор ажиллахгүй</h1>
        <p>
          CSV export найдвартай ажиллуулахын тулд дараах link-ээр
          Chrome эсвэл Safari дээр нээгээд цагаа хэмжээрэй.
        </p>
        <a class="btn btn-accent external-browser-link" href="${escapeHtml(
          getExternalBrowserHref(),
        )}" target="_blank" rel="noreferrer">Chrome/Safari дээр нээх</a>
        <p class="external-browser-url">${escapeHtml(window.location.href)}</p>
      </section>
    </main>
  `;
}

async function exportCsv() {
  if (isInAppBrowser()) {
    renderExternalBrowserGate();
    return;
  }

  const header = "Elapsed time,Comment";
  const rows = state.laps.map((lap) =>
    [
      formatExportElapsedTime(lap.elapsedMs),
      getExportComment(lap.comment),
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  const result = await exportFile(
    "werun-stopwatch-laps.csv",
    [header, ...rows].join("\n"),
    "text/csv;charset=utf-8",
  );
  updateRestoreBadge(
    result === "shared"
      ? "CSV shared"
      : result === "cancelled"
        ? "Export cancelled"
        : "CSV export ready",
  );
}

async function exportJson() {
  if (isInAppBrowser()) {
    renderExternalBrowserGate();
    return;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    laps: state.laps.map((lap) => ({
      "Elapsed time": formatExportElapsedTime(lap.elapsedMs),
      Comment: getExportComment(lap.comment),
    })),
  };

  const result = await exportFile(
    "werun-stopwatch-laps.json",
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8",
  );
  updateRestoreBadge(
    result === "shared"
      ? "JSON shared"
      : result === "cancelled"
        ? "Export cancelled"
        : "JSON export ready",
  );
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen?.();
  } else {
    await document.exitFullscreen?.();
  }
}

function syncFullscreenUi() {
  const inFullscreen = Boolean(document.fullscreenElement);
  fullscreenButton.textContent = inFullscreen
    ? "Exit Fullscreen"
    : "Fullscreen";
  document.body.classList.toggle("fullscreen-active", inFullscreen);
}

async function requestWakeLock() {
  if (
    !("wakeLock" in navigator) ||
    typeof navigator.wakeLock.request !== "function"
  ) {
    wakeLockButton.textContent = "Wake Lock Unsupported";
    wakeLockButton.disabled = true;
    state.wakeLockEnabled = false;
    persistState();
    return;
  }

  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", syncWakeLockUi);
    syncWakeLockUi();
  } catch (error) {
    updateRestoreBadge("Wake lock blocked by device");
    syncWakeLockUi();
  }
}

async function releaseWakeLock() {
  if (wakeLockSentinel) {
    await wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
  syncWakeLockUi();
}

function syncWakeLockUi() {
  const active = Boolean(wakeLockSentinel && !wakeLockSentinel.released);
  wakeLockButton.textContent = active ? "Screen Awake On" : "Keep Screen Awake";
}

async function toggleWakeLock() {
  const active = Boolean(wakeLockSentinel && !wakeLockSentinel.released);
  if (active) {
    state.wakeLockEnabled = false;
    persistState();
    await releaseWakeLock();
    return;
  }

  state.wakeLockEnabled = true;
  persistState();
  await requestWakeLock();
}

function updateConnectivityBadge() {
  if (navigator.onLine) {
    offlineBadge.textContent = "Online and offline-ready";
    return;
  }

  offlineBadge.textContent = "Offline mode active";
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const isLocalhost =
    location.hostname === "localhost" || location.hostname === "::1";

  if (isLocalhost) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
    updateRestoreBadge("Dev mode: cache cleared");
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    updateRestoreBadge("Offline cache unavailable on this browser");
  }
}

function restoreRunningSessionIfNeeded() {
  if (state.isRunning && state.startedAtEpochMs) {
    startTicker();
    updateRestoreBadge("Recovered running session");
    return;
  }

  updateRestoreBadge(
    state.updatedAt
      ? `Last saved ${new Date(state.updatedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : "Session persistence enabled",
  );
}

function syncFromVisibilityChange() {
  updateDisplay();

  if (document.visibilityState === "visible" && state.isRunning) {
    persistState();
    if (state.wakeLockEnabled) {
      requestWakeLock();
    }
  }
}

if (isInAppBrowser()) {
  renderExternalBrowserGate();
} else {
  startPauseButton.addEventListener("click", () => {
    if (state.isRunning) {
      pauseStopwatch();
      return;
    }

    startStopwatch();
  });

  lapButton.addEventListener("click", addLap);
  resetButton.addEventListener("click", resetStopwatch);
  exportCsvButton.addEventListener("click", exportCsv);
  exportJsonButton.addEventListener("click", exportJson);
  fullscreenButton.addEventListener("click", () => {
    toggleFullscreen().catch(() => {
      updateRestoreBadge("Fullscreen unavailable");
    });
  });
  wakeLockButton.addEventListener("click", () => {
    toggleWakeLock().catch(() => {
      updateRestoreBadge("Could not change wake lock");
    });
  });

  document.addEventListener("fullscreenchange", syncFullscreenUi);
  document.addEventListener("visibilitychange", syncFromVisibilityChange);
  window.addEventListener("pageshow", updateDisplay);
  window.addEventListener("beforeunload", persistState);
  window.addEventListener("online", updateConnectivityBadge);
  window.addEventListener("offline", updateConnectivityBadge);

  refreshAll();
  restoreRunningSessionIfNeeded();
  updateConnectivityBadge();
  syncFullscreenUi();
  syncWakeLockUi();
  if (state.wakeLockEnabled && document.visibilityState === "visible") {
    requestWakeLock();
  }
  registerServiceWorker();
}
