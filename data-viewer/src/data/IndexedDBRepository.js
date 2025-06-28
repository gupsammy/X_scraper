// IndexedDB Repository - Handles all database operations
export class IndexedDBRepository {
  constructor() {
    this.db = null;
    this.dbName = "TwitterCollector";
    this.dbVersion = 1;
  }

  async openDatabase() {
    if (this.db && this.db.readyState !== "closed") {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains("tweets")) {
          const tweetsStore = db.createObjectStore("tweets", {
            keyPath: "id",
          });

          tweetsStore.createIndex("source_category", "source_category", {
            unique: false,
          });
          tweetsStore.createIndex("created_at", "created_at", {
            unique: false,
          });
          tweetsStore.createIndex("author_screen_name", "author_screen_name", {
            unique: false,
          });
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
      const transaction = db.transaction(["tweets"], "readwrite");
      const store = transaction.objectStore("tweets");
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
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