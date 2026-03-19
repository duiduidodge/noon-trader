'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchResult {
  id: string;
  url: string;
  titleOriginal: string;
  titleTh?: string;
  summaryTh?: string;
  publishedAt: string;
  source: string;
  tags: string[];
  sentiment?: string;
  marketImpact?: string;
}

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
      const data = await response.json();
      setResults(data.items || []);
      setShowResults(true);
    } catch (error) {
      console.error('Search failed:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Debounce search
    const timeoutId = setTimeout(() => {
      handleSearch(value);
    }, 300);

    return () => clearTimeout(timeoutId);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  const getSentimentColor = (sentiment?: string) => {
    if (sentiment === 'bullish') return 'text-green-400';
    if (sentiment === 'bearish') return 'text-red-400';
    return 'text-gray-400';
  };

  const getImpactEmoji = (impact?: string) => {
    if (impact === 'high') return '🔥';
    if (impact === 'medium') return '⚡';
    return '📝';
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto mb-8">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-500" />
        </div>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Search articles (English or Thai)... ค้นหาข่าว..."
          className="block w-full pl-10 pr-10 py-3 border border-gray-700 rounded-lg bg-gray-900 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            <X className="h-5 w-5 text-gray-500 hover:text-gray-300" />
          </button>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="absolute top-full left-0 right-0 mt-2 p-4 bg-gray-900 border border-gray-700 rounded-lg shadow-xl">
          <p className="text-gray-400 text-center">Searching...</p>
        </div>
      )}

      {/* Search Results */}
      {showResults && !loading && (
        <div className="absolute top-full left-0 right-0 mt-2 max-h-96 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
          {results.length === 0 ? (
            <div className="p-4 text-center text-gray-400">
              No results found for &quot;{query}&quot;
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {results.map((result) => (
                <a
                  key={result.id}
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 hover:bg-gray-800 transition-colors"
                  onClick={() => setShowResults(false)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0">
                      {getImpactEmoji(result.marketImpact)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white truncate">
                        {result.titleTh || result.titleOriginal}
                      </h3>
                      {result.summaryTh && (
                        <p className="text-sm text-gray-400 line-clamp-2 mt-1">
                          {result.summaryTh}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className="text-gray-500">{result.source}</span>
                        {result.sentiment && (
                          <span className={getSentimentColor(result.sentiment)}>
                            {result.sentiment}
                          </span>
                        )}
                        {result.tags.length > 0 && (
                          <div className="flex gap-1">
                            {result.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 bg-gray-800 text-gray-400 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
          <div className="p-3 bg-gray-800 text-center text-xs text-gray-500">
            Found {results.length} result{results.length !== 1 ? 's' : ''} for &quot;{query}&quot;
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {showResults && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowResults(false)}
        />
      )}
    </div>
  );
}
