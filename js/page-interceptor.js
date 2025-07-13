// Twitter Collector Page Interceptor
// This script runs in the page context (not extension isolated world)
// It overrides XMLHttpRequest and fetch to capture Twitter GraphQL responses
// Matching our API patterns and posts them back via window.postMessage.

(function () {
  const API_PATTERNS = {
    bookmarks: /\/i\/api\/graphql\/[^\/]+\/Bookmarks/i,
    userTweets: /\/i\/api\/graphql\/[^\/]+\/UserTweets/i,
    searchResults: /\/i\/api\/graphql\/[^\/]+\/SearchTimeline/i,
    homeTimeline: /\/i\/api\/graphql\/[^\/]+\/HomeTimeline/i,
    homeLatestTimeline: /\/i\/api\/graphql\/[^\/]+\/HomeLatestTimeline/i,
    exploreForYou: /\/i\/api\/graphql\/[^\/]+\/ExplorePage/i,
  };

  function matchApi(url) {
    for (const [type, pattern] of Object.entries(API_PATTERNS)) {
      if (pattern.test(url)) return type;
    }
    return null;
  }

  // ---------------- XHR -----------------
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this.__tc_url = url;
    return originalXhrOpen.apply(this, [method, url, ...args]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        const url = this.__tc_url || this.responseURL;
        const apiType = matchApi(url);
        if (!apiType) return;

        window.postMessage(
          {
            source: "TC_INTERCEPTOR",
            transport: "xhr",
            apiType,
            url,
            responseText: this.responseText,
          },
          "*"
        );
      } catch (err) {
        // ignore
      }
    });
    return originalXhrSend.apply(this, args);
  };

  // ---------------- fetch -----------------
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    return originalFetch.apply(this, args).then((resp) => {
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0].url;
        const apiType = matchApi(url);
        if (apiType) {
          resp
            .clone()
            .text()
            .then((txt) => {
              window.postMessage(
                {
                  source: "TC_INTERCEPTOR",
                  transport: "fetch",
                  apiType,
                  url,
                  responseText: txt,
                },
                "*"
              );
            })
            .catch(() => {});
        }
      } catch (err) {
        // ignore
      }
      return resp;
    });
  };
})();
