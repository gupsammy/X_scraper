// Main Data Viewer - Lightweight orchestrator using modular components
import { TweetDataService } from './data/TweetDataService.js';
import { AppState } from './state/AppState.js';
import { TweetGrid } from './ui/TweetGrid.js';
import { FilterBar } from './ui/FilterBar.js';
import { Modal } from './ui/Modal.js';
import { Toast } from './ui/Toast.js';
import { PAGINATION, VIEW_MODES } from './utils/constants.js';

export class TwitterDataViewer {
  constructor() {
    this.dataService = new TweetDataService();
    this.appState = new AppState();
    this.components = {};
    
    this.init();
  }

  async init() {
    console.log("Initializing modular Twitter Data Viewer");

    try {
      // Initialize UI components first
      await this.initializeComponents();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Load initial data
      await this.loadTweets();
      
      console.log("Data viewer initialized successfully");
    } catch (error) {
      console.error("Error initializing data viewer:", error);
      if (this.components.toast) {
        this.components.toast.error("Failed to initialize data viewer");
      } else {
        alert("Failed to initialize data viewer: " + error.message);
      }
    }
  }

  async initializeComponents() {
    console.log("Initializing components...");
    
    // Create UI components
    this.components.modal = new Modal();
    this.components.toast = new Toast();
    
    // Wait for DOM elements to be available
    await this.waitForElement('filter-container');
    await this.waitForElement('tweets-container');
    
    // Initialize filter bar
    const filterContainer = document.getElementById('filter-container');
    if (filterContainer) {
      this.components.filterBar = new FilterBar(filterContainer, this.appState.get('filters'));
      console.log("FilterBar initialized");
    } else {
      console.warn("Filter container not found");
    }

    // Initialize tweet grid
    const tweetsContainer = document.getElementById('tweets-container');
    if (tweetsContainer) {
      this.components.tweetGrid = new TweetGrid(tweetsContainer, {
        viewMode: this.appState.get('viewMode'),
        enableAnimation: true,
        infiniteScroll: true
      });
      console.log("TweetGrid initialized");
    } else {
      console.warn("Tweets container not found");
    }

    // Initialize loading/empty state elements
    this.loadingState = document.getElementById('loading-state');
    this.emptyState = document.getElementById('empty-state');
    this.pagination = document.getElementById('pagination');
    
    console.log("All components initialized");
  }

