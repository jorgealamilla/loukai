# Kai Player Creator - Design Document

Integration of karaoke file creation into kai-player. This document captures the full understanding of kai-converter's architecture and outlines the Node.js-first approach for the merged application.

---

## 0. CRITICAL: Feature Parity with kai-converter

**Priority: HIGHEST**

The new creator MUST produce M4A files identical to kai-converter. This section documents the exact format specification that must be replicated.

### M4A File Structure (must match exactly)

```
song.stem.m4a
├── ftyp: M4A brand
├── moov (metadata container)
│   ├── mvhd (movie header)
│   ├── trak[0]: Mixdown (AAC, enabled, default)
│   ├── trak[1]: Drums (AAC, disabled)
│   ├── trak[2]: Bass (AAC, disabled)
│   ├── trak[3]: Other (AAC, disabled)
│   ├── trak[4]: Vocals (AAC, disabled)
│   ├── trak[5]: Lyrics (mov_text/WebVTT)
│   └── udta (user data)
│       ├── meta (iTunes metadata: ©nam, ©ART, ©alb, covr)
│       ├── stem (NI Stems JSON - Traktor compatibility)
│       ├── ----:com.stems:kaid (Karaoke Data JSON)
│       ├── ----:com.stems:vpch (Vocal Pitch binary)
│       └── ----:com.stems:kons (Onsets binary, optional)
└── mdat (media data - all audio/subtitle streams)
```

### Audio Encoding (must match)

```javascript
// AAC encoding parameters (FFmpeg)
const aacParams = {
  codec: 'aac',
  bitrate: '256k',
  vbr: 4,
  movflags: 'faststart'
};

// FFmpeg command per stem
ffmpeg -i {input.wav} -c:a aac -b:a 256k -vbr 4 -movflags faststart -y {output.m4a}

// Encoder delay
const ENCODER_DELAY_SAMPLES = 1105;  // AAC encoder delay at 44.1kHz (~25ms)
```

### Track Order (NI Stems specification)

```javascript
// STEMS-4 profile
const STEMS_4_ORDER = ['mixdown', 'drums', 'bass', 'other', 'vocals'];

// STEMS-2 profile
const STEMS_2_ORDER = ['mixdown', 'music', 'vocals'];
```

### Custom Atoms (mutagen freeform atoms)

**kaid atom** - `----:com.stems:kaid`
```javascript
// Karaoke Data (JSON, UTF-8 encoded bytes)
{
  "stems_karaoke_version": "1.0",
  "audio": {
    "profile": "STEMS-4",
    "encoder_delay_samples": 1105,
    "sources": [
      {"track": 0, "id": "mixdown", "role": "mixdown"},
      {"track": 1, "id": "drums", "role": "drums"},
      {"track": 2, "id": "bass", "role": "bass"},
      {"track": 3, "id": "other", "role": "other"},
      {"track": 4, "id": "vocals", "role": "vocals"}
    ],
    "presets": [{"id": "karaoke", "levels": {"vocals": -120}}]
  },
  "timing": {
    "reference": "aligned_to_vocals",
    "offset_sec": 0.0
  },
  "singers": [{"id": "A", "name": "Lead", "guide_track": 4}],
  "lines": [
    {
      "singer_id": "A",
      "start": 12.345,
      "end": 15.678,
      "text": "First line of lyrics",
      "word_timing": [[0.0, 0.5], [0.5, 0.9], ...]  // Relative to line start
    }
  ]
}
```

**vpch atom** - `----:com.stems:vpch`
```javascript
// Vocal Pitch (binary float32 array)
// MIDI cents values at 25Hz sample rate
// Written via mutagen: mp4['----:com.stems:vpch'] = [float32_buffer]
```

**kons atom** - `----:com.stems:kons`
```javascript
// Karaoke Onsets (binary float64 array)
// Onset timestamps in seconds
// Written via mutagen: mp4['----:com.stems:kons'] = [float64_buffer]
```

**stem atom** - Raw binary in `moov/udta/stem`
```javascript
// NI Stems metadata (JSON, injected via binary manipulation)
{
  "version": 1,
  "mastering_dsp": {
    "compressor": {
      "enabled": true,
      "input_gain": 0.0,
      "output_gain": 0.0,
      "threshold": -6.0,
      "dry_wet": 100,
      "attack": 0.003,
      "release": 0.3,
      "ratio": 2.0,
      "hp_cutoff": 20
    },
    "limiter": {
      "enabled": true,
      "threshold": -0.3,
      "ceiling": -0.3,
      "release": 0.05
    }
  },
  "stems": [
    {"name": "Drums", "color": "#FF0000"},
    {"name": "Bass", "color": "#00FF00"},
    {"name": "Other", "color": "#0000FF"},
    {"name": "Vocals", "color": "#FFFF00"}
  ]
}
```

### WebVTT Lyrics Format

```vtt
WEBVTT

00:12:34.567 --> 00:15:67.890
<v A><00:12:34.567>First <00:12:56.789>line <00:13:01.234>of <00:13:45.678>lyrics

00:16:00.000 --> 00:18:30.000
<v A><00:16:00.000>Second <00:16:25.000>line
```

