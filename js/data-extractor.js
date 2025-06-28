// Data extraction logic for Twitter API responses
class TwitterDataExtractor {
  constructor() {
    this.debugMode = true;
  }

  // Main extraction method - determines source type and extracts tweets
  extractTweetData(responseText, url, sourceType) {
    try {
      debugLog(`Starting data extraction for ${sourceType}`, {
        urlLength: url.length,
        responseLength: responseText.length,
      });

      const data = safeJSONParse(responseText);
      if (!data) {
        debugLog("Failed to parse JSON response");
        return [];
      }

      debugLog(`Extracting data for ${sourceType}`, {
        url,
        dataKeys: Object.keys(data),
      });

      let tweets = [];
      const requestInfo = extractRequestInfo(url);
      debugLog("Request info extracted:", requestInfo);

      switch (sourceType) {
        case "bookmarks":
          tweets = this.extractFromBookmarks(data, requestInfo);
          break;
        case "userTweets":
          tweets = this.extractFromUserTweets(data, requestInfo);
          break;
        case "searchResults":
          tweets = this.extractFromSearch(data, requestInfo);
          break;
        default:
          debugLog(`Unknown source type: ${sourceType}`);
          return [];
      }

      debugLog(`Extracted ${tweets.length} tweets from ${sourceType}`);
      return tweets;
    } catch (error) {
      console.error("Error extracting tweet data:", error);
      debugLog("Extraction error details:", {
        error: error.message,
        stack: error.stack,
      });
      return [];
    }
  }

  // Extract tweets from bookmarks API response
  extractFromBookmarks(data, requestInfo) {
    try {
      debugLog("Extracting from bookmarks response");
      debugLog("Data structure:", {
        hasData: !!data.data,
        hasBookmarkTimeline: !!data.data?.bookmark_timeline_v2,
        hasTimeline: !!data.data?.bookmark_timeline_v2?.timeline,
        hasInstructions:
          !!data.data?.bookmark_timeline_v2?.timeline?.instructions,
      });

      const instructions =
        data?.data?.bookmark_timeline_v2?.timeline?.instructions || [];
      debugLog(`Found ${instructions.length} instructions`);

      return this.extractFromInstructions(
        instructions,
        "bookmarks",
        requestInfo
      );
    } catch (error) {
      console.error("Error extracting bookmarks:", error);
      debugLog("Bookmarks extraction error:", {
        error: error.message,
        stack: error.stack,
      });
      return [];
    }
  }

  // Extract tweets from user timeline API response
  extractFromUserTweets(data, requestInfo) {
    try {
      debugLog("Extracting from user tweets response");
      debugLog("Data structure:", {
        hasData: !!data.data,
        hasUser: !!data.data?.user,
        hasResult: !!data.data?.user?.result,
        hasTimeline: !!data.data?.user?.result?.timeline,
        hasTimelineTimeline: !!data.data?.user?.result?.timeline?.timeline,
        hasInstructions:
          !!data.data?.user?.result?.timeline?.timeline?.instructions,
      });

      const instructions =
        data?.data?.user?.result?.timeline?.timeline?.instructions || [];
      debugLog(`Found ${instructions.length} instructions`);

      return this.extractFromInstructions(
        instructions,
        "usertweets",
        requestInfo
      );
    } catch (error) {
      console.error("Error extracting user tweets:", error);
      debugLog("User tweets extraction error:", {
        error: error.message,
        stack: error.stack,
      });
      return [];
    }
  }

  // Extract tweets from search results API response
  extractFromSearch(data, requestInfo) {
    try {
      const instructions =
        data?.data?.search_by_raw_query?.search_timeline?.timeline
          ?.instructions || [];
      return this.extractFromInstructions(instructions, "search", requestInfo);
    } catch (error) {
      console.error("Error extracting search results:", error);
      return [];
    }
  }

