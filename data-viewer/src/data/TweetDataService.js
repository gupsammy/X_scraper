// Tweet Data Service - Main data orchestrator
import { IndexedDBRepository } from './IndexedDBRepository.js';
import { ExtensionBridge } from './ExtensionBridge.js';

export class TweetDataService {
  constructor() {
    this.dbRepository = new IndexedDBRepository();
    this.extensionBridge = new ExtensionBridge();
  }

  async getAllTweets() {
    console.log("Loading tweets from multiple sources...");
    
    let tweets = [];

    // Strategy 1: Direct IndexedDB access
    try {
      tweets = await this.dbRepository.getAllTweets();
      console.log(`Direct IndexedDB: ${tweets.length} tweets`);
      if (tweets.length > 0) return tweets;
    } catch (error) {
      console.warn("Direct IndexedDB access failed:", error);
    }

    // Strategy 2: Background script
    try {
      const bgTweets = await this.extensionBridge.getAllTweetsFromBackground();
      if (bgTweets && bgTweets.length > 0) {
        console.log(`Background script: ${bgTweets.length} tweets`);
        return bgTweets;
      }
    } catch (error) {
      console.warn("Background script access failed:", error);
    }

    // Strategy 3: Content script via tab messaging
    try {
      const csTweets = await this.extensionBridge.getAllTweetsFromContentScript();
      if (csTweets && csTweets.length > 0) {
        console.log(`Content script: ${csTweets.length} tweets`);
        return csTweets;
      }
    } catch (error) {
      console.warn("Content script access failed:", error);
    }

    console.log("No tweets found from any source");
    return [];
  }

  async deleteTweet(tweetId) {
    console.log("TweetDataService: Attempting to delete tweet:", tweetId);
    
    // Try background script first for consistency across contexts
    const bgResult = await this.extensionBridge.deleteTweetViaBackground(tweetId);
    console.log("TweetDataService: Background delete result:", bgResult);
    
    if (bgResult.success) {
      console.log("TweetDataService: Tweet deleted successfully via background script");
      return true;
    }

    // Fallback to direct database deletion
    console.log("TweetDataService: Falling back to direct database deletion");
    try {
      await this.dbRepository.deleteTweet(tweetId);
      console.log("TweetDataService: Tweet deleted successfully via direct database");
      return true;
    } catch (error) {
      console.error("TweetDataService: Failed to delete tweet:", error);
      return false;
    }
  }

  async clearAllTweets() {
    console.log("TweetDataService: Attempting to clear all tweets");
    
    // Try background script first for consistency
    const bgResult = await this.extensionBridge.clearAllDataViaBackground();
    console.log("TweetDataService: Background clear result:", bgResult);
    
    if (bgResult.success) {
      console.log("TweetDataService: All tweets cleared successfully via background script");
      return true;
    }

    // Fallback to direct database clear
    console.log("TweetDataService: Falling back to direct database clear");
    try {
      await this.dbRepository.clearAllTweets();
      console.log("TweetDataService: All tweets cleared successfully via direct database");
      return true;
    } catch (error) {
      console.error("TweetDataService: Failed to clear all tweets:", error);
      return false;
    }
  }

  async getTweetCount() {
    try {
      return await this.dbRepository.getTweetCount();
    } catch (error) {
      console.error("Failed to get tweet count:", error);
      return 0;
    }
  }

  async debugDatabase() {
    await this.dbRepository.debugDatabase();
  }

  // Filtering and sorting utilities
  filterTweets(tweets, filters) {
    let filtered = [...tweets];

    // Source filter
    if (filters.source && filters.source !== "all") {
      filtered = filtered.filter(tweet => tweet.source_category === filters.source);
    }

    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(tweet =>
        (tweet.full_text && tweet.full_text.toLowerCase().includes(searchTerm)) ||
        (tweet.author_name && tweet.author_name.toLowerCase().includes(searchTerm)) ||
        (tweet.author_screen_name && tweet.author_screen_name.toLowerCase().includes(searchTerm))
      );
    }

    return filtered;
  }

  sortTweets(tweets, sortBy) {
    return [...tweets].sort((a, b) => {
      switch (sortBy) {
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
  }
}