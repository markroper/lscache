/**
 * lscache library
 * Copyright (c) 2011, Pamela Fox
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 **************************************************************
 *
 * MODIFIED by Mark Roper on 11/16/2012
 * - Update the expiration entry with each 'GET' operation so that 
 * entries are eliminated by last accessed date and not last modified date.
 * - Fixes a bug where the expiration entry setItem() operation was not surrounded by a 
 * try/catch block, leading to unhandled QUOTA_EXCEEDED_ERR exceptions in tests
 * - removes JSON.parse from the get method to eliminate differences in return values between
 * lscache and local storage.
 */

/*jshint undef:true, browser:true */

/**
 * Creates a namespace for the lscache functions.
 */
var lscache = function() {

  // Prefix for all lscache keys
  var CACHE_PREFIX = 'lscache-';

  // Suffix for the key name on the expiration items in localStorage
  var CACHE_SUFFIX = '-cacheexpiration';

  // expiration date radix (set to Base-36 for most space savings)
  var EXPIRY_RADIX = 10;

  // time resolution in minutes
  var EXPIRY_UNITS = 60 * 1000;

  // ECMAScript max Date (epoch + 1e8 days)
  var MAX_DATE = Math.floor(8.64e15/EXPIRY_UNITS);

  var cachedStorage;
  var cachedJSON;
  var cacheBucket = '';

  // Determines if localStorage is supported in the browser;
  // result is cached for better performance instead of being run each time.
  // Feature detection is based on how Modernizr does it;
  // it's not straightforward due to FF4 issues.
  // It's not run at parse-time as it takes 200ms in Android.
  function supportsStorage() {
    var key = '__lscachetest__';
    var value = key;

    if (cachedStorage !== undefined) {
      return cachedStorage;
    }

    try {
      setItem(key, value);
      removeItem(key);
      cachedStorage = true;
    } catch (exc) {
      cachedStorage = false;
    }
    return cachedStorage;
  }

  // Determines if native JSON (de-)serialization is supported in the browser.
  function supportsJSON() {
    /*jshint eqnull:true */
    if (cachedJSON === undefined) {
      cachedJSON = (window.JSON != null);
    }
    return cachedJSON;
  }

  /**
   * Returns the full string for the localStorage expiration item.
   * @param {String} key
   * @return {string}
   */
  function expirationKey(key) {
    return key + CACHE_SUFFIX;
  }

  /**
   * Returns the number of minutes since the epoch.
   * @return {number}
   */
  function currentTime() {
    return Math.floor((new Date().getTime())/EXPIRY_UNITS);
  }

  /**
   * Wrapper functions for localStorage methods
   */

  function getItem(key) {
    return localStorage.getItem(CACHE_PREFIX + cacheBucket + key);
  }

  function setItem(key, value) {
    // Fix for iPad issue - sometimes throws QUOTA_EXCEEDED_ERR on setItem.
    localStorage.removeItem(CACHE_PREFIX + cacheBucket + key);
    localStorage.setItem(CACHE_PREFIX + cacheBucket + key, value);
  }

  /**
     * Removes minimum number of entries from the cache by least recently accessed date needed
	 * to make space for the key and value pair passed in, then calls setItem().
     * @param {string} key_
	 * @param {string} value_
	 * @param {int} targetSize
     */
  function makeSpaceAndSetItem(key_, value_, targetSize) {
	// If we exceeded the quota, then we will sort
	// by the expire time, and then remove the N oldest
	var storedKeys = [];
	var storedKey;
	for (var i = 0; i < localStorage.length; i++) {
		storedKey = localStorage.key(i);

		if (storedKey.indexOf(CACHE_PREFIX + cacheBucket) === 0 && storedKey.indexOf(CACHE_SUFFIX) < 0) {
			var mainKey = storedKey.substr((CACHE_PREFIX + cacheBucket).length);
			var exprKey = expirationKey(mainKey);
			var expiration = getItem(exprKey);
			if (expiration) {
				expiration = expiration.split(",");
				expiration = parseInt(expiration[0]);
			} else {
				// TODO: Store date added for non-expiring items for smarter removal
				expiration = MAX_DATE;
			}
			storedKeys.push({
				key: mainKey,
				size: (getItem(mainKey)||'').length,
				expiration: expiration
				});
		}
	}
	// Sorts the keys with oldest expiration time last
	storedKeys.sort(function(a, b) { return (b.expiration-a.expiration); });

	while (storedKeys.length && targetSize > 0) {
		storedKey = storedKeys.pop();
		removeItem(storedKey.key);
		removeItem(expirationKey(storedKey.key));
		targetSize -= storedKey.size; //+ storedKey.key.length;
	}
	try {
		setItem(key_, value_);
	} catch (e) {
		// value may be larger than total quota
		return;
	}
  }
  
  function removeItem(key) {
    localStorage.removeItem(CACHE_PREFIX + cacheBucket + key);
  }

  return {

    /**
     * Stores the value in localStorage. Expires after specified number of minutes.
     * @param {string} key
     * @param {Object|string} value
     * @param {number} time
     */
    set: function(key, value, time) {
      if (!supportsStorage()) return;

      // If we don't get a string value, try to stringify
      // In future, localStorage may properly support storing non-strings
      // and this can be removed.
      if (typeof value !== 'string') {
        if (!supportsJSON()) return;
        try {
          value = JSON.stringify(value);
        } catch (e) {
          // Sometimes we can't stringify due to circular refs
          // in complex objects, so we won't bother storing then.
          return;
        }
      }

      try {
        setItem(key, value);
      } catch (e) {
        if (e.name === 'QUOTA_EXCEEDED_ERR' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.name === 'Error') {
		  var targetSize = (value||'').length;
		  makeSpaceAndSetItem(key, value, targetSize);
		}else{
			return;
		}
	  }
      // If a time is specified, store expiration info in localStorage
      if (time) {
		try{
			setItem(expirationKey(key), (currentTime() + time).toString(EXPIRY_RADIX) + ','+ time.toString(EXPIRY_RADIX));
		}catch (e){
			if (e.name === 'QUOTA_EXCEEDED_ERR' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.name === 'Error') {
				var targetSize = (currentTime() + time).toString(EXPIRY_RADIX).length;
				makeSpaceAndSetItem(expirationKey(key), (currentTime() + time).toString(EXPIRY_RADIX), targetSize);
			}else{
				return;
			}
		}
      } else {
        // In case they previously set a time, remove that info from localStorage.
        removeItem(expirationKey(key));
      }
    },

    /**
     * Retrieves specified value from localStorage, if not expired.
     * @param {string} key
     * @return {string|Object}
     */
    get: function(key) {
      if (!supportsStorage()) return null;

      // Return the de-serialized item if not expired
      var exprKey = expirationKey(key);
      var expr = getItem(exprKey);
	  
      if (expr) {
		expr = expr.split(",");
		for(var i = 0; i < expr.length; i++)
		{
			expr[i] = parseInt(expr[i], EXPIRY_RADIX);
		}

		var currTime = currentTime();
        // Check if we should actually kick item out of storage
        if (expr.length == 2 && currentTime() >= expr[0]) {
          removeItem(key);
          removeItem(exprKey);
          return null;
        }else{
			//update the expiry entry
			setItem(exprKey, (currentTime() + expr[1]).toString(EXPIRY_RADIX) + ',' + expr[1].toString(EXPIRY_RADIX));
		}
      }

      // Tries to de-serialize stored value if its an object, and returns the normal value otherwise.
      var value = getItem(key);
      return value;
    },

    /**
     * Removes a value from localStorage.
     * Equivalent to 'delete' in memcache, but that's a keyword in JS.
     * @param {string} key
     */
    remove: function(key) {
      if (!supportsStorage()) return null;
      removeItem(key);
      removeItem(expirationKey(key));
    },

    /**
     * Returns whether local storage is supported.
     * Currently exposed for testing purposes.
     * @return {boolean}
     */
    supported: function() {
      return supportsStorage();
    },

    /**
     * Flushes all lscache items and expiry markers without affecting rest of localStorage
     */
    flush: function() {
      if (!supportsStorage()) return;

      // Loop in reverse as removing items will change indices of tail
      for (var i = localStorage.length-1; i >= 0 ; --i) {
        var key = localStorage.key(i);
        if (key.indexOf(CACHE_PREFIX + cacheBucket) === 0) {
          localStorage.removeItem(key);
        }
      }
    },
    
    /**
     * Appends CACHE_PREFIX so lscache will partition data in to different buckets.
     * @param {string} bucket
     */
    setBucket: function(bucket) {
      cacheBucket = bucket;
    },
    
    /**
     * Resets the string being appended to CACHE_PREFIX so lscache will use the default storage behavior.
     */
    resetBucket: function() {
      cacheBucket = '';
    }
  };
}();