  // Helper function to wait for DOM elements
  waitForElement(id, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const element = document.getElementById(id);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const element = document.getElementById(id);
        if (element) {
          obs.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element with id '${id}' not found within timeout`));
      }, timeout);
    });
  }

  setupEventListeners() {
    // State change listeners
    this.appState.subscribe('filters', (filters) => {
      this.applyFiltersAndSort();
    });

    this.appState.subscribe('viewMode', (viewMode) => {
      if (this.components.tweetGrid) {
        this.components.tweetGrid.setViewMode(viewMode);
      }
    });

    // Filter bar events
    if (this.components.filterBar) {
      const filterContainer = this.components.filterBar.container;
      
      filterContainer.addEventListener('filterChange', (e) => {
        this.appState.updateFilters({ [e.detail.key]: e.detail.value });
      });

      filterContainer.addEventListener('filtersCleared', (e) => {
        this.appState.set('filters', e.detail.filters);
      });

      filterContainer.addEventListener('viewModeChange', (e) => {
        this.appState.set('viewMode', e.detail.mode);
      });
    }

    // Tweet grid events
    if (this.components.tweetGrid) {
      const gridContainer = this.components.tweetGrid.container;
      
      gridContainer.addEventListener('loadMore', () => {
        this.loadMoreTweets();
      });
    }

    // Global document events
    document.addEventListener('deleteTweet', (e) => {
      this.deleteTweet(e.detail.tweetId);
    });

    document.addEventListener('openMediaModal', (e) => {
      this.components.modal.openMedia(e.detail.mediaUrl, e.detail.mediaType);
    });

    document.addEventListener('showToast', (e) => {
      this.components.toast.show(e.detail.message, e.detail.type);
    });

    // Footer actions
    this.setupFooterActions();

    // Debug database on init
    this.dataService.debugDatabase();
  }

  setupFooterActions() {
    const clearAllDataBtn = document.getElementById('clear-all-data');
    const exportAllDataBtn = document.getElementById('export-all-data');
    const goToTwitterBtn = document.getElementById('go-to-twitter');

    if (clearAllDataBtn) {
      clearAllDataBtn.addEventListener('click', () => {
        this.confirmClearAllData();
      });
    }

    if (exportAllDataBtn) {
      exportAllDataBtn.addEventListener('click', () => {
        this.exportAllData();
      });
    }

    if (goToTwitterBtn) {
      goToTwitterBtn.addEventListener('click', () => {
        window.open('https://twitter.com', '_blank');
      });
    }
  }

  async loadTweets() {
    this.showLoading(true);
    
    try {
      const tweets = await this.dataService.getAllTweets();
      console.log(`Loaded ${tweets.length} tweets`);
      
      this.appState.set('tweets', tweets);
      this.applyFiltersAndSort();
      
    } catch (error) {
      console.error("Error loading tweets:", error);
      this.components.toast.error("Failed to load tweets from database");
      this.showEmptyState();
    } finally {
      this.showLoading(false);
    }
  }

  applyFiltersAndSort() {
    const tweets = this.appState.get('tweets');
    const filters = this.appState.get('filters');
    
    if (!tweets || tweets.length === 0) {
      this.appState.update({
        filteredTweets: [],
        displayedTweets: []
      });
      this.showEmptyState();
      return;
    }

    // Apply filters
    let filtered = this.dataService.filterTweets(tweets, filters);
    
    // Apply sorting
    filtered = this.dataService.sortTweets(filtered, filters.sort);
    
    this.appState.update({
      filteredTweets: filtered,
      currentPage: 0
    });
    
    this.displayTweets();
  }

  displayTweets() {
    const filteredTweets = this.appState.get('filteredTweets');
    
    if (!filteredTweets || filteredTweets.length === 0) {
      this.showEmptyState();
      return;
    }

    // Calculate tweets to display for current page
    const startIndex = 0; // Always start from 0 for grid refresh
    const endIndex = Math.min(
      (this.appState.get('currentPage') + 1) * PAGINATION.PAGE_SIZE,
      filteredTweets.length
    );
    
    const tweetsToShow = filteredTweets.slice(startIndex, endIndex);
    
    // Update displayed tweets
    this.appState.set('displayedTweets', tweetsToShow);
    
    // Render in grid
    if (this.components.tweetGrid) {
      try {
        this.components.tweetGrid.renderTweets(tweetsToShow, false);
        console.log(`Rendered ${tweetsToShow.length} tweets`);
      } catch (error) {
        console.error("Error rendering tweets:", error);
        this.components.toast.error("Failed to render tweets");
        return;
      }
    } else {
      console.error("Tweet grid component not available");
      return;
    }
    
    // Update UI state
    this.updateCounts();
    this.showTweetsContainer();
  }

  loadMoreTweets() {
    const currentPage = this.appState.get('currentPage');
    const filteredTweets = this.appState.get('filteredTweets');
    const displayedTweets = this.appState.get('displayedTweets');
    
    if (displayedTweets.length >= filteredTweets.length) {
      return; // No more tweets to load
    }

    const newPage = currentPage + 1;
    const startIndex = displayedTweets.length;
    const endIndex = Math.min(
      startIndex + PAGINATION.PAGE_SIZE,
      filteredTweets.length
    );
    
    const newTweets = filteredTweets.slice(startIndex, endIndex);
    const allDisplayed = [...displayedTweets, ...newTweets];
    
    this.appState.update({
      currentPage: newPage,
      displayedTweets: allDisplayed
    });
    
    // Append to grid
    this.components.tweetGrid.renderTweets(newTweets, true);
    this.updateCounts();
  }

  async deleteTweet(tweetId) {
    try {
      const success = await this.dataService.deleteTweet(tweetId);
      
      if (success) {
        // Remove from state
        const tweets = this.appState.get('tweets').filter(t => t.id !== tweetId);
        this.appState.set('tweets', tweets);
        
        // Remove from grid
        this.components.tweetGrid.removeTweet(tweetId);
        
        // Reapply filters to update counts
        this.applyFiltersAndSort();
        
        this.components.toast.success("Tweet deleted successfully");
      } else {
        this.components.toast.error("Failed to delete tweet");
      }
    } catch (error) {
      console.error("Error deleting tweet:", error);
      this.components.toast.error("Failed to delete tweet");
    }
  }

  confirmClearAllData() {
    this.components.modal.openConfirmation(
      "Are you sure you want to delete ALL captured tweets? This cannot be undone.",
      () => this.clearAllData(),
      null
    );
  }

  async clearAllData() {
    try {
      const success = await this.dataService.clearAllTweets();
      
      if (success) {
        this.appState.reset();
        this.components.tweetGrid.clear();
        this.showEmptyState();
        this.components.toast.success("All tweets cleared successfully");
      } else {
        this.components.toast.error("Failed to clear all tweets");
      }
    } catch (error) {
      console.error("Error clearing all data:", error);
      this.components.toast.error("Failed to clear all tweets");
    }
  }

  exportAllData() {
    const filteredTweets = this.appState.get('filteredTweets');
    
    if (filteredTweets.length === 0) {
      this.components.toast.warning("No tweets to export");
      return;
    }

    try {
      const dataStr = JSON.stringify(filteredTweets, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `twitter-collector-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
      
      this.components.toast.success("Data exported successfully");
    } catch (error) {
      console.error("Error exporting data:", error);
      this.components.toast.error("Failed to export data");
    }
  }

