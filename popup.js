// --- STATE MANAGEMENT ---
let appState = {
  currentView: 'daily',
  subView: null,
  selectedDate: null,
};

// --- DOM ELEMENTS ---
const mainView = document.getElementById("mainView");
const settingsView = document.getElementById("settingsView");
const listsView = document.getElementById("listsView");
const dailyBtn = document.getElementById("dailyBtn");
const weeklyBtn = document.getElementById("weeklyBtn");
const monthlyBtn = document.getElementById("monthlyBtn");
const siteList = document.getElementById("siteList");
const mainTotalLabel = document.getElementById("mainTotalLabel");
const mainTotalTime = document.getElementById("mainTotalTime");
const mainTotalView = document.getElementById("main-total-view");
const subViewHeader = document.getElementById("sub-view-header");
const subViewTitle = document.getElementById("subViewTitle");
const subViewTotalTime = document.getElementById("subViewTotalTime");
const backToMainViewBtn = document.getElementById("backToMainViewBtn");
const settingsBtn = document.getElementById("settingsBtn");
const backBtn = document.getElementById("backBtn");
const resetBtn = document.getElementById("resetBtn");
const exportBtn = document.getElementById("exportBtn");
const darkToggleMain = document.getElementById("darkToggleMain");
const darkToggleSettings = document.getElementById("darkToggleSettings");

// --- NEW DOM ELEMENTS ---
const trackAllWebToggle = document.getElementById("trackAllWebToggle");
const trackOnlyWhileActiveToggle = document.getElementById("trackOnlyWhileActiveToggle");
const notifDivider = document.getElementById("notifDivider");
const enableNotifRow = document.getElementById("enableNotifRow");
const enableNotifToggle = document.getElementById("enableNotifToggle");
const whitelistRow = document.getElementById("whitelistRow");
const listDivider = document.getElementById("listDivider");
const manageWhitelistBtn = document.getElementById("manageWhitelistBtn");
const manageIgnorelistBtn = document.getElementById("manageIgnorelistBtn");

// --- LISTS VIEW ELEMENTS ---
const backToListsBtn = document.getElementById("backToListsBtn");
const listsViewTitle = document.getElementById("listsViewTitle");
const listSiteInput = document.getElementById("listSiteInput");
const addSiteBtn = document.getElementById("addSiteBtn");
const managedSiteList = document.getElementById("managedSiteList");
const toastMessage = document.getElementById("toastMessage");
const moveSiteDialog = document.getElementById("moveSiteDialog");
const moveSiteDomain = document.getElementById("moveSiteDomain");
const moveSitePrompt = document.getElementById("moveSitePrompt");
const cancelMoveSiteBtn = document.getElementById("cancelMoveSiteBtn");
const confirmMoveSiteBtn = document.getElementById("confirmMoveSiteBtn");

let currentActiveList = "whitelist";
let onConfirmMoveSite = null;

// --- UTILITY FUNCTIONS ---
function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const formattedTime = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return s > 0 ? `${formattedTime} ${s}s` : formattedTime;
}

function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFaviconUrl(domain, size) {
  return `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(domain)}`;
}

function hideUnavailableFavicons(container) {
  container.querySelectorAll(".site-icon-image").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
    }, { once: true });
    image.src = image.dataset.faviconUrl;
    delete image.dataset.faviconUrl;
  });
}

function updateOverflowPadding(element) {
  element.classList.toggle("has-vertical-overflow", element.scrollHeight > element.clientHeight);
}

function watchOverflow(element) {
  const update = () => updateOverflowPadding(element);
  const resizeObserver = new ResizeObserver(update);
  resizeObserver.observe(element);

  const mutationObserver = new MutationObserver(update);
  mutationObserver.observe(element, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true
  });

  update();
}

watchOverflow(siteList);
watchOverflow(settingsView.querySelector(".settings-content"));
watchOverflow(managedSiteList);

function createPopupElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createDayListItem(dateString, dayName, seconds) {
  const item = createPopupElement("li", "day-item");
  item.dataset.date = dateString;
  const details = createPopupElement("div");
  details.append(
    createPopupElement("div", "day-name", dayName),
    createPopupElement("div", "day-date", dateString)
  );
  item.append(details, createPopupElement("div", "day-duration", formatTime(seconds)));
  return item;
}

