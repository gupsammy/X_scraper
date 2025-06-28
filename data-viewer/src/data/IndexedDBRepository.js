// IndexedDB Repository - Handles all database operations
export class IndexedDBRepository {
  constructor() {
    this.db = null;
    this.dbName = "TwitterCollector";
    this.dbVersion = 2; // Match the main database version
  }

  async openDatabase() {
    if (this.db && this.db.readyState !== "closed") {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        let tweetsStore;
        if (!db.objectStoreNames.contains("tweets")) {
          tweetsStore = db.createObjectStore("tweets", {
            keyPath: "id",
          });
          console.log("Tweets object store created");
        } else {
          tweetsStore = e.target.transaction.objectStore("tweets");
        }

        // Ensure all indexes exist (safe to attempt create)
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
        if (!db.objectStoreNames.contains("capture_sessions")) {
          const sessionsStore = db.createObjectStore("capture_sessions", {
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

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async getAllTweets() {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["tweets"], "readonly");
      const store = transaction.objectStore("tweets");
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async getTweetCount() {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["tweets"], "readonly");
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

  async deleteTweet(tweetId) {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["tweets"], "readwrite");
      const store = transaction.objectStore("tweets");
      const request = store.delete(tweetId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllTweets() {
    const db = await this.openDatabase();
    return new Promise((resolve, reject) => {
      // Clear both tweets and capture_sessions to match main database behavior
      const transaction = db.transaction(["tweets", "capture_sessions"], "readwrite");
      
      const clearTweets = transaction.objectStore("tweets").clear();
      const clearSessions = transaction.objectStore("capture_sessions").clear();

      transaction.oncomplete = () => {
        console.log("All data cleared from IndexedDBRepository");
        resolve();
      };

      transaction.onerror = () => {
        console.error("Failed to clear data:", transaction.error);
        reject(transaction.error);
      };
    });
  }

  async debugDatabase() {
    console.log("=== IndexedDB Debug ===");
    console.log("Page URL:", window.location.href);
    console.log("Page origin:", window.location.origin);

    try {
      const databases = await indexedDB.databases();
      console.log("Available databases:", databases);

      const count = await this.getTweetCount();
      console.log("Tweet count:", count);
    } catch (error) {
      console.error("Database debug error:", error);
    }
  }
}