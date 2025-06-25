// Utility functions for Twitter Collector Extension

// Generate unique session ID for tracking capture sessions
function generateSessionId() {
  return (
    "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
  );
}

// Detect the current page context (bookmarks, user profile, etc.)
function detectPageContext() {
  const url = window.location.href;
  const pathname = window.location.pathname;

  console.log("Detecting page context for:", url);

  if (url.includes("/bookmarks")) {
    return {
      type: "bookmarks",
      displayName: "Bookmarks Page",
      description: "Ready to capture bookmarks",
    };
  }

  if (url.includes("/search?q=")) {
    const searchParams = new URLSearchParams(window.location.search);
    const query = searchParams.get("q");
    return {
      type: "search",
      displayName: "Search Results",
      description: `Ready to capture search: "${query}"`,
      query: query,
    };
  }

  // Check for user profile (e.g., /username but not /username/status/xxx)
  const userProfileMatch = pathname.match(/^\/([^\/]+)$/);
  if (
    userProfileMatch &&
    !pathname.includes("/status/") &&
    !pathname.includes("/i/")
  ) {
    const username = userProfileMatch[1];
    return {
      type: "usertweets",
      displayName: `@${username} Profile`,
      description: "Ready to capture user tweets",
      username: username,
    };
  }

  return {
    type: "unknown",
    displayName: "Unsupported Page",
    description: "Navigate to Bookmarks, Profile, or Search",
  };
}

// Construct tweet URL from user handle and tweet ID
function constructTweetUrl(screenName, tweetId) {
  return `https://twitter.com/${screenName}/status/${tweetId}`;
}

// Parse Twitter date format to JavaScript Date
function parseTwitterDate(twitterDate) {
  // Twitter dates come in format: "Wed Oct 05 20:11:47 +0000 2022"
  return new Date(twitterDate);
}

// Format date for display
function formatDateForDisplay(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

// Extract request information from GraphQL URL
function extractRequestInfo(url) {
  try {
    const urlObj = new URL(url);
    const variables = JSON.parse(urlObj.searchParams.get("variables") || "{}");
    const features = JSON.parse(urlObj.searchParams.get("features") || "{}");

    return {
      count: variables.count || 20,
      cursor: variables.cursor || null,
      userId: variables.userId || null,
      query: variables.query || null,
      variables: variables,
      features: features,
    };
  } catch (error) {
    console.error("Error parsing request info:", error);
    return {};
  }
}

// Check if URL matches any of our target API patterns
function matchesAPIPattern(url) {
  const API_PATTERNS = {
    bookmarks: /\/i\/api\/graphql\/[^\/]+\/Bookmarks/i,
    userTweets: /\/i\/api\/graphql\/[^\/]+\/UserTweets/i,
    searchResults: /\/i\/api\/graphql\/[^\/]+\/SearchTimeline/i,
    homeTimeline: /\/i\/api\/graphql\/[^\/]+\/HomeTimeline/i,
  };

  for (const [apiType, pattern] of Object.entries(API_PATTERNS)) {
    if (pattern.test(url)) {
      return { type: apiType, pattern: pattern };
    }
  }

  return null;
}

// Debounce function for performance optimization
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle function for API calls
function throttle(func, limit) {
  let inThrottle;
  return function () {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Escape HTML entities for safe display
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Decode HTML entities to readable text
function decodeHtmlEntities(text) {
  if (!text) return "";

  // Create a temporary element to decode HTML entities safely
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

// Format numbers (e.g., 1234 -> 1.2K)
function formatNumber(num) {
  if (!num || isNaN(num)) return "0";

  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

// Check if running in extension context
function isExtensionContext() {
  return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id;
}

// Safe JSON parse with error handling
function safeJSONParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("JSON parse error:", error);
    return defaultValue;
  }
}

// Get cursor from API response for pagination
function getCursorFromResponse(data, sourceType) {
  try {
    if (sourceType === "bookmarks") {
      const instructions =
        data?.data?.bookmark_timeline_v2?.timeline?.instructions || [];
      for (const instruction of instructions) {
        if (instruction.type === "TimelineAddEntries") {
          const entries = instruction.entries || [];
          const cursorEntry = entries.find(
            (entry) =>
              entry.content?.__typename === "TimelineTimelineCursor" &&
              entry.content?.cursorType === "Bottom"
          );
          return cursorEntry?.content?.value || null;
        }
      }
    } else if (sourceType === "userTweets") {
      const instructions =
        data?.data?.user?.result?.timeline?.timeline?.instructions || [];
      for (const instruction of instructions) {
        if (instruction.type === "TimelineAddEntries") {
          const entries = instruction.entries || [];
          const cursorEntry = entries.find(
            (entry) =>
              entry.content?.__typename === "TimelineTimelineCursor" &&
              entry.content?.cursorType === "Bottom"
          );
          return cursorEntry?.content?.value || null;
        }
      }
    }
  } catch (error) {
    console.error("Error extracting cursor:", error);
  }

  return null;
}

// Log with timestamp for debugging
function debugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[Twitter Collector ${timestamp}] ${message}`, data || "");
}

// Export functions for use in other modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    generateSessionId,
    detectPageContext,
    constructTweetUrl,
    parseTwitterDate,
    formatDateForDisplay,
    extractRequestInfo,
    matchesAPIPattern,
    debounce,
    throttle,
    escapeHtml,
    decodeHtmlEntities,
    formatNumber,
    isExtensionContext,
    safeJSONParse,
    getCursorFromResponse,
    debugLog,
  };
}