function createFavicon(domain) {
  const icon = createPopupElement("span", "site-icon");
  icon.setAttribute("aria-hidden", "true");
  const image = createPopupElement("img", "site-icon-image");
  image.dataset.faviconUrl = getFaviconUrl(domain, 32);
  image.alt = "";
  icon.appendChild(image);
  return icon;
}

function createPopupSvg(markup) {
  const svg = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
  return document.importNode(svg, true);
}

function showToast(message) {
  toastMessage.textContent = message;
  toastMessage.classList.add("show");
  setTimeout(() => {
    toastMessage.classList.remove("show");
  }, 3000);
}

function closeMoveSiteDialog() {
  moveSiteDialog.hidden = true;
  onConfirmMoveSite = null;
}

function showMoveSiteDialog(domain, sourceList, targetList, onConfirm) {
  moveSiteDomain.textContent = domain;
  moveSitePrompt.textContent = ` is in ${sourceList}. Move to ${targetList}?`;
  onConfirmMoveSite = onConfirm;
  moveSiteDialog.hidden = false;
  confirmMoveSiteBtn.focus();
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// --- RENDER FUNCTIONS ---
function render() {
  chrome.storage.local.get("dailyTimeData", (result) => {
    const allData = result.dailyTimeData || {};
    // Control which view is visible
    if (appState.subView === 'day-detail') {
      mainTotalView.style.display = 'none';
      subViewHeader.style.display = 'flex';
      renderDayDetail(allData, appState.selectedDate);
    } else {
      mainTotalView.style.display = 'flex';
      subViewHeader.style.display = 'none';
      switch (appState.currentView) {
        case 'weekly':
          renderWeekView(allData);
          break;
        case 'monthly':
          renderMonthView(allData);
          break;
        case 'daily':
        default:
          renderDailyView(allData);
          break;
      }
    }
  });
}

function renderDailyView(allData) {
  const todayStr = getLocalDateString(new Date());
  const todayData = allData[todayStr] || {};
  mainTotalLabel.textContent = 'Total Today';
  renderSiteList(todayData);
}

function renderWeekView(allData) {
  const today = new Date();
  const firstDayOfWeek = new Date(today);
  firstDayOfWeek.setDate(today.getDate() - today.getDay());

  let weeklyTotalSeconds = 0;
  const dayItems = document.createDocumentFragment();

  for (let i = 0; i < 7; i++) {
    const date = new Date(firstDayOfWeek);
    date.setDate(date.getDate() + i);
    const dateStr = getLocalDateString(date);
    const dayData = allData[dateStr] || {};
    let dayTotalSeconds = Object.values(dayData).reduce((sum, s) => sum + s, 0);
    weeklyTotalSeconds += dayTotalSeconds;

    dayItems.appendChild(createDayListItem(dateStr, dayNames[date.getDay()], dayTotalSeconds));
  }
  mainTotalLabel.textContent = 'Total This Week';
  mainTotalTime.textContent = formatTime(weeklyTotalSeconds);
  siteList.replaceChildren(dayItems);
}

function renderMonthView(allData) {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  let monthlyTotalSeconds = 0;
  const dayItems = document.createDocumentFragment();
  
  for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
    const date = new Date(firstDayOfMonth);
    date.setDate(i);
    const dateStr = getLocalDateString(date);
    const dayData = allData[dateStr] || {};
    let dayTotalSeconds = Object.values(dayData).reduce((sum, s) => sum + s, 0);
    monthlyTotalSeconds += dayTotalSeconds;

    dayItems.appendChild(createDayListItem(dateStr, dayNames[date.getDay()], dayTotalSeconds));
  }
  mainTotalLabel.textContent = 'Total This Month';
  mainTotalTime.textContent = formatTime(monthlyTotalSeconds);
  siteList.replaceChildren(dayItems);
}

function renderDayDetail(allData, dateStr) {
  const dayData = allData[dateStr] || {};
  const dayTotalSeconds = Object.values(dayData).reduce((sum, s) => sum + s, 0);

  // Populate sub-header content
  const [year, month, day] = dateStr.split('-').map(Number);
  subViewTitle.textContent = `${dayNames[new Date(year, month - 1, day).getDay()]}, ${dateStr}`;
  subViewTotalTime.textContent = formatTime(dayTotalSeconds);

  // Render the site list for the selected day
  renderSiteList(dayData, false);
}