Features:
- Voice tags: `<v A>` for singer ID
- Karaoke timestamps: `<HH:MM:SS.mmm>` before each word
- Backup vocal class: `<c.backup>...</c>`
- Encoder delay compensation applied to all timestamps

### Muxing Process (FFmpeg)

```bash
# Step 1: Mux all tracks
ffmpeg \
  -i mixdown.m4a \
  -i drums.m4a \
  -i bass.m4a \
  -i other.m4a \
  -i vocals.m4a \
  -i lyrics.vtt \
  -map 0:a -map 1:a -map 2:a -map 3:a -map 4:a -map 5:s \
  -c:a copy \
  -c:s mov_text \
  -disposition:a:0 default \
  -disposition:a:1 0 \
  -disposition:a:2 0 \
  -disposition:a:3 0 \
  -disposition:a:4 0 \
  -metadata title="Song Title" \
  -metadata artist="Artist Name" \
  -movflags faststart \
  -y output.stem.m4a

# Step 2: Inject NI Stems atom (binary manipulation)
# Insert JSON into moov/udta/stem
# Update stco/co64 chunk offset tables

# Step 3: Write custom atoms (mutagen)
# kaid, vpch, kons via freeform atoms
```

### Critical Binary Operations

**Chunk Offset Update** (after injecting stem atom):
```javascript
// When inserting data inside moov, all chunk offsets pointing
// to mdat must be updated by the insertion size

function updateChunkOffsets(data, insertionSize, moovEndPosition) {
  // Find all stco (32-bit) and co64 (64-bit) atoms
  // For each offset >= moovEndPosition: offset += insertionSize
}
```

### Validation Checklist

Before releasing, verify output files:
- [ ] Opens in Traktor and shows 4 stems
- [ ] Opens in Mixxx and shows multi-track
- [ ] Opens in VLC and plays mixdown
- [ ] Lyrics display correctly in kai-player
- [ ] Word-level timing works in karaoke mode
- [ ] Pitch visualization works (vpch atom)
- [ ] iTunes metadata (title, artist, album, cover) present
- [ ] File size comparable to kai-converter output

### Node.js Implementation Notes

**For mutagen (Python) replacement:**
- Use `mp4box` npm package or custom binary manipulation
- Custom freeform atoms: `----:com.stems:kaid` etc.
- iTunes atoms: `©nam`, `©ART`, `©alb`, `©day`, `©gen`, `trkn`, `covr`

**For binary stem atom injection:**
- Port `_inject_stem_atom()` and `_update_chunk_offsets()` to Node.js
- Use Buffer for binary manipulation
- Update stco/co64 tables after insertion

---

## 1. Current kai-converter Architecture (Reference)

### Processing Pipeline (9 Steps)
1. **Load Audio** (5%) - FFmpeg converts to WAV 44.1kHz stereo
2. **Extract Metadata** (2%) - mutagen reads ID3 tags
3. **Stem Separation** (35%) - Demucs htdemucs_ft model (REQUIRES PYTHON/TORCH)
4. **Transcription** (40%) - Whisper with word-level timing (REQUIRES PYTHON/TORCH)
5. **Musical Analysis** (8%) - CREPE pitch, madmom tempo (REQUIRES PYTHON/TORCH)
6. **MP3 Encoding** (5%) - FFmpeg encodes stems
7. **Generate song.json** (2%) - Pure JSON structure
8. **Save Features** (1%) - Write analysis JSON files
9. **Package KAI** (2%) - ZIP archive creation

### Current Python Dependencies (~4-5GB installed)
- **torch** (~1.2GB) - PyTorch for ML inference
- **torchaudio** - Audio tensor operations
- **demucs** (~100MB) - Stem separation models
- **openai-whisper** - Speech recognition
- **torchcrepe** - Pitch detection
- **madmom** - Tempo/beat detection (optional)
- **essentia** - Timbral features (optional)
- **mutagen** - ID3 metadata
- **numpy**, **scipy**, **soundfile** - Audio processing

### Current IPC Mechanism
```
Electron Main → spawn Python with inline script → stdout PROGRESS:JSON/RESULT:JSON
```

Problems:
- 5-second cold start (torch import)
- Inline Python scripts embedded in JS strings
- No model caching between operations
- No parallel processing capability

---

## 2. What MUST Stay Python

These require PyTorch and have no Node.js alternatives:

| Component | Library | Purpose |
|-----------|---------|---------|
| Stem Separation | demucs | Neural network splits audio into vocals/drums/bass/other |
| Transcription | whisper | Speech-to-text with word-level timestamps |
| Pitch Detection | torchcrepe | F0 contour extraction for vocal pitch |
| Beat Detection | madmom | Neural network tempo/beat tracking |

**Minimum Python call**: Single invocation that does Demucs → Whisper → CREPE in sequence, outputting intermediate files.

---

## 3. What Moves to Node.js

