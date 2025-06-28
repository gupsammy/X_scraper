// Text Processor - HTML entities, links, mentions, hashtags

export function decodeHtmlEntities(text) {
  if (!text) return "";

  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

export function processTextLinks(text) {
  if (!text) return "";

  // First decode any existing HTML entities to get the actual text
  let processedText = decodeHtmlEntities(text);

  // Escape HTML to prevent XSS
  processedText = processedText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // Process URLs - match http/https URLs
  processedText = processedText.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Process @mentions
  processedText = processedText.replace(
    /@([a-zA-Z0-9_]+)/g,
    '<a href="https://x.com/$1" target="_blank" rel="noopener noreferrer" class="mention">@$1</a>'
  );

  // Process hashtags
  processedText = processedText.replace(
    /#([a-zA-Z0-9_]+)/g,
    '<a href="https://x.com/hashtag/$1" target="_blank" rel="noopener noreferrer" class="hashtag">#$1</a>'
  );

  return processedText;
}

export function extractMentions(text) {
  if (!text) return [];
  const mentions = text.match(/@([a-zA-Z0-9_]+)/g);
  return mentions ? mentions.map(m => m.substring(1)) : [];
}

export function extractHashtags(text) {
  if (!text) return [];
  const hashtags = text.match(/#([a-zA-Z0-9_]+)/g);
  return hashtags ? hashtags.map(h => h.substring(1)) : [];
}

export function extractUrls(text) {
  if (!text) return [];
  const urls = text.match(/(https?:\/\/[^\s]+)/g);
  return urls || [];
}