  // Generic method to extract tweets from timeline instructions
  extractFromInstructions(instructions, sourceCategory, requestInfo) {
    debugLog(
      `Processing ${instructions.length} instructions for ${sourceCategory}`
    );
    const tweets = [];

    for (const instruction of instructions) {
      debugLog(`Processing instruction type: ${instruction.type}`);

      if (instruction.type === "TimelineAddEntries") {
        const entryCount = instruction.entries?.length || 0;
        debugLog(`TimelineAddEntries has ${entryCount} entries`);

        for (const entry of instruction.entries || []) {
          debugLog(`Processing entry: ${entry.entryId}`, {
            entryType: entry.content?.entryType,
            itemType: entry.content?.itemContent?.itemType,
            hasTweetResults: !!entry.content?.itemContent?.tweet_results,
            hasResult: !!entry.content?.itemContent?.tweet_results?.result,
          });

          const tweet = this.extractTweetFromEntry(
            entry,
            sourceCategory,
            requestInfo
          );
          if (tweet) {
            debugLog(`Successfully extracted tweet: ${tweet.id}`);
            tweets.push(tweet);
          } else {
            debugLog(`Failed to extract tweet from entry: ${entry.entryId}`);
          }
        }
      } else if (instruction.type === "TimelinePinEntry") {
        debugLog("Processing pinned entry");
        // Handle pinned tweets in user profiles
        const tweet = this.extractTweetFromEntry(
          instruction.entry,
          sourceCategory,
          requestInfo
        );
        if (tweet) {
          tweet.is_pinned = true;
          debugLog(`Successfully extracted pinned tweet: ${tweet.id}`);
          tweets.push(tweet);
        }
      } else {
        debugLog(`Skipping instruction type: ${instruction.type}`);
      }
    }

    debugLog(`Total tweets extracted from instructions: ${tweets.length}`);
    return tweets;
  }

  // Extract individual tweet data from timeline entry
  extractTweetFromEntry(entry, sourceCategory, requestInfo) {
    try {
      debugLog(`Extracting tweet from entry: ${entry.entryId}`);

      // Skip non-tweet entries by checking entry type and item type first
      if (entry.content?.entryType !== "TimelineTimelineItem") {
        debugLog(
          `Skipping entry ${entry.entryId}: entryType is ${entry.content?.entryType}`
        );
        return null;
      }

      if (entry.content?.itemContent?.itemType !== "TimelineTweet") {
        debugLog(
          `Skipping entry ${entry.entryId}: itemType is ${entry.content?.itemContent?.itemType}`
        );
        return null;
      }

      // Skip non-tweet entries (cursors, promotions, etc.)
      if (!entry?.content?.itemContent?.tweet_results?.result) {
        debugLog(`Skipping entry ${entry.entryId}: no tweet_results.result`);
        return null;
      }

      const tweetResult = entry.content.itemContent.tweet_results.result;
      debugLog(`Tweet result typename: ${tweetResult.__typename}`);

      // Handle different tweet result types
      if (tweetResult.__typename === "TweetWithVisibilityResults") {
        debugLog("Processing TweetWithVisibilityResults");
        return this.extractTweetDataFromResult(
          tweetResult.tweet,
          sourceCategory,
          requestInfo
        );
      } else if (tweetResult.__typename === "Tweet") {
        debugLog("Processing Tweet");
        return this.extractTweetDataFromResult(
          tweetResult,
          sourceCategory,
          requestInfo
        );
      } else {
        debugLog("Unknown tweet result type:", tweetResult.__typename);
        return null;
      }
    } catch (error) {
      console.error("Error extracting tweet from entry:", error);
      debugLog("Entry extraction error details:", {
        error: error.message,
        entryId: entry?.entryId,
      });
      return null;
    }
  }

