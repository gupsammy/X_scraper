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

        case "clearData":
          this.clearAllData().then(() => {
            sendResponse({ success: true });
          });
          return true;

        case "getAllTweetsForViewer":
          this.getAllTweetsForViewer().then((tweets) => {
            sendResponse({ tweets });
          });
          return true;

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

      return {
        total: totalCount,
        bySource: countsBySource,
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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startSmartCapture") {
    if (twitterCollector) {
      twitterCollector.startCapture();
      sendResponse({ success: true });
    } else {
      sendResponse({ error: "Content script not ready" });
    }
  }
});