### File I/O & Metadata
| Python | Node.js Replacement |
|--------|---------------------|
| `mutagen` (ID3) | `music-metadata` npm |
| `zipfile` (KAI) | `archiver` npm |
| `json` | Native JSON |
| `pathlib` | Native `path` |

### Audio Processing
| Python | Node.js Replacement |
|--------|---------------------|
| FFmpeg subprocess | `fluent-ffmpeg` or `child_process.spawn` |
| `soundfile` | `fluent-ffmpeg` for format conversion |

### API Calls
| Python | Node.js Replacement |
|--------|---------------------|
| `openai` SDK | `openai` npm |
| `anthropic` SDK | `@anthropic-ai/sdk` npm |
| `google-generativeai` | `@google/generative-ai` npm |
| LRCLIB HTTP | Native `fetch` |

### Lyrics & Text Processing
| Python | Node.js Replacement |
|--------|---------------------|
| `webvtt_generator.py` | String template literals |
| `song_json.py` | JS object construction |
| Word alignment math | JS implementation |

---

## 4. New Architecture

### Design Principle
**Node.js orchestrates everything. Python only does ML inference.**

Each ML step is a separate Python spawn. This gives Node full control over progress, error handling, and cancellation between steps.

### Overview
```
┌─────────────────────────────────────────────────────────────────┐
│                     Electron Main Process                        │
├─────────────────────────────────────────────────────────────────┤
│  CreatorService (Node.js Worker Thread)                         │
│  ├── 1. music-metadata: Read ID3 tags                           │
│  ├── 2. fetch: LRCLIB lookup → get reference lyrics             │
│  ├── 3. JS: Extract vocabulary hints for Whisper                │
│  ├── 4. FFmpeg: Convert input to WAV                            │
│  ├── 5. Python spawn: demucs.py → stems/*.wav                   │
│  ├── 6. Python spawn: whisper.py (with vocab hints) → lyrics    │
│  ├── 7. Python spawn: crepe.py → pitch.json                     │
│  ├── 8. LLM SDK: Lyrics correction (compare to reference)       │
│  ├── 9. FFmpeg: Encode WAVs to AAC                              │
│  ├── 10. FFmpeg: Mux multi-track M4A                            │
│  └── 11. Binary: Write custom atoms (kaid, vpch, stems)         │
├─────────────────────────────────────────────────────────────────┤
│  Worker Thread (creator-worker.js)                              │
│  ├── Runs all CreatorService operations                         │
│  ├── Posts progress messages to main                            │
│  └── Non-blocking: player continues while creating              │
└─────────────────────────────────────────────────────────────────┘
```

### Python Scripts (Minimal, Single-Purpose)

**demucs.py** - Stem separation only
```python
#!/usr/bin/env python3
import sys, json, torch
from demucs.pretrained import get_model
from demucs.apply import apply_model
import torchaudio

config = json.loads(sys.argv[1])
# Load audio, run demucs, save stems as WAV
# Output: vocals.wav, drums.wav, bass.wav, other.wav (or music.wav for 2-stem)
print(f"RESULT:{json.dumps({'success': True, 'stems': [...]})}")
```

**whisper.py** - Transcription only
```python
#!/usr/bin/env python3
import sys, json, whisper

config = json.loads(sys.argv[1])
model = whisper.load_model(config['model'])  # default: large-v3-turbo
result = model.transcribe(config['vocals_wav'], word_timestamps=True, ...)
# Output: lyrics.json with word-level timing
print(f"RESULT:{json.dumps({'success': True, 'lyrics': result})}")
```

**crepe.py** - Pitch detection only
```python
#!/usr/bin/env python3
import sys, json, torch, torchcrepe

config = json.loads(sys.argv[1])
# Run CREPE on vocals, output pitch contour
# Output: pitch.json with times, frequencies, confidence
print(f"RESULT:{json.dumps({'success': True, 'pitch': data})}")
```

