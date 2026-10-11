// Main function to track time
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let trackingRefreshRunning = false;
let trackingRefreshQueued = false;
let trackingResetRequested = false;
let trackingResetCallbacks = [];
let dataCleanupRequested = false;
// Prevent a delayed alarm or suspended browser from adding a long inactive gap
const maxTrackingIntervalMs = 60 * 1000;

function splitElapsedByLocalDate(startMs, elapsedMs) {
  const segments = [];
  const endMs = startMs + elapsedMs;
  let segmentStartMs = startMs;

  while (segmentStartMs < endMs) {
    const nextMidnight = new Date(segmentStartMs);
    nextMidnight.setHours(24, 0, 0, 0);
    const segmentEndMs = Math.min(endMs, nextMidnight.getTime());
    segments.push({
      date: getLocalDateString(new Date(segmentStartMs)),
      elapsedMs: segmentEndMs - segmentStartMs
    });
    segmentStartMs = segmentEndMs;
  }

  return segments;
}

function trackTime() {
  trackingRefreshQueued = true;
  if (trackingRefreshRunning) return;

  trackingRefreshRunning = true;
  const processNextRefresh = () => {
    if (trackingResetRequested) {
      trackingResetRequested = false;
      trackingRefreshQueued = false;
      const resetCallbacks = trackingResetCallbacks;
      trackingResetCallbacks = [];

      chrome.storage.local.set({ dailyTimeData: {} }, () => {
        const dataError = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
        chrome.storage.session.remove("timeTrackingState", () => {
          const resetError = dataError || (chrome.runtime.lastError ? chrome.runtime.lastError.message : null);
          if (resetError) {
            console.error("Failed to reset tracked data:", resetError);
          }
          resetCallbacks.forEach((callback) => callback(resetError));
          processNextRefresh();
        });
      });
      return;
    }

    if (dataCleanupRequested) {
      dataCleanupRequested = false;
      performDataCleanup(() => {
        processNextRefresh();
      });
      return;
    }

    if (!trackingRefreshQueued) {
      trackingRefreshRunning = false;
      return;
    }
    trackingRefreshQueued = false;

    getTrackingContext((context) => {
      chrome.storage.session.get("timeTrackingState", (result) => {
        if (chrome.runtime.lastError) {
          console.error("Failed to read tracking state:", chrome.runtime.lastError.message);
          processNextRefresh();
          return;
        }

        const now = Date.now();
        const previousState = result.timeTrackingState;
        const remainders = previousState && previousState.remainders
          ? previousState.remainders
          : {};
        let trackedSegments = [];
        if (previousState && previousState.shouldTrack && previousState.domain) {
          const elapsedMs = Math.max(0, Math.min(now - previousState.updatedAt, maxTrackingIntervalMs));
          trackedSegments = splitElapsedByLocalDate(now - elapsedMs, elapsedMs).map((segment) => {
            const remainderKey = `${segment.date}|${previousState.domain}`;
            const previousRemainderMs = Number.isFinite(remainders[remainderKey])
              ? remainders[remainderKey]
              : 0;
            const elapsedWithRemainderMs = segment.elapsedMs + previousRemainderMs;
            remainders[remainderKey] = elapsedWithRemainderMs % 1000;
            return {
              date: segment.date,
              seconds: Math.floor(elapsedWithRemainderMs / 1000)
            };
          });
          for (const key of Object.keys(remainders)) {
            const separatorIndex = key.indexOf("|");
            const remainderDate = separatorIndex === -1
              ? getLocalDateString(new Date(now - elapsedMs))
              : key.slice(0, separatorIndex);
            if (remainderDate < getLocalDateString(new Date(now - elapsedMs))) {
              delete remainders[key];
            }
          }
        }
        const saveNextState = () => {
          chrome.storage.session.set({
            timeTrackingState: {
              domain: context.domain,
              shouldTrack: context.shouldTrack,
              updatedAt: now,
              remainders
            }
          }, () => {
            if (chrome.runtime.lastError) {
              console.error("Failed to save tracking state:", chrome.runtime.lastError.message);
            }
            processNextRefresh();
          });
        };

        const saveTrackedSegments = (index) => {
          if (index >= trackedSegments.length) {
            saveNextState();
            return;
          }
          const segment = trackedSegments[index];
          if (segment.seconds > 0) {
            updateStorage(previousState.domain, segment.seconds, segment.date, () => {
              saveTrackedSegments(index + 1);
            });
          } else {
            saveTrackedSegments(index + 1);
          }
        };
        saveTrackedSegments(0);
      });
    });
  };

  processNextRefresh();
}

