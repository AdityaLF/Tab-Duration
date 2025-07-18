// Tab Duration - Copyright © 2025 AdityaLF
// All rights reserved. See LICENSE for terms.

// --- STATE MANAGEMENT ---
let appState = {
  currentView: 'daily',
  subView: null,
  selectedDate: null,
};

// --- DOM ELEMENTS ---
const mainView = document.getElementById("mainView");
const settingsView = document.getElementById("settingsView");
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

// --- UTILITY FUNCTIONS ---
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getFavicon(domain) {
  return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
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
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayData = allData[todayStr] || {};
  mainTotalLabel.textContent = 'Total Today';
  renderSiteList(todayData);
}

function renderWeekView(allData) {
  const today = new Date();
  const firstDayOfWeek = new Date(today);
  firstDayOfWeek.setDate(today.getDate() - today.getDay());

  let weeklyTotalSeconds = 0;
  let dayItemsHtml = '';

  for (let i = 0; i < 7; i++) {
    const date = new Date(firstDayOfWeek);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    const dayData = allData[dateStr] || {};
    let dayTotalSeconds = Object.values(dayData).reduce((sum, s) => sum + s, 0);
    weeklyTotalSeconds += dayTotalSeconds;

    dayItemsHtml += `
      <li class="day-item" data-date="${dateStr}">
        <div>
          <div class="day-name">${dayNames[date.getDay()]}</div>
          <div class="day-date">${dateStr}</div>
        </div>
        <div class="day-duration">${formatTime(dayTotalSeconds)}</div>
      </li>`;
  }
  mainTotalLabel.textContent = 'Total This Week';
  mainTotalTime.textContent = formatTime(weeklyTotalSeconds);
  siteList.innerHTML = dayItemsHtml;
}

function renderMonthView(allData) {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  let monthlyTotalSeconds = 0;
  let dayItemsHtml = '';
  
  for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
    const date = new Date(firstDayOfMonth);
    date.setDate(i);
    const dateStr = date.toISOString().slice(0, 10);
    const dayData = allData[dateStr] || {};
    let dayTotalSeconds = Object.values(dayData).reduce((sum, s) => sum + s, 0);
    monthlyTotalSeconds += dayTotalSeconds;

      dayItemsHtml += `
      <li class="day-item" data-date="${dateStr}">
        <div>
          <div class="day-name">${dayNames[date.getDay()]}</div>
          <div class="day-date">${dateStr}</div>
        </div>
        <div class="day-duration">${formatTime(dayTotalSeconds)}</div>
      </li>`;
  }
  mainTotalLabel.textContent = 'Total This Month';
  mainTotalTime.textContent = formatTime(monthlyTotalSeconds);
  siteList.innerHTML = dayItemsHtml;
}

function renderDayDetail(allData, dateStr) {
  const dayData = allData[dateStr] || {};
  const dayTotalSeconds = Object.values(dayData).reduce((sum, s) => sum + s, 0);

  // Populate sub-header content
  subViewTitle.textContent = `${dayNames[new Date(dateStr+'T12:00:00Z').getUTCDay()]}, ${dateStr}`;
  subViewTotalTime.textContent = formatTime(dayTotalSeconds);

  // Render the site list for the selected day
  renderSiteList(dayData, false);
}

function renderSiteList(data, updateTotal = true) {
  let totalSeconds = 0;
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    siteList.innerHTML = "<li>No usage data for this period.</li>";
  } else {
    siteList.innerHTML = sorted.map(([domain, seconds]) => {
      totalSeconds += seconds;
      return `<li>
          <img src="${getFavicon(domain)}" class="favicon" />
          <span class="domain">${domain}</span>
          <span class="duration">${formatTime(seconds)}</span>
        </li>`;
    }).join('');
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
    settingsView.style.display = "block";
  });

  backBtn.addEventListener("click", () => {
    settingsView.style.display = "none";
    mainView.style.display = "block";
  });
  
  resetBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete all data? This action cannot be undone.")) {
      chrome.storage.local.remove(["dailyTimeData"], () => {
        alert("All data has been reset.");
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
}

// --- EXPORT CSV ---
function exportDataToCSV() {
  chrome.storage.local.get("dailyTimeData", (result) => {
    const data = result.dailyTimeData || {};
    if (Object.keys(data).length === 0) {
      alert("No data to export.");
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
  });
}

// --- TOGGLE DARK MODE ---
function setDarkMode(isDark) {
  if (isDark) {
    document.body.classList.add("dark");
    darkToggleMain.textContent = "☀️";
    darkToggleSettings.textContent = "☀️";
  } else {
    document.body.classList.remove("dark");
    darkToggleMain.textContent = "🌙";
    darkToggleSettings.textContent = "🌙";
  }
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
  chrome.storage.local.get("darkMode", (result) => {
    setDarkMode(result.darkMode);
  });
});