### Node.js Orchestration (creator-service.js)
```javascript
class CreatorService {
  async create(inputFile, options, onProgress) {
    const workDir = await this.prepareWorkDir();

    // Step 1: Read metadata (Node - music-metadata)
    onProgress({ stage: 'metadata', percent: 0 });
    const metadata = await this.readMetadata(inputFile);

    // Step 2: LRCLIB lookup FIRST (Node - fetch)
    // Reference lyrics are used to build Whisper initial_prompt
    onProgress({ stage: 'lyrics_lookup', percent: 2 });
    const refLyrics = await this.lookupLRCLIB(metadata.title, metadata.artist);
    // Or use options.referenceLyrics if user pasted them

    // Step 3: Extract vocabulary hints for Whisper
    const vocabHints = this.extractVocabulary(refLyrics || options.referenceLyrics);
    const whisperPrompt = vocabHints
      ? `${metadata.title}. ${vocabHints}`  // "Song Title. word1, word2, word3..."
      : metadata.title;

    // Step 4: Convert to WAV (Node - FFmpeg spawn)
    onProgress({ stage: 'convert', percent: 5 });
    const inputWav = await this.convertToWav(inputFile, workDir);

    // Step 5: Stem separation (Python - demucs.py)
    onProgress({ stage: 'stems', percent: 10 });
    const stems = await this.runDemucs(inputWav, workDir, options.fourStems);
    // Node has control here - can report 10-45% as demucs progresses

    // Step 6: Transcription with vocabulary hints (Python - whisper.py)
    onProgress({ stage: 'transcribe', percent: 45 });
    const lyrics = await this.runWhisper(stems.vocals, workDir, {
      model: options.whisperModel,      // default: large-v3-turbo
      language: options.language,        // default: auto
      initialPrompt: whisperPrompt       // vocabulary hints from LRCLIB
    });
    // Node has control here - can report 45-80% as whisper progresses

    // Step 7: Pitch detection (Python - crepe.py)
    onProgress({ stage: 'pitch', percent: 80 });
    const pitch = await this.runCrepe(stems.vocals, workDir);

    // Step 8: LLM correction if enabled (Node - SDK)
    // Uses BOTH whisper output AND reference lyrics for comparison
    onProgress({ stage: 'correct', percent: 85 });
    const correctedLyrics = options.llmCorrection
      ? await this.correctLyrics(lyrics, refLyrics, options.llm)
      : lyrics;

    // Step 9: Encode stems to AAC (Node - FFmpeg)
    onProgress({ stage: 'encode', percent: 90 });
    const stemAac = await this.encodeStemsToAAC(workDir);

    // Step 10: Mux M4A (Node - FFmpeg)
    onProgress({ stage: 'mux', percent: 95 });
    const m4aFile = await this.muxStemsM4A(stemAac, correctedLyrics, metadata, pitch);

    // Step 11: Write custom atoms (Node - binary)
    onProgress({ stage: 'finalize', percent: 98 });
    await this.writeCustomAtoms(m4aFile, correctedLyrics, pitch, metadata);

    onProgress({ stage: 'complete', percent: 100 });
    return m4aFile;
  }

  extractVocabulary(lyrics, maxTokens = 150) {
    // Extract frequent meaningful words (>3 chars, not common words)
    // Returns comma-separated list fitting within token budget
    // e.g., "forever, dancing, midnight, surrender, holding"
  }
}
```

### Whisper Initial Prompt Strategy
Reference lyrics from LRCLIB (or user-pasted) are used to hint Whisper:

1. **Extract vocabulary** - Get frequent meaningful words from lyrics
2. **Build prompt** - `"Song Title. word1, word2, word3..."` (max 224 tokens)
3. **Pass to Whisper** - `initial_prompt` parameter improves transcription accuracy

This helps Whisper recognize:
- Unusual words/names in the song
- Correct spelling of homophones
- Language-specific vocabulary

---

## 5. Python Dependency Management

### On-Demand Installation
Python and its dependencies are NOT bundled with kai-player. They are downloaded when the user first accesses the Create tab.

### Installation Flow
```
User clicks "Create" tab
       ↓
Check if Python installed → ~/.cache/loukai/python/
       ↓ No
Show "Setup Required" screen with:
  - Estimated download size (~2-4GB)
  - What will be installed
  - "Install" button
       ↓
Download & Install:
  1. Python standalone (~50MB)
  2. Core deps (numpy, scipy, etc.) (~200MB)
  3. PyTorch (CPU or GPU variant) (~1-2GB)
  4. Demucs (~100MB)
  5. Whisper (~100MB)
  6. Models on first use (~1-2GB)
       ↓
"Create" tab now functional
```

### Cache Locations
```
~/.cache/loukai/
├── python/              # Python interpreter
│   └── bin/python3
├── models/
│   ├── torch/           # PyTorch model cache (TORCH_HOME)
│   ├── whisper/         # Whisper models
│   └── huggingface/     # Demucs models (HF_HOME)
└── bin/
    └── ffmpeg           # FFmpeg binary (if not system-installed)
```

### UI States for Create Tab

1. **Setup Required**
   - Python not installed
   - Shows download size estimate
   - "Install AI Tools" button

2. **Installing**
   - Progress bar with stage descriptions
   - Cancel button
   - Log output (expandable)

3. **Ready**
   - Full Create UI
   - File picker
   - Options panel
   - Create button

4. **Creating**
   - Progress bar with stages
   - Cancel button
   - Log panel
   - Current stage indicator

---

## 6. Worker Thread Design

### Why Worker Thread?
- Main process stays responsive (player keeps playing)
- Long-running operations don't block UI
- Can queue multiple creation jobs
- Proper cancellation support

### Implementation

**creator-worker.js** (Worker Thread)
```javascript
import { parentPort, workerData } from 'worker_threads';
import { CreatorService } from './creator-service.js';

const creator = new CreatorService();

parentPort.on('message', async (message) => {
  if (message.type === 'create') {
    try {
      const result = await creator.create(message.inputFile, message.options,
        (progress) => parentPort.postMessage({ type: 'progress', ...progress })
      );
      parentPort.postMessage({ type: 'complete', result });
    } catch (error) {
      parentPort.postMessage({ type: 'error', error: error.message });
    }
  } else if (message.type === 'cancel') {
    creator.cancel();
  }
});
```

