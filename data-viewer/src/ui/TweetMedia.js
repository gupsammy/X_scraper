// Tweet Media Component - Smart media rendering with size constraints
import { formatDuration, generateAltText } from '../utils/formatters.js';
import { MEDIA_CONSTRAINTS } from '../utils/constants.js';

export class TweetMedia {
  constructor(container, mediaInfo, tweet) {
    this.container = container;
    this.mediaInfo = mediaInfo;
    this.tweet = tweet;
  }

  render() {
    this.container.innerHTML = "";
    
    if (!this.mediaInfo || this.mediaInfo.length === 0) {
      this.container.style.display = "none";
      return;
    }

    this.container.style.display = "block";
    this.setupMediaLayout();

    this.mediaInfo.forEach((media, index) => {
      if (index >= 4) return; // Limit to 4 media items

      const mediaItem = document.createElement("div");
      mediaItem.className = "media-item";

      try {
        switch (media.type) {
          case "photo":
            this.createImageElement(mediaItem, media);
            break;
          case "video":
            this.createVideoElement(mediaItem, media);
            break;
          case "animated_gif":
            this.createGifElement(mediaItem, media);
            break;
          default:
            this.createErrorElement(mediaItem, "Unsupported media type");
        }

        this.container.appendChild(mediaItem);
      } catch (error) {
        console.error("Error creating media element:", error);
        this.createErrorElement(mediaItem, "Failed to load media");
        this.container.appendChild(mediaItem);
      }
    });
  }

  setupMediaLayout() {
    const mediaCount = this.mediaInfo.length;
    
    // Remove existing layout classes
    this.container.classList.remove("single-media", "two-media", "three-media", "four-media");
    
    // Analyze aspect ratios for optimal layout
    const aspectRatios = this.mediaInfo.map(media => {
      if (media.width && media.height && media.width > 0 && media.height > 0) {
        return media.width / media.height;
      }
      return 1; // default square
    });
    
    const avgAspectRatio = aspectRatios.reduce((sum, ratio) => sum + ratio, 0) / aspectRatios.length;
    const isWideMedia = avgAspectRatio > 1.5;
    
    // Set grid layout based on count and aspect ratio
    if (mediaCount === 1) {
      this.container.classList.add("single-media");
      this.container.style.gridTemplateColumns = "1fr";
    } else if (mediaCount === 2) {
      this.container.classList.add("two-media");
      this.container.style.gridTemplateColumns = isWideMedia ? "1fr" : "1fr 1fr";
    } else if (mediaCount === 3) {
      this.container.classList.add("three-media");
      this.container.style.gridTemplateColumns = "1fr 1fr";
    } else {
      this.container.classList.add("four-media");
      this.container.style.gridTemplateColumns = "1fr 1fr";
    }
  }

  createImageElement(mediaItem, media) {
    const img = document.createElement("img");
    img.src = media.media_url || media.preview_url;
    img.alt = generateAltText(this.tweet.full_text);
    img.loading = "lazy";
    img.className = "media-image";

    // Smart sizing based on aspect ratio and media count
    this.applySmartSizing(img, media);

    // Click handler for full-size view
    img.addEventListener("click", () => {
      this.openMediaModal(media.media_url || media.preview_url, "image");
    });

    // Error handling
    img.addEventListener("error", () => {
      this.createErrorElement(mediaItem, "Image failed to load");
    });

    mediaItem.appendChild(img);
  }

  createVideoElement(mediaItem, media) {
    const video = document.createElement("video");
    video.controls = true;
    video.preload = "metadata";
    video.poster = media.preview_url;
    video.className = "media-video";

    // Smart sizing
    this.applySmartSizing(video, media);

    // Source element
    const source = document.createElement("source");
    source.src = media.media_url;
    source.type = "video/mp4";
    video.appendChild(source);

    // Type indicator
    const typeIndicator = document.createElement("div");
    typeIndicator.className = "media-type-indicator video";
    typeIndicator.textContent = "VIDEO";
    mediaItem.appendChild(typeIndicator);

    // Duration badge
    if (media.duration_ms) {
      const durationBadge = document.createElement("div");
      durationBadge.className = "media-duration";
      durationBadge.textContent = formatDuration(media.duration_ms);
      mediaItem.appendChild(durationBadge);
    }

    // Error handling
    video.addEventListener("error", () => {
      this.createErrorElement(mediaItem, "Video failed to load");
    });

    mediaItem.appendChild(video);
  }

  createGifElement(mediaItem, media) {
    const video = document.createElement("video");
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.controls = false;
    video.poster = media.preview_url;
    video.className = "media-gif";

    // Smart sizing
    this.applySmartSizing(video, media);

    // Source element
    const source = document.createElement("source");
    source.src = media.media_url;
    source.type = "video/mp4";
    video.appendChild(source);

    // Type indicator
    const typeIndicator = document.createElement("div");
    typeIndicator.className = "media-type-indicator gif";
    typeIndicator.textContent = "GIF";
    mediaItem.appendChild(typeIndicator);

    // Play/pause on click
    video.addEventListener("click", () => {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    });

    // Error handling
    video.addEventListener("error", () => {
      this.createErrorElement(mediaItem, "GIF failed to load");
    });

    mediaItem.appendChild(video);
  }

  applySmartSizing(element, media) {
    const maxHeight = MEDIA_CONSTRAINTS.MAX_HEIGHT;
    const maxWidth = MEDIA_CONSTRAINTS.MAX_WIDTH;

    if (media.width && media.height) {
      const aspectRatio = media.width / media.height;
      
      // Very wide media - constrain height
      if (aspectRatio > 2) {
        element.style.maxHeight = `${maxHeight}px`;
        element.style.width = "100%";
        element.style.objectFit = "cover";
      } 
      // Very tall media - constrain width  
      else if (aspectRatio < 0.5) {
        element.style.maxWidth = `${maxWidth}px`;
        element.style.height = "auto";
        element.style.objectFit = "cover";
      }
      // Normal aspect ratio
      else {
        element.style.maxHeight = `${maxHeight}px`;
        element.style.maxWidth = `${maxWidth}px`;
        element.style.width = "100%";
        element.style.height = "auto";
        element.style.objectFit = "cover";
      }
    } else {
      // Default sizing when dimensions not available
      element.style.maxHeight = `${maxHeight}px`;
      element.style.width = "100%";
      element.style.objectFit = "cover";
    }

    // Ensure all media has rounded corners and consistent styling
    element.style.borderRadius = "12px";
    element.style.cursor = "pointer";
  }

  createErrorElement(mediaItem, errorMessage) {
    mediaItem.innerHTML = "";
    mediaItem.classList.add("error");

    const errorContainer = document.createElement("div");
    errorContainer.className = "media-error";
    errorContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 150px;
      background: #f8f9fa;
      border-radius: 12px;
      color: #6c757d;
      font-size: 14px;
    `;

    const errorIcon = document.createElement("div");
    errorIcon.textContent = "⚠️";
    errorIcon.style.fontSize = "24px";
    errorIcon.style.marginBottom = "8px";

    const errorText = document.createElement("div");
    errorText.textContent = errorMessage;

    errorContainer.appendChild(errorIcon);
    errorContainer.appendChild(errorText);
    mediaItem.appendChild(errorContainer);
  }

  openMediaModal(mediaUrl, mediaType) {
    // Dispatch custom event to be handled by main app
    const event = new CustomEvent('openMediaModal', {
      detail: { mediaUrl, mediaType }
    });
    document.dispatchEvent(event);
  }
}