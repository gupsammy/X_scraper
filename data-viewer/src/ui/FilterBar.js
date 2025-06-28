// Filter Bar Component - Search, sort, and filter controls
import { SORT_OPTIONS, SOURCE_CATEGORIES, DEBOUNCE_DELAY } from '../utils/constants.js';

export class FilterBar {
  constructor(container, initialFilters = {}) {
    this.container = container;
    this.filters = {
      source: SOURCE_CATEGORIES.ALL,
      search: '',
      sort: SORT_OPTIONS.CREATED_AT_DESC,
      ...initialFilters
    };
    
    this.searchTimeout = null;
    this.init();
  }

  init() {
    this.render();
    this.attachEventListeners();
  }

  render() {
    this.container.innerHTML = `
      <div class="filter-bar">
        <div class="filter-section search-section">
          <div class="search-input-container">
            <svg viewBox="0 0 24 24" class="search-icon">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input 
              type="text" 
              id="search-input" 
              class="search-input" 
              placeholder="Search tweets, authors..."
              value="${this.filters.search}"
            />
            <button class="clear-search-btn" id="clear-search" ${this.filters.search ? '' : 'style="display: none;"'}>
              <svg viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="filter-section source-section">
          <label for="source-filter" class="filter-label">Source:</label>
          <select id="source-filter" class="filter-select">
            <option value="${SOURCE_CATEGORIES.ALL}" ${this.filters.source === SOURCE_CATEGORIES.ALL ? 'selected' : ''}>All Sources</option>
            <option value="${SOURCE_CATEGORIES.BOOKMARKS}" ${this.filters.source === SOURCE_CATEGORIES.BOOKMARKS ? 'selected' : ''}>Bookmarks</option>
            <option value="${SOURCE_CATEGORIES.USER_TWEETS}" ${this.filters.source === SOURCE_CATEGORIES.USER_TWEETS ? 'selected' : ''}>User Tweets</option>
            <option value="${SOURCE_CATEGORIES.SEARCH}" ${this.filters.source === SOURCE_CATEGORIES.SEARCH ? 'selected' : ''}>Search Results</option>
          </select>
        </div>

        <div class="filter-section sort-section">
          <label for="sort-select" class="filter-label">Sort by:</label>
          <select id="sort-select" class="filter-select">
            <option value="${SORT_OPTIONS.CREATED_AT_DESC}" ${this.filters.sort === SORT_OPTIONS.CREATED_AT_DESC ? 'selected' : ''}>Newest First</option>
            <option value="${SORT_OPTIONS.CREATED_AT_ASC}" ${this.filters.sort === SORT_OPTIONS.CREATED_AT_ASC ? 'selected' : ''}>Oldest First</option>
            <option value="${SORT_OPTIONS.LIKE_COUNT_DESC}" ${this.filters.sort === SORT_OPTIONS.LIKE_COUNT_DESC ? 'selected' : ''}>Most Liked</option>
            <option value="${SORT_OPTIONS.RETWEET_COUNT_DESC}" ${this.filters.sort === SORT_OPTIONS.RETWEET_COUNT_DESC ? 'selected' : ''}>Most Retweeted</option>
            <option value="${SORT_OPTIONS.AUTHOR_NAME_ASC}" ${this.filters.sort === SORT_OPTIONS.AUTHOR_NAME_ASC ? 'selected' : ''}>Author A-Z</option>
          </select>
        </div>

        <div class="filter-section actions-section">
          <button id="clear-filters" class="filter-btn clear-btn" ${this.hasActiveFilters() ? '' : 'disabled'}>
            <svg viewBox="0 0 24 24" class="btn-icon">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
            Clear Filters
          </button>
          
          <div class="view-mode-toggle" id="view-mode-toggle">
            <button class="view-mode-btn" data-mode="compact" title="Compact view">
              <svg viewBox="0 0 24 24">
                <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
              </svg>
            </button>
            <button class="view-mode-btn active" data-mode="comfortable" title="Comfortable view">
              <svg viewBox="0 0 24 24">
                <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
              </svg>
            </button>
            <button class="view-mode-btn" data-mode="spacious" title="Spacious view">
              <svg viewBox="0 0 24 24">
                <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="filter-stats" id="filter-stats">
          <span class="stats-text">Loading...</span>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    // Search input with debouncing
    const searchInput = this.container.querySelector('#search-input');
    const clearSearchBtn = this.container.querySelector('#clear-search');
    
    searchInput.addEventListener('input', (e) => {
      const value = e.target.value;
      
      // Show/hide clear button
      clearSearchBtn.style.display = value ? 'block' : 'none';
      
      // Debounce search
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.updateFilter('search', value);
      }, DEBOUNCE_DELAY);
    });

    // Clear search button
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      this.updateFilter('search', '');
    });

    // Source filter
    const sourceFilter = this.container.querySelector('#source-filter');
    sourceFilter.addEventListener('change', (e) => {
      this.updateFilter('source', e.target.value);
    });

    // Sort select
    const sortSelect = this.container.querySelector('#sort-select');
    sortSelect.addEventListener('change', (e) => {
      this.updateFilter('sort', e.target.value);
    });

    // Clear filters button
    const clearFiltersBtn = this.container.querySelector('#clear-filters');
    clearFiltersBtn.addEventListener('click', () => {
      this.clearAllFilters();
    });

    // View mode toggle
    const viewModeButtons = this.container.querySelectorAll('.view-mode-btn');
    viewModeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.mode;
        this.setActiveViewMode(mode);
        this.dispatchEvent('viewModeChange', { mode });
      });
    });
  }

  updateFilter(key, value) {
    const oldValue = this.filters[key];
    this.filters[key] = value;
    
    if (oldValue !== value) {
      this.updateClearButton();
      this.dispatchEvent('filterChange', { 
        key, 
        value, 
        filters: { ...this.filters } 
      });
    }
  }

  clearAllFilters() {
    // Reset to defaults
    this.filters = {
      source: SOURCE_CATEGORIES.ALL,
      search: '',
      sort: SORT_OPTIONS.CREATED_AT_DESC
    };

    // Update UI
    this.container.querySelector('#search-input').value = '';
    this.container.querySelector('#clear-search').style.display = 'none';
    this.container.querySelector('#source-filter').value = SOURCE_CATEGORIES.ALL;
    this.container.querySelector('#sort-select').value = SORT_OPTIONS.CREATED_AT_DESC;
    
    this.updateClearButton();
    
    this.dispatchEvent('filtersCleared', { filters: { ...this.filters } });
  }

  setFilters(newFilters) {
    this.filters = { ...this.filters, ...newFilters };
    
    // Update UI to reflect new filters
    const searchInput = this.container.querySelector('#search-input');
    const sourceFilter = this.container.querySelector('#source-filter');
    const sortSelect = this.container.querySelector('#sort-select');
    const clearSearchBtn = this.container.querySelector('#clear-search');
    
    searchInput.value = this.filters.search;
    sourceFilter.value = this.filters.source;
    sortSelect.value = this.filters.sort;
    clearSearchBtn.style.display = this.filters.search ? 'block' : 'none';
    
    this.updateClearButton();
  }

  getFilters() {
    return { ...this.filters };
  }

  hasActiveFilters() {
    return this.filters.search !== '' || 
           this.filters.source !== SOURCE_CATEGORIES.ALL || 
           this.filters.sort !== SORT_OPTIONS.CREATED_AT_DESC;
  }

  updateClearButton() {
    const clearBtn = this.container.querySelector('#clear-filters');
    clearBtn.disabled = !this.hasActiveFilters();
  }

  setActiveViewMode(mode) {
    const viewModeButtons = this.container.querySelectorAll('.view-mode-btn');
    viewModeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  updateStats(stats) {
    const statsElement = this.container.querySelector('#filter-stats .stats-text');
    
    if (stats.filtered === stats.total) {
      statsElement.textContent = `Showing ${stats.displayed} of ${stats.total} tweets`;
    } else {
      statsElement.textContent = `Showing ${stats.displayed} of ${stats.filtered} filtered tweets (${stats.total} total)`;
    }
  }

  showLoading() {
    const statsElement = this.container.querySelector('#filter-stats .stats-text');
    statsElement.textContent = 'Loading...';
  }

  showError(message) {
    const statsElement = this.container.querySelector('#filter-stats .stats-text');
    statsElement.textContent = message;
    statsElement.style.color = '#e74c3c';
  }

  // Event dispatching
  dispatchEvent(eventName, detail = {}) {
    const event = new CustomEvent(eventName, { detail });
    this.container.dispatchEvent(event);
  }

  // Get search suggestions (could be implemented later)
  getSuggestions(query) {
    // This could return recent searches, popular hashtags, etc.
    return [];
  }

  // Add keyboard shortcuts
  addKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + F to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = this.container.querySelector('#search-input');
        searchInput.focus();
        searchInput.select();
      }
      
      // Escape to clear search
      if (e.key === 'Escape') {
        const searchInput = this.container.querySelector('#search-input');
        if (document.activeElement === searchInput && searchInput.value) {
          searchInput.value = '';
          this.container.querySelector('#clear-search').style.display = 'none';
          this.updateFilter('search', '');
        }
      }
    });
  }

  destroy() {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.container.innerHTML = '';
  }
}