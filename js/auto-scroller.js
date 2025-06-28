// Auto-scroll functionality for Twitter Collector Extension
class AutoScroller {
  constructor(config = {}) {
    // Configuration
    this.scrollDistance = config.scrollDistance || 50000;
    this.waitTime = config.waitTime || 200;
    this.maxRetries = config.maxRetries || 3;
    this.pageContext = config.pageContext || null;

    // State management
    this.isActive = false;
    this.isScrolling = false;
    this.retryCount = 0;
    this.lastScrollHeight = 0;
    this.lastAPICallTime = 0;
    this.apiCallCount = 0;

    // Progressive speed management
    this.baseWaitTime = this.waitTime;
    this.baseDelay = config.baseDelay || 1000;
    this.currentSpeedMultiplier = 1.0;
    this.maxSpeedMultiplier = 4.0; // Can get up to 4x faster
    this.successiveSuccesses = 0;
    this.recentAPIResponses = [];

    // Timers and intervals
    this.scrollTimer = null;
    this.waitTimer = null;
    this.progressUpdateInterval = null;

    // Callbacks
    this.onStart = config.onStart || (() => {});
    this.onStop = config.onStop || (() => {});
    this.onProgress = config.onProgress || (() => {});
    this.onAPIActivity = config.onAPIActivity || (() => {});

    // Bind methods
    this.scroll = this.scroll.bind(this);
    this.checkForNewContent = this.checkForNewContent.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);