function resetTrackedData(callback) {
  trackingResetCallbacks.push(callback);
  trackingResetRequested = true;
  if (!trackingRefreshRunning) {
    trackTime();
  }
}

function getTrackingContext(callback) {
  chrome.storage.local.get(["trackOnlyWhileActive", "trackWhileIdle", "trackAllWeb", "whitelist", "ignorelist"], (settings) => {
    if (chrome.runtime.lastError) {
      console.error("Failed to read tracking settings:", chrome.runtime.lastError.message);
      callback({ domain: null, shouldTrack: false });
      return;
    }

    const trackOnlyWhileActive = typeof settings.trackOnlyWhileActive === "boolean"
      ? settings.trackOnlyWhileActive
      : settings.trackWhileIdle === false;
    const continueTrackingContext = () => {
      chrome.windows.getLastFocused((focusedWindow) => {
        if (chrome.runtime.lastError) {
          console.error("Failed to get the focused browser window:", chrome.runtime.lastError.message);
          callback({ domain: null, shouldTrack: false });
          return;
        }
        if (!focusedWindow || !focusedWindow.focused) {
          callback({ domain: null, shouldTrack: false });
          return;
        }

        chrome.tabs.query({ active: true, windowId: focusedWindow.id }, (tabs) => {
          if (chrome.runtime.lastError) {
            console.error("Failed to get the active browser tab:", chrome.runtime.lastError.message);
            callback({ domain: null, shouldTrack: false });
            return;
          }
          const tab = tabs[0];
          if (!tab || !tab.url || !tab.url.startsWith("http")) {
            callback({ domain: null, shouldTrack: false });
            return;
          }

          const domain = new URL(tab.url).hostname;
          const trackAll = settings.trackAllWeb !== false;
          const whitelist = settings.whitelist || [];
          const ignorelist = settings.ignorelist || [];
          const listStatus = getDomainListStatus(domain, whitelist, ignorelist);
          callback({
            domain,
            shouldTrack: listStatus !== "ignored" && (trackAll || listStatus === "whitelisted")
          });
        });
      });
    };

    if (!trackOnlyWhileActive) {
      continueTrackingContext();
      return;
    }

    chrome.idle.queryState(60, (idleState) => {
      if (chrome.runtime.lastError) {
        console.error("Failed to query user idle state:", chrome.runtime.lastError.message);
        callback({ domain: null, shouldTrack: false });
        return;
      }
      if (idleState === "active") {
        continueTrackingContext();
      } else {
        callback({ domain: null, shouldTrack: false });
      }
    });
  });
}

function updateStorage(domain, secondsToAdd, date = getLocalDateString(), callback = () => {}) {
  chrome.storage.local.get("dailyTimeData", (result) => {
    if (chrome.runtime.lastError) {
      console.error("Failed to read tracked time:", chrome.runtime.lastError.message);
      callback();
      return;
    }
    const data = result.dailyTimeData || {};
    if (!data[date]) {
      data[date] = {};
    }
    data[date][domain] = (data[date][domain] || 0) + secondsToAdd;
    chrome.storage.local.set({ dailyTimeData: data }, () => {
      if (chrome.runtime.lastError) {
        console.error("Failed to save tracked time:", chrome.runtime.lastError.message);
      }
      callback();
    });
  });
}

// Helper to check if domain or its parent domain is in a list (Improved)
function isDomainInList(domain, list) {
  const cleanDomain = domain.replace(/^www\./, '');
  return list.some(entry => {
    const cleanEntry = entry.replace(/^www\./, '');
    return cleanDomain === cleanEntry ||
           cleanDomain.endsWith('.' + cleanEntry) ||
           cleanEntry.endsWith('.' + cleanDomain);
  });
}

function getDomainListStatus(domain, whitelist, ignorelist) {
  const cleanDomain = domain.replace(/^www\./, '');
  const isCoveredByList = (list) => list.some(entry => {
    const cleanEntry = entry.replace(/^www\./, '');
    return cleanDomain === cleanEntry || cleanDomain.endsWith('.' + cleanEntry);
  });

  if (isCoveredByList(ignorelist)) return "ignored";
  if (isCoveredByList(whitelist)) return "whitelisted";
  return null;
}

// --- SUGGESTION NOTIFICATIONS ---
const suggestionCooldownMs = 24 * 60 * 60 * 1000;
let activeSuggestion = null;
const pendingSuggestionTimers = new Map();

