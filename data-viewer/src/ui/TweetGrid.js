// Tweet Grid Component - Responsive masonry-style layout with conversation support
import { TweetCard } from "./TweetCard.js";
import { ConversationThread } from "./ConversationThread.js";
import {
  BREAKPOINTS,
  GRID_COLUMNS,
  ANIMATION_DURATION,
} from "../utils/constants.js";

export class TweetGrid {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      viewMode: "comfortable",
      enableAnimation: true,
      infiniteScroll: false,
      groupConversations: true, // New option to enable conversation grouping
      ...options,
    };

    this.tweetCards = new Map(); // tweetId -> TweetCard instance
    this.conversationThreads = new Map(); // conversationId -> ConversationThread instance
    this.observer = null;
    this.resizeObserver = null;

    this.init();
  }

  init() {
    this.setupContainer();
    this.setupResponsiveLayout();
    this.setupInfiniteScroll();
  }

  setupContainer() {
    this.container.className = `tweet-grid ${this.options.viewMode}`;
    this.container.style.cssText = `
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
      padding: 16px;
      transition: all ${ANIMATION_DURATION}ms ease;
    `;
  }

  setupResponsiveLayout() {
    this.updateGridLayout();

    // Set up resize observer for responsive updates with debouncing
    let resizeTimeout;
    this.resizeObserver = new ResizeObserver((entries) => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Only update if container size actually changed
        const entry = entries[0];
        if (entry && entry.contentRect) {
          const newWidth = entry.contentRect.width;
          if (Math.abs(newWidth - (this.lastWidth || 0)) > 10) {
            this.lastWidth = newWidth;
            this.updateGridLayout();
          }
        }
      }, 100); // Debounce by 100ms
    });
    this.resizeObserver.observe(this.container);
  }

  updateGridLayout() {
    // Always use single column layout
    this.container.style.gridTemplateColumns = "1fr";

    // Update card spacing based on view mode
    const gap = this.getGapSize();
    this.container.style.gap = `${gap}px`;

    // Calculate padding based on viewport width
    const viewportWidth = window.innerWidth;
    let horizontalPadding;

    if (viewportWidth < BREAKPOINTS.MOBILE) {
      // Mobile: use 20px padding
      horizontalPadding = "20px";
    } else if (viewportWidth < BREAKPOINTS.TABLET) {
      // Tablet: use 60px padding
      horizontalPadding = "60px";
    } else {
      // Desktop: Use wider margins for better readability
      // Aim for ~600-800px content width (optimal reading width)
      const optimalContentWidth = 700;
      const minPadding = 100; // Minimum padding for very small screens

      if (viewportWidth <= optimalContentWidth + minPadding * 2) {
        horizontalPadding = `${minPadding}px`;
      } else {
        const totalPadding = viewportWidth - optimalContentWidth;
        horizontalPadding = `${totalPadding / 2}px`;
      }
    }

    this.container.style.padding = `16px ${horizontalPadding}`;
  }

  getGapSize() {
    switch (this.options.viewMode) {
      case "compact":
        return 12;
      case "spacious":
        return 24;
      default:
        return 16; // comfortable
    }
  }

  setupInfiniteScroll() {
    if (!this.options.infiniteScroll) return;

    // Set up intersection observer for infinite scroll
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.dispatchEvent("loadMore");
          }
        });
      },
      {
        rootMargin: "100px",
      }
    );
  }

  renderTweets(tweets, append = false) {
    if (!append) {
      this.clear();
    }

    const fragment = document.createDocumentFragment();

    if (this.options.groupConversations) {
      this.renderConversations(tweets, fragment);
    } else {
      this.renderIndividualTweets(tweets, fragment);
    }

    this.container.appendChild(fragment);

    // Update infinite scroll observer
    this.updateInfiniteScrollTarget();
  }

  renderConversations(tweets, fragment) {
    // Group tweets by conversation
    const conversations = ConversationThread.groupTweetsByConversation(tweets);
    let animationIndex = 0;

    conversations.forEach((conversationTweets, conversationId) => {
      // NEW: Check if we already rendered some tweets for this conversation as standalone
      // If so, merge them so that we create a single ConversationThread element
      const existingStandaloneTweets = [];
      if (!this.conversationThreads.has(conversationId)) {
        // Only search if a thread does NOT already exist for this conversation
        this.tweetCards.forEach((cardInstance, storedTweetId) => {
          // cardInstance might be an actual TweetCard or a placeholder object (when part of a thread)
          const storedTweet = cardInstance?.tweet; // TweetCard instances expose the tweet via .tweet
          if (storedTweet && storedTweet.conversation_id === conversationId) {
            existingStandaloneTweets.push(storedTweet);
          }
        });

        if (existingStandaloneTweets.length > 0) {
          // Merge previously-rendered standalone tweets with the newly loaded ones
          const combined = [...existingStandaloneTweets, ...conversationTweets];

          // Remove the old standalone tweet cards from the grid & internal map
          existingStandaloneTweets.forEach((tweet) => {
            this.removeTweet(tweet.id);
          });

          conversationTweets = combined;
        }
      }

      if (conversationTweets.length === 1) {
        // Single tweet - render as individual tweet
        const tweet = conversationTweets[0];
        this.renderSingleTweet(tweet, fragment, animationIndex);
        animationIndex++;
      } else if (ConversationThread.isConversation(conversationTweets)) {
        // Multiple related tweets - render as conversation thread
        if (this.conversationThreads.has(conversationId)) {
          // Update existing conversation
          const existingThread = this.conversationThreads.get(conversationId);
          existingThread.updateTweets(conversationTweets);
        } else {
          // Create new conversation thread
          const conversationThread = new ConversationThread(
            conversationTweets,
            {
              showReplies: true,
              maxDepth: 5,
            }
          );

          const threadElement = conversationThread.render();

          // Add stagger animation
          if (this.options.enableAnimation) {
            threadElement.style.opacity = "0";
            threadElement.style.transform = "translateY(20px)";

            setTimeout(() => {
              threadElement.style.transition = `opacity ${ANIMATION_DURATION}ms ease, transform ${ANIMATION_DURATION}ms ease`;
              threadElement.style.opacity = "1";
              threadElement.style.transform = "translateY(0)";
            }, animationIndex * 100); // Longer stagger for conversations
          }

          fragment.appendChild(threadElement);
          this.conversationThreads.set(conversationId, conversationThread);

          // Track tweets that are part of this conversation so we can detect duplicates later
          conversationTweets.forEach((tweet) => {
            this.tweetCards.set(tweet.id, {
              isConversation: true,
              conversationId,
            });
          });
        }
        animationIndex++;
      } else {
        // Multiple unrelated tweets with same conversation_id - render individually
        conversationTweets.forEach((tweet) => {
          this.renderSingleTweet(tweet, fragment, animationIndex);
          animationIndex++;
        });
      }
    });
  }

  renderIndividualTweets(tweets, fragment) {
    tweets.forEach((tweet, index) => {
      this.renderSingleTweet(tweet, fragment, index);
    });
  }

  renderSingleTweet(tweet, fragment, animationIndex) {
    if (this.tweetCards.has(tweet.id)) {
      // Update existing card
      const existingCard = this.tweetCards.get(tweet.id);
      if (existingCard.updateData) {
        existingCard.updateData(tweet);
      }
    } else {
      // Create new card
      const tweetCard = new TweetCard(tweet, {
        compact: this.options.viewMode === "compact",
        conversationMode: false,
      });

      const cardElement = tweetCard.render();

      // Add stagger animation for smooth loading
      if (this.options.enableAnimation) {
        cardElement.style.opacity = "0";
        cardElement.style.transform = "translateY(20px)";

        setTimeout(() => {
          cardElement.style.transition = `opacity ${ANIMATION_DURATION}ms ease, transform ${ANIMATION_DURATION}ms ease`;
          cardElement.style.opacity = "1";
          cardElement.style.transform = "translateY(0)";
        }, animationIndex * 50); // Stagger by 50ms
      }

      fragment.appendChild(cardElement);
      this.tweetCards.set(tweet.id, tweetCard);
    }
  }

  updateInfiniteScrollTarget() {
    if (!this.observer) return;

    // Remove previous target
    const oldTarget = this.container.querySelector(".infinite-scroll-target");
    if (oldTarget) {
      this.observer.unobserve(oldTarget);
      oldTarget.remove();
    }

    // Add new target at the end
    const target = document.createElement("div");
    target.className = "infinite-scroll-target";
    target.style.cssText = `
      height: 1px;
      grid-column: 1 / -1;
      margin-top: 20px;
    `;

    this.container.appendChild(target);
    this.observer.observe(target);
  }

  removeTweet(tweetId) {
    const tweetCard = this.tweetCards.get(tweetId);
    if (!tweetCard) return;

    const element = tweetCard.getElement();

    if (this.options.enableAnimation) {
      // Animate out
      element.style.transition = `opacity ${ANIMATION_DURATION}ms ease, transform ${ANIMATION_DURATION}ms ease`;
      element.style.opacity = "0";
      element.style.transform = "scale(0.95)";

      setTimeout(() => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
        this.tweetCards.delete(tweetId);
      }, ANIMATION_DURATION);
    } else {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      this.tweetCards.delete(tweetId);
    }
  }

  updateTweet(tweet) {
    const tweetCard = this.tweetCards.get(tweet.id);
    if (tweetCard) {
      tweetCard.updateData(tweet);
    }
  }

  clear() {
    // Capture both cards and conversation threads that are currently in the grid
    const existingCards = Array.from(
      this.container.querySelectorAll(".tweet-card")
    );
    const existingThreads = Array.from(
      this.container.querySelectorAll(".conversation-thread")
    );

    // Reset internal maps so that subsequent renders start fresh
    this.tweetCards.clear();
    this.conversationThreads.clear();

    // If there is nothing to remove, just ensure the container is empty right away
    if (existingCards.length === 0 && existingThreads.length === 0) {
      this.container.innerHTML = "";
      return;
    }

    const allElements = [...existingCards, ...existingThreads];

    if (this.options.enableAnimation) {
      // Animate each existing element out and remove it *individually* after the animation.
      allElements.forEach((element, index) => {
        const delay = index * 20;

        // Animate out
        setTimeout(() => {
          element.style.transition = `opacity ${ANIMATION_DURATION}ms ease, transform ${ANIMATION_DURATION}ms ease`;
          element.style.opacity = "0";
          element.style.transform = "translateY(-20px)";
        }, delay);

        // Remove after animation completes so that brand-new elements added meanwhile are untouched
        setTimeout(() => {
          if (element.parentNode) {
            element.parentNode.removeChild(element);
          }
        }, delay + ANIMATION_DURATION);
      });
    } else {
      // No animation – remove immediately
      allElements.forEach((element) => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });
    }
  }

  setViewMode(viewMode) {
    if (this.options.viewMode === viewMode) return;

    this.options.viewMode = viewMode;
    this.container.className = `tweet-grid ${viewMode}`;

    // Update layout
    this.updateGridLayout();

    // Update all card options
    this.tweetCards.forEach((card) => {
      card.options.compact = viewMode === "compact";
      const newElement = card.render();
      const oldElement = card.getElement();
      if (oldElement && oldElement.parentNode) {
        oldElement.parentNode.replaceChild(newElement, oldElement);
      }
    });
  }

  getViewMode() {
    return this.options.viewMode;
  }

  getTweetCount() {
    return this.tweetCards.size;
  }

  scrollToTop(smooth = true) {
    this.container.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "start",
    });
  }

  // Event dispatching for parent components
  dispatchEvent(eventName, detail = {}) {
    const event = new CustomEvent(eventName, { detail });
    this.container.dispatchEvent(event);
  }

  // Cleanup
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.tweetCards.clear();
    this.container.innerHTML = "";
  }

  // Performance optimization: Virtual scrolling for large datasets
  enableVirtualScrolling(enabled = true) {
    // This could be implemented for very large datasets
    // For now, we rely on pagination and infinite scroll
    this.options.virtualScrolling = enabled;
  }

  // Get visible tweets (for performance monitoring)
  getVisibleTweets() {
    const visibleTweets = [];
    const containerRect = this.container.getBoundingClientRect();

    this.tweetCards.forEach((card, tweetId) => {
      const element = card.getElement();
      if (!element) return;

      const cardRect = element.getBoundingClientRect();

      // Check if card is visible in viewport
      if (cardRect.bottom >= 0 && cardRect.top <= window.innerHeight) {
        visibleTweets.push(tweetId);
      }
    });

    return visibleTweets;
  }
}
