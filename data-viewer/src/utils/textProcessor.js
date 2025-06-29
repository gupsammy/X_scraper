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

  // Preserve line breaks by converting them to <br> tags
  processedText = processedText.replace(/\n/g, '<br>');

  // Process URLs - match http/https URLs (improved regex to handle edge cases)
  processedText = processedText.replace(
    /(https?:\/\/(?:[-\w.])+(?:\:[0-9]+)?(?:\/(?:[\w\/_.])*)?(?:\?(?:[\w&=%.])*)?(?:\#(?:[\w.])*)?)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="url-link">$1</a>'
  );

  // Process @mentions (improved to handle edge cases and unicode characters)
  processedText = processedText.replace(
    /@([a-zA-Z0-9_]+)/g,
    '<a href="https://x.com/$1" target="_blank" rel="noopener noreferrer" class="mention">@$1</a>'
  );

  // Process hashtags (improved to handle edge cases and unicode characters)
  processedText = processedText.replace(
    /#([a-zA-Z0-9_\u00c0-\u017f\u0400-\u04ff]+)/g,
    '<a href="https://x.com/hashtag/$1" target="_blank" rel="noopener noreferrer" class="hashtag">#$1</a>'
  );

  // Process cashtags (financial symbols like $AAPL)
  processedText = processedText.replace(
    /\$([A-Z]{1,6}(?:\.[A-Z]{1,2})?)/g,
    '<a href="https://x.com/search?q=%24$1" target="_blank" rel="noopener noreferrer" class="cashtag">$$1</a>'
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