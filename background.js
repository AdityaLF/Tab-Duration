// Main function to track time
function trackTime() {
  // Check user state
  chrome.idle.queryState(60, (state) => {
    if (state === "active") {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs.length === 0 || !tabs[0].url || !tabs[0].url.startsWith("http")) {
          return;
        }

        const tab = tabs[0];
        const domain = new URL(tab.url).hostname;
        updateStorage(domain, 60);
      });
    }
  });
}

function updateStorage(domain, secondsToAdd) {
  const today = new Date().toISOString().slice(0, 10);
  chrome.storage.local.get("dailyTimeData", (result) => {
    const data = result.dailyTimeData || {};
    if (!data[today]) {
      data[today] = {};
    }
    data[today][domain] = (data[today][domain] || 0) + secondsToAdd;
    chrome.storage.local.set({ dailyTimeData: data });
  });
}

// --- AUTOMATIC DATA CLEANUP ---
function cleanupOldData() {
  const cutoffDays = 31; // Keep data for the last 31 days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);

  chrome.storage.local.get("dailyTimeData", (result) => {
    const data = result.dailyTimeData || {};
    const updatedData = {};

    for (const dateString in data) {
      const entryDate = new Date(dateString);
      if (entryDate >= cutoffDate) {
        updatedData[dateString] = data[dateString];
      }
    }
    chrome.storage.local.set({ dailyTimeData: updatedData }, () => {
      console.log("Old data has been cleaned up.");
    });
  });
}

// ALARM SETUP
chrome.runtime.onInstalled.addListener(() => {
  // Alarm for tracking time
  chrome.alarms.create('timeTracker', { delayInMinutes: 1, periodInMinutes: 1 });
  // Alarm for cleaning up old data daily
  chrome.alarms.create('cleanupTask', { delayInMinutes: 5, periodInMinutes: 1440 }); // 1440 minutes = 1 day
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'timeTracker') {
    trackTime();
  } else if (alarm.name === 'cleanupTask') {
    cleanupOldData();
  }
});