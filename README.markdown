lscache
===============================
This is a simple library that emulates `memcache` functions using HTML5 `localStorage`, so that you can cache data on the client
and associate an expiration time with each piece of data. If the `localStorage` limit (~5MB) is exceeded, it tries to create space by removing the items that are closest to expiring anyway. If `localStorage` is not available at all in the browser, the library degrades by simply not caching and all cache requests return null.

This is a fork of the original library, which is at: https://github.com/pamelafox/lscache
This forked branch fixes an IE8 bug (checks for the correct storage exception error name in IE8) and ensures that room is made in the cache to store expiration tracking entries.  This version also removes the JSON.parse() call from the getter, leaving the parsing to the consuming function.

Browser Support
----------------

The `lscache` library should work in all browsers where `localStorage` is supported.
A list of those is here:
http://www.quirksmode.org/dom/html5.html

