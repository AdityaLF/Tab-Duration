let currentNotificationCleanup = null;

function createNotificationNode(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createNotificationIcon(type) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 12 12");

  if (type === "dots") {
    for (const y of [2, 6, 10]) {
      const circle = document.createElementNS(namespace, "circle");
      circle.setAttribute("cx", "6");
      circle.setAttribute("cy", String(y));
      circle.setAttribute("r", "1.25");
      svg.appendChild(circle);
    }
  } else {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", "m3 3 6 6M9 3 3 9");
    svg.appendChild(path);
  }

  return svg;
}

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

  const content = createNotificationNode("div", "td-suggestion-content");
  const header = createNotificationNode("div", "td-top-header");
  const appName = createNotificationNode("div", "td-app-name", "Tab Duration");
  const controls = createNotificationNode("div", "td-controls");
  const menu = createNotificationNode("div", "td-menu-container");
  const dots = createNotificationNode("div", "td-dots");
  dots.setAttribute("aria-hidden", "true");
  dots.appendChild(createNotificationIcon("dots"));
  const dropdown = createNotificationNode("div", "td-dropdown");
  dropdown.style.display = "none";
  const disableSuggestions = createNotificationNode("div", "td-dropdown-item", "Disable suggestion");
  disableSuggestions.id = "td-disable-suggestions";
  dropdown.appendChild(disableSuggestions);
  menu.append(dots, dropdown);

  const close = createNotificationNode("div", "td-close");
  close.id = "td-close-btn";
  close.setAttribute("aria-hidden", "true");
  close.appendChild(createNotificationIcon("close"));
  controls.append(menu, close);
  header.append(appName, controls);

  const divider = createNotificationNode("div", "td-divider");
  const siteRow = createNotificationNode("div", "td-site-row");
  const siteIcon = createNotificationNode("div", "td-site-icon");
  siteIcon.setAttribute("aria-hidden", "true");
  const favicon = createNotificationNode("img", "td-site-icon-image");
  favicon.alt = "";
  siteIcon.appendChild(favicon);
  const siteName = createNotificationNode("div", "td-site-name", domain);
  siteRow.append(siteIcon, siteName);

  const buttonRow = createNotificationNode("div", "td-button-row");
  const addButton = createNotificationNode("div", "td-add-action", "Track time spent on this site");
  addButton.id = "td-add-btn";
  buttonRow.appendChild(addButton);
  content.append(header, divider, siteRow, buttonRow);
  container.appendChild(content);

  chrome.storage.local.get("darkMode", (result) => {
    const current = document.getElementById("tab-duration-suggestion");
    if (current) current.remove();

    container.classList.toggle("td-light", result.darkMode !== true);
    document.body.appendChild(container);
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
