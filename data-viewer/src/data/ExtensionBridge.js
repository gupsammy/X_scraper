// Extension Bridge - Handles communication with background script and content scripts
export class ExtensionBridge {
  constructor() {
    this.isExtensionContext = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
    console.log("ExtensionBridge: Extension context detected:", this.isExtensionContext);
    console.log("ExtensionBridge: chrome object:", typeof chrome);
    console.log("ExtensionBridge: chrome.runtime:", typeof chrome?.runtime);
    console.log("ExtensionBridge: chrome.runtime.sendMessage:", typeof chrome?.runtime?.sendMessage);
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
    if (!this.isExtensionContext) {
      console.log("ExtensionBridge: Not in extension context");
      return { success: false };
    }

    console.log("ExtensionBridge: Sending delete tweet message to background script:", tweetId);
    
    try {
      // Check if runtime is still valid
      if (chrome.runtime.lastError) {
        console.warn("ExtensionBridge: Chrome runtime error detected:", chrome.runtime.lastError);
        return { success: false };
      }

      const response = await chrome.runtime.sendMessage({
        type: "deleteTweet",
        tweetId
      });
      
      console.log("ExtensionBridge: Received response from background script:", response);
      
      // Check for runtime errors after message
      if (chrome.runtime.lastError) {
        console.warn("ExtensionBridge: Chrome runtime error after message:", chrome.runtime.lastError);
        return { success: false };
      }
      
      // Properly handle the response - background script sends { success: true/false }
      if (response && typeof response.success === 'boolean') {
        console.log("ExtensionBridge: Valid response received, success:", response.success);
        return response;
      }
      
      console.warn("ExtensionBridge: Invalid response from background script:", response);
      return { success: false };
    } catch (error) {
      console.warn("ExtensionBridge: Background delete failed:", error);
      console.warn("ExtensionBridge: Chrome runtime lastError:", chrome.runtime.lastError);
      return { success: false };
    }
  }

  async clearAllDataViaBackground() {
    if (!this.isExtensionContext) {
      console.log("ExtensionBridge: Not in extension context");
      return { success: false };
    }

    console.log("ExtensionBridge: Sending clear all data message to background script");
    
    try {
      // Check if runtime is still valid
      if (chrome.runtime.lastError) {
        console.warn("ExtensionBridge: Chrome runtime error detected:", chrome.runtime.lastError);
        return { success: false };
      }

      const response = await chrome.runtime.sendMessage({
        type: "clearAllData"
      });
      
      console.log("ExtensionBridge: Received response from background script:", response);
      
      // Check for runtime errors after message
      if (chrome.runtime.lastError) {
        console.warn("ExtensionBridge: Chrome runtime error after message:", chrome.runtime.lastError);
        return { success: false };
      }
      
      // Properly handle the response - background script sends { success: true/false }
      if (response && typeof response.success === 'boolean') {
        console.log("ExtensionBridge: Valid response received, success:", response.success);
        return response;
      }
      
      console.warn("ExtensionBridge: Invalid response from background script:", response);
      return { success: false };
    } catch (error) {
      console.warn("ExtensionBridge: Background clear failed:", error);
      console.warn("ExtensionBridge: Chrome runtime lastError:", chrome.runtime.lastError);
      return { success: false };
    }
  }
}