function renderSiteList(data, updateTotal = true) {
  let totalSeconds = 0;
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    siteList.replaceChildren(createPopupElement("li", "", "No usage data for this period."));
  } else {
    const siteItems = document.createDocumentFragment();
    sorted.forEach(([domain, seconds]) => {
      totalSeconds += seconds;
      const item = createPopupElement("li");
      item.append(
        createFavicon(domain),
        createPopupElement("span", "domain", domain),
        createPopupElement("span", "duration", formatTime(seconds))
      );
      siteItems.appendChild(item);
    });
    siteList.replaceChildren(siteItems);
    hideUnavailableFavicons(siteList);
  }

  if (updateTotal) {
    mainTotalTime.textContent = formatTime(totalSeconds);
  }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  const toggleButtons = {
    daily: dailyBtn,
    weekly: weeklyBtn,
    monthly: monthlyBtn,
  };

  Object.entries(toggleButtons).forEach(([view, btn]) => {
    btn.addEventListener('click', () => {
      Object.values(toggleButtons).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appState.currentView = view;
      appState.subView = null;
      render();
    });
  });

  siteList.addEventListener('click', (e) => {
    const dayItem = e.target.closest('.day-item');
    if (dayItem) {
      appState.subView = 'day-detail';
      appState.selectedDate = dayItem.dataset.date;
      render();
    }
  });

  backToMainViewBtn.addEventListener('click', () => {
    appState.subView = null;
    render();
  });
  
  settingsBtn.addEventListener("click", () => {
    mainView.style.display = "none";
    settingsView.style.display = "flex";
  });

  backBtn.addEventListener("click", () => {
    settingsView.style.display = "none";
    mainView.style.display = "block";
  });
  
  resetBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete all data? This action cannot be undone.")) {
      chrome.runtime.sendMessage({ action: "resetTrackedData" }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          const error = chrome.runtime.lastError
            ? chrome.runtime.lastError.message
            : response && response.error
              ? response.error
              : "Unknown error";
          showToast(`Failed to reset data: ${error}`);
          return;
        }

        showToast("All data has been reset");
        appState.subView = null;
        appState.currentView = 'daily';
        Object.values(toggleButtons).forEach(b => b.classList.remove('active'));
        dailyBtn.classList.add('active');
        render();
      });
    }
  });
  
  exportBtn.addEventListener("click", exportDataToCSV);

  darkToggleMain.addEventListener("click", toggleDarkMode);
  darkToggleSettings.addEventListener("click", toggleDarkMode);

  // --- SETTINGS EVENT LISTENERS ---
  trackAllWebToggle.addEventListener("change", () => {
    const enabled = trackAllWebToggle.checked;
    chrome.storage.local.set({ trackAllWeb: enabled });
    updateSettingsVisibility(enabled);
  });

  trackOnlyWhileActiveToggle.addEventListener("change", () => {
    chrome.storage.local.set({ trackOnlyWhileActive: trackOnlyWhileActiveToggle.checked });
  });

  enableNotifToggle.addEventListener("change", () => {
    chrome.storage.local.set({ enableNotif: enableNotifToggle.checked });
  });

  manageWhitelistBtn.addEventListener("click", () => {
    openListView("whitelist");
  });

  manageIgnorelistBtn.addEventListener("click", () => {
    openListView("ignorelist");
  });

  backToListsBtn.addEventListener("click", () => {
    listsView.style.display = "none";
    settingsView.style.display = "flex";
  });

  cancelMoveSiteBtn.addEventListener("click", closeMoveSiteDialog);

  confirmMoveSiteBtn.addEventListener("click", () => {
    const onConfirm = onConfirmMoveSite;
    closeMoveSiteDialog();
    if (onConfirm) onConfirm();
  });

  moveSiteDialog.addEventListener("click", (event) => {
    if (event.target === moveSiteDialog) closeMoveSiteDialog();
  });

  const handleAddSite = () => {
    let domain = listSiteInput.value.trim().toLowerCase();
    
    // If it's a full URL, extract only the hostname
    try {
      if (domain.includes("://")) {
        const urlObj = new URL(domain);
        domain = urlObj.hostname;
      } else if (domain.includes("/")) {
        // Handle cases like "example.com/path" without protocol
        domain = domain.split("/")[0];
      }
    } catch (e) {
      // If URL parsing fails, keep original domain string for regex check
    }

    domain = domain.replace(/^www\./, '');

    // Strict Character Filtering
    const domainRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/;
    
    // Length Limit
    const isTooLong = domain.length > 100;
    
    if (domain && domainRegex.test(domain) && !isTooLong) {
      addToList(currentActiveList, domain, () => {
        listSiteInput.value = "";
        refreshManagedList();
      });
    } else if (isTooLong) {
      showToast("Domain name is too long");
    } else if (domain) {
      showToast("Invalid domain");
    }
  };

  addSiteBtn.addEventListener("click", handleAddSite);

  listSiteInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      handleAddSite();
    }
  });
}

