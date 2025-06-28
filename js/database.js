// IndexedDB Database Management for Twitter Collector
class TwitterDatabase {
  constructor() {
    this.dbName = "TwitterCollector";
    this.dbVersion = 2;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error("Database failed to open");
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log("Database opened successfully");
        resolve(this.db);
      };

      request.onupgradeneeded = (e) => {
        this.db = e.target.result;

        let tweetsStore;
        if (!this.db.objectStoreNames.contains("tweets")) {
          tweetsStore = this.db.createObjectStore("tweets", {
            keyPath: "id",
          });
          console.log("Tweets object store created");
        } else {
          tweetsStore = e.target.transaction.objectStore("tweets");
        }

        // Ensure indexes exist (safe to attempt create – will throw if duplicate, so guard)
        const ensureIndex = (name, keyPath) => {
          if (!tweetsStore.indexNames.contains(name)) {
            tweetsStore.createIndex(name, keyPath, { unique: false });
          }
        };

        ensureIndex("source_category", "source_category");
        ensureIndex("created_at", "created_at");
        ensureIndex("author_screen_name", "author_screen_name");
        ensureIndex("capture_session_id", "capture_session_id");
        ensureIndex("author_id", "author_id");
        ensureIndex("unique_key", "unique_key");

        // Create capture sessions store for tracking
        if (!this.db.objectStoreNames.contains("capture_sessions")) {
          const sessionsStore = this.db.createObjectStore("capture_sessions", {
            keyPath: "id",
          });
          sessionsStore.createIndex("created_at", "created_at", {
            unique: false,
          });
          sessionsStore.createIndex("source_type", "source_type", {
            unique: false,
          });

          console.log("Capture sessions object store created");
        }
      };
    });
  }

  async storeTweets(tweets) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["tweets"], "readwrite");
      const store = transaction.objectStore("tweets");

      let successCount = 0;
      let duplicateCount = 0;

      transaction.oncomplete = () => {
        console.log(
          `Stored ${successCount} tweets, ${duplicateCount} duplicates skipped`
        );
        resolve({ stored: successCount, duplicates: duplicateCount });
      };

      transaction.onerror = () => {
        console.error("Transaction failed:", {
          error: transaction.error,
          message: transaction.error?.message,
          name: transaction.error?.name,
          stack: transaction.error?.stack,
        });
        reject(transaction.error);
      };

      tweets.forEach((tweet) => {
        const request = store.add(tweet);

        request.onsuccess = () => {
          successCount++;
        };

        request.onerror = (event) => {
          // Prevent duplicate key errors from aborting the entire transaction
          if (request.error && request.error.name === "ConstraintError") {
            duplicateCount++;
            // Stop the error from bubbling up and aborting the transaction
            event.preventDefault();
            event.stopPropagation();
          } else {
            console.error("Error storing tweet:", {
              error: request.error,
              message: request.error?.message,
              name: request.error?.name,
              stack: request.error?.stack,
            });
          }
        };
      });
    });
  }

  async getTweetsBySource(sourceCategory = null, limit = 100) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["tweets"], "readonly");
      const store = transaction.objectStore("tweets");

      let request;
      if (sourceCategory) {
        const index = store.index("source_category");
        request = index.getAll(sourceCategory);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        const results = request.result
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, limit);
        resolve(results);
      };

      request.onerror = () => {
        console.error("Error fetching tweets:", request.error);
        reject(request.error);
      };
    });
  }

  async getTotalTweetCount() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["tweets"], "readonly");
      const store = transaction.objectStore("tweets");
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async getTweetCountBySource() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["tweets"], "readonly");
      const store = transaction.objectStore("tweets");
      const index = store.index("source_category");

      const counts = {};
      const request = index.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const source = cursor.key;
          counts[source] = (counts[source] || 0) + 1;
          cursor.continue();
        } else {
          resolve(counts);
        }
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async searchTweets(searchTerm, sourceCategory = null) {
    if (!this.db) {
      await this.init();
    }

    const tweets = await this.getTweetsBySource(sourceCategory, 1000);
    const searchLower = searchTerm.toLowerCase();

    return tweets.filter(
      (tweet) =>
        tweet.full_text.toLowerCase().includes(searchLower) ||
        tweet.author_name.toLowerCase().includes(searchLower) ||
        tweet.author_screen_name.toLowerCase().includes(searchLower)
    );
  }

  async createCaptureSession(sourceType, context) {
    if (!this.db) {
      await this.init();
    }

    const session = {
      id: generateSessionId(),
      source_type: sourceType,
      context: context,
      created_at: new Date(),
      tweet_count: 0,
      status: "active",
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(
        ["capture_sessions"],
        "readwrite"
      );
      const store = transaction.objectStore("capture_sessions");
      const request = store.add(session);

      request.onsuccess = () => {
        resolve(session.id);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async updateCaptureSession(sessionId, updates) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(
        ["capture_sessions"],
        "readwrite"
      );
      const store = transaction.objectStore("capture_sessions");

      const getRequest = store.get(sessionId);

      getRequest.onsuccess = () => {
        const session = getRequest.result;
        if (session) {
          Object.assign(session, updates);
          const putRequest = store.put(session);

          putRequest.onsuccess = () => resolve(session);
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          reject(new Error("Session not found"));
        }
      };

      getRequest.onerror = () => {
        reject(getRequest.error);
      };
    });
  }

  async clearAllData() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(
        ["tweets", "capture_sessions"],
        "readwrite"
      );

      const clearTweets = transaction.objectStore("tweets").clear();
      const clearSessions = transaction.objectStore("capture_sessions").clear();

      transaction.oncomplete = () => {
        console.log("All data cleared");
        resolve();
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  }

  async deleteTweet(tweetId) {
    // Delete a single tweet by its ID
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["tweets"], "readwrite");
      const store = transaction.objectStore("tweets");
      const request = store.delete(tweetId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Convenience method – clear only the tweets store but keep sessions
  async clearAllTweets() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["tweets"], "readwrite");
      const store = transaction.objectStore("tweets");
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Get count of unique authors (by screen name)
  async getUniqueAuthorCount() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(["tweets"], "readonly");
      const store = transaction.objectStore("tweets");
      const index = store.index("author_screen_name");

      const uniqueSet = new Set();
      const cursorRequest = index.openCursor();

      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          uniqueSet.add(cursor.key);
          cursor.continue();
        } else {
          resolve(uniqueSet.size);
        }
      };

      cursorRequest.onerror = () => {
        reject(cursorRequest.error);
      };
    });
  }
}

// Global database instance
const twitterDB = new TwitterDatabase();

// Initialize database when content script loads
if (typeof window !== "undefined") {
  twitterDB.init().catch(console.error);
}