**Main Process Integration**
```javascript
import { Worker } from 'worker_threads';

class CreatorManager {
  constructor() {
    this.worker = null;
    this.currentJob = null;
  }

  async startCreation(inputFile, options) {
    if (this.worker) {
      throw new Error('Creation already in progress');
    }

    this.worker = new Worker('./creator-worker.js');

    return new Promise((resolve, reject) => {
      this.worker.on('message', (msg) => {
        if (msg.type === 'progress') {
          this.emitProgress(msg);
        } else if (msg.type === 'complete') {
          this.cleanup();
          resolve(msg.result);
        } else if (msg.type === 'error') {
          this.cleanup();
          reject(new Error(msg.error));
        }
      });

      this.worker.postMessage({ type: 'create', inputFile, options });
    });
  }

  cancel() {
    if (this.worker) {
      this.worker.postMessage({ type: 'cancel' });
    }
  }

  cleanup() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
```

---

## 7. Create Tab UI Flow

### Tab Structure
```
┌─────────────────────────────────────────────────────────────┐
│  Create                                                     │
├─────────────────────────────────────────────────────────────┤
│  [ New ]  [ Settings ]                    ← Subtab buttons  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  (subtab content here)                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Robustness: Always Verify on Tab Visit

**Every time** user clicks Create tab, do a fresh check. Never trust cached state.

```javascript
// Called every time Create tab is opened
async onCreateTabOpen() {
  this.setState({ checking: true });

  const status = await this.checkAllComponents();

  if (status.allInstalled) {
    this.setState({ screen: 'ready', checking: false });
  } else {
    this.setState({ screen: 'setup', components: status, checking: false });
  }
}

async checkAllComponents() {
  // Each check is independent - partial installs are detected
  const components = {
    python: await this.checkPython(),
    coreDeps: await this.checkCoreDeps(),
    pytorch: await this.checkPyTorch(),
    demucs: await this.checkDemucs(),
    whisper: await this.checkWhisper(),
    crepe: await this.checkCrepe(),
    ffmpeg: await this.checkFFmpeg(),
    whisperModel: await this.checkWhisperModel('large-v3-turbo'),
    demucsModel: await this.checkDemucsModel('htdemucs_ft'),
  };

  return {
    ...components,
    allInstalled: Object.values(components).every(c => c.installed)
  };
}
```

**Component Check Methods:**

```javascript
async checkPython() {
  // Check if Python binary exists AND is executable
  const pythonPath = join(this.cacheDir, 'python', 'bin', 'python3');
  if (!existsSync(pythonPath)) {
    return { installed: false, reason: 'not_found' };
  }

  // Verify it actually runs
  try {
    const { stdout } = await execAsync(`"${pythonPath}" --version`);
    const version = stdout.trim().replace('Python ', '');
    return { installed: true, version, path: pythonPath };
  } catch (e) {
    return { installed: false, reason: 'not_executable' };
  }
}

async checkPyTorch() {
  // Must have Python first
  if (!this.pythonPath) return { installed: false, reason: 'no_python' };

  // Try importing torch
  try {
    const script = `import torch; print(torch.__version__)`;
    const { stdout } = await execAsync(`"${this.pythonPath}" -c "${script}"`);
    const version = stdout.trim();

    // Check for CUDA/MPS
    const deviceScript = `
import torch
if torch.cuda.is_available():
    print('cuda')
elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
    print('mps')
else:
    print('cpu')
`;
    const { stdout: device } = await execAsync(`"${this.pythonPath}" -c "${deviceScript}"`);

    return { installed: true, version, device: device.trim() };
  } catch (e) {
    return { installed: false, reason: 'import_failed' };
  }
}

async checkWhisperModel(modelName) {
  // Check if model files exist in cache
  const modelDir = join(this.cacheDir, 'models', 'whisper');
  const modelFile = join(modelDir, `${modelName}.pt`);

  if (existsSync(modelFile)) {
    const stats = statSync(modelFile);
    // Verify file isn't truncated (minimum expected sizes)
    const minSizes = {
      'tiny': 70_000_000,
      'base': 130_000_000,
      'small': 450_000_000,
      'medium': 1_400_000_000,
      'large-v3-turbo': 1_500_000_000,
    };
    if (stats.size >= (minSizes[modelName] || 0)) {
      return { installed: true, model: modelName, size: stats.size };
    } else {
      // Truncated file - partial download
      return { installed: false, reason: 'truncated', partial: stats.size };
    }
  }
  return { installed: false, reason: 'not_found' };
}
```

**Handling Partial Installs:**

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| Python download interrupted | Binary missing or not executable | Re-download Python |
| pip install interrupted | Package import fails | Re-run pip install |
| Model download interrupted | File size < expected minimum | Delete partial, re-download |
| Extraction failed | Binary exists but wrong size | Delete and re-extract |

**Install State Persistence (for resume):**

```javascript
// Save progress to allow resume after crash
const INSTALL_STATE_FILE = join(cacheDir, 'install-state.json');

