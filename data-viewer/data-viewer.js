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
      // Debug IndexedDB immediately when page loads
      await this.debugDataViewerDB();

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

  async debugDataViewerDB() {
    console.log("=== Data Viewer IndexedDB Debug ===");
    console.log("Page URL:", window.location.href);
    console.log("Page origin:", window.location.origin);

    try {
      const databases = await indexedDB.databases();
      console.log("Available databases:", databases);

      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("TwitterCollector", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () =>
          reject(new Error("DB doesn't exist"));
      });

      const count = await new Promise((resolve, reject) => {
        const transaction = db.transaction(["tweets"], "readonly");
        const store = transaction.objectStore("tweets");
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      console.log("Tweet count in data viewer context:", count);
      db.close();
    } catch (error) {
      console.error("Data viewer DB debug error:", error);
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
    const authorAvatarLink = card.querySelector(".author-avatar-link");
    const authorName = card.querySelector(".author-name");
    const authorNameLink = card.querySelector(".author-name-link");
    const authorHandle = card.querySelector(".author-handle");
    const verifiedBadge = card.querySelector(".verified-badge");

    const authorProfileUrl = `https://x.com/${
      tweet.author_screen_name || "unknown"
    }`;

    authorAvatar.src = tweet.author_profile_image_url || "../icons/icon48.png";
    authorAvatar.alt = tweet.author_name || "Unknown";
    authorAvatarLink.href = authorProfileUrl;

    authorName.textContent = tweet.author_name || "Unknown User";
    authorNameLink.href = authorProfileUrl;
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
    tweetText.innerHTML = this.processTextLinks(tweet.full_text);

    // Media content
    const tweetMedia = card.querySelector(".tweet-media");
    if (tweet.has_media && tweet.media_info && tweet.media_info.length > 0) {
      this.renderTweetMedia(tweetMedia, tweet.media_info, tweet);
      tweetMedia.style.display = "block";
    }

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

    copyLinkBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.copyToClipboard(tweet.tweet_url);
      this.showToast("Tweet link copied to clipboard!");
    });

    deleteTweetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.deleteTweet(tweet.id);
    });

    return card;
  }

  renderTweetMedia(mediaContainer, mediaInfo, tweet) {
    // Clear any existing media content
    mediaContainer.innerHTML = "";
    
    const mediaCount = mediaInfo.length;
    
    // Set up dynamic grid layout based on media count and aspect ratios
    this.setupMediaLayout(mediaContainer, mediaInfo);

    mediaInfo.forEach((media, index) => {
      // Only show first 4 media items to prevent UI issues
      if (index >= 4) return;
      
      const mediaItem = document.createElement("div");
      mediaItem.className = "media-item";
      
      try {
        if (media.type === "photo") {
          this.createImageElement(mediaItem, media, tweet);
        } else if (media.type === "video") {
          this.createVideoElement(mediaItem, media, tweet);
        } else if (media.type === "animated_gif") {
          this.createGifElement(mediaItem, media, tweet);
        }
        
        mediaContainer.appendChild(mediaItem);
      } catch (error) {
        console.error("Error creating media element:", error);
        this.createErrorMediaElement(mediaItem, "Failed to load media");
        mediaContainer.appendChild(mediaItem);
      }
    });
  }

  setupMediaLayout(mediaContainer, mediaInfo) {
    const mediaCount = mediaInfo.length;
    
    // Remove existing layout classes
    mediaContainer.classList.remove("single-media", "two-media", "three-media", "four-media");
    
    // Analyze aspect ratios to determine best layout
    const aspectRatios = mediaInfo.map(media => {
      if (media.width && media.height && media.width > 0 && media.height > 0) {
        return media.width / media.height;
      }
      return 1; // default square aspect ratio
    });
    
    const avgAspectRatio = aspectRatios.reduce((sum, ratio) => sum + ratio, 0) / aspectRatios.length;
    const isWideMedia = avgAspectRatio > 1.5; // Landscape oriented
    const isTallMedia = avgAspectRatio < 0.7; // Portrait oriented
    
    if (mediaCount === 1) {
      mediaContainer.classList.add("single-media");
      mediaContainer.style.gridTemplateColumns = "1fr";
    } else if (mediaCount === 2) {
      mediaContainer.classList.add("two-media");
      // Stack vertically for wide media, side by side for tall/square media
      mediaContainer.style.gridTemplateColumns = isWideMedia ? "1fr" : "1fr 1fr";
    } else if (mediaCount === 3) {
      mediaContainer.classList.add("three-media");
      mediaContainer.style.gridTemplateColumns = "1fr 1fr";
    } else if (mediaCount >= 4) {
      mediaContainer.classList.add("four-media");
      mediaContainer.style.gridTemplateColumns = "1fr 1fr";
    }
  }

  createImageElement(mediaItem, media, tweet) {
    const img = document.createElement("img");
    img.src = media.media_url || media.preview_url;
    img.alt = this.generateAltText(tweet.full_text);
    img.loading = "lazy";
    img.style.cursor = "pointer";
    
    // Set dynamic sizing based on aspect ratio
    if (media.width && media.height) {
      const aspectRatio = media.width / media.height;
      
      // For very wide images, constrain height more
      if (aspectRatio > 2) {
        img.style.maxHeight = "300px";
        img.style.width = "100%";
        img.style.objectFit = "contain";
      } 
      // For very tall images, constrain width
      else if (aspectRatio < 0.5) {
        img.style.maxWidth = "100%";
        img.style.height = "auto";
        img.style.objectFit = "contain";
      }
      // For normal aspect ratios, show full image
      else {
        img.style.width = "100%";
        img.style.height = "auto";
        img.style.objectFit = "contain";
      }
    }
    
    // Add click handler for full-size view
    img.addEventListener("click", () => {
      this.openMediaModal(media.media_url || media.preview_url, "image");
    });
    
    // Handle image load errors
    img.addEventListener("error", () => {
      this.createErrorMediaElement(mediaItem, "Image failed to load");
    });
    
    mediaItem.appendChild(img);
  }

  createVideoElement(mediaItem, media, tweet) {
    const video = document.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    video.poster = media.preview_url;
    
    // Set dynamic sizing based on aspect ratio
    if (media.width && media.height) {
      const aspectRatio = media.width / media.height;
      
      // For very wide videos, constrain height
      if (aspectRatio > 2) {
        video.style.maxHeight = "300px";
        video.style.width = "100%";
        video.style.objectFit = "contain";
      } 
      // For very tall videos, constrain width
      else if (aspectRatio < 0.5) {
        video.style.maxWidth = "100%";
        video.style.height = "auto";
        video.style.objectFit = "contain";
      }
      // For normal aspect ratios, show full video
      else {
        video.style.width = "100%";
        video.style.height = "auto";
        video.style.objectFit = "contain";
      }
    } else {
      // Default sizing when dimensions not available
      video.style.width = "100%";
      video.style.height = "auto";
      video.style.objectFit = "contain";
    }
    
    // Create source element
    const source = document.createElement("source");
    source.src = media.media_url;
    source.type = "video/mp4";
    video.appendChild(source);
    
    // Add type indicator
    const typeIndicator = document.createElement("div");
    typeIndicator.className = "media-type-indicator video";
    typeIndicator.textContent = "VIDEO";
    mediaItem.appendChild(typeIndicator);
    
    // Add duration badge if available
    if (media.duration_ms) {
      const durationBadge = document.createElement("div");
      durationBadge.className = "media-duration";
      durationBadge.textContent = this.formatDuration(media.duration_ms);
      mediaItem.appendChild(durationBadge);
    }
    
    // Handle video errors
    video.addEventListener("error", () => {
      this.createErrorMediaElement(mediaItem, "Video failed to load");
    });
    
    mediaItem.appendChild(video);
  }

  createGifElement(mediaItem, media, tweet) {
    const video = document.createElement("video");
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.controls = false;
    video.poster = media.preview_url;
    
    // Make it behave like a clickable GIF
    video.style.cursor = "pointer";
    mediaItem.classList.add("gif");
    
    // Set dynamic sizing based on aspect ratio (same logic as videos)
    if (media.width && media.height) {
      const aspectRatio = media.width / media.height;
      
      // For very wide GIFs, constrain height
      if (aspectRatio > 2) {
        video.style.maxHeight = "300px";
        video.style.width = "100%";
        video.style.objectFit = "contain";
      } 
      // For very tall GIFs, constrain width
      else if (aspectRatio < 0.5) {
        video.style.maxWidth = "100%";
        video.style.height = "auto";
        video.style.objectFit = "contain";
      }
      // For normal aspect ratios, show full GIF
      else {
        video.style.width = "100%";
        video.style.height = "auto";
        video.style.objectFit = "contain";
      }
    } else {
      // Default sizing when dimensions not available
      video.style.width = "100%";
      video.style.height = "auto";
      video.style.objectFit = "contain";
    }
    
    // Create source element
    const source = document.createElement("source");
    source.src = media.media_url;
    source.type = "video/mp4";
    video.appendChild(source);
    
    // Add type indicator
    const typeIndicator = document.createElement("div");
    typeIndicator.className = "media-type-indicator gif";
    typeIndicator.textContent = "GIF";
    mediaItem.appendChild(typeIndicator);
    
    // Handle video errors
    video.addEventListener("error", () => {
      this.createErrorMediaElement(mediaItem, "GIF failed to load");
    });
    
    // Toggle play/pause on click
    video.addEventListener("click", () => {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    });
    
    mediaItem.appendChild(video);
  }

  createErrorMediaElement(mediaItem, errorMessage) {
    mediaItem.innerHTML = "";
    mediaItem.classList.add("error");
    
    const errorIcon = document.createElement("div");
    errorIcon.className = "media-error-icon";
    errorIcon.textContent = "⚠️";
    
    const errorText = document.createElement("div");
    errorText.className = "media-error-text";
    errorText.textContent = errorMessage;
    
    mediaItem.appendChild(errorIcon);
    mediaItem.appendChild(errorText);
  }

  generateAltText(tweetText) {
    if (!tweetText) return "Tweet media";
    
    // Truncate tweet text for alt attribute
    const cleanText = tweetText.replace(/https?:\/\/[^\s]+/g, "").trim();
    return cleanText.length > 100 
      ? cleanText.substring(0, 97) + "..." 
      : cleanText || "Tweet media";
  }

  formatDuration(durationMs) {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
    } else {
      return `0:${remainingSeconds.toString().padStart(2, "0")}`;
    }
  }

  openMediaModal(mediaUrl, mediaType) {
    // Create modal if it doesn't exist
    let modal = document.querySelector(".media-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.className = "media-modal";
      
      const modalContent = document.createElement("div");
      modalContent.className = "media-modal-content";
      
      const closeBtn = document.createElement("button");
      closeBtn.className = "media-modal-close";
      closeBtn.innerHTML = "&times;";
      closeBtn.addEventListener("click", () => {
        modal.classList.remove("active");
      });
      
      modalContent.appendChild(closeBtn);
      modal.appendChild(modalContent);
      document.body.appendChild(modal);
      
      // Close on background click
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.remove("active");
        }
      });
      
      // Close on escape key
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.classList.contains("active")) {
          modal.classList.remove("active");
        }
      });
    }
    
    const modalContent = modal.querySelector(".media-modal-content");
    const existingMedia = modalContent.querySelector("img, video");
    if (existingMedia) {
      existingMedia.remove();
    }
    
    // Create media element
    let mediaElement;
    if (mediaType === "image") {
      mediaElement = document.createElement("img");
      mediaElement.src = mediaUrl;
      mediaElement.alt = "Full size image";
    } else {
      mediaElement = document.createElement("video");
      mediaElement.controls = true;
      mediaElement.src = mediaUrl;
    }
    
    modalContent.appendChild(mediaElement);
    modal.classList.add("active");
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
                  "BG deletion failed, falling back to direct DB:",
                  chrome.runtime.lastError.message
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
                "BG clearAllData failed, falling back:",
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

  // Helper function to decode HTML entities
  decodeHtmlEntities(text) {
    if (!text) return "";

    // Create a temporary element to decode HTML entities safely
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  }

  processTextLinks(text) {
    if (!text) return "";

    // First decode any existing HTML entities to get the actual text
    let processedText = this.decodeHtmlEntities(text);

    // Now escape HTML to prevent XSS, but only what needs to be escaped
    processedText = processedText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    // Note: We don't encode single quotes since they're not dangerous in this context
    // and users expect to see them as regular apostrophes

    // Process URLs - match http/https URLs
    processedText = processedText.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank">$1</a>'
    );

    // Process @mentions
    processedText = processedText.replace(
      /@([a-zA-Z0-9_]+)/g,
      '<a href="https://x.com/$1" target="_blank" class="mention">@$1</a>'
    );

    // Process hashtags (optional enhancement)
    processedText = processedText.replace(
      /#([a-zA-Z0-9_]+)/g,
      '<a href="https://x.com/hashtag/$1" target="_blank" class="hashtag">#$1</a>'
    );

    return processedText;
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