  // Extract complete tweet data object
  extractTweetDataFromResult(tweetResult, sourceCategory, requestInfo) {
    try {
      debugLog(`Extracting tweet data for ID: ${tweetResult?.rest_id}`);
      debugLog(`TweetResult structure:`, {
        hasRestId: !!tweetResult?.rest_id,
        hasLegacy: !!tweetResult?.legacy,
        hasCore: !!tweetResult?.core,
        typename: tweetResult?.__typename,
        keys: tweetResult ? Object.keys(tweetResult) : [],
      });

      const legacy = tweetResult?.legacy;
      const core = tweetResult?.core;

      if (!legacy) {
        debugLog("Missing legacy data in tweet result");
        debugLog("TweetResult object:", tweetResult);
        return null;
      }

      if (!core?.user_results?.result) {
        debugLog("Missing core.user_results.result in tweet result");
        debugLog("Core object:", core);
        return null;
      }

      const user = core.user_results.result;

      // Twitter changed the user schema – name/screen_name now live under
      //   user.core  (while most other properties stay under user.legacy).
      // Keep backwards-compatibility by reading from both locations.
      const userLegacy = user?.legacy || {};
      const userCoreData = user?.core || {};

      // Fallback handling – older responses may still omit legacy
      if (!userLegacy && !userCoreData) {
        debugLog("Missing user data (legacy & core) in tweet result", user);
        return null;
      }

      // Handle different text formats (long-form vs regular)
      const fullText = this.extractFullText(tweetResult);

      if (!fullText) {
        debugLog("No text content found in tweet");
        debugLog("Legacy object for text:", legacy);
        return null;
      }

      // Handle quoted tweet
      const quotedTweet = this.extractQuotedTweet(tweetResult);

      // Handle retweet
      const retweetedStatus = this.extractRetweetedStatus(tweetResult);

      // Determine author screen name for URL construction
      const screenNameForUrl =
        userCoreData?.screen_name || userLegacy?.screen_name || "unknown";

      // Construct tweet URL
      const tweetUrl = constructTweetUrl(
        screenNameForUrl,
        tweetResult?.rest_id || "unknown"
      );

      // Generate session ID if not provided
      const sessionId = generateSessionId();

      const tweetData = {
        // Basic tweet info
        id: tweetResult?.rest_id || "",
        conversation_id: legacy?.conversation_id_str || "",
        created_at: legacy?.created_at
          ? parseTwitterDate(legacy.created_at)
          : new Date(),
        full_text: fullText,
        language: legacy.lang || "en",
        tweet_url: tweetUrl,

        // Author information
        author_id: userCoreData?.screen_name || userLegacy?.screen_name || "",
        author_screen_name:
          userCoreData?.screen_name || userLegacy?.screen_name || "",
        author_name: userCoreData?.name || userLegacy?.name || "",
        author_verified: user?.is_blue_verified || false,
        author_followers_count: userLegacy?.followers_count || 0,
        author_profile_image_url:
          user?.avatar?.image_url ||
          userLegacy?.profile_image_url_https ||
          userLegacy?.profile_image_url ||
          "",

        // Engagement metrics
        // Use original tweet metrics if this item is a retweet; otherwise use current
        //   legacy metrics. This fixes incorrect stats for RTs.
        ...(function () {
          const rtLegacy =
            tweetResult?.legacy?.retweeted_status_result?.result?.legacy;
          const viewsCount =
            tweetResult?.legacy?.retweeted_status_result?.result?.views
              ?.count ||
            tweetResult?.views?.count ||
            "0";
          const metrics = rtLegacy || legacy;
          return {
            like_count: metrics?.favorite_count || 0,
            retweet_count: metrics?.retweet_count || 0,
            reply_count: metrics?.reply_count || 0,
            quote_count: metrics?.quote_count || 0,
            bookmark_count: metrics?.bookmark_count || 0,
            view_count: parseInt(viewsCount),
          };
        })(),

        // Tweet metadata
        is_quote_status: legacy?.is_quote_status || false,
        possibly_sensitive: legacy?.possibly_sensitive || false,
        in_reply_to_status_id: legacy?.in_reply_to_status_id_str || null,
        in_reply_to_user_id: legacy?.in_reply_to_user_id_str || null,
        in_reply_to_screen_name: legacy?.in_reply_to_screen_name || null,

        // Media information
        has_media: this.hasMedia(legacy),
        media_info: this.extractMediaInfo(legacy),

        // Source tracking
        source_category: sourceCategory,
        source_user_id: requestInfo?.userId || null,
        source_query: requestInfo?.query || null,

        // Capture metadata
        captured_at: new Date(),
        capture_session_id: sessionId,
        api_request_info: requestInfo,

        // Additional fields
        quoted_tweet: quotedTweet,
        retweeted_status: retweetedStatus,
        is_pinned: false, // Will be set to true for pinned tweets
        unique_key: `${(
          userCoreData?.screen_name ||
          userLegacy?.screen_name ||
          ""
        ).toLowerCase()}_${tweetResult?.rest_id || ""}`,
      };

      debugLog(
        `Successfully extracted tweet: ${tweetData.id} by @${tweetData.author_screen_name}`
      );
      return tweetData;
    } catch (error) {
      console.error("Error extracting tweet data:", error);
      debugLog("Tweet data extraction error:", {
        error: error.message,
        tweetId: tweetResult?.rest_id,
      });
      return null;
    }
  }

