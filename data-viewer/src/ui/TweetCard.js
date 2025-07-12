// Tweet Card Component - Compact, responsive tweet card
import { formatDate, formatNumber, truncateText } from "../utils/formatters.js";
import { processTextLinks } from "../utils/textProcessor.js";
import { TweetMedia } from "./TweetMedia.js";
import { QuotedTweet } from "./QuotedTweet.js";

export class TweetCard {
  constructor(tweet, options = {}) {
    this.tweet = tweet;
    this.options = {
      compact: false,
      showFullText: false,
      isReply: false,
      isMainTweet: false,
      conversationMode: false,
      ...options,
    };
    this.element = null;
  }

  render() {
    this.element = document.createElement("article");
    let className = `tweet-card ${this.options.compact ? "compact" : ""}`;

    // Add conversation-specific classes
    if (this.options.conversationMode) {
      className += " conversation-tweet";
      if (this.options.isReply) {
        className += " reply-tweet";
      }
      if (this.options.isMainTweet) {
        className += " main-tweet";
      }
    }

    this.element.className = className;
    this.element.dataset.tweetId = this.tweet.id;

    // Build card structure with dynamic layout for conversation mode
    if (this.options.conversationMode) {
      this.element.innerHTML = `
        <div class="tweet-body">
          <div class="tweet-header">
            ${this.renderAuthorSection()}
            ${this.renderMetaSection()}
          </div>
          <div class="tweet-content">
            ${this.renderTextContent()}
            ${this.renderQuotedTweet()}
            <div class="tweet-media"></div>
          </div>
        </div>
        <div class="tweet-footer">
          ${this.renderEngagementStats()}
          ${this.renderActions()}
        </div>
      `;
    } else {
      // Standard layout for individual tweets
      this.element.innerHTML = `
        <div class="tweet-header">
          ${this.renderAuthorSection()}
          ${this.renderMetaSection()}
        </div>
        <div class="tweet-content">
          ${this.renderTextContent()}
          ${this.renderQuotedTweet()}
          <div class="tweet-media"></div>
        </div>
        <div class="tweet-footer">
          ${this.renderEngagementStats()}
          ${this.renderActions()}
        </div>
      `;
    }

    // Render media if present
    if (
      this.tweet.has_media &&
      this.tweet.media_info &&
      this.tweet.media_info.length > 0
    ) {
      const mediaContainer = this.element.querySelector(".tweet-media");
      const mediaRenderer = new TweetMedia(
        mediaContainer,
        this.tweet.media_info,
        this.tweet
      );
      mediaRenderer.render();
    }

    // Add event listeners
    this.attachEventListeners();

    return this.element;
  }

  renderAuthorSection() {
    const authorProfileUrl = `https://x.com/${
      this.tweet.author_screen_name || "unknown"
    }`;

    return `
      <div class="tweet-author">
        <a href="${authorProfileUrl}" target="_blank" rel="noopener noreferrer" class="author-avatar-link">
          <img 
            src="${
              this.tweet.author_profile_image_url || "../icons/icon48.png"
            }" 
            alt="${this.tweet.author_name || "Unknown"}" 
            class="author-avatar"
            loading="lazy"
          />
        </a>
        <div class="author-info">
          <div class="author-name-row">
            <a href="${authorProfileUrl}" target="_blank" rel="noopener noreferrer" class="author-name">
              ${this.tweet.author_name || "Unknown User"}
            </a>
            ${
              this.tweet.author_verified
                ? '<span class="verified-badge">✓</span>'
                : ""
            }
          </div>
          <div class="author-handle">@${
            this.tweet.author_screen_name || "unknown"
          }</div>
        </div>
      </div>
    `;
  }

  renderMetaSection() {
    // Build tags markup (supports both array and single string properties)
    let tags = [];
    if (Array.isArray(this.tweet.tags)) {
      tags = this.tweet.tags;
    } else if (this.tweet.filter_regex) {
      tags = [this.tweet.filter_regex];
    }

    const tagsHtml = tags
      .filter((tag) => tag && tag.trim() !== "")
      .map((tag) => `<span class="tag-badge" title="Filter tag">${tag}</span>`) // Escape tag? assume safe
      .join("");

    return `
      <div class="tweet-meta">
        <span class="tweet-date">${formatDate(this.tweet.created_at)}</span>
        <span class="source-badge ${this.tweet.source_category}">${
      this.tweet.source_category
    }</span>
        ${tagsHtml}
        ${
          this.tweet.is_pinned
            ? '<span class="pinned-badge">📌 Pinned</span>'
            : ""
        }
      </div>
    `;
  }

  renderTextContent() {
    const fullText = this.tweet.full_text || "";
    const isLongText = fullText.length > 280;

    if (this.options.compact && isLongText && !this.options.showFullText) {
      const truncated = truncateText(fullText, 200);
      return `
        <div class="tweet-text">
          ${processTextLinks(truncated)}
          <button class="read-more-btn" data-action="expand">Read more</button>
        </div>
      `;
    }

    return `
      <div class="tweet-text">
        ${processTextLinks(fullText)}
        ${
          isLongText && this.options.showFullText
            ? '<button class="read-less-btn" data-action="collapse">Show less</button>'
            : ""
        }
      </div>
    `;
  }

  renderQuotedTweet() {
    if (!this.tweet.quoted_tweet) return "";

    const quotedTweetRenderer = new QuotedTweet(this.tweet.quoted_tweet);
    const quotedElement = quotedTweetRenderer.render();

    // Return as string for innerHTML (we'll replace with actual element after)
    return '<div class="quoted-tweet-placeholder"></div>';
  }