function openListView(type) {
  currentActiveList = type;
  settingsView.style.display = "none";
  listsView.style.display = "block";
  
  if (type === "whitelist") {
    listsViewTitle.textContent = "Manage Whitelist";
    listSiteInput.placeholder = "example.com";
  } else {
    listsViewTitle.textContent = "Manage Ignore List";
    listSiteInput.placeholder = "example.com";
  }
  
  refreshManagedList();
}

function refreshManagedList() {
  chrome.storage.local.get(currentActiveList, (result) => {
    const list = result[currentActiveList] || [];
    renderManagedList(list);
  });
}

function renderManagedList(list) {
  const items = document.createDocumentFragment();
  list.forEach((domain) => {
    const item = createPopupElement("li", "setting-row");
    const label = createPopupElement("span", "");
    label.style.flex = "1";
    label.textContent = domain;
    const removeButton = createPopupElement("button", "remove-btn", "\u00d7");
    removeButton.dataset.domain = domain;
    item.append(createFavicon(domain), label, removeButton);
    items.appendChild(item);
  });
  managedSiteList.replaceChildren(items);

  hideUnavailableFavicons(managedSiteList);
  managedSiteList.querySelectorAll(".remove-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      removeFromList(currentActiveList, btn.dataset.domain, () => {
        refreshManagedList();
        showToast("Site removed");
      });
    });
  });
}

function addToList(listName, domain, callback) {
  const otherListName = listName === "whitelist" ? "ignorelist" : "whitelist";
  const listLabel = listName === "whitelist" ? "Whitelist" : "Ignore List";
  const otherListLabel = otherListName === "whitelist" ? "Whitelist" : "Ignore List";
  const cleanDomain = normalizeDomain(domain);

  chrome.storage.local.get([listName, otherListName], (result) => {
    const list = result[listName] || [];
    const otherList = result[otherListName] || [];

    const targetEntries = list.filter((entry) => domainsOverlap(cleanDomain, entry));
    let moveDomain = [cleanDomain, ...targetEntries.map(normalizeDomain)]
      .sort((a, b) => a.length - b.length)[0];
    let conflictingDomains = [];
    let previousMoveDomain;

    do {
      previousMoveDomain = moveDomain;
      conflictingDomains = otherList.filter((entry) => domainsOverlap(moveDomain, entry));
      moveDomain = [moveDomain, ...conflictingDomains.map(normalizeDomain)]
        .sort((a, b) => a.length - b.length)[0];
    } while (moveDomain !== previousMoveDomain);

    if (conflictingDomains.length === 0 && list.some((entry) => isDomainCoveredByEntry(cleanDomain, entry))) {
      showToast(`Site is already in ${listLabel}.`);
      return;
    }

    const addSite = () => {
      const updatedList = list.filter((entry) => !isDomainCoveredByEntry(entry, moveDomain));
      updatedList.push(moveDomain);
      const updatedOtherList = otherList.filter((entry) => !domainsOverlap(moveDomain, entry));
      chrome.storage.local.set({
        [listName]: updatedList,
        [otherListName]: updatedOtherList
      }, () => {
        callback();
        showToast(conflictingDomains.length > 0 ? `Site moved to ${listLabel}.` : "Site added successfully.");
      });
    };

    if (conflictingDomains.length > 0) {
      showMoveSiteDialog(moveDomain, otherListLabel, listLabel, addSite);
      return;
    }

    addSite();
  });
}

