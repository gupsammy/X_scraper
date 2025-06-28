// Formatters - Date, number, and text formatting utilities

export function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

export function formatNumber(num) {
  if (!num || isNaN(num)) return "0";

  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

export function formatDuration(durationMs) {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  } else {
    return `0:${remainingSeconds.toString().padStart(2, "0")}`;
  }
}

export function generateAltText(tweetText) {
  if (!tweetText) return "Tweet media";

  const cleanText = tweetText.replace(/https?:\/\/[^\s]+/g, "").trim();
  return cleanText.length > 100
    ? cleanText.substring(0, 97) + "..."
    : cleanText || "Tweet media";
}

export function truncateText(text, maxLength = 280) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}