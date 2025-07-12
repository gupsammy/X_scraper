# Twitter Bookmark & Tweet Collector

A Chrome extension that captures and stores Twitter bookmarks and user tweets locally for personal knowledge management.

## Features

- 🔖 **Capture Twitter Bookmarks** - Automatically save your bookmarked tweets
- 👤 **Capture User Tweets** - Save tweets from any user's profile  
- 🎯 **Advanced Filtering** - Filter tweets during capture using regex patterns or keywords
- 🔍 **Smart Page Detection** - Automatically detects bookmark pages vs user profiles
- 💾 **Local Storage** - All data stored securely in your browser's IndexedDB
- 📊 **Data Viewer** - Beautiful interface to view, search, and filter captured tweets
- 🚀 **Real-time Capture** - Live progress tracking as you scroll and load tweets
- ⚡ **Auto-scroll** - Intelligent auto-scrolling with configurable speed control
- 📋 **Export Data** - Export your captured tweets to JSON format

## Installation

1. **Download/Clone** this repository to your local machine
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** (toggle in top-right corner)
4. **Click "Load unpacked"** and select the `X_scraper` folder
5. **Pin the extension** to your toolbar for easy access

## How to Use

### Capturing Tweets

1. **Go to Twitter** (`twitter.com` or `x.com`)
2. **Navigate to one of these pages**:

   - Your bookmarks: `twitter.com/i/bookmarks`
   - Any user profile: `twitter.com/username`
   - Search results: `twitter.com/search?q=something`

3. **Click the extension icon** in your toolbar
4. **(Optional) Configure Advanced Settings**:
   - Click "Advanced Settings" to expand options
   - Enter a regex pattern or keywords to filter tweets during capture
   - Enable/disable auto-scroll and adjust speed
5. **Click "Start Listening"** in the popup  
6. **Scroll down** to load more tweets - they'll be captured automatically (or enable auto-scroll)
7. **Click "Stop Capture"** when finished

### Advanced Filtering

The extension supports selective tweet filtering using regular expressions or keywords. **Note: Filtering only works when auto-scroll is disabled** to avoid performance issues during high-volume capture.

#### Filter Examples

**Keywords:**
- `AI` - Capture tweets containing "AI" (case-insensitive)
- `javascript|typescript` - Tweets mentioning either JavaScript or TypeScript
- `#BlackFriday` - Tweets with specific hashtags

**Regular Expressions:**
- `\b(bug|issue|fix)\b` - Tweets about bugs, issues, or fixes
- `https://github\.com` - Tweets with GitHub links
- `@(elonmusk|sundarpichai)` - Tweets mentioning specific users
- `\$[A-Z]{1,5}\b` - Tweets mentioning stock symbols

**Date/Time Patterns:**
- `\b202[3-4]\b` - Tweets mentioning years 2023 or 2024
- `[Jj]anuary|[Ff]ebruary` - Tweets mentioning specific months

#### How to Use Filters

1. **Open Advanced Settings** in the popup
2. **Enter your pattern** in the "Advanced Search" field
3. **Ensure auto-scroll is OFF** (filtering is disabled during auto-scroll)
4. **Start capture** - only matching tweets will be saved
5. **Empty field** captures all tweets (default behavior)

### Viewing Your Data

1. **Click the extension icon**
2. **Click "View Data"**
3. **Use the filters** to search and sort your tweets:
   - Filter by source (bookmarks, profiles, search)
   - Search tweet content, authors, or usernames
   - Sort by date, likes, retweets, etc.

### Additional Features

- **Context Menu**: Right-click on Twitter pages for quick capture options
- **Export**: Export filtered tweets to JSON format
- **Delete**: Remove individual tweets or clear all data
- **Real-time Stats**: Track your collection statistics

## Supported Pages

- ✅ Twitter Bookmarks (`/i/bookmarks`)
- ✅ User Profiles (`/username`)
- ✅ Search Results (`/search?q=`)
- 🚧 Home Timeline (coming soon)
- 🚧 Lists (coming soon)

## Technical Details

### Data Captured

- Complete tweet text (including long-form tweets)
- Author information (name, handle, verification status)
- Engagement metrics (likes, retweets, replies, views)
- Tweet metadata (timestamp, URLs, media info)
- Source categorization for filtering

### Privacy & Security

- All data stored **locally** in your browser's IndexedDB
- No data sent to external servers
- No tracking or analytics
- Open source code for transparency

## Troubleshooting

### Popup appears as vertical line

- Refresh the extension by disabling and re-enabling it
- Try reloading the Twitter page

### Extension not detecting page context

- Make sure you're on a supported Twitter page
- Try refreshing the page and reopening the extension popup

### No tweets being captured

- Ensure you've clicked "Start Capture"
- Check that you're scrolling to load new tweets
- Verify the page is supported (bookmarks, profiles, search)

## Development

### File Structure

```
X_scraper/
├── manifest.json           # Extension configuration
├── background.js           # Service worker & context menus
├── content-script.js       # API interception & capture logic
├── popup/                  # Extension popup interface
├── data-viewer/           # Tweet viewing interface
├── js/                    # Core modules (database, extraction, utils)
└── icons/                 # Extension icons
```

### Key Technologies

- **Chrome Extensions Manifest V3**
- **IndexedDB** for local data storage
- **XMLHttpRequest/Fetch Interception** for API capture
- **Vanilla JavaScript** (no frameworks)
- **Modern CSS** with responsive design

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use and modify as needed.

## Disclaimer

This extension is for personal use only. Respect Twitter's Terms of Service and rate limits. The extension captures publicly available data that you already have access to through the Twitter interface.
