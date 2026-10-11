let currentNotificationCleanup = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showSuggestion") {
    showNotification(request.domain);
  } else if (request.action === "hideSuggestion") {
    if (currentNotificationCleanup) currentNotificationCleanup();
  }
});

function showNotification(domain) {
  if (currentNotificationCleanup) currentNotificationCleanup();

  const container = document.createElement("div");
  container.id = "tab-duration-suggestion";
  
  container.innerHTML = `
    <div class="td-suggestion-content">
      <div class="td-top-header">
        <div class="td-app-name">Tab Duration</div>
        <div class="td-controls">
          <div class="td-menu-container">
            <div class="td-dots">⋮</div>
            <div class="td-dropdown" style="display: none;">
              <div class="td-dropdown-item" id="td-disable-suggestions">Disable suggestion</div>
            </div>
          </div>
          <div class="td-close" id="td-close-btn">&times;</div>
        </div>
      </div>
      <div class="td-divider"></div>
      <div class="td-site-row">
        <div class="td-site-icon" aria-hidden="true">
          <img class="td-site-icon-image" alt="" />
        </div>
        <div class="td-site-name">${domain}</div>
      </div>
      <div class="td-button-row">
        <div class="td-add-action" id="td-add-btn">Track time spent on this site</div>
      </div>
    </div>
  `;

  chrome.storage.local.get("darkMode", (result) => {
    const current = document.getElementById("tab-duration-suggestion");
    if (current) current.remove();

    container.classList.toggle("td-light", result.darkMode !== true);
    document.body.appendChild(container);
    const favicon = container.querySelector(".td-site-icon-image");
    favicon.src = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
    favicon.addEventListener("error", () => {
      favicon.hidden = true;
    }, { once: true });
    setupEventListeners(container, domain);
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.darkMode) return;

  const container = document.getElementById("tab-duration-suggestion");
  if (container) {
    container.classList.toggle("td-light", changes.darkMode.newValue !== true);
  }
});

function setupEventListeners(container, domain) {
  let autoDismissTimer;
  const clickHandler = (e) => {
    const dropdown = container.querySelector(".td-dropdown");
    const menu = container.querySelector(".td-menu-container");
    if (!menu.contains(e.target)) dropdown.style.display = "none";
  };
  document.addEventListener("click", clickHandler);

  const closeNotification = (automatically = false, notifyRuntime = true) => {
    clearTimeout(autoDismissTimer);
    document.removeEventListener("click", clickHandler);
    if (currentNotificationCleanup === hideNotification) currentNotificationCleanup = null;
    if (notifyRuntime) {
      chrome.runtime.sendMessage({
        action: "suggestionDismissed",
        domain: domain,
        automatically: automatically
      });
    }
    container.classList.add("td-closing");
    setTimeout(() => {
      container.remove();
    }, 800);
  };

  const hideNotification = () => closeNotification(false, false);
  currentNotificationCleanup = hideNotification;

  // Auto-dismiss after 8 seconds
  autoDismissTimer = setTimeout(() => {
    closeNotification(true);
  }, 8000);

  const clearTimer = () => clearTimeout(autoDismissTimer);

  const closeBtn = container.querySelector("#td-close-btn");
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    clearTimer();
    chrome.runtime.sendMessage({ action: "addToIgnorelist", domain: domain });
    closeNotification();
  };

  const addBtn = container.querySelector("#td-add-btn");
  addBtn.onclick = (e) => {
    e.stopPropagation();
    clearTimer();
    chrome.runtime.sendMessage({ action: "addToWhitelist", domain: domain });
    closeNotification();
  };

  const dots = container.querySelector(".td-dots");
  const dropdown = container.querySelector(".td-dropdown");
  dots.onclick = (e) => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
  };

  const disableSuggestions = container.querySelector("#td-disable-suggestions");
  disableSuggestions.onclick = (e) => {
    e.stopPropagation();
    clearTimer();
    chrome.runtime.sendMessage({ action: "disableSuggestions" });
    closeNotification();
  };
}
