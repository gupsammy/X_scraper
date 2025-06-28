// Quoted Tweet Component - Compact quoted tweet rendering
import { formatDate, formatNumber } from '../utils/formatters.js';
import { processTextLinks } from '../utils/textProcessor.js';
import { TweetMedia } from './TweetMedia.js';

export class QuotedTweet {
  constructor(quotedTweet) {
    this.quotedTweet = quotedTweet;
  }

  render() {
    const quotedContainer = document.createElement("div");
    quotedContainer.className = "quoted-tweet";

    // Author section
    const authorSection = this.createAuthorSection();
    quotedContainer.appendChild(authorSection);

    // Quote text
    const quoteText = document.createElement("div");
    quoteText.className = "quoted-text";
    quoteText.innerHTML = processTextLinks(this.quotedTweet.text || "");
    quotedContainer.appendChild(quoteText);

    // Media content
    if (this.quotedTweet.has_media && this.quotedTweet.media_info && this.quotedTweet.media_info.length > 0) {
      const quotedMedia = document.createElement("div");
      quotedMedia.className = "quoted-media";
      
      const mediaRenderer = new TweetMedia(quotedMedia, this.quotedTweet.media_info, this.quotedTweet);
      mediaRenderer.render();
      
      quotedContainer.appendChild(quotedMedia);
    }

    // Footer with stats and link
    const footerSection = this.createFooterSection();
    quotedContainer.appendChild(footerSection);

    return quotedContainer;
  }

  createAuthorSection() {
    const authorSection = document.createElement("div");
    authorSection.className = "quoted-author";

    // Avatar
    if (this.quotedTweet.author_profile_image_url) {
      const avatarLink = document.createElement("a");
      avatarLink.href = `https://x.com/${this.quotedTweet.author_screen_name || "unknown"}`;
      avatarLink.target = "_blank";
      avatarLink.rel = "noopener noreferrer";
      avatarLink.className = "quoted-avatar-link";

      const avatar = document.createElement("img");
      avatar.src = this.quotedTweet.author_profile_image_url;
      avatar.alt = this.quotedTweet.author_name || "Unknown";
      avatar.className = "quoted-avatar";

      avatarLink.appendChild(avatar);
      authorSection.appendChild(avatarLink);
    }

    // Author info container
    const authorInfo = document.createElement("div");
    authorInfo.className = "quoted-author-info";

    // Author name
    const authorNameLink = document.createElement("a");
    authorNameLink.href = `https://x.com/${this.quotedTweet.author_screen_name || "unknown"}`;
    authorNameLink.target = "_blank";
    authorNameLink.rel = "noopener noreferrer";
    authorNameLink.className = "quoted-author-name";
    authorNameLink.textContent = this.quotedTweet.author_name || "Unknown User";

    // Handle and timestamp
    const metaInfo = document.createElement("span");
    metaInfo.className = "quoted-meta";
    
    const handle = document.createElement("span");
    handle.className = "quoted-handle";
    handle.textContent = `@${this.quotedTweet.author_screen_name || "unknown"}`;
    
    metaInfo.appendChild(handle);

    if (this.quotedTweet.created_at) {
      const separator = document.createElement("span");
      separator.textContent = " · ";
      separator.className = "meta-separator";
      
      const timestamp = document.createElement("span");
      timestamp.className = "quoted-timestamp";
      timestamp.textContent = formatDate(this.quotedTweet.created_at);
      
      metaInfo.appendChild(separator);
      metaInfo.appendChild(timestamp);
    }

    authorInfo.appendChild(authorNameLink);
    authorInfo.appendChild(metaInfo);
    authorSection.appendChild(authorInfo);

    return authorSection;
  }

  createFooterSection() {
    const footerSection = document.createElement("div");
    footerSection.className = "quoted-footer";

    // Engagement stats (only if there are any)
    if (this.hasEngagementStats()) {
      const statsContainer = document.createElement("div");
      statsContainer.className = "quoted-stats";

      if (this.quotedTweet.reply_count > 0) {
        const replies = this.createStatElement("reply", this.quotedTweet.reply_count);
        statsContainer.appendChild(replies);
      }

      if (this.quotedTweet.retweet_count > 0) {
        const retweets = this.createStatElement("retweet", this.quotedTweet.retweet_count);
        statsContainer.appendChild(retweets);
      }

      if (this.quotedTweet.like_count > 0) {
        const likes = this.createStatElement("like", this.quotedTweet.like_count);
        statsContainer.appendChild(likes);
      }

      footerSection.appendChild(statsContainer);
    }

    // View original link
    if (this.quotedTweet.tweet_url) {
      const viewLink = document.createElement("a");
      viewLink.href = this.quotedTweet.tweet_url;
      viewLink.target = "_blank";
      viewLink.rel = "noopener noreferrer";
      viewLink.className = "quoted-view-link";
      viewLink.innerHTML = `
        <svg viewBox="0 0 24 24" class="quoted-link-icon">
          <path d="M18.36 5.64c-1.95-1.96-5.11-1.96-7.07 0L9.88 7.05 8.46 5.64l1.42-1.42c2.73-2.73 7.16-2.73 9.9 0 2.73 2.74 2.73 7.17 0 9.9l-1.42 1.42-1.41-1.42 1.41-1.41c1.96-1.96 1.96-5.12 0-7.07z"></path>
          <path d="m15.54 18.36-1.41 1.42c-2.73 2.73-7.16 2.73-9.9 0-2.73-2.74-2.73-7.17 0-9.9l1.42-1.42 1.41 1.42-1.41 1.41c-1.96 1.96-1.96 5.12 0 7.07 1.95 1.96 5.11 1.96 7.07 0l1.41-1.42 1.41 1.42z"></path>
          <path d="m14.12 11.46-4.24 4.24-1.42-1.42 4.24-4.24 1.42 1.42z"></path>
        </svg>
        View on X
      `;
      footerSection.appendChild(viewLink);
    }

    return footerSection;
  }

  createStatElement(type, count) {
    const stat = document.createElement("span");
    stat.className = "quoted-stat";

    const icons = {
      reply: `<path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01z"></path>`,
      retweet: `<path d="M4.75 3.79l4.603 4.3-1.706 1.82L6 8.38v7.37c0 .97.784 1.75 1.75 1.75H13V20H7.75c-2.347 0-4.25-1.9-4.25-4.25V8.38L1.853 9.91.147 8.09l4.603-4.3zm11.5 2.71H11V4h5.25c2.347 0 4.25 1.9 4.25 4.25v7.37l1.647-1.53 1.706 1.82-4.603 4.3-4.603-4.3 1.706-1.82L18 15.62V8.25c0-.97-.784-1.75-1.75-1.75z"></path>`,
      like: `<path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"></path>`
    };

    stat.innerHTML = `
      <svg viewBox="0 0 24 24" class="quoted-stat-icon">
        ${icons[type]}
      </svg>
      ${formatNumber(count)}
    `;

    return stat;
  }

  hasEngagementStats() {
    return (
      (this.quotedTweet.reply_count && this.quotedTweet.reply_count > 0) ||
      (this.quotedTweet.retweet_count && this.quotedTweet.retweet_count > 0) ||
      (this.quotedTweet.like_count && this.quotedTweet.like_count > 0)
    );
  }
}