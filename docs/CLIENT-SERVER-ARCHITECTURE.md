# Loukai Client-Server Architecture

## Overview

Transform Loukai from a standalone Electron application to a distributed client-server system where:
- **Origin Server**: Centralized karaoke file storage, library management, and media streaming
- **Clients**: Lightweight applications (Android TV APK, web apps, iOS) that connect to the server

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     ORIGIN SERVER                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  File Storage Layer                                     │ │
│  │  - Karaoke files (.stem.m4a, CDG)                      │ │
│  │  - Album art, metadata cache                           │ │
│  │  - User data, playlists                                │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Core Services                                          │ │
│  │  - Library Management                                   │ │
│  │  - Audio Streaming (HLS/DASH)                          │ │
│  │  - Queue Management                                     │ │
│  │  - User Authentication                                  │ │
│  │  - Creator Pipeline (stem separation)                  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  API Layer                                              │ │
│  │  - REST API (Express)                                   │ │
│  │  - WebSocket (Socket.io) for real-time                │ │
│  │  - Media Streaming endpoints                           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS/WSS
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌──────▼───────┐  ┌───────▼────────┐
│  Android TV    │  │  Web Client  │  │  iOS/iPad      │
│  APK Client    │  │  (Browser)   │  │  Client        │
├────────────────┤  ├──────────────┤  ├────────────────┤
│ - Video out    │  │ - Admin UI   │  │ - Touch UI     │
│ - Audio mixer  │  │ - Singer UI  │  │ - Portable     │
│ - Remote ctrl  │  │ - Remote     │  │ - Remote       │
│ - Lyrics       │  │ - Requests   │  │ - Requests     │
└────────────────┘  └──────────────┘  └────────────────┘
```

## Component Breakdown

### 1. Origin Server (Node.js)

**Technology Stack:**
- Node.js 20+ with Express 5
- PostgreSQL or SQLite for metadata
- Redis for session management and caching
- FFmpeg for audio transcoding
- Socket.io for real-time communication

**Core Responsibilities:**
- **File Storage**: Centralized karaoke file repository
- **Library Management**: Scan, index, and search songs
- **Audio Streaming**: Transcode and stream audio to clients
- **Queue Management**: Global queue across all clients
- **User Management**: Authentication, profiles, permissions
- **Creator Pipeline**: Convert audio files to karaoke format
- **Analytics**: Track usage, popular songs, performance metrics

**API Endpoints:**

```javascript
// Authentication
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/session

// Library
GET    /api/library/songs
GET    /api/library/search?q=query
GET    /api/library/song/:id
POST   /api/library/scan

// Streaming
GET    /api/stream/:songId/master.m3u8    // HLS manifest
GET    /api/stream/:songId/stem/:stemId   // Individual stems
GET    /api/stream/:songId/lyrics         // Timed lyrics

// Queue
GET    /api/queue
POST   /api/queue/add
DELETE /api/queue/:id
PUT    /api/queue/reorder

// Playback Control (Server-side state)
POST   /api/playback/play
POST   /api/playback/pause
POST   /api/playback/seek
POST   /api/playback/next

// Requests
GET    /api/requests
POST   /api/requests/create
POST   /api/requests/:id/approve
POST   /api/requests/:id/reject

// Creator
POST   /api/creator/upload
GET    /api/creator/status/:jobId
POST   /api/creator/process
```

**WebSocket Events:**

```javascript
// Server → Clients
'queue:updated'
'playback:stateChanged'
'song:loaded'
'request:new'
'request:approved'
'lyrics:sync'