  // UI State Management
  showLoading(show) {
    if (!this.loadingState) return;
    
    console.log(`showLoading called with: ${show}`);
    
    if (show) {
      this.loadingState.style.display = 'flex';
      this.hideOtherStates(true); // Hide everything including tweets
      if (this.components.filterBar) {
        this.components.filterBar.showLoading();
      }
    } else {
      this.loadingState.style.display = 'none';
      // Don't call hideOtherStates here - let the calling method decide what to show
    }
  }

  showEmptyState() {
    if (!this.emptyState) return;
    
    this.emptyState.style.display = 'block';
    this.hideOtherStates(false);
    
    if (this.components.filterBar) {
      this.components.filterBar.updateStats({
        displayed: 0,
        filtered: 0,
        total: this.appState.getTweetCount()
      });
    }
  }

  showTweetsContainer() {
    console.log("showTweetsContainer called");
    
    if (this.components.tweetGrid && this.components.tweetGrid.container) {
      // Ensure other states are hidden first
      this.hideOtherStates(false);
      
      // Use requestAnimationFrame to ensure DOM updates are processed
      requestAnimationFrame(() => {
        this.components.tweetGrid.container.style.display = 'grid';
        console.log("Tweet grid container display set to grid");
        
        // Force a reflow to ensure the change is applied
        this.components.tweetGrid.container.offsetHeight;
        
        console.log("Tweet grid container made visible");
      });
    } else {
      console.warn("Tweet grid container not available");
    }
    
    if (this.pagination) {
      this.pagination.style.display = 'block';
    }
  }

  hideOtherStates(includeTweets = true) {
    console.log(`hideOtherStates called with includeTweets: ${includeTweets}`);
    
    if (this.loadingState) {
      this.loadingState.style.display = 'none';
      console.log("Loading state hidden");
    }
    if (this.emptyState) {
      this.emptyState.style.display = 'none';
      console.log("Empty state hidden");
    }
    
    if (includeTweets) {
      if (this.components.tweetGrid) {
        this.components.tweetGrid.container.style.display = 'none';
        console.log("Tweet grid hidden");
      }
      if (this.pagination) {
        this.pagination.style.display = 'none';
        console.log("Pagination hidden");
      }
    }
  }

  updateCounts() {
    if (!this.components.filterBar) return;
    
    const stats = {
      displayed: this.appState.getDisplayedCount(),
      filtered: this.appState.getFilteredCount(),
      total: this.appState.getTweetCount()
    };
    
    this.components.filterBar.updateStats(stats);
  }

  // Utility methods for backwards compatibility
  async formatDate(dateString) {
    const { formatDate } = await import('./utils/formatters.js');
    return formatDate(dateString);
  }

  async formatNumber(num) {
    const { formatNumber } = await import('./utils/formatters.js');
    return formatNumber(num);
  }

  // Cleanup
  destroy() {
    // Clean up components
    Object.values(this.components).forEach(component => {
      if (component.destroy) {
        component.destroy();
      }
    });

    // Reset state
    this.appState.reset();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new TwitterDataViewer();
});