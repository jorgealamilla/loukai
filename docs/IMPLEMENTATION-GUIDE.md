# Implementation Guide: Client-Server Architecture

This guide provides step-by-step instructions to transform Loukai into a client-server architecture.

## Quick Start

### 1. Create Standalone Server

```bash
# Create new server directory
mkdir loukai-server
cd loukai-server
npm init -y

# Install dependencies
npm install express socket.io cors pg redis fluent-ffmpeg
npm install dotenv bcryptjs jsonwebtoken uuid
npm install --save-dev nodemon
```

### 2. Server Directory Structure

```
loukai-server/
├── src/
│   ├── server.js              # Main entry point
│   ├── config/
│   │   ├── database.js        # Database configuration
│   │   └── redis.js           # Redis configuration
│   ├── routes/
│   │   ├── auth.js            # Authentication routes
│   │   ├── library.js         # Library management
│   │   ├── streaming.js       # Audio streaming
│   │   ├── queue.js           # Queue management
│   │   └── playback.js        # Playback control
│   ├── services/
│   │   ├── libraryService.js  # Library operations
│   │   ├── streamingService.js # HLS generation
│   │   ├── queueService.js    # Queue logic
│   │   └── authService.js     # Authentication
│   ├── middleware/
│   │   ├── auth.js            # JWT verification
│   │   └── errorHandler.js    # Error handling
│   ├── models/
│   │   ├── Song.js            # Song model
│   │   ├── User.js            # User model
│   │   └── Queue.js           # Queue model
│   └── websocket/
│       └── handlers.js        # WebSocket event handlers
├── storage/
│   ├── songs/                 # Karaoke files
│   ├── cache/                 # Transcoded files
│   └── uploads/               # Temporary uploads
├── .env                       # Environment variables
├── package.json
└── README.md
```

## Step-by-Step Implementation

### Step 1: Set Up Server Foundation

**Create `src/server.js`:**

```javascript
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import libraryRoutes from './routes/library.js';
import streamingRoutes from './routes/streaming.js';
import queueRoutes from './routes/queue.js';
import playbackRoutes from './routes/playback.js';
import { setupWebSocket } from './websocket/handlers.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/stream', streamingRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/playback', playbackRoutes);

// WebSocket setup
setupWebSocket(io);

// Error handling
app.use(errorHandler);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3069;
httpServer.listen(PORT, () => {
  console.log(`🎤 Loukai Server running on port ${PORT}`);
});

export { io };
```

**Create `.env`:**

```env
# Server Configuration
PORT=3069
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/loukai
# Or for SQLite: DATABASE_URL=sqlite:./storage/loukai.db

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key-change-this
JWT_EXPIRES_IN=7d

# Storage
STORAGE_PATH=/path/to/karaoke/files
CACHE_PATH=/path/to/cache

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.100:3000

# Streaming
HLS_SEGMENT_DURATION=10
TRANSCODE_QUALITY=high
```

### Step 2: Implement HLS Streaming Service

**Create `src/services/streamingService.js`:**