  renderEngagementStats() {
    return `
      <div class="engagement-stats">
        <span class="stat replies" title="Replies">
          <svg viewBox="0 0 24 24" class="stat-icon">
            <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z"></path>
          </svg>
          ${formatNumber(this.tweet.reply_count)}
        </span>
        <span class="stat retweets" title="Retweets">
          <svg viewBox="0 0 24 24" class="stat-icon">
            <path d="M4.75 3.79l4.603 4.3-1.706 1.82L6 8.38v7.37c0 .97.784 1.75 1.75 1.75H13V20H7.75c-2.347 0-4.25-1.9-4.25-4.25V8.38L1.853 9.91.147 8.09l4.603-4.3zm11.5 2.71H11V4h5.25c2.347 0 4.25 1.9 4.25 4.25v7.37l1.647-1.53 1.706 1.82-4.603 4.3-4.603-4.3 1.706-1.82L18 15.62V8.25c0-.97-.784-1.75-1.75-1.75z"></path>
          </svg>
          ${formatNumber(this.tweet.retweet_count)}
        </span>
        <span class="stat likes" title="Likes">
          <svg viewBox="0 0 24 24" class="stat-icon">
            <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>
          </svg>
          ${formatNumber(this.tweet.like_count)}
        </span>
        ${
          this.tweet.view_count
            ? `
          <span class="stat views" title="Views">
            <svg viewBox="0 0 24 24" class="stat-icon">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path>
            </svg>
            ${formatNumber(this.tweet.view_count)}
          </span>
        `
            : ""
        }
      </div>
    `;
  }

  renderActions() {
    return `
      <div class="tweet-actions">
        <a href="${this.tweet.tweet_url}" target="_blank" rel="noopener noreferrer" class="action-btn view-original" title="View on X">
          <svg viewBox="0 0 24 24" class="action-icon">
            <path d="M18.36 5.64c-1.95-1.96-5.11-1.96-7.07 0L9.88 7.05 8.46 5.64l1.42-1.42c2.73-2.73 7.16-2.73 9.9 0 2.73 2.74 2.73 7.17 0 9.9l-1.42 1.42-1.41-1.42 1.41-1.41c1.96-1.96 1.96-5.12 0-7.07z"></path>
            <path d="m15.54 18.36-1.41 1.42c-2.73 2.73-7.16 2.73-9.9 0-2.73-2.74-2.73-7.17 0-9.9l1.42-1.42 1.41 1.42-1.41 1.41c-1.96 1.96-1.96 5.12 0 7.07 1.95 1.96 5.11 1.96 7.07 0l1.41-1.42 1.41 1.42z"></path>
            <path d="m14.12 11.46-4.24 4.24-1.42-1.42 4.24-4.24 1.42 1.42z"></path>
          </svg>
        </a>
        <button class="action-btn copy-link" data-action="copy" title="Copy link">
          <svg viewBox="0 0 24 24" class="action-icon">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path>
          </svg>
        </button>
        <button class="action-btn delete-tweet" data-action="delete" title="Delete tweet">
          <svg viewBox="0 0 24 24" class="action-icon">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path>
          </svg>
        </button>
      </div>
    `;
  }

  attachEventListeners() {
    // Handle quoted tweet placeholder replacement
    if (this.tweet.quoted_tweet) {
      const placeholder = this.element.querySelector(
        ".quoted-tweet-placeholder"
      );
      if (placeholder) {
        const quotedTweetRenderer = new QuotedTweet(this.tweet.quoted_tweet);
        const quotedElement = quotedTweetRenderer.render();
        placeholder.replaceWith(quotedElement);
      }
    }

    // Read more/less functionality
    const readMoreBtn = this.element.querySelector(".read-more-btn");
    const readLessBtn = this.element.querySelector(".read-less-btn");

    if (readMoreBtn) {
      readMoreBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.options.showFullText = true;
        this.refreshTextContent();
      });
    }

    if (readLessBtn) {
      readLessBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.options.showFullText = false;
        this.refreshTextContent();
      });
    }

    // Copy link functionality
    const copyBtn = this.element.querySelector(".copy-link");
    if (copyBtn) {
      copyBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.copyToClipboard(this.tweet.tweet_url);
      });
    }

    // Delete functionality
    const deleteBtn = this.element.querySelector(".delete-tweet");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.deleteTweet();
      });
    }
  }

  refreshTextContent() {
    const textContainer = this.element.querySelector(".tweet-text");
    textContainer.innerHTML = this.renderTextContent().match(
      /<div class="tweet-text">(.*)<\/div>/s
    )[1];

    // Re-attach text-related event listeners
    const readMoreBtn = textContainer.querySelector(".read-more-btn");
    const readLessBtn = textContainer.querySelector(".read-less-btn");

    if (readMoreBtn) {
      readMoreBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.options.showFullText = true;
        this.refreshTextContent();
      });
    }

    if (readLessBtn) {
      readLessBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.options.showFullText = false;
        this.refreshTextContent();
      });
    }
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

  deleteTweet() {
    if (!confirm("Are you sure you want to delete this tweet?")) {
      return;
    }

    // Dispatch custom event to be handled by main app
    const event = new CustomEvent("deleteTweet", {
      detail: { tweetId: this.tweet.id },
    });
    document.dispatchEvent(event);
  }

  showToast(message, type = "success") {
    // Dispatch custom event to be handled by main app
    const event = new CustomEvent("showToast", {
      detail: { message, type },
    });
    document.dispatchEvent(event);
  }

  // Update card data (for when tweet data changes)
  updateData(newTweet) {
    this.tweet = newTweet;
    // Re-render the card
    const newElement = this.render();
    if (this.element && this.element.parentNode) {
      this.element.parentNode.replaceChild(newElement, this.element);
    }
  }

  // Get the DOM element
  getElement() {
    return this.element;
  }
}
