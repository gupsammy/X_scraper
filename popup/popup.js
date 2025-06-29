// Twitter Collector Popup JavaScript
class TwitterCollectorPopup {
  constructor() {
    this.isCapturing = false;
    this.currentContext = null;
    this.currentStats = null;
    this.updateInterval = null;
    
    // Speed control configuration (matches AutoScroller speedConfigs)
    this.speedLevels = [
      { display: "1/4x (Slowest)" },
      { display: "1/2x" },
      { display: "1x (Default)" },
      { display: "2x" },
      { display: "4x" },
      { display: "8x (Max)" }
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

    // Simple user profile detection
    const pathMatch = new URL(url).pathname.match(/^\/([^\/]+)$/);
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
      description: "Navigate to bookmarks or profile page",
    };
  }

  updatePageContext(context) {
    this.currentContext = context;

    const contextIcon = document.getElementById("context-icon");
    const contextName = document.getElementById("context-name");
    const contextDescription = document.getElementById("context-description");
    const captureBtn = document.getElementById("capture-btn");

    // Update context display
    contextName.textContent = context.displayName;
    contextDescription.textContent = context.description;

    // Update context icon
    const icons = {
      bookmarks: "🔖",
      usertweets: "👤",
      search: "🔍",
      unknown: "❓",
    };
    contextIcon.textContent = icons[context.type] || "❓";

    // Enable/disable capture button based on context
    const canCapture = context.type !== "unknown";
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

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "startCapture",
      });

      if (response && response.success) {
        this.isCapturing = true;
        this.updateCaptureButton();
        this.showProgressSection();
        this.showToast(
          "Capture started! Scroll to load more tweets.",
          "success"
        );

        // Refresh the page so that new API calls are triggered and interception starts immediately
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
      btnText.textContent = "Start Capture";
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

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (tab && this.isTwitterPage(tab.url)) {
        await chrome.tabs.sendMessage(tab.id, { action: "clearData" });
      }

      // Reset UI
      this.updateStatisticsDisplay({
        total: 0,
        bySource: {},
        currentSession: { isActive: false },
      });

      this.showToast("All data cleared successfully", "success");
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
        this.showToast(
          "Auto-scroll enabled - will start after capture begins",
          "info"
        );
      } else {
        this.showToast("Auto-scroll disabled", "info");
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
      }
    } catch (error) {
      console.log("No auto-scroll preference found:", error);
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
      speedDisplay.textContent = this.speedLevels[this.currentSpeedIndex].display;
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
}

// Initialize popup when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new TwitterCollectorPopup();
});