  // Extract full text, handling both regular and long-form tweets
  extractFullText(tweetResult) {
    if (!tweetResult) return "";

    // If this tweet is a retweet, prefer the full text of the original tweet
    // when available. This prevents truncation ("…") that often appears in
    // the wrapper tweet. We fallback to wrapper text only when the original
    // is missing.
    const rt = tweetResult?.legacy?.retweeted_status_result?.result;
    if (rt) {
      const rtFull = this.extractFullText(rt); // recursive – will resolve note_tweet etc.
      if (rtFull) {
        return `RT @${
          rt?.core?.user_results?.result?.core?.screen_name ||
          rt?.core?.user_results?.result?.legacy?.screen_name ||
          ""
        }: ${rtFull}`.trim();
      }
    }

    // Long-form tweets (Twitter Notes)
    if (tweetResult.note_tweet?.note_tweet_results?.result?.text) {
      return tweetResult.note_tweet.note_tweet_results.result.text;
    }

    // Regular tweets
    if (tweetResult?.legacy?.full_text) {
      return tweetResult.legacy.full_text;
    }

    // Fallback
    return tweetResult?.legacy?.text || "";
  }

  // Extract quoted tweet information
  extractQuotedTweet(tweetResult) {
    try {
      const quotedResult = tweetResult.quoted_status_result?.result;
      if (!quotedResult) return null;

      const quotedUser = quotedResult.core?.user_results?.result;
      const quotedLegacy = quotedResult.legacy;
      const quotedUserLegacy = quotedUser?.legacy || {};
      const quotedUserCore = quotedUser?.core || {};

      // Get author screen name for URL construction
      const authorScreenName =
        quotedUserCore?.screen_name || quotedUserLegacy?.screen_name;

      // Construct tweet URL
      const tweetUrl =
        authorScreenName && quotedResult.rest_id
          ? constructTweetUrl(authorScreenName, quotedResult.rest_id)
          : null;

      return {
        id: quotedResult.rest_id,
        text: this.extractFullText(quotedResult),
        author_name: quotedUserCore?.name || quotedUserLegacy?.name,
        author_screen_name: authorScreenName,
        author_profile_image_url:
          quotedUser?.avatar?.image_url ||
          quotedUserLegacy?.profile_image_url_https ||
          quotedUserLegacy?.profile_image_url ||
          "",
        created_at: quotedLegacy?.created_at,
        tweet_url: tweetUrl,
        // Include engagement metrics if available
        like_count: quotedLegacy?.favorite_count || 0,
        retweet_count: quotedLegacy?.retweet_count || 0,
        reply_count: quotedLegacy?.reply_count || 0,
        quote_count: quotedLegacy?.quote_count || 0,
        // Include media information
        has_media: this.hasMedia(quotedLegacy),
        media_info: this.extractMediaInfo(quotedLegacy),
      };
    } catch (error) {
      console.error("Error extracting quoted tweet:", error);
      return null;
    }
  }

