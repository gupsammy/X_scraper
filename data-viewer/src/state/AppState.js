// App State - Simple pub/sub state management

export class AppState {
  constructor() {
    this.state = {
      tweets: [],
      filteredTweets: [],
      displayedTweets: [],
      currentPage: 0,
      filters: {
        source: "all",
        search: "",
        sort: "created_at_desc",
      },
      viewMode: "comfortable",
      isLoading: false,
      error: null
    };
    
    this.listeners = new Map();
  }

  // Subscribe to state changes
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(key);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  // Emit state change to subscribers
  emit(key, data) {
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in state listener for ${key}:`, error);
        }
      });
    }
  }

  // Get state value
  get(key) {
    return key ? this.state[key] : this.state;
  }

  // Set state value and notify listeners
  set(key, value) {
    const oldValue = this.state[key];
    this.state[key] = value;
    
    if (oldValue !== value) {
      this.emit(key, value);
      this.emit('*', { key, value, oldValue });
    }
  }

  // Update state with partial object
  update(updates) {
    const changes = {};
    
    Object.keys(updates).forEach(key => {
      const oldValue = this.state[key];
      this.state[key] = updates[key];
      
      if (oldValue !== updates[key]) {
        changes[key] = { oldValue, newValue: updates[key] };
        this.emit(key, updates[key]);
      }
    });

    if (Object.keys(changes).length > 0) {
      this.emit('*', changes);
    }
  }

  // Update filters
  updateFilters(filterUpdates) {
    const newFilters = { ...this.state.filters, ...filterUpdates };
    this.set('filters', newFilters);
  }

  // Reset state to initial values
  reset() {
    this.update({
      tweets: [],
      filteredTweets: [],
      displayedTweets: [],
      currentPage: 0,
      filters: {
        source: "all",
        search: "",
        sort: "created_at_desc",
      },
      viewMode: "comfortable",
      isLoading: false,
      error: null
    });
  }

  // Computed getters
  getTweetCount() {
    return this.state.tweets.length;
  }

  getFilteredCount() {
    return this.state.filteredTweets.length;
  }

  getDisplayedCount() {
    return this.state.displayedTweets.length;
  }

  hasMoreTweets() {
    return this.state.displayedTweets.length < this.state.filteredTweets.length;
  }
}