function hasRecentSuggestion(domain, dismissedSuggestions) {
  const now = Date.now();
  return Object.entries(dismissedSuggestions).some(([dismissedDomain, dismissedAt]) =>
    now - dismissedAt < suggestionCooldownMs && isDomainInList(domain, [dismissedDomain])
  );
}

function showNotification(tabId, domain) {
  activeSuggestion = { tabId, domain };
  chrome.tabs.sendMessage(tabId, { action: "showSuggestion", domain: domain }, (response) => {
    if (chrome.runtime.lastError) {
      activeSuggestion = null;
    }
  });
}

function clearPendingSuggestion(tabId) {
  const pendingTimer = pendingSuggestionTimers.get(tabId);
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingSuggestionTimers.delete(tabId);
}

function scheduleSuggestion(tabId, domain) {
  if (!domain) return;
  clearPendingSuggestion(tabId);

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab || !tab.active || !tab.url || !tab.url.startsWith("http")) return;
    if (activeSuggestion) return;
    const currentDomain = new URL(tab.url).hostname.replace(/^www\./, '');
    if (currentDomain !== domain) return;

    chrome.windows.getLastFocused((focusedWindow) => {
      if (chrome.runtime.lastError || !focusedWindow || focusedWindow.id !== tab.windowId) return;

      chrome.storage.local.get(["trackAllWeb", "enableNotif", "whitelist", "ignorelist", "autoDismissedSuggestions"], (result) => {
        const dismissedSuggestions = result.autoDismissedSuggestions || {};
        if (
          result.trackAllWeb === false &&
          result.enableNotif !== false &&
          getDomainListStatus(domain, result.whitelist || [], result.ignorelist || []) === null &&
          !hasRecentSuggestion(domain, dismissedSuggestions)
        ) {
          const timer = setTimeout(() => {
            if (pendingSuggestionTimers.get(tabId) !== timer) return;
            pendingSuggestionTimers.delete(tabId);

            chrome.tabs.get(tabId, (currentTab) => {
              if (chrome.runtime.lastError || !currentTab || !currentTab.active || !currentTab.url) return;
              const currentDomain = new URL(currentTab.url).hostname.replace(/^www\./, '');
              if (currentDomain !== domain) return;

              chrome.windows.getLastFocused((currentFocusedWindow) => {
                if (
                  chrome.runtime.lastError ||
                  !currentFocusedWindow ||
                  currentFocusedWindow.id !== currentTab.windowId ||
                  activeSuggestion
                ) return;

                chrome.storage.local.get(["trackAllWeb", "enableNotif", "whitelist", "ignorelist", "autoDismissedSuggestions"], (latestResult) => {
                  if (
                    latestResult.trackAllWeb === false &&
                    latestResult.enableNotif !== false &&
                    getDomainListStatus(domain, latestResult.whitelist || [], latestResult.ignorelist || []) === null &&
                    !hasRecentSuggestion(domain, latestResult.autoDismissedSuggestions || {}) &&
                    !activeSuggestion
                  ) {
                    showNotification(tabId, domain);
                  }
                });
              });
            });
          }, 10000);
          pendingSuggestionTimers.set(tabId, timer);
        }
      });
    });
  });
}

function scheduleSuggestionForActiveTab(windowId) {
  chrome.tabs.query({ active: true, windowId }, (tabs) => {
    const tab = tabs[0];
    if (!tab || tab.status !== "complete" || !tab.url || !tab.url.startsWith("http")) return;
    scheduleSuggestion(tab.id, new URL(tab.url).hostname.replace(/^www\./, ''));
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status || changeInfo.url) trackTime();

  if (changeInfo.status === 'loading') {
    clearPendingSuggestion(tabId);
  }

  if (changeInfo.status === 'loading' && activeSuggestion && activeSuggestion.tabId === tabId) {
    activeSuggestion = null;
  }

  if (changeInfo.status === 'complete' && tab.active && tab.url && tab.url.startsWith("http")) {
    const domain = new URL(tab.url).hostname.replace(/^www\./, '');
    scheduleSuggestion(tabId, domain);
  }
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  trackTime();
  for (const pendingTabId of pendingSuggestionTimers.keys()) {
    clearPendingSuggestion(pendingTabId);
  }

  if (activeSuggestion && activeSuggestion.tabId !== tabId) {
    chrome.tabs.sendMessage(activeSuggestion.tabId, { action: "hideSuggestion" }, () => {
      if (chrome.runtime.lastError) return;
    });
    activeSuggestion = null;
  }
  scheduleSuggestionForActiveTab(windowId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  trackTime();
  for (const tabId of pendingSuggestionTimers.keys()) {
    clearPendingSuggestion(tabId);
  }

  if (activeSuggestion) {
    chrome.tabs.sendMessage(activeSuggestion.tabId, { action: "hideSuggestion" }, () => {
      if (chrome.runtime.lastError) return;
    });
    activeSuggestion = null;
  }

  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    scheduleSuggestionForActiveTab(windowId);
  }
});