    debugLog("AutoScroller initialized with config:", config);
  }

  start() {
    if (this.isActive) {
      debugLog("AutoScroller already active");
      return false;
    }

    debugLog("Starting AutoScroller for page context:", this.pageContext);

    this.isActive = true;
    this.retryCount = 0;
    this.lastScrollHeight = document.body.scrollHeight;
    this.lastAPICallTime = Date.now();
    this.apiCallCount = 0;

    // Reset progressive speed state for new session
    this.currentSpeedMultiplier = 1.0;
    this.successiveSuccesses = 0;
    this.recentAPIResponses = [];

    // Apply context-aware configuration
    this.updateContextualConfig();

    // Set up page visibility change listener to pause when tab is not visible
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    // Start progress updates
    this.startProgressUpdates();

    // Start scrolling
    this.scheduleNextScroll();

    // Notify start
    this.onStart({
      pageContext: this.pageContext,
      config: {
        scrollDistance: this.scrollDistance,
        waitTime: this.waitTime,
        maxRetries: this.maxRetries,
      },
    });

    return true;
  }

  stop(reason = "manual") {
    if (!this.isActive) {
      debugLog("AutoScroller not active");
      return false;
    }

    debugLog("Stopping AutoScroller, reason:", reason);

    this.isActive = false;
    this.isScrolling = false;

    // Clear all timers
    this.clearAllTimers();

    // Remove event listeners
    document.removeEventListener(
      "visibilitychange",
      this.handleVisibilityChange
    );

    // Notify stop
    this.onStop({
      reason: reason,
      scrollCount: Math.floor(
        (Date.now() - this.lastAPICallTime) / (this.waitTime + 1000)
      ),
      apiCallCount: this.apiCallCount,
    });

    return true;
  }

  scheduleNextScroll() {
    if (!this.isActive) return;

    let delay = this.getScrollDelay();
    // Add random variation ±15%
    delay = delay * (1 + (Math.random() - 0.5) * 0.3);
    delay = Math.max(20, delay); // ensure not too small
    debugLog(
      `Scheduling next scroll in ${Math.round(delay)}ms (with variation)`
    );

    this.scrollTimer = setTimeout(() => {
      if (this.isActive) {
        this.scroll();
      }
    }, delay);
  }

  scroll() {
    if (!this.isActive || this.isScrolling) return;

    debugLog("Performing scroll", {
      distance: this.scrollDistance,
      currentHeight: document.body.scrollHeight,
      retryCount: this.retryCount,
    });

    this.isScrolling = true;
    this.lastScrollHeight = document.body.scrollHeight;

    // Add random variation ±10% to scroll distance
    const distanceVariation =
      this.scrollDistance * ((Math.random() - 0.5) * 0.2);
    const distance = this.scrollDistance + distanceVariation;
    window.scrollBy({
      top: distance,
      behavior: "smooth",
    });

    // Wait for scroll to complete and then check for new content
    setTimeout(() => {
      this.isScrolling = false;
      this.waitForNewContent();
    }, 500); // Give scroll animation time to complete
  }

  waitForNewContent() {
    if (!this.isActive) return;

    debugLog("Waiting for new content...", {
      waitTime: this.waitTime,
      retryCount: this.retryCount,
    });

    this.waitTimer = setTimeout(() => {
      this.checkForNewContent();
    }, this.waitTime);
  }

  checkForNewContent() {
    if (!this.isActive) return;

    const currentHeight = document.body.scrollHeight;
    const heightChanged = currentHeight > this.lastScrollHeight;
    const recentAPIActivity = this.hasRecentAPIActivity();

    debugLog("Checking for new content", {
      heightChanged,
      recentAPIActivity,
      currentHeight,
      lastHeight: this.lastScrollHeight,
      retryCount: this.retryCount,
      apiCallCount: this.apiCallCount,
    });

    if (heightChanged || recentAPIActivity) {
      // New content detected - increase speed progressively
      debugLog("New content detected, resetting retry count");
      this.retryCount = 0;
      this.lastScrollHeight = currentHeight;
      this.successiveSuccesses++;
      this.updateSpeedBasedOnSuccess();
      this.scheduleNextScroll();
    } else {
      // No new content - slow down and retry
      this.retryCount++;
      this.successiveSuccesses = 0; // Reset success streak
      this.updateSpeedBasedOnFailure();
      debugLog(
        `No new content, retry ${this.retryCount}/${
          this.maxRetries
        }, speed: ${this.currentSpeedMultiplier.toFixed(2)}x`
      );

      if (this.retryCount >= this.maxRetries) {
        // Max retries reached, stop scrolling
        debugLog("Max retries reached, stopping auto-scroll");
        this.stop("end_reached");
      } else {
        // Try again with current speed
        this.scheduleNextScroll();
      }
    }
  }

  hasRecentAPIActivity() {
    const timeSinceLastAPI = Date.now() - this.lastAPICallTime;
    return timeSinceLastAPI < this.waitTime;
  }

  getScrollDelay() {
    // Context-aware scroll timing with progressive speed
    const baseDelay = this.baseDelay;
    const retryMultiplier = Math.pow(1.5, this.retryCount); // Exponential backoff for retries

    const contextConfig = this.getContextConfig();
    const contextMultiplier = contextConfig.speedMultiplier;

    // Apply progressive speed (lower multiplier = faster scrolling)
    const speedAdjustedDelay = this.baseWaitTime / this.currentSpeedMultiplier;

    const finalDelay = Math.min(
      Math.max(baseDelay, speedAdjustedDelay) *
        retryMultiplier *
        contextMultiplier,
      10000 // Max 10 seconds
    );

    return finalDelay;
  }

  updateSpeedBasedOnSuccess() {
    // Increase speed progressively with each success
    const speedIncrement = 0.2; // Increase by 0.2x each success
    const accelerationThreshold = 3; // Start accelerating after 3 successes

    if (this.successiveSuccesses >= accelerationThreshold) {
      this.currentSpeedMultiplier = Math.min(
        this.currentSpeedMultiplier + speedIncrement,
        this.maxSpeedMultiplier
      );

      debugLog(
        `Speed increased to ${this.currentSpeedMultiplier.toFixed(2)}x after ${
          this.successiveSuccesses
        } successes`
      );
    }
  }

  updateSpeedBasedOnFailure() {
    // Reduce speed when content loading fails
    const speedReduction = 0.3; // Reduce by 0.3x on failure
    const minSpeedMultiplier = 0.5; // Don't go below 0.5x (2x slower than base)

    this.currentSpeedMultiplier = Math.max(
      this.currentSpeedMultiplier - speedReduction,
      minSpeedMultiplier
    );

    debugLog(
      `Speed reduced to ${this.currentSpeedMultiplier.toFixed(
        2
      )}x due to no content`
    );
  }

  getContextConfig() {
    if (!this.pageContext) {
      return this.getDefaultConfig();
    }

    switch (this.pageContext.type) {
      case "bookmarks":
        return {
          speedMultiplier: 1.3, // Slower for bookmarks (more content per request)
          scrollDistance: 8000, // 10x larger scroll distance
          maxRetries: 4, // More patient with bookmarks
          description: "Optimized for bookmark scrolling",
        };

      case "search":
        return {
          speedMultiplier: 0.8, // Faster for search results
          scrollDistance: 12000, // 10x larger scroll distance
          maxRetries: 3, // Standard retries
          description: "Optimized for search results",
        };

      case "usertweets":
        return {
          speedMultiplier: 1.0, // Normal speed for profiles
          scrollDistance: 10000, // 10x larger scroll distance
          maxRetries: 5, // More patient for user profiles (may have less content)
          description: "Optimized for user profiles",
        };

      default:
        return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      speedMultiplier: 1.0,
      scrollDistance: 10000,
      maxRetries: 3,
      description: "Default configuration",
    };
  }

  updateContextualConfig() {
    if (!this.pageContext) return;

    const contextConfig = this.getContextConfig();

    // Update scroll distance based on context
    this.scrollDistance = contextConfig.scrollDistance;

    // Update max retries based on context
    this.maxRetries = contextConfig.maxRetries;

    debugLog("Updated contextual config:", {
      pageType: this.pageContext.type,
      config: contextConfig,
    });
  }

  onAPICall(url, responseText, apiType) {
    if (!this.isActive) return;

    const currentTime = Date.now();
    this.lastAPICallTime = currentTime;
    this.apiCallCount++;

    // Track recent API response patterns for progressive speed
    this.recentAPIResponses.push({
      timestamp: currentTime,
      responseLength: responseText?.length || 0,
      apiType,
    });

    // Keep only last 10 API responses for analysis
    if (this.recentAPIResponses.length > 10) {
      this.recentAPIResponses.shift();
    }

    debugLog("API activity detected", {
      apiType,
      url: url.substring(0, 100) + "...",
      responseLength: responseText?.length,
      callCount: this.apiCallCount,
      currentSpeed: this.currentSpeedMultiplier.toFixed(2) + "x",
    });

    // Notify of API activity
    this.onAPIActivity({
      apiType,
      callCount: this.apiCallCount,
      timestamp: this.lastAPICallTime,
      currentSpeed: this.currentSpeedMultiplier,
    });
  }

  startProgressUpdates() {
    this.progressUpdateInterval = setInterval(() => {
      if (this.isActive) {
        this.onProgress({
          isScrolling: this.isScrolling,
          retryCount: this.retryCount,
          maxRetries: this.maxRetries,
          apiCallCount: this.apiCallCount,
          scrollHeight: document.body.scrollHeight,
          currentSpeed: this.currentSpeedMultiplier,
          successiveSuccesses: this.successiveSuccesses,
        });
      }
    }, 1000); // Update every second
  }

  clearAllTimers() {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
      this.progressUpdateInterval = null;
    }
  }

  handleVisibilityChange() {
    if (document.hidden && this.isActive) {
      debugLog("Page hidden, pausing auto-scroll");
      this.clearAllTimers();
    } else if (!document.hidden && this.isActive) {
      debugLog("Page visible, resuming auto-scroll");
      this.scheduleNextScroll();
      this.startProgressUpdates();
    }
  }

  // Update configuration
  updateConfig(newConfig) {
    this.scrollDistance = newConfig.scrollDistance || this.scrollDistance;
    this.waitTime = newConfig.waitTime || this.waitTime;
    this.maxRetries = newConfig.maxRetries || this.maxRetries;
    this.pageContext = newConfig.pageContext || this.pageContext;

    debugLog("AutoScroller config updated:", newConfig);
  }

  // Get current status
  getStatus() {
    return {
      isActive: this.isActive,
      isScrolling: this.isScrolling,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      apiCallCount: this.apiCallCount,
      lastAPICallTime: this.lastAPICallTime,
      scrollHeight: document.body.scrollHeight,
      pageContext: this.pageContext,
      currentSpeed: this.currentSpeedMultiplier,
      successiveSuccesses: this.successiveSuccesses,
      baseWaitTime: this.baseWaitTime,
      currentWaitTime: this.getScrollDelay(),
    };
  }
}

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = AutoScroller;
}
