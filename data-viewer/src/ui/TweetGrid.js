// Tweet Grid Component - Responsive masonry-style layout
import { TweetCard } from "./TweetCard.js";
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
      ...options,
    };

    this.tweetCards = new Map(); // tweetId -> TweetCard instance
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
    const containerWidth = this.container.clientWidth;
    let columns;

    // Determine number of columns based on viewport and view mode
    if (containerWidth < BREAKPOINTS.MOBILE) {
      columns = GRID_COLUMNS.MOBILE;
    } else if (containerWidth < BREAKPOINTS.TABLET) {
      columns = GRID_COLUMNS.TABLET;
    } else if (containerWidth < BREAKPOINTS.DESKTOP) {
      columns = GRID_COLUMNS.DESKTOP;
    } else if (containerWidth < BREAKPOINTS.ULTRA_WIDE) {
      columns = GRID_COLUMNS.DESKTOP;
    } else {
      columns = GRID_COLUMNS.ULTRA_WIDE;
    }

    // Adjust for view mode
    if (this.options.viewMode === "compact") {
      columns = Math.min(columns + 1, 5); // Add one more column in compact mode
    } else if (this.options.viewMode === "spacious") {
      columns = Math.max(columns - 1, 1); // Remove one column in spacious mode
    }

    // Apply grid layout
    this.container.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

    // Update card spacing based on view mode
    const gap = this.getGapSize();
    this.container.style.gap = `${gap}px`;
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

    tweets.forEach((tweet, index) => {
      if (this.tweetCards.has(tweet.id)) {
        // Update existing card
        const existingCard = this.tweetCards.get(tweet.id);
        existingCard.updateData(tweet);
      } else {
        // Create new card
        const tweetCard = new TweetCard(tweet, {
          compact: this.options.viewMode === "compact",
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
          }, index * 50); // Stagger by 50ms
        }

        fragment.appendChild(cardElement);
        this.tweetCards.set(tweet.id, tweetCard);
      }
    });

    this.container.appendChild(fragment);

    // Update infinite scroll observer
    this.updateInfiniteScrollTarget();
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
    // Capture the cards that are currently in the grid _before_ we start rendering
    const existingCards = Array.from(
      this.container.querySelectorAll(".tweet-card")
    );

    // Reset internal map so that subsequent renders start fresh
    this.tweetCards.clear();

    // If there is nothing to remove, just ensure the container is empty right away
    if (existingCards.length === 0) {
      this.container.innerHTML = "";
      return;
    }

    if (this.options.enableAnimation) {
      // Animate each existing card out and remove it *individually* after the animation.
      existingCards.forEach((card, index) => {
        const delay = index * 20;

        // Animate out
        setTimeout(() => {
          card.style.transition = `opacity ${ANIMATION_DURATION}ms ease, transform ${ANIMATION_DURATION}ms ease`;
          card.style.opacity = "0";
          card.style.transform = "translateY(-20px)";
        }, delay);

        // Remove after animation completes so that brand-new cards added meanwhile are untouched
        setTimeout(() => {
          if (card.parentNode) {
            card.parentNode.removeChild(card);
          }
        }, delay + ANIMATION_DURATION);
      });
    } else {
      // No animation – remove immediately
      existingCards.forEach((card) => {
        if (card.parentNode) {
          card.parentNode.removeChild(card);
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
