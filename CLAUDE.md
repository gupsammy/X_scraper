# Twitter Collector Extension

Chrome Extension (Manifest V3) that captures tweets by intercepting Twitter's GraphQL API. All data stored locally in IndexedDB.

**Stack**: Vanilla JS, Chrome Extension APIs, IndexedDB, ES6 Modules

## Architecture

```
content-script.js      → Main orchestrator, injects page-interceptor
js/database.js         → TwitterDatabase class (IndexedDB v2)
js/data-extractor.js   → TwitterDataExtractor parses GraphQL responses
js/utils.js            → detectPageContext(), matchesAPIPattern(), helpers
js/auto-scroller.js    → Auto-scroll with rate limiting
js/page-interceptor.js → Injected XHR/fetch interceptor (page context)
background.js          → Service worker, message routing, DB sync
popup/                 → Extension popup UI
data-viewer/           → Modular ES6 viewer (src/ has components)
```

## Key Patterns

### API Interception

Captured endpoints (patterns in `matchesAPIPattern()` in utils.js):
- `Bookmarks`, `UserTweets`, `SearchTimeline`, `HomeTimeline`, `HomeLatestTimeline`, `ExplorePage`

### GraphQL Response Paths

```javascript
// Bookmarks → data.bookmark_timeline_v2.timeline.instructions
// User tweets → data.user.result.timeline.timeline.instructions
// Home timeline → data.home.home_timeline_urt.instructions
// Search → data.search_by_raw_query.search_timeline.timeline.instructions
// Explore → data.explore_page.body.initialTimeline.timeline.timeline.instructions
```

### Tweet Text Extraction (priority order)

1. `note_tweet.note_tweet_results.result.text` (long-form)
2. Retweet's original `legacy.full_text`
3. `legacy.full_text` (standard)

### Page Context Detection

`detectPageContext()` returns `{type, displayName, description}`:
- `/bookmarks` → `bookmarks`
- `/search?q=` → `search`
- `/home` → `homeTimeline`
- `/explore` → `exploreForYou`
- `/@username` (no /status/) → `usertweets`

### Database

**tweets** store: Primary key `id`, indexes: `source_category`, `created_at`, `author_screen_name`, `capture_session_id`, `author_id`, `unique_key`

**capture_sessions** store: Tracks capture metadata

Schema changes: increment `dbVersion` in database.js, add migration in `onupgradeneeded`

### Message Flow

- Page → Content script: `postMessage` with `TC_INTERCEPTOR` source
- Content script ↔ Popup: Chrome runtime messaging
- Background ↔ Data Viewer: Tweet CRUD operations

## Data Viewer Components

`data-viewer/src/` modular structure:
- **UI**: TweetCard, TweetGrid, FilterBar, Modal, QuotedTweet, TweetMedia, ConversationThread, Toast
- **Data**: TweetDataService, ExtensionBridge, IndexedDBRepository
- **State**: AppState (centralized)

## Development

### Load Extension
`chrome://extensions/` → Developer mode → Load unpacked

### Debug
- Console: `[Twitter Collector]` prefix via `debugLog()`
- Popup: Right-click extension icon → Inspect popup
- Data viewer: `data-viewer/debug.html`

## Common Tasks

### Add New API Endpoint
1. Add pattern to `API_PATTERNS` in `js/utils.js`
2. Add extraction method in `TwitterDataExtractor`
3. Update `detectPageContext()` for new page type
4. Add case in `popup.js` UI

## Code Conventions

- Debug logging via `debugLog()` with `[Twitter Collector]` prefix
- Safe JSON parsing via `safeJSONParse()`
- Duplicate prevention: in-memory Set + IndexedDB primary key
- All data stored locally (no external servers)
- Manifest V3 CSP compliant
