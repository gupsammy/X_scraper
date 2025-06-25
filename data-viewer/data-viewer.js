// Twitter Collector Data Viewer JavaScript
class TwitterDataViewer {
  constructor() {
    this.tweets = [];
    this.filteredTweets = [];
    this.displayedTweets = [];
    this.currentPage = 0;
    this.pageSize = 20;
    this.filters = {
      source: "all",
      search: "",
      sort: "created_at_desc",
    };
    this.db = null;

    this.init();
  }

  async init() {
    console.log("Initializing Twitter Data Viewer");

    try {
      // Set up event listeners
      this.setupEventListeners();

      // Load tweets from database
      await this.loadTweets();

      console.log("Data viewer initialized successfully");
    } catch (error) {
      console.error("Error initializing data viewer:", error);
      this.showError("Failed to initialize data viewer");
    }
  }

  setupEventListeners() {
    // Filter controls
    const sourceFilter = document.getElementById("source-filter");
    const searchInput = document.getElementById("search-input");
    const sortSelect = document.getElementById("sort-select");
    const clearFiltersBtn = document.getElementById("clear-filters");

    sourceFilter.addEventListener("change", (e) => {
      this.filters.source = e.target.value;
      this.applyFilters();
    });

    searchInput.addEventListener(
      "input",
      this.debounce((e) => {
        this.filters.search = e.target.value;
        this.applyFilters();
      }, 300)
    );

    sortSelect.addEventListener("change", (e) => {
      this.filters.sort = e.target.value;
      this.applyFilters();
    });

    clearFiltersBtn.addEventListener("click", () => {
      this.clearFilters();
    });

    // Pagination
    const loadMoreBtn = document.getElementById("load-more");
    loadMoreBtn.addEventListener("click", () => {
      this.loadMoreTweets();
    });

    // Footer actions
    const clearAllDataBtn = document.getElementById("clear-all-data");
    const exportAllDataBtn = document.getElementById("export-all-data");
    const goToTwitterBtn = document.getElementById("go-to-twitter");

    clearAllDataBtn.addEventListener("click", () => {
      this.confirmClearAllData();
    });

    exportAllDataBtn.addEventListener("click", () => {
      this.exportAllData();
    });

    if (goToTwitterBtn) {
      goToTwitterBtn.addEventListener("click", () => {
        window.open("https://twitter.com", "_blank");
      });
    }
  }

  async loadTweets() {
    this.showLoading(true);

    try {
      console.log("Debug: Attempting to load tweets...");

      // Try to get tweets from the same IndexedDB that the content script uses
      let tweets = [];

      try {
        // First attempt: Direct IndexedDB access
        console.log("Debug: Trying direct IndexedDB access...");
        const db = await this.openDatabase();
        tweets = await this.getAllTweets(db);
        console.log(`Debug: Direct access found ${tweets.length} tweets`);
      } catch (directError) {
        console.log("Debug: Direct access failed:", directError);

        // Second attempt: Try background script (extension scoped DB)
        try {
          console.log("Debug: Trying background script fetch...");
          const bgResponse = await chrome.runtime.sendMessage({
            type: "getAllTweets",
          });
          if (bgResponse && bgResponse.tweets) {
            tweets = bgResponse.tweets;
            console.log(
              `Debug: Background script returned ${tweets.length} tweets`
            );
          }
        } catch (bgErr) {
          console.log("Debug: Background script fetch failed:", bgErr);
        }

        // Third attempt: Find a Twitter tab and ask its content script for data
        if (tweets.length === 0) {
          try {
            console.log("Debug: Trying content script communication...");
            const tabs = await chrome.tabs.query({
              url: ["*://twitter.com/*", "*://x.com/*"],
            });
            console.log(`Debug: Found ${tabs.length} Twitter tabs`);

            if (tabs.length > 0) {
              const response = await chrome.tabs.sendMessage(tabs[0].id, {
                action: "getAllTweetsForViewer",
              });
              if (response && response.tweets) {
                tweets = response.tweets;
                console.log(
                  `Debug: Content script returned ${tweets.length} tweets`
                );
              }
            } else {
              console.log("Debug: No Twitter tabs found");
            }
          } catch (commError) {
            console.log(
              "Debug: Content script communication failed:",
              commError
            );
          }
        }
      }

      console.log(`Debug: Found ${tweets.length} tweets in database`);
      if (tweets.length > 0) {
        console.log("Debug: First tweet structure:", tweets[0]);
        console.log("Debug: Tweet field names:", Object.keys(tweets[0]));
      }

      this.tweets = tweets;
      this.applyFilters();

      console.log(`Loaded ${tweets.length} tweets`);
    } catch (error) {
      console.error("Error loading tweets:", error);
      this.showError("Failed to load tweets from database");
    } finally {
      this.showLoading(false);
    }
  }