function normalizeDomain(domain) {
  return domain.replace(/^www\./, '').toLowerCase();
}

function isDomainCoveredByEntry(domain, entry) {
  const cleanDomain = normalizeDomain(domain);
  const cleanEntry = normalizeDomain(entry);
  return cleanDomain === cleanEntry || cleanDomain.endsWith(`.${cleanEntry}`);
}

function domainsOverlap(domain, entry) {
  const cleanDomain = normalizeDomain(domain);
  const cleanEntry = normalizeDomain(entry);
  return isDomainCoveredByEntry(cleanDomain, cleanEntry) ||
    isDomainCoveredByEntry(cleanEntry, cleanDomain);
}

function removeFromList(listName, domain, callback) {
  chrome.storage.local.get(listName, (result) => {
    let list = result[listName] || [];
    list = list.filter(d => d !== domain);
    chrome.storage.local.set({ [listName]: list }, callback);
  });
}

function updateSettingsVisibility(trackAll) {
  settingsView.classList.toggle("track-all-disabled", !trackAll);
  if (trackAll) {
    notifDivider.style.display = "none";
    enableNotifRow.style.display = "none";
    whitelistRow.style.display = "none";
    listDivider.style.display = "none";
  } else {
    notifDivider.style.display = "block";
    enableNotifRow.style.display = "flex";
    whitelistRow.style.display = "flex";
    listDivider.style.display = "block";
  }
}

// --- EXPORT CSV ---
function exportDataToCSV() {
  chrome.storage.local.get("dailyTimeData", (result) => {
    const data = result.dailyTimeData || {};
    if (Object.keys(data).length === 0) {
      showToast("No data to export");
      return;
    }

    function formatSecondsToHHMMSS(totalSeconds) {
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');
      const ss = String(seconds).padStart(2, '0');

      return `${hh}:${mm}:${ss}`;
    }

    let csvContent = "data:text/csv;charset=utf-8,Date,Domain,Duration (HH:MM:SS),Total Seconds\n";

    const sortedDates = Object.keys(data).sort();

    sortedDates.forEach(date => {
      const domains = data[date];
      for (const domain in domains) {
        const totalSeconds = domains[domain];
        const formattedTime = formatSecondsToHHMMSS(totalSeconds);

        csvContent += `${date},${domain},${formattedTime},${totalSeconds}\n`;
      }
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "tab_duration_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("CSV Exported successfully");
  });
}

// --- ICONS ---
const MOON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
const SUN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M22 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
const SETTINGS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;

// --- TOGGLE DARK MODE ---
function setDarkMode(isDark) {
  if (isDark) {
    document.body.classList.add("dark");
    darkToggleMain.replaceChildren(createPopupSvg(SUN_SVG));
    darkToggleSettings.replaceChildren(createPopupSvg(SUN_SVG));
  } else {
    document.body.classList.remove("dark");
    darkToggleMain.replaceChildren(createPopupSvg(MOON_SVG));
    darkToggleSettings.replaceChildren(createPopupSvg(MOON_SVG));
  }
  localStorage.setItem("darkMode", String(isDark === true));
}

function toggleDarkMode() {
  const isCurrentlyDark = document.body.classList.contains("dark");
  setDarkMode(!isCurrentlyDark);
  chrome.storage.local.set({ darkMode: !isCurrentlyDark });
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  render(); // Initial render (defaults to daily view)
  settingsBtn.replaceChildren(createPopupSvg(SETTINGS_SVG));
  chrome.storage.local.get(["darkMode", "trackAllWeb", "trackOnlyWhileActive", "trackWhileIdle", "enableNotif"], (result) => {
    setDarkMode(result.darkMode);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.remove("theme-initializing");
      });
    });

    // Default trackAllWeb to true if undefined
    const trackAll = result.trackAllWeb !== false;
    trackAllWebToggle.checked = trackAll;
    updateSettingsVisibility(trackAll);

    trackOnlyWhileActiveToggle.checked = typeof result.trackOnlyWhileActive === "boolean"
      ? result.trackOnlyWhileActive
      : result.trackWhileIdle === false;

    // Default enableNotif to true if undefined
    const enableNotif = result.enableNotif !== false;
    enableNotifToggle.checked = enableNotif;
  });
});