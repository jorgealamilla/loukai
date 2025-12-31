import React, { useState, useEffect, useRef } from 'react';

const YouTubeSearchTab = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const videoRefs = useRef([]);
  const searchInputRef = useRef(null);

  // Auto-focus search bar when component mounts
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
    videoRefs.current = videoRefs.current.slice(0, results.length);
  }, [results]);

  // Scroll selected video into view
  useEffect(() => {
    if (videoRefs.current[selectedIndex]) {
      videoRefs.current[selectedIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle if typing in search box
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (results.length === 0) return;

      const cols = 3; // Grid has 3 columns
      const key = e.key.toLowerCase();

      // Check for navigation keys
      if (
        ['arrowdown', 's', 'arrowup', 'w', 'arrowright', 'd', 'arrowleft', 'a', 'enter'].includes(
          key
        )
      ) {
        e.preventDefault();

        switch (key) {
          case 'arrowdown':
          case 's':
            setSelectedIndex((prev) => {
              const newIndex = prev + cols;
              return newIndex < results.length ? newIndex : prev;
            });
            break;
          case 'arrowup':
          case 'w':
            setSelectedIndex((prev) => {
              const newIndex = prev - cols;
              // If we're at the top row (index 0-2), focus search bar instead
              if (newIndex < 0) {
                if (searchInputRef.current) {
                  searchInputRef.current.focus();
                }
                return prev;
              }
              return newIndex;
            });
            break;
          case 'arrowright':
          case 'd':
            setSelectedIndex((prev) => (prev + 1) % results.length);
            break;
          case 'arrowleft':
          case 'a':
            setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
            break;
          case 'enter':
            if (results[selectedIndex]) {
              handlePlayVideo(results[selectedIndex]);
            }
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedIndex]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const searchResults = await window.kaiAPI.youtube.search(query);
      setResults(searchResults);
    } catch (err) {
      console.error('Search failed:', err);
      setError('Failed to search YouTube. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handlePlayVideo = async (video) => {
    try {
      await window.kaiAPI.youtube.openVideo(video.url);
    } catch (err) {
      console.error('Failed to open video:', err);
      alert('Failed to open video. Please try again.');
    }
  };

  const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatViews = (views) => {
    if (!views) return '0 views';
    if (views >= 1000000) {
      return `${(views / 1000000).toFixed(1)}M views`;
    }
    if (views >= 1000) {
      return `${(views / 1000).toFixed(1)}K views`;
    }
    return `${views} views`;
  };

  return (
    <div className="youtube-search-tab p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
          🎤 YouTube Karaoke Search
        </h1>

        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-3">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for karaoke videos..."
              className="flex-1 px-4 py-3 text-lg border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
              disabled={isSearching}
            />
            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {results.map((video, index) => (
            <div
              key={video.id}
              ref={(el) => (videoRefs.current[index] = el)}
              className={`bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden transition-all cursor-pointer ${
                selectedIndex === index
                  ? 'ring-4 ring-blue-500 shadow-2xl scale-105'
                  : 'hover:shadow-xl'
              }`}
              onClick={() => handlePlayVideo(video)}
            >
              <div className="relative">
                <img src={video.thumbnail} alt={video.title} className="w-full h-48 object-cover" />
                <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-sm px-2 py-1 rounded">
                  {formatDuration(video.duration)}
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
                  {video.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{video.artist}</p>
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
                  <span>{formatViews(video.views)}</span>
                  <span className="truncate ml-2">{video.channel}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayVideo(video);
                  }}
                  className="mt-3 w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded transition-colors"
                >
                  ▶️ Play Fullscreen
                </button>
              </div>
            </div>
          ))}
        </div>

        {results.length === 0 && !isSearching && !error && (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-12">
            <p className="text-lg">Search for karaoke videos to get started!</p>
            <p className="text-sm mt-2">Videos will open in fullscreen browser mode</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200 text-center">
              ⌨️ <strong>Keyboard Controls:</strong> Arrow Keys or WASD to navigate • Enter to play
              • ESC to close video
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default YouTubeSearchTab;