chrome.idle.onStateChanged.addListener(() => trackTime());
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "local" &&
    (
      changes.trackAllWeb ||
      changes.trackOnlyWhileActive ||
      changes.trackWhileIdle ||
      changes.whitelist ||
      changes.ignorelist
    )
  ) {
    trackTime();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearPendingSuggestion(tabId);

  if (activeSuggestion && activeSuggestion.tabId === tabId) {
    activeSuggestion = null;
  }
  trackTime();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "resetTrackedData") {
    resetTrackedData((error) => {
      sendResponse(error ? { success: false, error } : { success: true });
    });
    return true;
  } else if (request.action === "addToWhitelist") {
    const domain = request.domain.replace(/^www\./, '');
    chrome.storage.local.get("whitelist", (result) => {
      const list = result.whitelist || [];
      if (!list.includes(domain)) {
        list.push(domain);
        chrome.storage.local.set({ whitelist: list });
      }
    });
  } else if (request.action === "addToIgnorelist") {
    const domain = request.domain.replace(/^www\./, '');
    chrome.storage.local.get("ignorelist", (result) => {
      const list = result.ignorelist || [];
      if (!list.includes(domain)) {
        list.push(domain);
        chrome.storage.local.set({ ignorelist: list });
      }
    });
  } else if (request.action === "disableSuggestions") {
    chrome.storage.local.set({ enableNotif: false });
  } else if (request.action === "suggestionDismissed") {
    if (activeSuggestion && sender.tab && activeSuggestion.tabId === sender.tab.id) {
      activeSuggestion = null;
    }
    if (request.automatically) {
      chrome.storage.local.get("autoDismissedSuggestions", (result) => {
        const dismissedSuggestions = result.autoDismissedSuggestions || {};
        const now = Date.now();
        for (const [dismissedDomain, dismissedAt] of Object.entries(dismissedSuggestions)) {
          if (now - dismissedAt >= suggestionCooldownMs) {
            delete dismissedSuggestions[dismissedDomain];
          }
        }
        dismissedSuggestions[request.domain] = Date.now();
        chrome.storage.local.set({ autoDismissedSuggestions: dismissedSuggestions });
      });
    }
  }
});

// --- AUTOMATIC DATA CLEANUP ---
function cleanupOldData() {
  dataCleanupRequested = true;
  if (!trackingRefreshRunning) {
    trackTime();
  }
}

function performDataCleanup(callback) {
  const cutoffDays = 31;
  const cutoffDate = new Date();
  cutoffDate.setHours(0, 0, 0, 0);
  cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);

  chrome.storage.local.get("dailyTimeData", (result) => {
    if (chrome.runtime.lastError) {
      const error = chrome.runtime.lastError.message;
      console.error("Failed to read tracked data for cleanup:", error);
      callback();
      return;
    }

    const data = result.dailyTimeData || {};
    const updatedData = {};

    for (const dateString in data) {
      const [year, month, day] = dateString.split('-').map(Number);
      const entryDate = new Date(year, month - 1, day);
      if (!Number.isNaN(entryDate.getTime()) && entryDate >= cutoffDate) {
        updatedData[dateString] = data[dateString];
      }
    }
    chrome.storage.local.set({ dailyTimeData: updatedData }, () => {
      const error = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
      if (error) {
        console.error("Failed to save cleaned tracking data:", error);
      }
      callback();
    });
  });
}

// Alarm and event listeners
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('timeTracker', { delayInMinutes: 1, periodInMinutes: 1 });
  chrome.alarms.create('cleanupTask', { delayInMinutes: 5, periodInMinutes: 1440 });
  chrome.storage.session.remove("timeTrackingState", () => trackTime());
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'timeTracker') {
    trackTime();
  } else if (alarm.name === 'cleanupTask') {
    cleanupOldData();
  }
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('timeTracker', { delayInMinutes: 1, periodInMinutes: 1 });
  chrome.alarms.create('cleanupTask', { delayInMinutes: 5, periodInMinutes: 1440 });
  chrome.storage.session.remove("timeTrackingState", () => trackTime());
  chrome.windows.getLastFocused((focusedWindow) => {
    if (!chrome.runtime.lastError && focusedWindow && focusedWindow.focused) {
      scheduleSuggestionForActiveTab(focusedWindow.id);
    }
  });
});
