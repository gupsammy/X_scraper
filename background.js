// Add shared DB module so background and extension pages use same IndexedDB
importScripts("js/database.js");

// Background service worker for Twitter Collector extension
class TwitterCollectorBackground {
  constructor() {
    // Create shared DB instance (extension origin)
    this.twitterDB = new TwitterDatabase();
    this.twitterDB.init().catch((e) => {
      console.error("Background DB init failed", e);
    });

    this.init();
    // Track active capture sessions by tabId so we can resume after page reloads
    this.activeCaptures = {}; // { [tabId: number]: { context: any } }
  }

  init() {
    console.log("Twitter Collector background script initialized");

    // Set up event listeners
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstalled(details);
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.handleContextMenuClick(info, tab);
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });

    // Set up context menu
    this.createContextMenu();

    // Resume capture automatically when a tab that was capturing finishes loading again
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && this.activeCaptures[tabId]) {
        // Ensure it's still a Twitter page
        if (this.isTwitterPage(tab.url)) {
          console.log("Tab reloaded, resuming capture:", tab.url);
          this.sendMessageToContentScript(tabId, { action: "startCapture" });
        }
      }
    });
  }

  handleInstalled(details) {
    console.log("Extension installed/updated:", details.reason);

    if (details.reason === "install") {
      console.log("First time installation - setting up context menu");
    } else if (details.reason === "update") {
      console.log(
        "Extension updated to version:",
        chrome.runtime.getManifest().version
      );
    }

    this.createContextMenu();
  }

  createContextMenu() {
    // Remove existing menu items
    chrome.contextMenus.removeAll(() => {
      // Create context menu for Twitter pages
      chrome.contextMenus.create({
        id: "twitter-smart-capture",
        title: "Capture Tweets",
        contexts: ["page"],
        documentUrlPatterns: ["*://twitter.com/*", "*://x.com/*"],
      });

      // Create submenu for different capture types
      chrome.contextMenus.create({
        id: "capture-bookmarks",
        parentId: "twitter-smart-capture",
        title: "Capture Bookmarks",
        contexts: ["page"],
        documentUrlPatterns: [
          "*://twitter.com/i/bookmarks*",
          "*://x.com/i/bookmarks*",
        ],
      });

      chrome.contextMenus.create({
        id: "capture-user-tweets",
        parentId: "twitter-smart-capture",
        title: "Capture User Tweets",
        contexts: ["page"],
        documentUrlPatterns: [
          "*://twitter.com/*/status/*",
          "*://twitter.com/*",
          "*://x.com/*/status/*",
          "*://x.com/*",
        ],
      });

      chrome.contextMenus.create({
        id: "smart-capture-auto",
        parentId: "twitter-smart-capture",
        title: "Smart Capture (Auto-detect)",
        contexts: ["page"],
        documentUrlPatterns: ["*://twitter.com/*", "*://x.com/*"],
      });

      console.log("Context menu created successfully");
    });
  }

  handleContextMenuClick(info, tab) {
    console.log("Context menu clicked:", info.menuItemId, "on tab:", tab.url);

    if (!tab.id) {
      console.error("No valid tab ID");
      return;
    }

    // Check if we're on a Twitter page
    if (!this.isTwitterPage(tab.url)) {
      console.log("Not a Twitter page, ignoring context menu click");
      return;
    }

    // Send message to content script
    switch (info.menuItemId) {
      case "twitter-smart-capture":
      case "smart-capture-auto":
        this.sendMessageToContentScript(tab.id, {
          action: "startSmartCapture",
        });
        break;

      case "capture-bookmarks":
        this.sendMessageToContentScript(tab.id, {
          action: "startCapture",
          sourceType: "bookmarks",
        });
        break;

      case "capture-user-tweets":
        this.sendMessageToContentScript(tab.id, {
          action: "startCapture",
          sourceType: "userTweets",
        });
        break;

      default:
        console.log("Unknown context menu item:", info.menuItemId);
    }
  }

  handleMessage(message, sender, sendResponse) {
    console.log("Background received message:", message);

    switch (message.type) {
      case "captureStarted":
        console.log("Capture started:", message.data);
        if (sender.tab && sender.tab.id != null) {
          this.activeCaptures[sender.tab.id] = {
            context: message.data?.context || null,
          };
        }
        // Could show notification here
        break;

      case "captureStopped":
        console.log("Capture stopped:", message.data);
        if (sender.tab && sender.tab.id != null) {
          delete this.activeCaptures[sender.tab.id];
        }
        // Could show completion notification
        this.showNotification(
          "Capture Complete",
          `Captured ${message.data.tweetCount} tweets`
        );
        break;

      case "captureProgress":
        console.log("Capture progress:", message.data);
        break;

      case "error":
        console.error("Content script error:", message.data);
        break;

      // Content script asking if capture should resume after page reload
      case "getCaptureStatus":
        if (sender.tab && sender.tab.id != null) {
          const isCapturing = !!this.activeCaptures[sender.tab.id];
          sendResponse({ isCapturing });
        }
        break;

      case "storeTweets": {
        // Persist tweets coming from content script in extension-scoped DB so viewer can access them.
        (async () => {
          try {
            const tweets = Array.isArray(message.tweets) ? message.tweets : [];
            if (tweets.length > 0) {
              await this.twitterDB.storeTweets(tweets);
              console.log(`Stored ${tweets.length} tweets from CS in BG DB`);
            }
            sendResponse({ success: true, stored: tweets.length });
          } catch (err) {
            console.error("Failed to store tweets in BG DB", err);
            sendResponse({
              success: false,
              error: err?.message || String(err),
            });
          }
        })();
        return true; // keep channel open for async response
      }

      case "getAllTweets": {
        (async () => {
          try {
            const tweets = await this.twitterDB.getTweetsBySource(null, 10000);
            sendResponse({ tweets });
          } catch (err) {
            console.error("Failed to fetch tweets from BG DB", err);
            sendResponse({ error: err?.message || String(err) });
          }
        })();
        return true;
      }

      case "deleteTweet": {
        (async () => {
          try {
            if (message.tweetId) {
              await this.twitterDB.deleteTweet(message.tweetId);
              console.log("Deleted tweet from BG DB", message.tweetId);
              // Inform all Twitter tabs so they can sync their own DBs
              this.broadcastToTwitterTabs({
                action: "deleteTweet",
                tweetId: message.tweetId,
              });
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: "No tweetId provided" });
            }
          } catch (err) {
            console.error("Failed to delete tweet in BG DB", err);
            sendResponse({
              success: false,
              error: err?.message || String(err),
            });
          }
        })();
        return true; // keep channel open for async response
      }

      case "clearAllData": {
        (async () => {
          try {
            await this.twitterDB.clearAllData();
            console.log("Cleared all data in BG DB");
            // Invalidate data in content scripts as well
            this.broadcastToTwitterTabs({ action: "clearAllData" });
            sendResponse({ success: true });
          } catch (err) {
            console.error("Failed to clear all data in BG DB", err);
            sendResponse({
              success: false,
              error: err?.message || String(err),
            });
          }
        })();
        return true;
      }

      case "getGlobalStats": {
        (async () => {
          try {
            const total = await this.twitterDB.getTotalTweetCount();
            const bySource = await this.twitterDB.getTweetCountBySource();
            const anyActiveCaptures =
              Object.keys(this.activeCaptures).length > 0;
            sendResponse({ stats: { total, bySource, anyActiveCaptures } });
          } catch (err) {
            console.error("Failed to get global stats", err);
            sendResponse({ error: err?.message || String(err) });
          }
        })();
        return true;
      }

      default:
        console.log("Unknown message type:", message.type);
    }
  }

  sendMessageToContentScript(tabId, message) {
    chrome.tabs
      .sendMessage(tabId, message)
      .then((response) => {
        console.log("Message sent to content script, response:", response);
      })
      .catch((error) => {
        console.error("Error sending message to content script:", error);
        // Try to inject content script if it's not loaded
        this.injectContentScript(tabId, message);
      });
  }

  // Inject content script if not already loaded
  injectContentScript(tabId, pendingMessage) {
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        files: [
          "js/database.js",
          "js/data-extractor.js",
          "js/utils.js",
          "content-script.js",
        ],
      })
      .then(() => {
        console.log("Content script injected successfully");
        // Wait a bit for initialization then send the message
        setTimeout(() => {
          this.sendMessageToContentScript(tabId, pendingMessage);
        }, 1000);
      })
      .catch((error) => {
        console.error("Error injecting content script:", error);
      });
  }

  isTwitterPage(url) {
    return url && (url.includes("twitter.com") || url.includes("x.com"));
  }

  showNotification(title, message) {
    // Show browser notification (optional)
    if (chrome.notifications) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: title,
        message: message,
      });
    }
  }

  // Handle extension lifecycle
  onSuspend() {
    console.log("Background script suspending");
  }

  onStartup() {
    console.log("Background script starting up");
  }

  // Utility to send a message to all open Twitter tabs
  broadcastToTwitterTabs(payload) {
    chrome.tabs.query({ url: ["*://twitter.com/*", "*://x.com/*"] }, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
        }
      });
    });
  }
}

// Initialize background script
const twitterCollectorBackground = new TwitterCollectorBackground();

// Handle extension lifecycle events
chrome.runtime.onSuspend.addListener(() => {
  twitterCollectorBackground.onSuspend();
});

chrome.runtime.onStartup.addListener(() => {
  twitterCollectorBackground.onStartup();
});