  // Extract retweeted status information
  extractRetweetedStatus(tweetResult) {
    try {
      if (!tweetResult.legacy?.retweeted_status_result?.result) return null;

      const retweetedResult = tweetResult.legacy.retweeted_status_result.result;
      return {
        id: retweetedResult.rest_id,
        text: this.extractFullText(retweetedResult),
        author_name:
          retweetedResult.core?.user_results?.result?.core?.name ||
          retweetedResult.core?.user_results?.result?.legacy?.name,
        author_screen_name:
          retweetedResult.core?.user_results?.result?.core?.screen_name ||
          retweetedResult.core?.user_results?.result?.legacy?.screen_name,
        created_at: retweetedResult.legacy?.created_at,
      };
    } catch (error) {
      console.error("Error extracting retweeted status:", error);
      return null;
    }
  }

  // Check if tweet has media
  hasMedia(legacy) {
    if (!legacy) return false;
    return !!(
      legacy.extended_entities?.media?.length > 0 ||
      legacy.entities?.media?.length > 0
    );
  }

  // Extract media information with enhanced video handling
  extractMediaInfo(legacy) {
    try {
      if (!legacy) return [];

      // Prefer extended_entities.media but fall back to entities.media when needed
      const media =
        legacy.extended_entities?.media || legacy.entities?.media || [];

      if (media.length === 0) return [];

      return media.map((item) => {
        const mediaInfo = {
          id: item?.id_str || "",
          type: item?.type || "unknown", // photo, video, animated_gif
          preview_url: item?.media_url_https || item?.media_url || "",
          media_url: item?.media_url_https || item?.media_url || "",
          width: item?.original_info?.width || item?.sizes?.large?.w || 0,
          height: item?.original_info?.height || item?.sizes?.large?.h || 0,
        };

        // Handle video and animated_gif specific data
        if (item?.type === "video" || item?.type === "animated_gif") {
          // Extract duration
          if (item?.video_info?.duration_millis) {
            mediaInfo.duration_ms = item.video_info.duration_millis;
          }

          // Extract and process variants
          if (item?.video_info?.variants) {
            const allVariants = item.video_info.variants.map((variant) => ({
              bitrate: variant.bitrate || 0,
              url: variant.url || "",
              content_type: variant.content_type || "",
            }));

            mediaInfo.variants = allVariants;

            // Filter to MP4 variants only
            const mp4Variants = allVariants.filter(
              (variant) => variant.content_type === "video/mp4"
            );

            if (mp4Variants.length > 0) {
              // Sort by bitrate (treat undefined as 0)
              mp4Variants.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));

              // Choose middle quality variant (or highest if only one)
              let chosenVariant;
              if (mp4Variants.length === 1) {
                chosenVariant = mp4Variants[0];
              } else {
                const middleIndex = Math.floor(mp4Variants.length / 2);
                chosenVariant = mp4Variants[middleIndex];
              }

              mediaInfo.media_url = chosenVariant.url;
            }
          }
        }

        return mediaInfo;
      });
    } catch (error) {
      console.error("Error extracting media info:", error);
      return [];
    }
  }

  // Validate extracted tweet data
  validateTweetData(tweet) {
    const requiredFields = [
      "id",
      "full_text",
      "author_screen_name",
      "created_at",
    ];

    for (const field of requiredFields) {
      if (!tweet[field]) {
        debugLog(`Missing required field: ${field}`, tweet);
        return false;
      }
    }

    return true;
  }

  // Filter out invalid or unwanted tweets
  filterTweets(tweets) {
    return tweets.filter((tweet) => {
      if (!this.validateTweetData(tweet)) {
        return false;
      }

      // Skip promotional tweets or ads
      if (
        tweet.full_text.includes("Promoted") ||
        tweet.full_text.includes("Ad")
      ) {
        return false;
      }

      return true;
    });
  }
}

// Global data extractor instance
const twitterDataExtractor = new TwitterDataExtractor();
