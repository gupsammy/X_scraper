// Extension Bridge - Handles communication with background script and content scripts
export class ExtensionBridge {
  constructor() {
    this.isExtensionContext = typeof chrome !== 'undefined' && chrome.runtime;
  }

  async getAllTweetsFromBackground() {
    if (!this.isExtensionContext) return null;

    try {
      const response = await chrome.runtime.sendMessage({
        type: "getAllTweets",
      });
      return response?.tweets || null;
    } catch (error) {
      console.warn("Background script communication failed:", error);
      return null;
    }
  }

  async getAllTweetsFromContentScript() {
    if (!this.isExtensionContext) return null;

    try {
      const tabs = await chrome.tabs.query({
        url: ["*://twitter.com/*", "*://x.com/*"],
      });

      if (tabs.length === 0) return null;

      const response = await chrome.tabs.sendMessage(tabs[0].id, {
        action: "getAllTweetsForViewer",
      });
      return response?.tweets || null;
    } catch (error) {
      console.warn("Content script communication failed:", error);
      return null;
    }
  }

  async deleteTweetViaBackground(tweetId) {
    if (!this.isExtensionContext) return { success: false };

    try {
      const response = await chrome.runtime.sendMessage({
        type: "deleteTweet",
        tweetId
      });
      return response || { success: false };
    } catch (error) {
      console.warn("Background delete failed:", error);
      return { success: false };
    }
  }

  async clearAllDataViaBackground() {
    if (!this.isExtensionContext) return { success: false };

    try {
      const response = await chrome.runtime.sendMessage({
        type: "clearAllData"
      });
      return response || { success: false };
    } catch (error) {
      console.warn("Background clear failed:", error);
      return { success: false };
    }
  }
}