```javascript
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';

class StreamingService {
  constructor() {
    this.cachePath = process.env.CACHE_PATH || './storage/cache';
    this.segmentDuration = parseInt(process.env.HLS_SEGMENT_DURATION) || 10;
  }

  /**
   * Generate HLS playlist for a song with multiple stems
   */
  async generateHLSPlaylist(songId, songPath, stems) {
    const cacheDir = path.join(this.cachePath, songId);
    await fs.mkdir(cacheDir, { recursive: true });

    const masterPlaylist = path.join(cacheDir, 'master.m3u8');
    
    // Check if already cached
    try {
      await fs.access(masterPlaylist);
      return { playlistPath: masterPlaylist, cached: true };
    } catch {
      // Generate new playlist
    }

    // Generate HLS for each stem
    const stemPlaylists = await Promise.all(
      stems.map(stem => this.generateStemHLS(songId, songPath, stem))
    );

    // Create master playlist
    const masterContent = this.createMasterPlaylist(stemPlaylists);
    await fs.writeFile(masterPlaylist, masterContent);

    return { playlistPath: masterPlaylist, cached: false };
  }

  /**
   * Generate HLS for individual stem
   */
  async generateStemHLS(songId, songPath, stem) {
    const cacheDir = path.join(this.cachePath, songId);
    const stemPlaylist = path.join(cacheDir, `${stem.id}.m3u8`);
    const segmentPattern = path.join(cacheDir, `${stem.id}_%03d.ts`);

    return new Promise((resolve, reject) => {
      ffmpeg(songPath)
        .audioCodec('aac')
        .audioBitrate('128k')
        .audioChannels(2)
        .outputOptions([
          `-hls_time ${this.segmentDuration}`,
          '-hls_list_size 0',
          '-hls_segment_filename ' + segmentPattern,
          `-map 0:a:${stem.trackIndex}` // Select specific audio track
        ])
        .output(stemPlaylist)
        .on('end', () => {
          resolve({
            id: stem.id,
            name: stem.name,
            playlist: `${stem.id}.m3u8`,
            bandwidth: 128000
          });
        })
        .on('error', reject)
        .run();
    });
  }

  /**
   * Create master HLS playlist
   */
  createMasterPlaylist(stems) {
    let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
    
    stems.forEach(stem => {
      content += `#EXT-X-STREAM-INF:BANDWIDTH=${stem.bandwidth},NAME="${stem.name}"\n`;
      content += `${stem.playlist}\n`;
    });

    return content;
  }

  /**
   * Stream HLS segment
   */
  async streamSegment(songId, stemId, segmentNumber) {
    const segmentPath = path.join(
      this.cachePath,
      songId,
      `${stemId}_${segmentNumber.toString().padStart(3, '0')}.ts`
    );

    try {
      await fs.access(segmentPath);
      return createReadStream(segmentPath);
    } catch {
      throw new Error('Segment not found');
    }
  }

  /**
   * Get playlist content
   */
  async getPlaylist(songId, playlistName) {
    const playlistPath = path.join(this.cachePath, songId, playlistName);
    
    try {
      return await fs.readFile(playlistPath, 'utf-8');
    } catch {
      throw new Error('Playlist not found');
    }
  }

  /**
   * Clean up old cache files
   */
  async cleanCache(maxAgeHours = 24) {
    const cacheDir = this.cachePath;
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    const entries = await fs.readdir(cacheDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(cacheDir, entry.name);
        const stats = await fs.stat(dirPath);
        
        if (now - stats.mtimeMs > maxAge) {
          await fs.rm(dirPath, { recursive: true, force: true });
          console.log(`Cleaned cache: ${entry.name}`);
        }
      }
    }
  }
}

export default new StreamingService();
```

**Create `src/routes/streaming.js`:**

```javascript
import express from 'express';
import streamingService from '../services/streamingService.js';
import { authenticate } from '../middleware/auth.js';
import { Song } from '../models/Song.js';

const router = express.Router();

// Get master playlist for a song
router.get('/:songId/master.m3u8', authenticate, async (req, res, next) => {
  try {
    const { songId } = req.params;
    const song = await Song.findById(songId);
    
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const { playlistPath } = await streamingService.generateHLSPlaylist(
      songId,
      song.filePath,
      song.stems
    );

    const content = await streamingService.getPlaylist(songId, 'master.m3u8');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(content);
  } catch (error) {
    next(error);
  }
});

// Get stem playlist
router.get('/:songId/:stemId.m3u8', authenticate, async (req, res, next) => {
  try {
    const { songId, stemId } = req.params;
    const content = await streamingService.getPlaylist(songId, `${stemId}.m3u8`);
    
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(content);
  } catch (error) {
    next(error);
  }
});

