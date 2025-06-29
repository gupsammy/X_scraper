// Main content script for Twitter API interception and tweet capture
class TwitterCollectorContentScript {
  constructor() {
    this.isCapturing = false;
    this.capturedTweetIds = new Set();
    this.currentSession = null;
    this.originalXHRSend = null;
    this.originalFetch = null;
    this.pageContext = null;
    this.statsUpdateInterval = null;
    this.autoScroller = null;
    this.autoScrollPreference = false;
    this.autoScrollSpeedIndex = 2; // Default to 1x speed (index 2)
    this.firstAPICaptured = false;
    // History of recent API calls for rate-limit tracking (keeps ~1 min)
    this.apiHistory = []; // [{ ts: epochMillis, tweets: number }]

    // Listen for posted messages from injected script
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const msg = event.data;
      if (!msg || msg.source !== "TC_INTERCEPTOR") return;

      debugLog("Received TC_INTERCEPTOR message:", {
        apiType: msg.apiType,
        url: msg.url?.substring(0, 100) + "...",
        responseLength: msg.responseText?.length,
        isCapturing: this.isCapturing,
      });

      const { url, responseText, apiType } = msg;
      if (!url || !responseText || !apiType) return;

      const apiMatch = { type: apiType };
      if (this.isCapturing && apiMatch) {
        debugLog(`Processing intercepted ${apiType} response`);
        this.processAPIResponse(responseText, url, apiMatch.type);
      } else if (!this.isCapturing) {
        debugLog(`Received ${apiType} but not capturing`);
      }
    });

    // Initialize
    this.init();
  }

  async init() {
    try {
      debugLog("Initializing Twitter Collector Content Script");

      // Initialize database first
      if (!window.twitterDB) {
        window.twitterDB = new TwitterDatabase();
        await window.twitterDB.init();
        debugLog("Database initialized successfully");
      }

      // *** Set up interception IMMEDIATELY ***
      this.setupInterception();

      // Also set it up again after DOM is fully loaded (redundant safety)
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          this.setupInterception();
        });
      }

      // Set up message listeners
      this.setupMessageListeners();

      // Update page context
      this.updatePageContext();

      // Set up page change detection
      this.setupPageChangeDetection();

      // Check for auto-scroll preference from storage
      await this.checkAutoScrollPreference();

      // Ask background if capture should resume (e.g., after page reload)
      chrome.runtime.sendMessage({ type: "getCaptureStatus" }, (response) => {
        if (response && response.isCapturing) {
          debugLog("Resuming capture after page reload");
          this.startCapture();
        }
      });

      debugLog("Content script initialized successfully");
    } catch (error) {
      console.error("Error initializing content script:", error);
    }
  }

  setupInterception() {
    // Intercept within content script world (may not catch page world calls)
    this.interceptXHR();
    this.interceptFetch();

    // ALSO inject interception into the page context so we capture traffic from the actual website scripts.
    this.injectPageInterceptor();

    debugLog("API interception set up (content script + page context)");
  }

  // Intercept XMLHttpRequest for GraphQL API calls
  interceptXHR() {
    const self = this;
    this.originalXHRSend = XMLHttpRequest.prototype.send;
    this.originalXHROpen = XMLHttpRequest.prototype.open;

    // Override open to capture the URL
    XMLHttpRequest.prototype.open = function (method, url, ...args) {
      this._interceptedUrl = url;
      return self.originalXHROpen.apply(this, [method, url, ...args]);
    };

    XMLHttpRequest.prototype.send = function (data) {
      this.addEventListener("load", function () {
        try {
          const url = this._interceptedUrl || this.responseURL;
          debugLog("XHR intercepted:", url);
          if (!url) return;

          const apiMatch = matchesAPIPattern(url);
          debugLog("API match result:", apiMatch);

          if (apiMatch && self.isCapturing) {
            debugLog(`Intercepted ${apiMatch.type} API call`, { url });
            self.processAPIResponse(this.responseText, url, apiMatch.type);
          } else if (apiMatch && !self.isCapturing) {
            debugLog(`API matched but not capturing: ${apiMatch.type}`, {
              url,
            });
          } else if (!apiMatch && url.includes("/api/graphql/")) {
            debugLog("GraphQL API call but no pattern match:", url);
          }
        } catch (error) {
          console.error("Error in XHR interception:", error);
        }
      });

      // Call original send method
      return self.originalXHRSend.apply(this, arguments);
    };
  }

  // Intercept Fetch API calls
  interceptFetch() {
    const self = this;
    this.originalFetch = window.fetch;

    window.fetch = async function (...args) {
      const response = await self.originalFetch.apply(this, args);

      try {
        const url = args[0];
        debugLog("Fetch intercepted:", url);
        if (typeof url === "string") {
          const apiMatch = matchesAPIPattern(url);
          debugLog("Fetch API match result:", apiMatch);

          if (apiMatch && self.isCapturing) {
            const clonedResponse = response.clone();
            const responseText = await clonedResponse.text();
            debugLog(`Intercepted ${apiMatch.type} Fetch API call`, { url });
            self.processAPIResponse(responseText, url, apiMatch.type);
          } else if (apiMatch && !self.isCapturing) {
            debugLog(`Fetch API matched but not capturing: ${apiMatch.type}`, {
              url,
            });
          } else if (!apiMatch && url.includes("/api/graphql/")) {
            debugLog("Fetch GraphQL API call but no pattern match:", url);
          }
        }
      } catch (error) {
        console.error("Error in Fetch interception:", error);
      }

      return response;
    };
  }

  // Inject a script tag into the page to override XHR & fetch in the page context (not isolated world)
  injectPageInterceptor() {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("js/page-interceptor.js");
      script.type = "text/javascript";
      (document.documentElement || document.head || document.body).appendChild(
        script
      );
      // no removal; keep script for future navigations within SPA
    } catch (err) {
      console.error("Failed to inject page interceptor:", err);
    }
  }

  // Process intercepted API response
  async processAPIResponse(responseText, url, sourceType) {
    try {
      debugLog(`Processing ${sourceType} response`);
      debugLog(`Response length: ${responseText.length} characters`);

      // Extract tweets from response
      const tweets = twitterDataExtractor.extractTweetData(
        responseText,
        url,
        sourceType
      );

      debugLog(`Extracted ${tweets.length} tweets from response`);
      if (tweets.length === 0) {
        debugLog("No tweets extracted from response");
        return;
      }

      // Filter out duplicates
      const newTweets = tweets.filter(
        (tweet) => !this.capturedTweetIds.has(tweet.id)
      );

      // --------------------------
      //  Rate-limit measurement
      // --------------------------
      try {
        const nowTs = Date.now();
        // Record this API call along with number of *unique* tweets obtained
        this.apiHistory.push({ ts: nowTs, tweets: newTweets.length });

        // Retain only events from the last 60 s so memory stays bounded
        const sixtySecAgo = nowTs - 60_000;
        this.apiHistory = this.apiHistory.filter(
          (rec) => rec.ts >= sixtySecAgo
        );

        // 10-second window metrics
        const tenSecAgo = nowTs - 10_000;
        const slice10 = this.apiHistory.filter((rec) => rec.ts >= tenSecAgo);
        const calls10 = slice10.length;
        const tweets10 = slice10.reduce((sum, rec) => sum + rec.tweets, 0);

        // 60-second window metrics
        const calls60 = this.apiHistory.length;
        const tweets60 = this.apiHistory.reduce(
          (sum, rec) => sum + rec.tweets,
          0
        );

        debugLog(
          `[RATE] ${calls10} calls/${tweets10} tweets (10s) | ${calls60} calls/${tweets60} tweets (60s)`
        );
      } catch (err) {
        // Silently ignore any stats errors so we never break capture flow
      }

      debugLog(`${newTweets.length} new tweets after duplicate filtering`);
      if (newTweets.length === 0) {
        debugLog("All tweets were duplicates");
        return;
      }

      // Add session ID to tweets
      newTweets.forEach((tweet) => {
        tweet.capture_session_id = this.currentSession;
        this.capturedTweetIds.add(tweet.id);
      });

      // Ensure database is initialized
      if (!window.twitterDB) {
        window.twitterDB = new TwitterDatabase();
        await window.twitterDB.init();
      }

      const result = await window.twitterDB.storeTweets(newTweets);
      debugLog(
        `Stored ${result.stored} new tweets, ${result.duplicates} duplicates`
      );

      // ALSO persist in background script DB so extension pages can read the data
      try {
        chrome.runtime.sendMessage({
          type: "storeTweets",
          tweets: newTweets,
        });
      } catch (e) {
        debugLog("Failed to forward tweets to background DB", e);
      }

      // Update capture statistics
      await this.updateCaptureStats(newTweets.length);

      // Notify popup of progress
      this.notifyProgress(newTweets.length, sourceType);

      // Notify auto-scroller of API activity
      this.notifyAutoScrollerOfAPIActivity(url, responseText, sourceType);

      // Start auto-scroll after first API capture if preference is enabled
      if (
        !this.firstAPICaptured &&
        this.autoScrollPreference &&
        this.isCapturing
      ) {
        this.firstAPICaptured = true;
        debugLog("First API captured, starting auto-scroll");
        this.startAutoScrollAfterFirstCapture();
      }
    } catch (error) {
      console.error("Error processing API response:", error);
      debugLog("Full error details:", {
        error: error?.message || String(error),
        stack: error?.stack,
      });
    }
  }

  // Set up message listeners for communication with popup
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      debugLog("Content script received message:", message);

      switch (message.action) {
        case "startCapture":
          this.startCapture();
          sendResponse({ success: true });
          break;

        case "stopCapture":
          this.stopCapture();
          sendResponse({ success: true });
          break;

        case "getPageContext":
          sendResponse({ context: this.getPageContext() });
          break;

        case "getCaptureStats":
          this.getCaptureStats().then((stats) => {
            sendResponse({ stats });
          });
          return true; // Keep message channel open for async response

        case "deleteTweet":
          if (message.tweetId && window.twitterDB) {
            window.twitterDB.deleteTweet(message.tweetId).then(() => {
              // Remove from local cache if tracked
              if (this.capturedTweetIds) {
                this.capturedTweetIds.delete(message.tweetId);
              }
              sendResponse({ success: true });
            });
            return true;
          }
          sendResponse({ success: false, error: "tweetId missing" });
          break;

        case "clearData":
          this.clearAllData().then(() => {
            sendResponse({ success: true });
          });
          return true;

        case "clearAllData":
          this.clearAllData().then(() => {
            sendResponse({ success: true });
          });
          return true;

        case "getAllTweetsForViewer":
          this.getAllTweetsForViewer().then((tweets) => {
            sendResponse({ tweets });
          });
          return true;

        case "setAutoScrollPreference":
          this.setAutoScrollPreference(message.enabled, message.pageContext, message.speedIndex);
          sendResponse({ success: true });
          break;

        case "updateAutoScrollSpeed":
          this.updateAutoScrollSpeed(message.speedIndex);
          sendResponse({ success: true });
          break;

        case "getAutoScrollStatus":
          sendResponse({
            success: true,
            status: this.autoScroller ? this.autoScroller.getStatus() : null,
          });
          break;

        default:
          sendResponse({ error: "Unknown action" });
      }
    });
  }

  // Start capture process
  async startCapture() {
    try {
      if (this.isCapturing) {
        debugLog("Capture already in progress");
        return;
      }

      const context = this.getPageContext();
      if (context.type === "unknown") {
        debugLog("Cannot start capture on unsupported page");
        return;
      }

      debugLog("Starting capture for:", context);

      // Create new capture session
      if (!window.twitterDB) {
        window.twitterDB = new TwitterDatabase();
        await window.twitterDB.init();
      }

      this.currentSession = await window.twitterDB.createCaptureSession(
        context.type,
        context
      );

      // Reset capture state
      this.isCapturing = true;
      this.capturedTweetIds.clear();
      this.firstAPICaptured = false;

      // Start stats update interval
      this.startStatsUpdateInterval();

      // Notify popup
      this.notifyPopup("captureStarted", {
        context,
        sessionId: this.currentSession,
      });

      debugLog("Capture started successfully");
    } catch (error) {
      console.error("Error starting capture:", {
        error: error,
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
      });
    }
  }

  // Stop capture process
  async stopCapture() {
    try {
      if (!this.isCapturing) {
        debugLog("No capture in progress");
        return;
      }

      debugLog("Stopping capture");

      // Stop auto-scroll if active
      if (this.autoScroller && this.autoScroller.isActive) {
        this.stopAutoScroll();
      }

      this.isCapturing = false;

      // Stop stats updates
      if (this.statsUpdateInterval) {
        clearInterval(this.statsUpdateInterval);
        this.statsUpdateInterval = null;
      }

      // Update session status
      if (this.currentSession && window.twitterDB) {
        await window.twitterDB.updateCaptureSession(this.currentSession, {
          status: "completed",
          tweet_count: this.capturedTweetIds.size,
          completed_at: new Date(),
        });
      }

      // Notify popup
      this.notifyPopup("captureStopped", {
        tweetCount: this.capturedTweetIds.size,
        sessionId: this.currentSession,
      });

      this.currentSession = null;

      debugLog("Capture stopped successfully");
    } catch (error) {
      console.error("Error stopping capture:", error);
    }
  }

  // Get current page context
  getPageContext() {
    return detectPageContext();
  }

  // Update page context when URL changes
  updatePageContext() {
    this.pageContext = this.getPageContext();
    this.notifyPopup("contextChanged", { context: this.pageContext });
  }

  // Set up detection of page changes (for SPAs)
  setupPageChangeDetection() {
    let lastUrl = location.href;

    const checkUrlChange = () => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        debugLog("Page URL changed:", currentUrl);
        this.updatePageContext();
      }
    };

    // Check for URL changes periodically
    setInterval(checkUrlChange, 1000);

    // Also listen for browser navigation events
    window.addEventListener("popstate", checkUrlChange);

    // Override pushState and replaceState to catch programmatic navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(history, args);
      setTimeout(checkUrlChange, 100);
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(history, args);
      setTimeout(checkUrlChange, 100);
    };
  }

  // Get capture statistics
  async getCaptureStats() {
    try {
      if (!window.twitterDB) {
        window.twitterDB = new TwitterDatabase();
        await window.twitterDB.init();
      }

      const totalCount = await window.twitterDB.getTotalTweetCount();
      const countsBySource = await window.twitterDB.getTweetCountBySource();
      const uniqueAuthors = await window.twitterDB.getUniqueAuthorCount();

      return {
        total: totalCount,
        bySource: countsBySource,
        uniqueAuthors: uniqueAuthors,
        currentSession: {
          isActive: this.isCapturing,
          sessionId: this.currentSession,
          capturedCount: this.capturedTweetIds.size,
        },
      };
    } catch (error) {
      console.error("Error getting capture stats:", {
        error: error,
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
      });
      return {
        total: 0,
        bySource: {},
        uniqueAuthors: 0,
        currentSession: { isActive: false, capturedCount: 0 },
      };
    }
  }

  // Update capture statistics during active session
  async updateCaptureStats(newTweetCount) {
    if (this.currentSession && window.twitterDB) {
      await window.twitterDB.updateCaptureSession(this.currentSession, {
        tweet_count: this.capturedTweetIds.size,
      });
    }
  }

  // Start periodic stats updates during capture
  startStatsUpdateInterval() {
    this.statsUpdateInterval = setInterval(async () => {
      if (this.isCapturing) {
        const stats = await this.getCaptureStats();
        this.notifyPopup("statsUpdated", { stats });
      }
    }, 2000); // Update every 2 seconds
  }

  // Notify popup of progress
  notifyProgress(newTweetCount, sourceType) {
    this.notifyPopup("captureProgress", {
      newTweets: newTweetCount,
      totalCaptured: this.capturedTweetIds.size,
      sourceType: sourceType,
    });
  }

  // Send message to popup
  notifyPopup(type, data) {
    try {
      chrome.runtime
        .sendMessage({
          type: type,
          data: data,
          timestamp: new Date().toISOString(),
        })
        .catch((error) => {
          // Popup might not be open, that's okay
          debugLog("Could not notify popup:", error.message);
        });
    } catch (error) {
      debugLog("Error notifying popup:", error);
    }
  }

  // Clear all stored data
  async clearAllData() {
    try {
      if (!window.twitterDB) {
        window.twitterDB = new TwitterDatabase();
        await window.twitterDB.init();
      }

      await window.twitterDB.clearAllData();
      this.capturedTweetIds.clear();
      debugLog("All data cleared");
    } catch (error) {
      console.error("Error clearing data:", error);
    }
  }

  // Get all tweets for data viewer
  async getAllTweetsForViewer() {
    try {
      debugLog("Getting all tweets for data viewer");

      if (!window.twitterDB) {
        window.twitterDB = new TwitterDatabase();
        await window.twitterDB.init();
      }

      const tweets = await window.twitterDB.getTweetsBySource(null, 1000); // Get all tweets
      debugLog(`Returning ${tweets.length} tweets to data viewer`);
      return tweets;
    } catch (error) {
      console.error("Error getting tweets for viewer:", error);
      return [];
    }
  }

  // Auto-scroll functionality
  async setAutoScrollPreference(enabled, pageContext, speedIndex = 2) {
    try {
      this.autoScrollPreference = enabled;
      this.autoScrollSpeedIndex = speedIndex;
      debugLog("Auto-scroll preference set:", { enabled, pageContext, speedIndex });

      if (!enabled && this.autoScroller && this.autoScroller.isActive) {
        // If disabled and currently scrolling, stop it
        this.stopAutoScroll();
      }
    } catch (error) {
      console.error("Error setting auto-scroll preference:", error);
    }
  }

  updateAutoScrollSpeed(speedIndex) {
    try {
      this.autoScrollSpeedIndex = speedIndex;
      debugLog("Auto-scroll speed updated:", speedIndex);
      
      // Update active auto-scroller if running
      if (this.autoScroller && this.autoScroller.isActive) {
        this.autoScroller.updateSpeed(speedIndex);
      }
    } catch (error) {
      console.error("Error updating auto-scroll speed:", error);
    }
  }

  async checkAutoScrollPreference() {
    try {
      // Use chrome.storage.local because chrome.storage.session is not accessible from content scripts
      const result = await chrome.storage.local.get(["autoScrollEnabled", "autoScrollSpeedIndex"]);
      this.autoScrollPreference = result.autoScrollEnabled || false;
      
      // Load speed index
      if (result.autoScrollSpeedIndex !== undefined) {
        this.autoScrollSpeedIndex = result.autoScrollSpeedIndex;
      }
      
      debugLog("Auto-scroll preference loaded:", { 
        enabled: this.autoScrollPreference, 
        speedIndex: this.autoScrollSpeedIndex 
      });
    } catch (error) {
      debugLog("No auto-scroll preference found:", error);
      this.autoScrollPreference = false;
      this.autoScrollSpeedIndex = 2;
    }
  }

  startAutoScrollAfterFirstCapture() {
    try {
      if (this.autoScroller && this.autoScroller.isActive) {
        debugLog("Auto-scroll already active");
        return;
      }

      const pageContext = this.getPageContext();
      if (pageContext.type === "unknown") {
        debugLog("Cannot start auto-scroll on unsupported page");
        this.notifyPopup("autoScrollStopped", { reason: "unsupported_page" });
        return;
      }

      debugLog("Starting auto-scroll after first API capture");

      // Create auto-scroller instance with user-selected speed index
      const autoScrollConfig = {
        scrollDistance: 10000,
        maxRetries: 3,
        pageContext: pageContext,
        speedIndex: this.autoScrollSpeedIndex || 2,
        onStart: (data) => {
          debugLog("Auto-scroll started:", data);
          this.notifyPopup("autoScrollStarted", data);
        },
        onStop: (data) => {
          debugLog("Auto-scroll stopped:", data);
          this.notifyPopup("autoScrollStopped", data);
          this.autoScroller = null;
        },
        onProgress: (data) => {
          this.notifyPopup("autoScrollProgress", data);
        },
        onAPIActivity: (data) => {
          debugLog("Auto-scroll detected API activity:", data);
        },
      };

      this.autoScroller = new AutoScroller(autoScrollConfig);
      const started = this.autoScroller.start();

      if (!started) {
        this.notifyPopup("autoScrollStopped", { reason: "failed_to_start" });
      }
    } catch (error) {
      console.error("Error starting auto-scroll:", error);
      this.notifyPopup("autoScrollStopped", {
        reason: "error",
        error: error.message,
      });
    }
  }

  stopAutoScroll() {
    try {
      if (!this.autoScroller || !this.autoScroller.isActive) {
        debugLog("Auto-scroll not active");
        return;
      }

      debugLog("Stopping auto-scroll");
      this.autoScroller.stop("manual");
      this.autoScroller = null;
    } catch (error) {
      console.error("Error stopping auto-scroll:", error);
    }
  }

  // Notify auto-scroller of API activity
  notifyAutoScrollerOfAPIActivity(url, responseText, apiType) {
    if (this.autoScroller && this.autoScroller.isActive) {
      this.autoScroller.onAPICall(url, responseText, apiType);
    }
  }
}

// Initialize content script when DOM is ready
let twitterCollector;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    twitterCollector = new TwitterCollectorContentScript();
  });
} else {
  twitterCollector = new TwitterCollectorContentScript();
}

// Handle context menu activation
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "startSmartCapture") {
    if (twitterCollector) {
      twitterCollector.startCapture();
      sendResponse({ success: true });
    } else {
      sendResponse({ error: "Content script not ready" });
    }
  }
});