async saveInstallState(state) {
  await writeFile(INSTALL_STATE_FILE, JSON.stringify({
    timestamp: Date.now(),
    currentStep: state.currentStep,
    completed: state.completed,
    pytorchVariant: state.pytorchVariant,
  }));
}

async loadInstallState() {
  try {
    const data = await readFile(INSTALL_STATE_FILE, 'utf8');
    const state = JSON.parse(data);
    // Ignore stale state (> 1 hour old)
    if (Date.now() - state.timestamp > 3600000) return null;
    return state;
  } catch {
    return null;
  }
}

// Clear state when install completes successfully
async clearInstallState() {
  await unlink(INSTALL_STATE_FILE).catch(() => {});
}
```

**UI Behavior:**

1. **Tab opened** → Show "Checking components..." spinner (brief)
2. **All installed** → Go straight to New subtab
3. **Some missing** → Show Setup screen with current status
4. **Resume available** → "Resume previous install?" prompt

### Screen 1: Setup Required (components missing)
```
┌─────────────────────────────────────────────────────────────┐
│  Create                                                     │
├─────────────────────────────────────────────────────────────┤
│  [ New ]  [ Settings ]                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           🔧 AI Tools Setup Required                        │
│                                                             │
│  To create karaoke files, install these components:         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Component          Status           Size            │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ○ Python 3.11      Not installed    ~50 MB          │   │
│  │ ○ Core Libraries   Not installed    ~200 MB         │   │
│  │ ○ PyTorch (CPU)    Not installed    ~1.2 GB         │   │
│  │ ○ Demucs           Not installed    ~100 MB         │   │
│  │ ○ Whisper          Not installed    ~50 MB          │   │
│  │ ○ Whisper Model    Not installed    ~1.5 GB         │   │
│  │ ○ Demucs Model     Not installed    ~80 MB          │   │
│  │ ✓ FFmpeg           System installed  —              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Total download: ~3.2 GB                                    │
│  Disk space required: ~5 GB                                 │
│                                                             │
│  PyTorch variant: [CPU ▾]  (CUDA for NVIDIA GPU)            │
│                                                             │
│              [ Install All ]    [ Cancel ]                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Screen 2: Installing Components
```
┌─────────────────────────────────────────────────────────────┐
│  Create                                                     │
├─────────────────────────────────────────────────────────────┤
│  [ New ]  [ Settings ]                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           ⏳ Installing AI Tools                            │
│                                                             │
│  ████████████████░░░░░░░░░░░░░░░░░░  45%                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ✓ Python 3.11         Installed                     │   │
│  │ ✓ Core Libraries      Installed                     │   │
│  │ ◐ PyTorch (CPU)       Downloading... 892/1200 MB    │   │
│  │ ○ Demucs              Pending                       │   │
│  │ ○ Whisper             Pending                       │   │
│  │ ○ Whisper Model       Pending                       │   │
│  │ ○ Demucs Model        Pending                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Installing torch torchvision torchaudio...                 │
│                                                             │
│                        [ Cancel ]                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Screen 3: Settings Subtab (after install complete)
```
┌─────────────────────────────────────────────────────────────┐
│  Create                                                     │
├─────────────────────────────────────────────────────────────┤
│  [ New ]  [ Settings ]  ← selected                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ─── Installed Components ──────────────────────────────   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Component          Version         Size    Action   │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ✓ Python           3.11.9          52 MB    —       │   │
│  │ ✓ PyTorch          2.4.0 (CPU)    1.2 GB   —       │   │
│  │ ✓ Demucs           4.0.1          105 MB   —       │   │
│  │ ✓ Whisper          20240930        48 MB   —       │   │
│  │ ✓ CREPE            0.0.22          12 MB   —       │   │
│  │ ✓ Whisper Model    large-v3-turbo 1.5 GB  [Change] │   │
│  │ ✓ Demucs Model     htdemucs_ft     81 MB   —       │   │
│  │ ✓ FFmpeg           7.0 (system)     —      —       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Cache location: ~/.cache/loukai/                           │
│  Total size: 3.1 GB                    [ Clear Cache ]      │
│                                                             │
│  ─── Default Settings ──────────────────────────────────   │
│                                                             │
│  Stem Mode:       ○ 2-stem (vocals + music)                 │
│                   ● 4-stem (vocals + drums + bass + other)  │
│                                                             │
│  Whisper Model:   [large-v3-turbo ▾]                        │
│  Language:        [Auto-detect ▾]                           │
│                                                             │
│  ─── AI Lyrics Correction ──────────────────────────────   │
│                                                             │
│  ☑ Enable by default                                        │
│                                                             │
│  Provider:  ○ OpenAI   ○ Anthropic   ○ Google   ○ Local     │
│                        ↑ selected                           │
│                                                             │
│  API Key:   [sk-ant-api03-xxxxx...  ] [Show] [Test]         │
│  Model:     [claude-3-5-sonnet ▾]                           │
│                                                             │
│                              [ Save Settings ]              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Screen 4: New Subtab (Create Interface)
```
┌─────────────────────────────────────────────────────────────┐
│  Create                                                     │
├─────────────────────────────────────────────────────────────┤
│  [ New ]  ← selected    [ Settings ]                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │       🎵 Drop audio or video file here              │   │
│  │          or click to browse                         │   │
│  │                                                     │   │
│  │       Supports: MP3, WAV, FLAC, M4A, MP4, MKV       │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Title:    [                                            ]   │
│  Artist:   [                                            ]   │
│                                                             │
│  Reference Lyrics:  [ Lookup LRCLIB ]  [ Paste... ]         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ (lyrics preview if found/pasted)                    │   │
│  │ I've been waiting for a girl like you...            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ─── Options (override defaults) ───────────────────────   │
│                                                             │
│  ☑ 4-stem mode     ☑ Extract pitch     ☑ LLM correction    │
│                                                             │
│  Output: [Same folder as input ▾]   Filename: [Auto ▾]      │
│                                                             │
│                        [ Create .stem.m4a ]                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Screen 5: Creating (Progress)
```
┌─────────────────────────────────────────────────────────────┐
│  Create                                                     │
├─────────────────────────────────────────────────────────────┤
│  [ New ]  [ Settings ]                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Creating: Foreigner - Waiting For A Girl Like You          │
│                                                             │
│  ████████████████░░░░░░░░░░░░░░░░░░  45%                   │
│                                                             │
│  Current: Separating stems with Demucs...                   │
│           Processing vocals stem (2/4)                      │
│                                                             │
│  ─── Steps ─────────────────────────────────────────────   │
│  ✓ Read metadata                                            │
│  ✓ Looked up reference lyrics (LRCLIB)                      │
│  ✓ Converted to WAV                                         │
│  ◐ Separating stems... (45%)                                │
│  ○ Transcribing lyrics                                      │
│  ○ Detecting pitch                                          │
│  ○ Correcting lyrics (Claude)                               │
│  ○ Encoding stems to AAC                                    │
│  ○ Packaging M4A                                            │
│                                                             │
│                        [ Cancel ]                           │
│                                                             │
│  ─── Log ───────────────────────────────────────────────   │
│  [14:32:05] Demucs: Using CPU device                        │
│  [14:32:06] Processing with htdemucs_ft model               │
│  [14:32:45] Vocals stem complete                            │
│  [14:33:12] Drums stem complete                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Screen 6: Complete
```
┌─────────────────────────────────────────────────────────────┐
│  Create                                                     │
├─────────────────────────────────────────────────────────────┤
│  [ New ]  [ Settings ]                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           ✓ Karaoke File Created Successfully               │
│                                                             │
│  Foreigner - Waiting For A Girl Like You.stem.m4a           │
│                                                             │
│  Duration: 4:32                                             │
│  Size: 45.2 MB                                              │
│  Stems: 4 (vocals, drums, bass, other)                      │
│  Lyrics: 42 lines                                           │
│  Pitch data: Yes                                            │
│                                                             │
│  Saved to: /home/user/Music/                                │
│                                                             │
│      [ Add to Library ]    [ Open Folder ]    [ Create Another ]
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Output Format: .stem.m4a

**Decision: M4A only. KAI format is deprecated.**

### .stem.m4a Structure
Multi-track M4A with embedded karaoke data in custom atoms.

```
song.stem.m4a
├── Track 0: Mixdown (AAC) - enabled, default playback
├── Track 1: Drums (AAC) - disabled
├── Track 2: Bass (AAC) - disabled
├── Track 3: Other (AAC) - disabled
├── Track 4: Vocals (AAC) - disabled
├── Track 5: Lyrics (WebVTT/mov_text)
└── Custom Atoms:
    ├── stem (NI Stems metadata for Traktor)
    ├── kaid (Karaoke data - lyrics, timing, sources)
    └── vpch (Vocal pitch contour)
