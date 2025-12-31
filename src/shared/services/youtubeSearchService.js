import { YouTube } from 'youtube-sr';

class YouTubeSearchService {
  constructor() {
    this.cache = new Map();
  }

  async searchKaraoke(query) {
    try {
      const searchQuery = `${query} karaoke`;
      const results = await YouTube.search(searchQuery, {
        limit: 20,
        type: 'video',
      });

      return results.map((video) => ({
        id: video.id,
        title: video.title,
        artist: this.extractArtist(video.title),
        duration: video.duration,
        thumbnail: video.thumbnail?.url || video.thumbnail?.thumbnails?.[0]?.url,
        url: video.url,
        views: video.views,
        channel: video.channel?.name,
      }));
    } catch (error) {
      console.error('YouTube search error:', error);
      throw error;
    }
  }

  extractArtist(title) {
    const patterns = [/^(.+?)\s*-\s*(.+?)\s*[([]]/, /^(.+?)\s*-\s*(.+?)$/];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        return match[2].trim();
      }
    }

    return 'Unknown Artist';
  }
}

export default new YouTubeSearchService();
