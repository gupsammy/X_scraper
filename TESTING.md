# Testing Guide

## Automated Tests

### Filtering Logic Tests

Run the filtering test suite by opening `test-filtering.html` in your browser:

```bash
open test-filtering.html
# or
python -m http.server 8000  # then visit http://localhost:8000/test-filtering.html
```

The test suite covers:

- Simple keyword filtering
- Multiple term OR patterns
- Exact phrase matching
- Stock ticker patterns
- Hashtag and mention patterns
- Word boundary tests
- Case insensitivity
- Empty/null filter handling

## Manual Testing Checklist

### Basic Filtering Functionality

- [ ] **Setup**: Load extension in Chrome, navigate to Twitter bookmarks
- [ ] **Open Advanced Settings**: Click extension icon, expand "Advanced Settings"
- [ ] **Test Simple Keyword**: Enter `chatgpt`, start capture, verify only ChatGPT-related tweets are saved
- [ ] **Test Multiple Terms**: Enter `ai|ml|gpt`, verify tweets with any of these terms are captured
- [ ] **Test Invalid Regex**: Enter `*invalid`, verify error toast appears and capture doesn't start
- [ ] **Test Empty Filter**: Leave filter blank, verify all tweets are captured

### Auto-scroll Integration

- [ ] **Enable Auto-scroll**: Toggle auto-scroll ON, verify filter input becomes disabled
- [ ] **Disable Auto-scroll**: Toggle auto-scroll OFF, verify filter input becomes enabled
- [ ] **Filter with Auto-scroll**: Try to capture with both enabled, verify filter is ignored

### UI/UX Testing

- [ ] **Visual States**: Verify filter input shows correct disabled/enabled states
- [ ] **Error Feedback**: Test invalid regex shows red border and error message
- [ ] **Active Filter**: During capture with filter, verify green border indicates active filtering
- [ ] **Toast Messages**: Verify appropriate messages when toggling auto-scroll with active filter

### Edge Cases

- [ ] **Special Characters**: Test patterns with `$`, `@`, `#`, quotes
- [ ] **Unicode**: Test with emoji and international characters
- [ ] **Very Long Patterns**: Test with complex regex patterns
- [ ] **Performance**: Test filtering with high-volume capture (auto-scroll disabled)

### Cross-Platform Testing

- [ ] **Chrome**: Test on latest Chrome version
- [ ] **Different Screen Sizes**: Test popup layout on various screen resolutions
- [ ] **MacOS/Windows/Linux**: Verify consistent behavior across platforms

## Test Data

Use these Twitter pages for testing:

- **Bookmarks**: `twitter.com/i/bookmarks`
- **Tech Profile**: `twitter.com/elonmusk` or `twitter.com/sama`
- **Search Results**: `twitter.com/search?q=artificial%20intelligence`

## Common Test Patterns

```javascript
// Keywords
chatgpt
claude
ai

// Multiple terms (OR)
bitcoin|crypto|ethereum
react|vue|angular

// Exact phrases
"open source"
"machine learning"

// Stock tickers
\$[A-Z]{1,5}\b

// Hashtags
#\w+

// Mentions
@\w+

// Word boundaries
\b(AI|ML|LLM)\b
```

## Performance Benchmarks

Expected performance with filtering enabled:

- **Regex Compilation**: < 1ms per pattern
- **Tweet Filtering**: < 0.1ms per tweet
- **UI Updates**: < 50ms for visual feedback
- **Memory Usage**: No significant increase over baseline

## Debugging

Enable debug logging in browser console:

```javascript
// In browser console on Twitter page
localStorage.setItem("TC_DEBUG", "true");
```

Look for log messages:

- `Tweet matched filter: "..."`
- `Tweet filtered out: "..."`
- `Filter regex compiled: ...`
