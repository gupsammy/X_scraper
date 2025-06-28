// Constants - App-wide constants and configuration

export const VIEW_MODES = {
  COMPACT: 'compact',
  COMFORTABLE: 'comfortable', 
  SPACIOUS: 'spacious'
};

export const SORT_OPTIONS = {
  CREATED_AT_DESC: 'created_at_desc',
  CREATED_AT_ASC: 'created_at_asc',
  LIKE_COUNT_DESC: 'like_count_desc',
  RETWEET_COUNT_DESC: 'retweet_count_desc',
  AUTHOR_NAME_ASC: 'author_name_asc'
};

export const SOURCE_CATEGORIES = {
  ALL: 'all',
  BOOKMARKS: 'bookmarks',
  USER_TWEETS: 'user_tweets',
  SEARCH: 'search'
};

export const BREAKPOINTS = {
  MOBILE: 768,
  TABLET: 1024,
  DESKTOP: 1200,
  ULTRA_WIDE: 1600
};

export const GRID_COLUMNS = {
  MOBILE: 1,
  TABLET: 2,
  DESKTOP: 3,
  ULTRA_WIDE: 4
};

export const PAGINATION = {
  PAGE_SIZE: 20,
  LOAD_MORE_THRESHOLD: 3 // Load more when 3 items from bottom
};

export const MEDIA_CONSTRAINTS = {
  MAX_HEIGHT: 300,
  MAX_WIDTH: 400,
  THUMBNAIL_SIZE: 150
};

export const ANIMATION_DURATION = 300; // milliseconds

export const DEBOUNCE_DELAY = 300; // milliseconds for search input