```

For 2-stem mode:
```
├── Track 0: Mixdown (AAC)
├── Track 1: Music (AAC)
├── Track 2: Vocals (AAC)
└── ...
```

### kaid Atom Structure (JSON in custom atom)
```json
{
  "stems_karaoke_version": "1.0",
  "audio": {
    "profile": "STEMS-4",
    "encoder_delay_samples": 1105,
    "sources": [
      {"track": 0, "id": "mixdown", "role": "mixdown"},
      {"track": 1, "id": "drums", "role": "drums"},
      {"track": 2, "id": "bass", "role": "bass"},
      {"track": 3, "id": "other", "role": "other"},
      {"track": 4, "id": "vocals", "role": "vocals"}
    ],
    "presets": [
      {"id": "karaoke", "levels": {"vocals": -120}}
    ]
  },
  "song": {
    "title": "Song Name",
    "artist": "Artist Name",
    "album": "Album",
    "year": "2024",
    "duration_sec": 213.5,
    "key": "C major"
  },
  "timing": {
    "reference": "aligned_to_vocals",
    "offset_sec": 0.0
  },
  "singers": [{"id": "A", "name": "Lead", "guide_track": 4}],
  "lines": [
    {
      "singer_id": "A",
      "start": 12.345,
      "end": 15.678,
      "text": "First line of lyrics",
      "words": [
        {"text": "First", "start": 12.345, "end": 12.678},
        {"text": "line", "start": 12.678, "end": 13.012},
        ...
      ]
    }
  ]
}
```

### vpch Atom (Binary pitch data)
Compact binary format for vocal pitch contour:
- Header: sample_rate_hz (uint16), quantization_type (uint8)
- Data: Array of [midi_note (uint8), cents_offset (int8)] pairs

### Compatibility
- **Traktor**: Reads stem atom for stem mixing
- **Mixxx**: Reads multi-track audio
- **Loukai**: Reads kaid atom for karaoke features
- **Standard players**: Play Track 0 (mixdown) normally

---

## 9. Implementation Phases

### Phase 1: Infrastructure
- [ ] Create `src/main/creator/` directory structure
- [ ] Metadata reading with `music-metadata` npm
- [ ] FFmpeg wrapper for audio conversion
- [ ] Python environment checker
- [ ] M4A atom writing (binary manipulation)

### Phase 2: Python Scripts
- [ ] `demucs.py` - minimal stem separation script
- [ ] `whisper.py` - minimal transcription script
- [ ] `crepe.py` - minimal pitch detection script
- [ ] Progress output protocol (PROGRESS:JSON, RESULT:JSON)

### Phase 3: Python Setup UI
- [ ] Port download-manager.js from kai-converter
- [ ] Setup-wizard component for Create tab
- [ ] Python/dependencies installer
- [ ] Test on Windows, macOS, Linux

### Phase 4: Worker Thread
- [ ] Create creator-worker.js
- [ ] CreatorService with full pipeline
- [ ] IPC for progress updates to renderer
- [ ] Cancellation support

### Phase 5: M4A Packaging
- [ ] FFmpeg multi-track muxing
- [ ] WebVTT lyrics track
- [ ] NI Stems atom for Traktor
- [ ] kaid atom for karaoke data
- [ ] vpch atom for pitch data

### Phase 6: UI
- [ ] Create tab component structure
- [ ] Setup Required screen
- [ ] Create interface with options
- [ ] Progress screen
- [ ] Integration with library (auto-add created files)

### Phase 7: LRCLIB + LLM
- [ ] LRCLIB lookup via fetch
- [ ] LLM providers with Node.js SDKs (openai, anthropic, google)
- [ ] Lyrics correction prompt
- [ ] API key management in settings

### Phase 8: Testing & Polish
- [ ] End-to-end creation flow
- [ ] Error handling and recovery
- [ ] Performance optimization
- [ ] Memory management for large files

---

## 10. Decisions Made

1. **Output Format**: ✅ **M4A only** (.stem.m4a)
   - KAI format is deprecated
   - Traktor/Mixxx compatible
   - Single file with embedded karaoke data

2. **Batch Processing**: ✅ **Yes, but later**
   - Single file first
   - Queue UI in future phase

3. **Whisper Model**: ✅ **Default to large-v3-turbo**
   - Best quality, reasonable speed
   - User can change in settings if needed

4. **Pitch Detection (CREPE)**: ✅ **Default ON**
   - Always extract pitch data
   - Useful for scoring/visualization
   - Can be disabled in settings if needed

5. **Reference Lyrics**: ✅ **Same as kai-converter**
   - Auto-lookup LRCLIB by title/artist
   - Manual paste option available
   - Proceed without if not found

---

## 11. Notes from kai-converter

### Progress Weights (for accurate progress bar)
```javascript
const STEP_WEIGHTS = {
  load_audio: 5,
  extract_metadata: 2,
  stem_separation: 35,
  transcription: 40,
  analysis: 8,
  encode_mp3: 5,
  build_json: 2,
  save_features: 1,
  package_kai: 2
};
```

### Whisper Settings
- `word_timestamps: true` - Essential for karaoke
- `no_speech_threshold: 0.3` - Lower than default (0.6) to catch more vocals
- `condition_on_previous_text: false` - Prevents repetition loops in singing
- `initial_prompt` - Use LRCLIB vocabulary for hints

### Demucs Settings
- Model: `htdemucs_ft` (fine-tuned, best quality)
- Device auto-detection: CUDA > MPS > CPU
- 4-stem mode: vocals, drums, bass, other
- 2-stem mode: vocals, music (drums+bass+other mixed)

### Encoder Delay
- AAC: 1105 samples (~25ms at 44.1kHz)
- MP3: Variable, typically 576-1105 samples
- Critical for accurate lyric sync

### LLM Correction Prompt Pattern
```
You are a lyrics correction assistant. Compare the AI-transcribed lyrics
with the reference lyrics and fix:
- Misheard words
- Missing words
- Incorrect punctuation
DO NOT change timing, only text content.
```