  async openDatabase() {
    if (this.db && this.db.readyState !== "closed") {
      console.log("Debug: Reusing existing database connection");
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open("TwitterCollector", 1);

      console.log("Debug: Opening database...");

      // If the database needs to be created or upgraded, ensure the tweets store exists
      request.onupgradeneeded = (e) => {
        console.log("Debug: Database upgrade needed");
        const db = e.target.result;

        if (!db.objectStoreNames.contains("tweets")) {
          console.log("Debug: Creating tweets object store");
          const tweetsStore = db.createObjectStore("tweets", {
            keyPath: "id",
          });

          // Minimal indexes so viewer can query efficiently (match those in main DB)
          tweetsStore.createIndex("source_category", "source_category", {
            unique: false,
          });
          tweetsStore.createIndex("created_at", "created_at", {
            unique: false,
          });
          tweetsStore.createIndex("author_screen_name", "author_screen_name", {
            unique: false,
          });
        } else {
          console.log("Debug: Tweets object store already exists");
        }
      };

      request.onsuccess = () => {
        console.log("Debug: Database opened successfully");
        this.db = request.result;
        resolve(request.result);
      };

      request.onerror = () => {
        console.error("Debug: Failed to open database:", request.error);
        reject(request.error);
      };
    });
  }

  async getAllTweets(db) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["tweets"], "readonly");
      const store = transaction.objectStore("tweets");
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  applyFilters() {
    if (!this.tweets || this.tweets.length === 0) {
      console.log("Debug: No tweets to filter");
      this.filteredTweets = [];
      this.displayTweets();
      return;
    }

    let filtered = [...this.tweets];

    // Apply source filter
    if (this.filters.source !== "all") {
      filtered = filtered.filter(
        (tweet) => tweet.source_category === this.filters.source
      );
    }

    // Apply search filter
    if (this.filters.search) {
      const searchTerm = this.filters.search.toLowerCase();
      filtered = filtered.filter(
        (tweet) =>
          (tweet.full_text &&
            tweet.full_text.toLowerCase().includes(searchTerm)) ||
          (tweet.author_name &&
            tweet.author_name.toLowerCase().includes(searchTerm)) ||
          (tweet.author_screen_name &&
            tweet.author_screen_name.toLowerCase().includes(searchTerm))
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (this.filters.sort) {
        case "created_at_desc":
          return new Date(b.created_at) - new Date(a.created_at);
        case "created_at_asc":
          return new Date(a.created_at) - new Date(b.created_at);
        case "like_count_desc":
          return (b.like_count || 0) - (a.like_count || 0);
        case "retweet_count_desc":
          return (b.retweet_count || 0) - (a.retweet_count || 0);
        case "author_name_asc":
          return (a.author_name || "").localeCompare(b.author_name || "");
        default:
          return 0;
      }
    });

    this.filteredTweets = filtered;
    this.currentPage = 0;
    this.displayTweets();
  }

  displayTweets() {
    const container = document.getElementById("tweets-container");
    const loadingState = document.getElementById("loading-state");
    const emptyState = document.getElementById("empty-state");
    const pagination = document.getElementById("pagination");

    console.log(
      `Debug: displayTweets called with ${this.filteredTweets.length} filtered tweets`
    );

    if (this.filteredTweets.length === 0) {
      console.log("Debug: No filtered tweets, showing empty state");
      this.showEmptyState();
      return;
    }

    // Show tweets container
    loadingState.style.display = "none";
    emptyState.style.display = "none";
    container.style.display = "block";
    pagination.style.display = "block";

    // Reset container for fresh render
    if (this.currentPage === 0) {
      container.innerHTML = "";
      this.displayedTweets = [];
    }

    // Calculate tweets to display
    const startIndex = this.currentPage * this.pageSize;
    const endIndex = Math.min(
      startIndex + this.pageSize,
      this.filteredTweets.length
    );
    const tweetsToShow = this.filteredTweets.slice(startIndex, endIndex);

    console.log(
      `Debug: Displaying tweets ${startIndex} to ${endIndex}, total: ${tweetsToShow.length}`
    );

    // Render tweet cards
    tweetsToShow.forEach((tweet) => {
      const tweetCard = this.createTweetCard(tweet);
      container.appendChild(tweetCard);
      this.displayedTweets.push(tweet);
    });

    // Update UI elements
    this.updateCounts();
    this.updatePagination();
  }

  createTweetCard(tweet) {
    const template = document.getElementById("tweet-card-template");
    const card = template.content.cloneNode(true);

    // Author info
    const authorAvatar = card.querySelector(".author-avatar");
    const authorName = card.querySelector(".author-name");
    const authorHandle = card.querySelector(".author-handle");
    const verifiedBadge = card.querySelector(".verified-badge");

    authorAvatar.src = tweet.author_profile_image_url || "../icons/icon48.png";
    authorAvatar.alt = tweet.author_name || "Unknown";
    authorName.textContent = tweet.author_name || "Unknown User";
    authorHandle.textContent = `@${tweet.author_screen_name || "unknown"}`;

    if (tweet.author_verified) {
      verifiedBadge.style.display = "inline";
    }

    // Tweet meta
    const tweetDate = card.querySelector(".tweet-date");
    const sourceBadge = card.querySelector(".source-badge");

    tweetDate.textContent = this.formatDate(tweet.created_at);
    sourceBadge.textContent = tweet.source_category;
    sourceBadge.classList.add(tweet.source_category);

    // Tweet content
    const tweetText = card.querySelector(".tweet-text");
    tweetText.textContent = tweet.full_text;

    // Tweet stats
    const repliesCount = card.querySelector(".replies");
    const retweetsCount = card.querySelector(".retweets");
    const likesCount = card.querySelector(".likes");
    const viewsCount = card.querySelector(".views");

    repliesCount.textContent = this.formatNumber(tweet.reply_count);
    retweetsCount.textContent = this.formatNumber(tweet.retweet_count);
    likesCount.textContent = this.formatNumber(tweet.like_count);
    viewsCount.textContent = this.formatNumber(tweet.view_count);

    // Tweet actions
    const viewOriginalLink = card.querySelector(".view-original");
    const copyLinkBtn = card.querySelector(".copy-link");
    const deleteTweetBtn = card.querySelector(".delete-tweet");

    viewOriginalLink.href = tweet.tweet_url;

    copyLinkBtn.addEventListener("click", () => {
      this.copyToClipboard(tweet.tweet_url);
    });

    deleteTweetBtn.addEventListener("click", () => {
      this.deleteTweet(tweet.id);
    });

    return card;
  }

  showEmptyState() {
    const container = document.getElementById("tweets-container");
    const loadingState = document.getElementById("loading-state");
    const emptyState = document.getElementById("empty-state");
    const pagination = document.getElementById("pagination");

    loadingState.style.display = "none";
    container.style.display = "none";
    pagination.style.display = "none";
    emptyState.style.display = "block";
  }

  showLoading(show) {
    const loadingState = document.getElementById("loading-state");
    const container = document.getElementById("tweets-container");
    const emptyState = document.getElementById("empty-state");

    if (show) {
      loadingState.style.display = "flex";
      container.style.display = "none";
      emptyState.style.display = "none";
    } else {
      loadingState.style.display = "none";
    }
  }

  updateCounts() {
    const totalDisplayed = document.getElementById("total-displayed");
    const showingCount = document.getElementById("showing-count");
    const totalCount = document.getElementById("total-count");

    totalDisplayed.textContent = this.filteredTweets.length;
    showingCount.textContent = this.displayedTweets.length;
    totalCount.textContent = this.filteredTweets.length;
  }

  updatePagination() {
    const loadMoreBtn = document.getElementById("load-more");
    const hasMore = this.displayedTweets.length < this.filteredTweets.length;

    loadMoreBtn.disabled = !hasMore;
    loadMoreBtn.textContent = hasMore
      ? "Load More Tweets"
      : "All Tweets Loaded";
  }

  loadMoreTweets() {
    this.currentPage++;
    this.displayTweets();
  }

  clearFilters() {
    document.getElementById("source-filter").value = "all";
    document.getElementById("search-input").value = "";
    document.getElementById("sort-select").value = "created_at_desc";

    this.filters = {
      source: "all",
      search: "",
      sort: "created_at_desc",
    };

    this.applyFilters();
  }

  async deleteTweet(tweetId) {
    if (!confirm("Are you sure you want to delete this tweet?")) {
      return;
    }

    try {
      // Prefer deleting via background script so all extension contexts stay in sync
      const bgResponse = await new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage(
            { type: "deleteTweet", tweetId },
            (res) => {
              if (chrome.runtime.lastError) {
                // Communication with BG failed – fallback to direct DB access
                console.warn(
                  "BG deletion failed, falling back to direct DB",
                  chrome.runtime.lastError
                );
                resolve(null);
              } else {
                resolve(res);
              }
            }
          );
        } catch (err) {
          // Some browsers/pages may not allow messaging (e.g. in testing)
          console.warn("sendMessage threw", err);
          resolve(null);
        }
      });

      if (!bgResponse || bgResponse.success !== true) {
        console.warn(
          "Background deleteTweet failed or not supported",
          bgResponse
        );
        // Fallback: attempt direct IndexedDB deletion in viewer context
        const db = await this.openDatabase();
        await this.deleteTweetFromDB(db, tweetId);
      }

      // Remove from local arrays
      this.tweets = this.tweets.filter((t) => t.id !== tweetId);
      this.filteredTweets = this.filteredTweets.filter((t) => t.id !== tweetId);

      // Refresh display
      this.currentPage = 0;
      this.displayTweets();
    } catch (error) {
      console.error("Error deleting tweet:", error);
      alert("Failed to delete tweet");
    }
  }

  async deleteTweetFromDB(db, tweetId) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["tweets"], "readwrite");
      const store = transaction.objectStore("tweets");
      const request = store.delete(tweetId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async confirmClearAllData() {
    if (
      !confirm(
        "Are you sure you want to delete ALL captured tweets? This cannot be undone."
      )
    ) {
      return;
    }

    try {
      const bgResponse = await new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ type: "clearAllData" }, (res) => {
            if (chrome.runtime.lastError) {
              console.warn(
                "BG clearAllData failed, falling back",
                chrome.runtime.lastError
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

      if (!bgResponse || bgResponse.success !== true) {
        console.warn(
          "Background clearAllData failed or not supported",
          bgResponse
        );
        // Fallback to direct deletion if BG messaging unavailable
        const db = await this.openDatabase();
        await this.clearAllTweetsFromDB(db);
      }

      this.tweets = [];
      this.filteredTweets = [];
      this.displayedTweets = [];

      this.showEmptyState();
    } catch (error) {
      console.error("Error clearing all data:", error);
      alert("Failed to clear all data");
    }
  }

  async clearAllTweetsFromDB(db) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["tweets"], "readwrite");
      const store = transaction.objectStore("tweets");
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  exportAllData() {
    const dataStr = JSON.stringify(this.filteredTweets, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `twitter-collector-export-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  copyToClipboard(text) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.showToast("Link copied to clipboard!");
      })
      .catch(() => {
        this.showToast("Failed to copy link", "error");
      });
  }

  showToast(message, type = "success") {
    // Simple toast implementation
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.style.position = "fixed";
    toast.style.top = "20px";
    toast.style.right = "20px";
    toast.style.background = type === "error" ? "#ff4757" : "#10ac84";
    toast.style.color = "white";
    toast.style.padding = "12px 16px";
    toast.style.borderRadius = "6px";
    toast.style.zIndex = "1000";

    document.body.appendChild(toast);

    setTimeout(() => {
      document.body.removeChild(toast);
    }, 3000);
  }

  showError(message) {
    this.showToast(message, "error");
  }

  formatDate(dateString) {
    const date = new Date(dateString);
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

  formatNumber(num) {
    if (!num || isNaN(num)) return "0";

    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return num.toString();
  }

  debounce(func, wait) {
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
}

// Initialize data viewer when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new TwitterDataViewer();
});