// Clients → Server
'playback:control' (play/pause/seek)
'queue:add'
'mixer:update'
```

### 2. Android TV Client (APK)

**Technology Stack:**
- **React Native** or **Flutter** for cross-platform
- **ExoPlayer** for audio playback (Android)
- **WebSocket** for real-time communication
- **HLS/DASH** for adaptive streaming

**Features:**
- Full-screen karaoke display (lyrics + visualizations)
- Audio mixer with stem control
- Remote control support (TV remote, phone app)
- Offline mode with cached songs
- Voice control integration (Google Assistant)
- Multiple output routing (HDMI, Bluetooth, headphone jack)

**Architecture:**

```
┌─────────────────────────────────────────┐
│         Android TV Client               │
├─────────────────────────────────────────┤
│  UI Layer (React Native/Flutter)        │
│  ├─ Karaoke Display (Lyrics + Video)   │
│  ├─ Queue Management                    │
│  ├─ Settings & Mixer                    │
│  └─ Remote Control Interface            │
├─────────────────────────────────────────┤
│  Business Logic                          │
│  ├─ State Management (Redux/MobX)      │
│  ├─ API Client (REST + WebSocket)      │
│  └─ Cache Manager (SQLite)             │
├─────────────────────────────────────────┤
│  Media Layer                             │
│  ├─ ExoPlayer (Audio Streaming)        │
│  ├─ Stem Mixer (AudioTrack)            │
│  ├─ Lyrics Renderer (Canvas)           │
│  └─ Visualizations (OpenGL ES)         │
├─────────────────────────────────────────┤
│  Platform Services                       │
│  ├─ Network Manager                     │
│  ├─ Audio Output Router                │
│  └─ Storage Manager                     │
└─────────────────────────────────────────┘
```

### 3. Web Client (Browser)

**Two Modes:**

**Admin Mode** (KJ/Venue Control):
- Full playback control
- Queue management
- Request approval
- Mixer control
- Analytics dashboard

**Singer Mode** (Public):
- Browse library
- Search songs
- Submit requests
- View queue
- See lyrics (optional)

### 4. iOS/iPad Client

Similar to Android TV but optimized for touch:
- Portable karaoke system
- AirPlay support for TV output
- iPad as control surface
- iPhone as remote

## Audio Streaming Strategy

### Option 1: HLS (HTTP Live Streaming) - Recommended

**Pros:**
- Industry standard, wide support
- Adaptive bitrate streaming
- Works over HTTP/HTTPS
- CDN-friendly

**Implementation:**

```javascript
// Server generates HLS manifest
GET /api/stream/:songId/master.m3u8

#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=256000
vocals.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=256000
drums.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=256000
bass.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=256000
other.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=512000
master.m3u8
```

**Client Implementation:**
```javascript
// Android: ExoPlayer with HLS support
SimpleExoPlayer player = new SimpleExoPlayer.Builder(context).build();
MediaItem mediaItem = MediaItem.fromUri(hlsUrl);
player.setMediaItem(mediaItem);
player.prepare();
player.play();
```

### Option 2: WebRTC (Real-time)

**Pros:**
- Ultra-low latency
- Peer-to-peer capable
- Built-in encryption

**Cons:**
- More complex setup
- NAT traversal issues
- Higher server load

### Option 3: Custom Binary Protocol

**Pros:**
- Full control over streaming
- Optimized for karaoke use case

**Cons:**
- Reinventing the wheel
- More development time

**Recommendation**: Use HLS for initial implementation, add WebRTC for low-latency mode later.

## Data Synchronization

### Server-Side State Management

```javascript
// Global state on server
{
  playback: {
    currentSong: { id, path, position, duration },
    isPlaying: false,
    position: 0,
    activeClients: ['client-1', 'client-2']
  },
  queue: [
    { id, songId, requester, addedAt }
  ],
  mixer: {
    stems: [
      { id: 'vocals', gain: 0.8, muted: false },
      { id: 'drums', gain: 1.0, muted: false }
    ]
  },
  clients: {
    'client-1': { type: 'android-tv', role: 'player', lastSeen: timestamp },
    'client-2': { type: 'web', role: 'admin', lastSeen: timestamp }
  }
}
```

### Client-Side State

```javascript
// Minimal state on client
{
  connection: { status: 'connected', latency: 45 },
  playback: { position: 123.45, buffered: 130.0 },
  localSettings: { volume: 0.8, subtitleSize: 'large' }
}
```

### Synchronization Protocol

```javascript
// Server broadcasts state changes
socket.emit('state:sync', {
  type: 'playback',
  data: { isPlaying: true, position: 45.2 },
  timestamp: Date.now()
});

