// Twitter Collector Popup JavaScript
class TwitterCollectorPopup {
  constructor() {
    this.isCapturing = false;
    this.currentContext = null;
    this.currentStats = null;
    this.updateInterval = null;

    // TODO: Add filter regex state
    this.filterRegex = null;
    this.isFilterEnabled = false;

    // Speed control configuration (matches AutoScroller speedConfigs)
    this.speedLevels = [
      { display: "1/4x (Slowest)" },
      { display: "1/2x" },
      { display: "1x (Default)" },
      { display: "2x" },
      { display: "4x" },
      { display: "8x (Max)" },
    ];
    this.currentSpeedIndex = 2; // Default to 1x speed

    this.init();
  }

  async init() {
    console.log("Initializing Twitter Collector Popup");

    try {
      // Set up event listeners
      this.setupEventListeners();

      // Get current tab and context
      await this.getCurrentTabInfo();

      // Load initial statistics
      await this.loadStatistics();

      // Load auto-scroll preference and speed setting
      await this.loadAutoScrollPreference();
      await this.loadSpeedPreference();

      // Load filter preference from storage
      await this.loadFilterPreference();

      // Set initial filter state based on auto-scroll preference
      const autoScrollToggle = document.getElementById("auto-scroll-toggle");
      this.toggleFilterEnabled(!autoScrollToggle.checked);

      // Set up message listeners for real-time updates
      this.setupMessageListeners();

      console.log("Popup initialized successfully");
    } catch (error) {
      console.error("Error initializing popup:", error);
      this.showToast("Error initializing extension", "error");
    }
  }

