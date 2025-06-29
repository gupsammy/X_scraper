// Conversation Thread Component - Handles tweet conversation threading and visual hierarchy
import { TweetCard } from './TweetCard.js';

export class ConversationThread {
  constructor(tweets, options = {}) {
    this.tweets = tweets;
    this.options = {
      showReplies: true,
      maxDepth: 5,
      ...options
    };
    this.element = null;
    this.conversationId = tweets[0]?.conversation_id;
  }

  render() {
    this.element = document.createElement("div");
    this.element.className = "conversation-thread";
    this.element.dataset.conversationId = this.conversationId;

    // Sort tweets by creation date to maintain chronological order
    const sortedTweets = this.sortTweetsByDate();
    
    // Group tweets by their reply relationship
    const threadStructure = this.buildThreadStructure(sortedTweets);
    
    // Render the main tweet and its replies
    this.renderTweetThread(threadStructure);

    return this.element;
  }

  sortTweetsByDate() {
    return [...this.tweets].sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return dateA - dateB;
    });
  }

  buildThreadStructure(tweets) {
    const tweetMap = new Map();
    const rootTweets = [];

    // First pass: create map of all tweets
    tweets.forEach(tweet => {
      tweetMap.set(tweet.id, {
        tweet,
        replies: []
      });
    });

    // Second pass: build reply relationships
    tweets.forEach(tweet => {
      const tweetNode = tweetMap.get(tweet.id);
      
      if (tweet.in_reply_to_status_id && tweetMap.has(tweet.in_reply_to_status_id)) {
        // This is a reply to another tweet in our set
        const parentNode = tweetMap.get(tweet.in_reply_to_status_id);
        parentNode.replies.push(tweetNode);
      } else {
        // This is a root tweet (original tweet or reply to something not in our set)
        rootTweets.push(tweetNode);
      }
    });

    return rootTweets;
  }

  renderTweetThread(threadStructure) {
    threadStructure.forEach((tweetNode, index) => {
      this.renderTweetWithReplies(tweetNode, 0, index === 0);
    });
  }

  renderTweetWithReplies(tweetNode, depth = 0, isMainTweet = false) {
    const { tweet, replies } = tweetNode;
    
    // Create tweet container
    const tweetContainer = document.createElement("div");
    tweetContainer.className = `tweet-in-conversation ${isMainTweet ? 'main-tweet' : 'reply-tweet'}`;
    tweetContainer.dataset.depth = depth;
    tweetContainer.dataset.tweetId = tweet.id;

    // Add connecting line for replies
    if (depth > 0) {
      const connectingLine = document.createElement("div");
      connectingLine.className = "reply-connecting-line";
      tweetContainer.appendChild(connectingLine);
    }

    // Create tweet content wrapper
    const tweetWrapper = document.createElement("div");
    tweetWrapper.className = "tweet-content-wrapper";

    // Render the tweet card
    const tweetCardOptions = {
      compact: depth > 0, // Make replies more compact
      isReply: depth > 0,
      isMainTweet: isMainTweet,
      conversationMode: true
    };

    const tweetCard = new TweetCard(tweet, tweetCardOptions);
    const tweetElement = tweetCard.render();
    tweetWrapper.appendChild(tweetElement);

    tweetContainer.appendChild(tweetWrapper);

    // Add the tweet container to the thread
    this.element.appendChild(tweetContainer);

    // Render replies recursively (with depth limit)
    if (replies.length > 0 && depth < this.options.maxDepth && this.options.showReplies) {
      replies.forEach(replyNode => {
        this.renderTweetWithReplies(replyNode, depth + 1, false);
      });
    }
  }

  // Get conversation metadata
  getMetadata() {
    return {
      conversationId: this.conversationId,
      tweetCount: this.tweets.length,
      mainTweet: this.tweets.find(t => !t.in_reply_to_status_id || 
        !this.tweets.some(other => other.id === t.in_reply_to_status_id)),
      replyCount: this.tweets.filter(t => t.in_reply_to_status_id).length,
      authors: [...new Set(this.tweets.map(t => t.author_screen_name))]
    };
  }

  // Update conversation data
  updateTweets(newTweets) {
    this.tweets = newTweets;
    // Re-render the entire conversation
    const newElement = this.render();
    if (this.element && this.element.parentNode) {
      this.element.parentNode.replaceChild(newElement, this.element);
    }
  }

  // Get DOM element
  getElement() {
    return this.element;
  }

  // Static method to group tweets by conversation
  static groupTweetsByConversation(tweets) {
    const conversations = new Map();

    tweets.forEach(tweet => {
      const conversationId = tweet.conversation_id || tweet.id;
      
      if (!conversations.has(conversationId)) {
        conversations.set(conversationId, []);
      }
      
      conversations.get(conversationId).push(tweet);
    });

    return conversations;
  }

  // Static method to check if tweets form a conversation
  static isConversation(tweets) {
    if (tweets.length <= 1) return false;
    
    // Check if any tweet is a reply to another in the group
    return tweets.some(tweet => 
      tweet.in_reply_to_status_id && 
      tweets.some(other => other.id === tweet.in_reply_to_status_id)
    );
  }
}