// Clients acknowledge
socket.emit('state:ack', {
  type: 'playback',
  clientPosition: 45.3,
  timestamp: Date.now()
});

// Server detects drift and corrects
if (Math.abs(serverPosition - clientPosition) > 0.5) {
  socket.emit('playback:seek', { position: serverPosition });
}
```

## File Storage Structure

```
/karaoke-storage/
├── songs/
│   ├── 0-9/
│   ├── A/
│   │   ├── Artist - Title.stem.m4a
│   │   └── Artist - Title.json (metadata cache)
│   ├── B/
│   └── ...
├── cache/
│   ├── thumbnails/
│   ├── waveforms/
│   └── transcoded/
├── uploads/
│   └── pending/
└── database/
    └── library.db
```

## Database Schema

```sql
-- Songs table
CREATE TABLE songs (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255),
  album VARCHAR(255),
  duration INTEGER,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  format VARCHAR(10), -- 'stem', 'cdg'
  has_lyrics BOOLEAN DEFAULT false,
  has_stems BOOLEAN DEFAULT false,
  key VARCHAR(10),
  bpm INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  play_count INTEGER DEFAULT 0,
  last_played TIMESTAMP
);

-- Queue table
CREATE TABLE queue (
  id UUID PRIMARY KEY,
  song_id UUID REFERENCES songs(id),
  requester_id UUID REFERENCES users(id),
  requester_name VARCHAR(255),
  position INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, playing, completed
  added_at TIMESTAMP DEFAULT NOW(),
  played_at TIMESTAMP
);

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash TEXT,
  role VARCHAR(20) DEFAULT 'singer', -- admin, kj, singer
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

-- Requests table
CREATE TABLE requests (
  id UUID PRIMARY KEY,
  song_id UUID REFERENCES songs(id),
  requester_id UUID REFERENCES users(id),
  requester_name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(id)
);

-- Analytics table
CREATE TABLE analytics (
  id UUID PRIMARY KEY,
  event_type VARCHAR(50), -- song_played, song_requested, user_login
  song_id UUID REFERENCES songs(id),
  user_id UUID REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sessions table
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  client_type VARCHAR(50), -- android-tv, web, ios
  client_id VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);
```

## Security Considerations

### Authentication
- JWT tokens for API authentication
- Session-based auth for web clients
- API keys for trusted clients (Android TV)
- OAuth2 for third-party integrations

### Authorization
- Role-based access control (RBAC)
- Admin: Full control
- KJ: Playback control, queue management
- Singer: Browse, request songs
- Guest: View-only

### Network Security
- HTTPS/TLS for all communication
- WebSocket over TLS (WSS)
- Rate limiting on API endpoints
- CORS configuration
- Content Security Policy (CSP)

### File Access
- Signed URLs for media streaming (time-limited)
- No direct file system access from clients
- Watermarking for premium content (optional)

## Deployment Architecture

### Single Server Setup (Small Venue)

```
┌─────────────────────────────────┐
│  Server (Ubuntu/Debian)         │
│  ┌───────────────────────────┐  │
│  │  Loukai Server            │  │
│  │  - Node.js app            │  │
│  │  - PostgreSQL             │  │
│  │  - Redis                  │  │
│  │  - File storage           │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │  Nginx (Reverse Proxy)    │  │
│  │  - SSL termination        │  │
│  │  - Static file serving    │  │
│  │  - Load balancing         │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### Multi-Server Setup (Large Venue/Chain)

```
┌──────────────────┐
│  Load Balancer   │
│  (Nginx/HAProxy) │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐
│ App 1 │ │ App 2 │  (Node.js servers)
└───┬───┘ └──┬────┘
    │        │
    └────┬───┘
         │
┌────────▼─────────┐
│  PostgreSQL      │
│  (Primary)       │
└────────┬─────────┘
         │
┌────────▼─────────┐
│  PostgreSQL      │
│  (Replica)       │
└──────────────────┘

┌──────────────────┐
│  Redis Cluster   │
│  (Session/Cache) │
└──────────────────┘

┌──────────────────┐
│  NAS/S3          │
│  (File Storage)  │
└──────────────────┘
```