  setupEventListeners() {
    // Capture button
    const captureBtn = document.getElementById("capture-btn");
    captureBtn.addEventListener("click", () => this.toggleCapture());

    // View data button
    const viewDataBtn = document.getElementById("view-data-btn");
    viewDataBtn.addEventListener("click", () => this.openDataViewer());

    // Export button
    const exportBtn = document.getElementById("export-btn");
    exportBtn.addEventListener("click", () => this.showExportOptions());

    // Settings button
    const settingsBtn = document.getElementById("settings-btn");
    settingsBtn.addEventListener("click", () => this.openSettings());

    // Clear data button
    const clearDataBtn = document.getElementById("clear-data-btn");
    clearDataBtn.addEventListener("click", () => this.confirmClearData());

    // Help and feedback links
    const helpLink = document.getElementById("help-link");
    helpLink.addEventListener("click", (e) => {
      e.preventDefault();
      this.openHelp();
    });

    const feedbackLink = document.getElementById("feedback-link");
    feedbackLink.addEventListener("click", (e) => {
      e.preventDefault();
      this.openFeedback();
    });

    // Auto-scroll toggle
    const autoScrollToggle = document.getElementById("auto-scroll-toggle");
    autoScrollToggle.addEventListener("change", (e) => {
      this.toggleAutoScroll(e.target.checked);
    });

    // Speed slider
    const speedSlider = document.getElementById("speed-slider");
    speedSlider.addEventListener("input", (e) => {
      this.updateSpeedSelection(parseInt(e.target.value));
    });

    // Advanced settings toggle
    const advancedSettings = document.getElementById("advanced-settings");
    advancedSettings.addEventListener("toggle", (e) => {
      this.onAdvancedSettingsToggle(e.target.open);
    });

    // Filter input
    const filterInput = document.getElementById("filter-input");
    filterInput.addEventListener("input", (e) => {
      this.onFilterInputChange(e.target.value);
    });

    filterInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        // Trigger capture if valid
        if (
          !this.isCapturing &&
          !document.getElementById("capture-btn").disabled
        ) {
          this.toggleCapture();
        }
      }
    });
  }

  setupMessageListeners() {
    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log("Popup received message:", message);

      switch (message.type) {
        case "contextChanged":
          this.updatePageContext(message.data.context);
          break;

        case "captureStarted":
          this.onCaptureStarted(message.data);
          break;

        case "captureStopped":
          this.onCaptureStopped(message.data);
          break;

        case "captureProgress":
          this.onCaptureProgress(message.data);
          break;

        case "statsUpdated":
          this.updateStatistics(message.data.stats);
          break;

        case "autoScrollStarted":
          this.onAutoScrollStarted(message.data);
          break;

        case "autoScrollStopped":
          this.onAutoScrollStopped(message.data);
          break;

        case "autoScrollProgress":
          this.onAutoScrollProgress(message.data);
          break;

        default:
          console.log("Unknown message type:", message.type);
      }
    });
  }

  async getCurrentTabInfo() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab) {
        this.updatePageContext({
          type: "unknown",
          displayName: "No Active Tab",
          description: "Unable to detect page",
        });
        return;
      }

      // Check if it's a Twitter page
      if (!this.isTwitterPage(tab.url)) {
        this.updatePageContext({
          type: "unknown",
          displayName: "Not Twitter",
          description: "Navigate to twitter.com or x.com",
        });
        return;
      }

      // Send message to content script to get context
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: "getPageContext",
        });
        if (response && response.context) {
          this.updatePageContext(response.context);
        }
      } catch (error) {
        console.log("Content script not ready, using URL-based detection");
        this.updatePageContext(this.detectContextFromUrl(tab.url));
      }
    } catch (error) {
      console.error("Error getting tab info:", error);
      this.updatePageContext({
        type: "unknown",
        displayName: "Error",
        description: "Unable to access tab information",
      });
    }
  }

  isTwitterPage(url) {
    return url && (url.includes("twitter.com") || url.includes("x.com"));
  }

  detectContextFromUrl(url) {
    if (url.includes("/bookmarks")) {
      return {
        type: "bookmarks",
        displayName: "Bookmarks Page",
        description: "Ready to capture bookmarks",
      };
    }

    if (url.includes("/search?q=")) {
      return {
        type: "search",
        displayName: "Search Results",
        description: "Ready to capture search results",
      };
    }

    // Check for home timeline pages
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    if (pathname === "/home" || pathname.startsWith("/home/")) {
      return {
        type: "homeTimeline",
        displayName: "Home Timeline",
        description: "Ready to capture home timeline (For You/Following)",
      };
    }

    // Check for explore for you page
    if (pathname === "/explore" || pathname.startsWith("/explore/")) {
      // Check if it's the for you tab
      if (pathname.includes("/for_you") || pathname === "/explore") {
        return {
          type: "exploreForYou",
          displayName: "Explore For You",
          description: "Ready to capture explore for you",
        };
      }
      // General explore page
      return {
        type: "explore",
        displayName: "Explore Page",
        description: "Navigate to For You tab to capture",
      };
    }

    // Simple user profile detection
    const pathMatch = pathname.match(/^\/([^\/]+)$/);
    if (pathMatch) {
      return {
        type: "usertweets",
        displayName: `@${pathMatch[1]} Profile`,
        description: "Ready to capture user tweets",
      };
    }

    return {
      type: "unknown",
      displayName: "Twitter Page",
      description: "Navigate to home, explore, bookmarks, or profile page",
    };
  }

  updatePageContext(context) {
    this.currentContext = context;

    const badgeIcon = document.getElementById("badge-icon");
    const badgeText = document.getElementById("badge-text");
    const captureBtn = document.getElementById("capture-btn");

    // Update badge display
    badgeText.textContent = context.displayName;

    // Update badge icon
    const icons = {
      bookmarks: "🔖",
      usertweets: "👤",
      search: "🔍",
      homeTimeline: "🏠",
      exploreForYou: "🔍",
      explore: "🧭",
      unknown: "❓",
    };
    badgeIcon.textContent = icons[context.type] || "❓";

    // Enable/disable capture button based on context
    const canCapture = context.type !== "unknown" && context.type !== "explore";
    captureBtn.disabled = !canCapture;

    if (canCapture) {
      captureBtn.title = `Capture ${context.type}`;
    } else {
      captureBtn.title = "Navigate to a supported Twitter page";
    }
  }

  async loadStatistics() {
    try {
      // First, ask background for global stats so we always have up-to-date numbers
      let globalStats = null;
      try {
        globalStats = await chrome.runtime.sendMessage({
          type: "getGlobalStats",
        });
      } catch (e) {
        console.warn("BG stats request failed", e);
      }

      if (globalStats && globalStats.stats) {
        this.updateStatisticsDisplay({
          total: globalStats.stats.total,
          bySource: globalStats.stats.bySource,
          currentSession: { isActive: globalStats.stats.anyActiveCaptures },
        });
      }

      // Additionally, if the active tab is a Twitter page, get per-tab capture status (to show progress etc.)
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab && this.isTwitterPage(tab.url)) {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: "getCaptureStats",
          });
          if (response && response.stats) {
            this.updateStatistics(response.stats);
          }
        } catch (err) {
          // Content script might not be injected yet – ignore
        }
      }
    } catch (error) {
      console.error("Error loading statistics:", error);
    }
  }

  updateStatistics(stats) {
    this.currentStats = stats;
    this.updateStatisticsDisplay(stats);

    // Update capture state if needed
    if (
      stats.currentSession &&
      stats.currentSession.isActive !== this.isCapturing
    ) {
      this.isCapturing = stats.currentSession.isActive;
      this.updateCaptureButton();
    }
  }

  updateStatisticsDisplay(stats) {
    const totalTweets = document.getElementById("total-tweets");
    const bookmarksCount = document.getElementById("bookmarks-count");
    const profilesCount = document.getElementById("profiles-count");

    totalTweets.textContent = this.formatNumber(stats.total || 0);
    bookmarksCount.textContent = this.formatNumber(
      stats.bySource?.bookmarks || 0
    );
    profilesCount.textContent = this.formatNumber(stats.uniqueAuthors || 0);
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return num.toString();
  }

  async toggleCapture() {
    if (this.isCapturing) {
      await this.stopCapture();
    } else {
      await this.startCapture();
    }
  }

  async startCapture() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab || !this.isTwitterPage(tab.url)) {
        this.showToast("Please navigate to a Twitter page", "error");
        return;
      }

      // Validate filter regex before starting capture
      let filterRegex = null;
      const autoScrollToggle = document.getElementById("auto-scroll-toggle");

      if (!autoScrollToggle.checked && this.filterRegex) {
        const validation = this.validateFilterRegex(this.filterRegex);
        if (!validation.isValid) {
          this.showToast("Invalid filter regex: " + validation.error, "error");
          // Highlight the invalid input and open advanced settings
          const filterInput = document.getElementById("filter-input");
          const advancedSettings = document.getElementById("advanced-settings");
          filterInput.classList.add("invalid");
          filterInput.focus();
          advancedSettings.open = true;
          return;
        }
        filterRegex = this.filterRegex;
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "startCapture",
        filterRegex: filterRegex,
      });

      if (response && response.success) {
        // Persist the active filter so a page reload (triggered below) can
        // be recovered by the new content-script without depending on timing
        // of background messages.
        try {
          await chrome.storage.local.set({
            activeFilterForCapture: filterRegex || null,
          });
        } catch (e) {
          console.warn("Failed saving activeFilterForCapture", e);
        }

        this.isCapturing = true;
        this.updateCaptureButton();
        this.showProgressSection();

        // Show appropriate success message based on filtering state
        let message = "Capture started! Scroll to load more tweets.";
        if (filterRegex) {
          message = `Capture started with filter: "${filterRegex}"`;
        } else if (autoScrollToggle.checked) {
          message = "Auto-scroll capture started!";
        }
        this.showToast(message, "success");

        // Refresh the page so that new API calls are guaranteed.  The
        // background process stores `filterRegex` and re-injects it when the
        // page finishes loading, so the filter context is preserved even
        // across this reload.
        chrome.tabs.reload(tab.id);

        // Start periodic updates
        this.startUpdateInterval();
      } else {
        this.showToast("Failed to start capture", "error");
      }
    } catch (error) {
      console.error("Error starting capture:", error);
      this.showToast("Error starting capture: " + error.message, "error");
    }
  }

  async stopCapture() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab && this.isTwitterPage(tab.url)) {
        await chrome.tabs.sendMessage(tab.id, { action: "stopCapture" });
      }

      this.isCapturing = false;
      this.updateCaptureButton();
      this.hideProgressSection();
      this.stopUpdateInterval();

      // Clear auto-scroll preference and reset related UI controls
      try {
        await chrome.storage.local.remove([
          "autoScrollEnabled",
          "autoScrollPageContext",
        ]);
      } catch (e) {
        console.warn("Failed to clear autoScroll preference", e);
      }

      // Reset UI toggles to default (auto-scroll OFF, filter enabled, speed selector hidden)
      this.resetAutoScrollToggle();
      this.toggleSpeedSelectorVisibility(false);
      this.toggleFilterEnabled(true);

      this.showToast("Capture stopped", "success");
    } catch (error) {
      console.error("Error stopping capture:", error);
      this.showToast("Error stopping capture: " + error.message, "error");
    }
  }

  updateCaptureButton() {
    const captureBtn = document.getElementById("capture-btn");
    const btnIcon = document.getElementById("btn-icon");
    const btnText = document.getElementById("btn-text");
    const statusDot = document.getElementById("status-dot");
    const statusText = document.getElementById("status-text");

    if (this.isCapturing) {
      captureBtn.classList.add("capturing");
      btnIcon.textContent = "⏸️";
      btnText.textContent = "Stop Capture";
      statusDot.classList.add("capturing");
      statusText.textContent = "Capturing";
    } else {
      captureBtn.classList.remove("capturing");
      btnIcon.textContent = "▶️";
      btnText.textContent = "Start Listening";
      statusDot.classList.remove("capturing");
      statusText.textContent = "Ready";
    }
  }

  showProgressSection() {
    const progressSection = document.getElementById("progress-section");
    progressSection.style.display = "block";

    // Reset progress
    const currentSessionCount = document.getElementById(
      "current-session-count"
    );
    const sessionType = document.getElementById("session-type");
    const progressFill = document.getElementById("progress-fill");

    currentSessionCount.textContent = "0";
    sessionType.textContent = this.currentContext?.type || "";
    progressFill.style.width = "0%";
  }

  hideProgressSection() {
    const progressSection = document.getElementById("progress-section");
    progressSection.style.display = "none";
  }

  onCaptureStarted(data) {
    this.isCapturing = true;
    this.updateCaptureButton();
    this.showProgressSection();

    const sessionType = document.getElementById("session-type");
    sessionType.textContent = data.context?.type || "";

    // Add capture active styling to speed selector
    const speedSelector = document.getElementById("speed-selector");
    speedSelector.classList.add("capture-active");

    // Show filter indicator if filtering is active
    this.updateFilterIndicator();
  }

  onCaptureStopped(data) {
    this.isCapturing = false;
    this.updateCaptureButton();
    this.hideProgressSection();

    this.showToast(
      `Capture completed! ${data.tweetCount} tweets captured.`,
      "success"
    );

    // Remove capture active styling from speed selector
    const speedSelector = document.getElementById("speed-selector");
    speedSelector.classList.remove("capture-active");

    // Hide filter indicator
    this.updateFilterIndicator();

    // Reload statistics
    this.loadStatistics();
  }

  onCaptureProgress(data) {
    const currentSessionCount = document.getElementById(
      "current-session-count"
    );
    const progressFill = document.getElementById("progress-fill");
    const liveUpdates = document.getElementById("live-updates");

    // Update session count
    currentSessionCount.textContent = data.totalCaptured || 0;

    // Update progress bar (visual feedback)
    const progressPercent = Math.min((data.totalCaptured / 20) * 100, 100);
    progressFill.style.width = progressPercent + "%";

    // Add live update
    if (data.newTweets > 0) {
      const updateItem = document.createElement("div");
      updateItem.className = "update-item";
      updateItem.textContent = `+${data.newTweets} tweets from ${data.sourceType}`;

      liveUpdates.insertBefore(updateItem, liveUpdates.firstChild);

      // Keep only last 5 updates
      while (liveUpdates.children.length > 5) {
        liveUpdates.removeChild(liveUpdates.lastChild);
      }
    }
  }

  startUpdateInterval() {
    this.updateInterval = setInterval(() => {
      this.loadStatistics();
    }, 3000);
  }

  stopUpdateInterval() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  openDataViewer() {
    chrome.tabs.create({
      url: chrome.runtime.getURL("data-viewer/data-viewer.html"),
    });
  }

  showExportOptions() {
    this.showToast("Export feature coming soon!", "warning");
  }

  openSettings() {
    this.showToast("Settings panel coming soon!", "warning");
  }

  async confirmClearData() {
    if (
      confirm(
        "Are you sure you want to clear all captured data? This action cannot be undone."
      )
    ) {
      await this.clearAllData();
    }
  }

  async clearAllData() {
    try {
      this.showLoading(true);

      // Send clear message to background script (same as data viewer)
      const bgResponse = await new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ type: "clearAllData" }, (res) => {
            if (chrome.runtime.lastError) {
              console.warn(
                "Background clearAllData failed:",
                chrome.runtime.lastError.message
              );
              resolve(null);
            } else {
              resolve(res);
            }
          });
        } catch (err) {
          console.warn("sendMessage threw", err);
          resolve(null);
        }
      });

      if (bgResponse && bgResponse.success) {
        // Reset UI
        this.updateStatisticsDisplay({
          total: 0,
          bySource: {},
          currentSession: { isActive: false },
        });

        this.showToast("All data cleared successfully", "success");
      } else {
        console.error("Background script failed to clear data:", bgResponse);
        this.showToast("Failed to clear data from background script", "error");
      }
    } catch (error) {
      console.error("Error clearing data:", error);
      this.showToast("Error clearing data: " + error.message, "error");
    } finally {
      this.showLoading(false);
    }
  }

  openHelp() {
    chrome.tabs.create({
      url: "https://github.com/your-repo/twitter-collector#help",
    });
  }

  openFeedback() {
    chrome.tabs.create({
      url: "https://github.com/your-repo/twitter-collector/issues",
    });
  }

  showLoading(show) {
    const loadingOverlay = document.getElementById("loading-overlay");
    loadingOverlay.style.display = show ? "flex" : "none";
  }

  // Auto-scroll functionality
  async toggleAutoScroll(isEnabled) {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab || !this.isTwitterPage(tab.url)) {
        this.showToast("Auto-scroll only works on Twitter pages", "error");
        this.resetAutoScrollToggle();
        return;
      }

      if (!this.currentContext || this.currentContext.type === "unknown") {
        this.showToast(
          "Navigate to bookmarks, profile, or search page",
          "error"
        );
        this.resetAutoScrollToggle();
        return;
      }

      // Store auto-scroll preference (don't start scrolling yet). Using chrome.storage.local so it is accessible to content scripts even after page reload.
      await chrome.storage.local.set({
        autoScrollEnabled: isEnabled,
        autoScrollPageContext: this.currentContext,
      });

      // Show/hide speed selector
      this.toggleSpeedSelectorVisibility(isEnabled);

      // Enable/disable filter input based on auto-scroll state
      this.toggleFilterEnabled(!isEnabled);

      // Send preference to content script with current speed setting
      const message = {
        action: "setAutoScrollPreference",
        enabled: isEnabled,
        pageContext: this.currentContext,
        speedIndex: this.currentSpeedIndex,
      };

      try {
        await chrome.tabs.sendMessage(tab.id, message);
      } catch (e) {
        // Content script might not be ready, but preference is stored
        console.log("Content script not ready, preference stored for later");
      }

      // Update UI to show preference set (not active scrolling yet)
      this.updateAutoScrollStatus(isEnabled, false, true);

      if (isEnabled) {
        let message = "Auto-scroll enabled - will start after capture begins";
        if (this.filterRegex) {
          message += ". Filtering has been disabled for performance.";
        }
        this.showToast(message, "info");
      } else {
        let message = "Auto-scroll disabled";
        if (this.filterRegex) {
          message += ". Filtering is now available.";
        }
        this.showToast(message, "info");
      }
    } catch (error) {
      console.error("Error toggling auto-scroll:", error);
      this.showToast("Error toggling auto-scroll", "error");
      this.resetAutoScrollToggle();
    }
  }

  resetAutoScrollToggle() {
    const toggle = document.getElementById("auto-scroll-toggle");
    const status = document.getElementById("auto-scroll-status");
    toggle.checked = false;
    status.textContent = "OFF";
    status.className = "toggle-status";
  }

  updateAutoScrollStatus(
    isPreferenceSet,
    isScrolling = false,
    isReady = false
  ) {
    const status = document.getElementById("auto-scroll-status");

    if (isPreferenceSet) {
      if (isScrolling) {
        status.textContent = "SCROLLING";
        status.className = "toggle-status scrolling";
      } else if (isReady) {
        status.textContent = "READY";
        status.className = "toggle-status active";
      } else {
        status.textContent = "ON";
        status.className = "toggle-status active";
      }
    } else {
      status.textContent = "OFF";
      status.className = "toggle-status";
    }
  }

  onAutoScrollStarted(data) {
    console.log("Auto-scroll started:", data);
    this.updateAutoScrollStatus(true, false, false);
  }

  onAutoScrollStopped(data) {
    console.log("Auto-scroll stopped:", data);
    this.updateAutoScrollStatus(false, false, false);
    this.resetAutoScrollToggle();

    if (data.reason === "end_reached") {
      this.showToast("Reached end of content", "info");
    } else if (data.reason === "error") {
      this.showToast("Auto-scroll stopped due to error", "error");
    }
  }

  onAutoScrollProgress(data) {
    this.updateAutoScrollStatus(true, data.isScrolling, false);

    // Update speed display if it has changed
    if (data.currentSpeed) {
      const speedDisplay = document.getElementById("speed-display");
      if (speedDisplay.textContent !== data.currentSpeed) {
        speedDisplay.textContent = data.currentSpeed;
      }
    }
  }

  // Load auto-scroll preference from storage
  async loadAutoScrollPreference() {
    try {
      const result = await chrome.storage.local.get(["autoScrollEnabled"]);
      if (result.autoScrollEnabled) {
        const toggle = document.getElementById("auto-scroll-toggle");
        toggle.checked = true;
        this.updateAutoScrollStatus(true, false, true);
        this.toggleSpeedSelectorVisibility(true);
        // Filter should be disabled when auto-scroll is enabled
        this.toggleFilterEnabled(false);
      } else {
        // Filter should be enabled when auto-scroll is disabled
        this.toggleFilterEnabled(true);
      }
    } catch (error) {
      console.log("No auto-scroll preference found:", error);
      // Default to filter enabled when no preference
      this.toggleFilterEnabled(true);
    }
  }

  showToast(message, type = "info") {
    const toastContainer = document.getElementById("toast-container");

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3000);
  }

  // Speed control methods
  updateSpeedSelection(speedIndex) {
    this.currentSpeedIndex = speedIndex;
    const speedLevel = this.speedLevels[speedIndex];

    // Update display with visual feedback
    const speedDisplay = document.getElementById("speed-display");
    const speedSelector = document.getElementById("speed-selector");

    // Add changing effect
    speedDisplay.classList.add("changing");
    speedDisplay.textContent = speedLevel.display;

    // Remove changing effect after animation
    setTimeout(() => {
      speedDisplay.classList.remove("changing");
    }, 300);

    // Update capture active styling
    if (this.isCapturing) {
      speedSelector.classList.add("capture-active");
    }

    // Store preference
    this.saveSpeedPreference(speedIndex);

    // Send to content script if auto-scroll is active
    this.updateContentScriptSpeed();

    // Show feedback for real-time speed changes
    if (this.isCapturing) {
      this.showToast(`Speed changed to ${speedLevel.display}`, "info");
    }

    console.log(`Speed updated to ${speedLevel.display} (index ${speedIndex})`);
  }

  async saveSpeedPreference(speedIndex) {
    try {
      await chrome.storage.local.set({ autoScrollSpeedIndex: speedIndex });
    } catch (error) {
      console.log("Error saving speed preference:", error);
    }
  }

  async loadSpeedPreference() {
    try {
      const result = await chrome.storage.local.get(["autoScrollSpeedIndex"]);
      if (result.autoScrollSpeedIndex !== undefined) {
        this.currentSpeedIndex = result.autoScrollSpeedIndex;
      }

      // Update UI
      const speedSlider = document.getElementById("speed-slider");
      const speedDisplay = document.getElementById("speed-display");
      speedSlider.value = this.currentSpeedIndex;
      speedDisplay.textContent =
        this.speedLevels[this.currentSpeedIndex].display;
    } catch (error) {
      console.log("No speed preference found:", error);
    }
  }

  async updateContentScriptSpeed() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab && this.isTwitterPage(tab.url)) {
        await chrome.tabs.sendMessage(tab.id, {
          action: "updateAutoScrollSpeed",
          speedIndex: this.currentSpeedIndex,
        });
      }
    } catch (error) {
      console.log("Error updating content script speed:", error);
    }
  }

  toggleSpeedSelectorVisibility(show) {
    const speedSelector = document.getElementById("speed-selector");
    if (show) {
      speedSelector.classList.add("visible");
    } else {
      speedSelector.classList.remove("visible");
    }
  }

  // Advanced Settings Management
  onAdvancedSettingsToggle(isOpen) {
    // Update chevron rotation is handled by CSS
    // Could add analytics or state persistence here
    console.log("Advanced settings", isOpen ? "opened" : "closed");
  }

  onFilterInputChange(value) {
    this.filterRegex = value.trim();

    // Visual feedback for regex validation
    const filterInput = document.getElementById("filter-input");
    filterInput.classList.remove("invalid");

    if (this.filterRegex) {
      try {
        // Test regex compilation
        new RegExp(this.filterRegex, "i");
        // Valid regex - could add visual feedback
      } catch (error) {
        // Invalid regex - add visual feedback
        filterInput.classList.add("invalid");
        console.log("Invalid regex:", error.message);
      }
    }

    // Save to storage
    this.saveFilterPreference(this.filterRegex);
  }

  async loadFilterPreference() {
    try {
      const result = await chrome.storage.local.get(["advancedFilterValue"]);
      if (result.advancedFilterValue) {
        this.filterRegex = result.advancedFilterValue;
        const filterInput = document.getElementById("filter-input");
        if (filterInput) {
          filterInput.value = this.filterRegex;
        }
      }
    } catch (error) {
      console.log("No filter preference found:", error);
    }
  }

  async saveFilterPreference(filterValue) {
    try {
      await chrome.storage.local.set({ advancedFilterValue: filterValue });
    } catch (error) {
      console.log("Error saving filter preference:", error);
    }
  }

  validateFilterRegex(regexString) {
    if (!regexString || regexString.trim() === "") {
      return { isValid: true, regex: null, error: null };
    }

    try {
      const compiledRegex = new RegExp(regexString.trim(), "i");
      return { isValid: true, regex: compiledRegex, error: null };
    } catch (error) {
      return { isValid: false, regex: null, error: error.message };
    }
  }

  toggleFilterEnabled(enabled) {
    const filterInput = document.getElementById("filter-input");
    const settingHelp = filterInput.nextElementSibling;

    if (enabled) {
      filterInput.disabled = false;
      filterInput.placeholder =
        "Regex or keywords (e.g., chatgpt, *open-source*)";
      filterInput.classList.remove("disabled-by-autoscroll");
      settingHelp.textContent = "Only capture tweets matching this pattern";
      settingHelp.classList.remove("warning");
    } else {
      filterInput.disabled = true;
      filterInput.placeholder =
        "Filtering disabled when auto-scroll is enabled";
      filterInput.classList.add("disabled-by-autoscroll");
      settingHelp.textContent =
        "Auto-scroll captures all tweets for performance. Disable auto-scroll to use filtering.";
      settingHelp.classList.add("warning");
    }
  }

  updateFilterIndicator() {
    const filterInput = document.getElementById("filter-input");
    const autoScrollToggle = document.getElementById("auto-scroll-toggle");

    // Add/remove visual indicator when filtering is active
    if (this.isCapturing && !autoScrollToggle.checked && this.filterRegex) {
      filterInput.classList.add("filter-active");
      filterInput.title = `Filtering active: ${this.filterRegex}`;
    } else {
      filterInput.classList.remove("filter-active");
      filterInput.title = "Enter keywords or regex pattern to filter tweets";
    }
  }
}

// Initialize popup when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new TwitterCollectorPopup();
});