// Stream segment
router.get('/:songId/:segment', authenticate, async (req, res, next) => {
  try {
    const { songId, segment } = req.params;
    
    // Parse segment name (e.g., "vocals_001.ts")
    const match = segment.match(/^(.+)_(\d+)\.ts$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid segment format' });
    }

    const [, stemId, segmentNumber] = match;
    const stream = await streamingService.streamSegment(
      songId,
      stemId,
      parseInt(segmentNumber)
    );

    res.setHeader('Content-Type', 'video/mp2t');
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

// Get lyrics with timing
router.get('/:songId/lyrics', authenticate, async (req, res, next) => {
  try {
    const { songId } = req.params;
    const song = await Song.findById(songId);
    
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    res.json({
      songId,
      lyrics: song.lyrics,
      timing: song.timing
    });
  } catch (error) {
    next(error);
  }
});

export default router;
```

### Step 3: Create Android TV Client (React Native)

**Initialize React Native project:**

```bash
npx react-native init LoukaiTV
cd LoukaiTV

# Install dependencies
npm install @react-navigation/native @react-navigation/native-stack
npm install react-native-video socket.io-client axios
npm install @react-native-async-storage/async-storage
npm install react-native-gesture-handler react-native-reanimated
```

**Project structure:**

```
LoukaiTV/
├── src/
│   ├── screens/
│   │   ├── HomeScreen.js
│   │   ├── LibraryScreen.js
│   │   ├── PlayerScreen.js
│   │   └── SettingsScreen.js
│   ├── components/
│   │   ├── LyricsDisplay.js
│   │   ├── QueueList.js
│   │   ├── StemMixer.js
│   │   └── Visualizer.js
│   ├── services/
│   │   ├── ApiClient.js
│   │   ├── AudioPlayer.js
│   │   └── WebSocketClient.js
│   ├── store/
│   │   ├── index.js
│   │   ├── playbackSlice.js
│   │   └── queueSlice.js
│   └── utils/
│       ├── constants.js
│       └── helpers.js
├── android/
├── ios/
└── package.json
```

**Create `src/services/ApiClient.js`:**

```javascript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

class ApiClient {
  constructor() {
    this.baseURL = 'http://192.168.1.100:3069/api'; // Configure this
    this.token = null;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add auth token to requests
    this.client.interceptors.request.use(async (config) => {
      if (!this.token) {
        this.token = await AsyncStorage.getItem('authToken');
      }
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });
  }

  async login(username, password) {
    const response = await this.client.post('/auth/login', {
      username,
      password
    });
    this.token = response.data.token;
    await AsyncStorage.setItem('authToken', this.token);
    return response.data;
  }

  async searchSongs(query) {
    const response = await this.client.get('/library/search', {
      params: { q: query }
    });
    return response.data;
  }

  async getSongs(page = 1, limit = 50) {
    const response = await this.client.get('/library/songs', {
      params: { page, limit }
    });
    return response.data;
  }

  async getQueue() {
    const response = await this.client.get('/queue');
    return response.data;
  }

  async addToQueue(songId, requester) {
    const response = await this.client.post('/queue/add', {
      songId,
      requester
    });
    return response.data;
  }

  async play() {
    return await this.client.post('/playback/play');
  }

  async pause() {
    return await this.client.post('/playback/pause');
  }

  async seek(position) {
    return await this.client.post('/playback/seek', { position });
  }

  getStreamUrl(songId) {
    return `${this.baseURL}/stream/${songId}/master.m3u8`;
  }
}

export default new ApiClient();
```

**Create `src/services/AudioPlayer.js`:**

```javascript
import Video from 'react-native-video';

class AudioPlayer {
  constructor() {
    this.playerRef = null;
    this.currentSong = null;
    this.stems = {
      vocals: { volume: 1.0, muted: false },
      drums: { volume: 1.0, muted: false },
      bass: { volume: 1.0, muted: false },
      other: { volume: 1.0, muted: false }
    };
  }

  setPlayerRef(ref) {
    this.playerRef = ref;
  }

  loadSong(streamUrl) {
    this.currentSong = streamUrl;
    // React Native Video will handle HLS playback
  }

  play() {
    if (this.playerRef) {
      this.playerRef.resume();
    }
  }

  pause() {
    if (this.playerRef) {
      this.playerRef.pause();
    }
  }

  seek(position) {
    if (this.playerRef) {
      this.playerRef.seek(position);
    }
  }

  setStemVolume(stemId, volume) {
    this.stems[stemId].volume = volume;
    // Note: Individual stem volume control requires custom audio processing
    // For MVP, use master volume control
  }

  muteStem(stemId, muted) {
    this.stems[stemId].muted = muted;
  }
}

export default new AudioPlayer();
```

**Create `src/screens/PlayerScreen.js`:**

```javascript
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Video from 'react-native-video';
import { useSelector, useDispatch } from 'react-redux';
import ApiClient from '../services/ApiClient';
import AudioPlayer from '../services/AudioPlayer';
import LyricsDisplay from '../components/LyricsDisplay';
import StemMixer from '../components/StemMixer';

const PlayerScreen = () => {
  const dispatch = useDispatch();
  const currentSong = useSelector(state => state.playback.currentSong);
  const isPlaying = useSelector(state => state.playback.isPlaying);
  const [position, setPosition] = useState(0);
  const [lyrics, setLyrics] = useState([]);

  useEffect(() => {
    if (currentSong) {
      loadLyrics(currentSong.id);
    }
  }, [currentSong]);

  const loadLyrics = async (songId) => {
    try {
      const response = await ApiClient.client.get(`/stream/${songId}/lyrics`);
      setLyrics(response.data.lyrics);
    } catch (error) {
      console.error('Failed to load lyrics:', error);
    }
  };

  const handlePlayPause = async () => {
    if (isPlaying) {
      await ApiClient.pause();
      AudioPlayer.pause();
    } else {
      await ApiClient.play();
      AudioPlayer.play();
    }
  };

  const handleProgress = (data) => {
    setPosition(data.currentTime);
  };

  if (!currentSong) {
    return (
      <View style={styles.container}>
        <Text style={styles.noSong}>No song loaded</Text>
      </View>
    );
  }

  const streamUrl = ApiClient.getStreamUrl(currentSong.id);

  return (
    <View style={styles.container}>
      {/* Hidden video player for audio */}
      <Video
        ref={(ref) => AudioPlayer.setPlayerRef(ref)}
        source={{ uri: streamUrl }}
        audioOnly={true}
        paused={!isPlaying}
        onProgress={handleProgress}
        playInBackground={false}
        playWhenInactive={false}
      />

      {/* Lyrics Display */}
      <LyricsDisplay 
        lyrics={lyrics} 
        currentPosition={position}
        style={styles.lyrics}
      />

      {/* Song Info */}
      <View style={styles.songInfo}>
        <Text style={styles.title}>{currentSong.title}</Text>
        <Text style={styles.artist}>{currentSong.artist}</Text>
      </View>

      {/* Stem Mixer */}
      <StemMixer style={styles.mixer} />

      {/* Playback Controls */}
      <View style={styles.controls}>
        <TouchableOpacity 
          style={styles.button}
          onPress={handlePlayPause}
        >
          <Text style={styles.buttonText}>
            {isPlaying ? 'Pause' : 'Play'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  noSong: {
    color: '#fff',
    fontSize: 24,
    textAlign: 'center',
    marginTop: 100,
  },
  lyrics: {
    flex: 1,
    padding: 20,
  },
  songInfo: {
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  artist: {
    color: '#ccc',
    fontSize: 20,
    marginTop: 5,
  },
  mixer: {
    height: 150,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 20,
  },
  button: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default PlayerScreen;
```

### Step 4: WebSocket Synchronization

**Create `src/websocket/handlers.js` (Server):**

```javascript
export function setupWebSocket(io) {
  const clients = new Map();

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Register client
    socket.on('register', (data) => {
      clients.set(socket.id, {
        type: data.type, // 'android-tv', 'web', 'ios'
        role: data.role, // 'player', 'admin', 'singer'
        connectedAt: Date.now()
      });
    });

    // Playback control from clients
    socket.on('playback:control', async (data) => {
      const { action, position } = data;
      
      // Broadcast to all clients
      io.emit('playback:stateChanged', {
        action,
        position,
        timestamp: Date.now()
      });
    });

    // Queue updates
    socket.on('queue:update', (queue) => {
      io.emit('queue:updated', queue);
    });

    // Mixer updates
    socket.on('mixer:update', (mixerState) => {
      io.emit('mixer:updated', mixerState);
    });

    socket.on('disconnect', () => {
      clients.delete(socket.id);
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}
```

**Create `src/services/WebSocketClient.js` (Android TV):**

```javascript
import io from 'socket.io-client';
import { store } from '../store';
import { updatePlayback, updateQueue } from '../store/playbackSlice';

class WebSocketClient {
  constructor() {
    this.socket = null;
    this.serverUrl = 'http://192.168.1.100:3069';
  }

  connect(token) {
    this.socket = io(this.serverUrl, {
      auth: { token },
      transports: ['websocket']
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.socket.emit('register', {
        type: 'android-tv',
        role: 'player'
      });
    });

    this.socket.on('playback:stateChanged', (data) => {
      store.dispatch(updatePlayback(data));
    });

    this.socket.on('queue:updated', (queue) => {
      store.dispatch(updateQueue(queue));
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  emitPlaybackControl(action, position) {
    if (this.socket) {
      this.socket.emit('playback:control', { action, position });
    }
  }
}

export default new WebSocketClient();
```

## Migration Steps

### Phase 1: Run Both Systems in Parallel

1. Keep existing Electron app running
2. Deploy new server alongside
3. Configure server to use same song storage
4. Test API endpoints with Postman/curl

### Phase 2: Deploy Android TV Client

1. Build APK: `cd LoukaiTV && npx react-native run-android --variant=release`
2. Install on Android TV device
3. Configure server URL in settings
4. Test basic playback

### Phase 3: Gradual Migration

1. Start using Android TV for new installations
2. Maintain Electron app for existing users
3. Collect feedback and iterate
4. Eventually deprecate Electron app

## Testing Checklist

- [ ] Server starts without errors
- [ ] Database connection works
- [ ] Authentication flow works
- [ ] Library scanning works
- [ ] HLS streaming generates correctly
- [ ] Android TV client connects to server
- [ ] Audio playback works on TV
- [ ] Lyrics sync correctly
- [ ] Queue management works
- [ ] WebSocket real-time updates work
- [ ] Multiple clients can connect simultaneously

## Performance Optimization

1. **Caching**: Pre-generate HLS for popular songs
2. **CDN**: Use CDN for static assets and media
3. **Database**: Add indexes on frequently queried fields
4. **Connection pooling**: Use connection pools for database
5. **Compression**: Enable gzip compression for API responses

## Security Checklist

- [ ] Use HTTPS in production
- [ ] Implement rate limiting
- [ ] Validate all user inputs
- [ ] Use prepared statements for SQL queries
- [ ] Store passwords with bcrypt
- [ ] Use JWT with expiration
- [ ] Implement CORS properly
- [ ] Add request size limits
- [ ] Log security events
- [ ] Regular security audits