## Migration Path from Current Architecture

### Phase 1: Extract Server Components
1. Keep Electron app as-is
2. Extract web server to standalone Node.js app
3. Move file storage to centralized location
4. Update Electron app to use new API

### Phase 2: Build Android TV Client
1. Create React Native/Flutter project
2. Implement core playback features
3. Add mixer and queue management
4. Test with existing server

### Phase 3: Enhance Server
1. Add HLS streaming support
2. Implement user management
3. Add analytics and reporting
4. Optimize for multiple clients

### Phase 4: Deploy & Scale
1. Deploy server to cloud/on-premise
2. Distribute Android TV APK
3. Migrate existing installations
4. Monitor and optimize

## Development Roadmap

### Milestone 1: Server Foundation (4-6 weeks)
- [ ] Extract server from Electron app
- [ ] Implement REST API
- [ ] Add PostgreSQL database
- [ ] Implement authentication
- [ ] Add HLS streaming support

### Milestone 2: Android TV Client (6-8 weeks)
- [ ] Set up React Native/Flutter project
- [ ] Implement UI components
- [ ] Add audio playback with ExoPlayer
- [ ] Implement WebSocket communication
- [ ] Add mixer controls
- [ ] Test on Android TV devices

### Milestone 3: Enhanced Features (4-6 weeks)
- [ ] Multi-client synchronization
- [ ] Analytics dashboard
- [ ] User management
- [ ] Request system
- [ ] Offline mode

### Milestone 4: Production Ready (2-4 weeks)
- [ ] Performance optimization
- [ ] Security hardening
- [ ] Documentation
- [ ] Deployment scripts
- [ ] Beta testing

## Technology Recommendations

### Server
- **Runtime**: Node.js 20 LTS
- **Framework**: Express 5 or Fastify
- **Database**: PostgreSQL 15+ (or SQLite for small deployments)
- **Cache**: Redis 7+
- **Streaming**: FFmpeg with HLS support
- **Real-time**: Socket.io 4+

### Android TV Client
- **Framework**: React Native (easier for web devs) or Flutter (better performance)
- **Audio**: ExoPlayer 2.x
- **State**: Redux Toolkit or MobX
- **Networking**: Axios + Socket.io-client
- **Storage**: AsyncStorage or SQLite

### DevOps
- **Containerization**: Docker + Docker Compose
- **Orchestration**: Kubernetes (for large scale)
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack or Loki

## Cost Considerations

### Infrastructure Costs (Monthly)

**Small Venue (Single Location)**
- VPS (4 CPU, 8GB RAM, 500GB SSD): $40-80
- Domain + SSL: $10-20
- Total: ~$50-100/month

**Medium Venue (Multiple Locations)**
- Cloud servers (2x instances): $200-400
- Database (managed): $50-100
- Storage (1TB): $20-40
- CDN: $20-50
- Total: ~$300-600/month

**Large Chain (10+ Locations)**
- Kubernetes cluster: $500-1000
- Database cluster: $200-400
- Storage (10TB): $200-300
- CDN: $100-200
- Total: ~$1000-2000/month

### Development Costs
- Server development: 4-6 weeks
- Android TV client: 6-8 weeks
- Testing & deployment: 2-4 weeks
- Total: 12-18 weeks of development

## Next Steps

1. **Prototype the server**: Extract core services from Electron app
2. **Design API contracts**: Finalize REST and WebSocket APIs
3. **Build proof-of-concept**: Simple Android TV client with basic playback
4. **Test streaming**: Validate HLS streaming performance
5. **Iterate**: Refine based on testing feedback

## Questions to Consider

1. **Deployment model**: Cloud (AWS/Azure/GCP) or on-premise servers?
2. **Client distribution**: Google Play Store or direct APK distribution?
3. **Licensing**: How to handle music licensing across multiple venues?
4. **Monetization**: Subscription model, per-venue licensing, or one-time purchase?
5. **Offline mode**: Should clients cache songs for offline use?
6. **Multi-tenancy**: Single server for multiple venues or separate instances?
