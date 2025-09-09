const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const AudioEngine = require('./audioEngine');
const KaiLoader = require('../utils/kaiLoader');
const KaiWriter = require('../utils/kaiWriter');

class KaiPlayerApp {
  constructor() {
    this.mainWindow = null;
    this.audioEngine = null;
    this.currentSong = null;
    this.isDev = process.argv.includes('--dev');
  }

  async initialize() {
    await app.whenReady();
    this.createMainWindow();
    this.setupIPC();
    this.initializeAudioEngine();
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#1a1a1a',
        symbolColor: '#ffffff'
      }
    });

    const rendererPath = path.join(__dirname, '../renderer/index.html');
    this.mainWindow.loadFile(rendererPath);

    if (this.isDev) {
      this.mainWindow.webContents.openDevTools();
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
      if (this.audioEngine) {
        this.audioEngine.stop();
      }
    });
  }

  initializeAudioEngine() {
    try {
      this.audioEngine = new AudioEngine();
      this.audioEngine.initialize();
      
      this.audioEngine.on('xrun', (count) => {
        this.sendToRenderer('audio:xrun', count);
      });

      this.audioEngine.on('latencyUpdate', (latency) => {
        this.sendToRenderer('audio:latency', latency);
      });

      this.audioEngine.on('mixChanged', (mixState) => {
        this.sendToRenderer('mixer:state', mixState);
      });

    } catch (error) {
      console.error('Failed to initialize audio engine:', error);
    }
  }

  setupIPC() {
    ipcMain.handle('app:getVersion', () => {
      return app.getVersion();
    });

    ipcMain.handle('file:openKai', async () => {
      const result = await dialog.showOpenDialog(this.mainWindow, {
        filters: [
          { name: 'KAI Files', extensions: ['kai'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return await this.loadKaiFile(result.filePaths[0]);
      }
      return null;
    });

    ipcMain.handle('audio:getDevices', () => {
      return this.audioEngine ? this.audioEngine.getDevices() : [];
    });

    ipcMain.handle('audio:enumerateDevices', async () => {
      // This will be called from renderer to get real device list
      return [];
    });

    ipcMain.handle('audio:setDevice', (event, deviceType, deviceId) => {
      if (this.audioEngine) {
        return this.audioEngine.setDevice(deviceType, deviceId);
      }
      return false;
    });

    ipcMain.handle('mixer:toggleMute', (event, stemId, bus) => {
      if (this.audioEngine) {
        return this.audioEngine.toggleMute(stemId, bus);
      }
      return false;
    });

    ipcMain.handle('mixer:toggleSolo', (event, stemId) => {
      if (this.audioEngine) {
        return this.audioEngine.toggleSolo(stemId);
      }
      return false;
    });

    ipcMain.handle('mixer:setGain', (event, stemId, gainDb) => {
      if (this.audioEngine) {
        return this.audioEngine.setGain(stemId, gainDb);
      }
      return false;
    });

    ipcMain.handle('mixer:applyPreset', (event, presetId) => {
      if (this.audioEngine) {
        return this.audioEngine.applyPreset(presetId);
      }
      return false;
    });

    ipcMain.handle('mixer:recallScene', (event, sceneId) => {
      if (this.audioEngine) {
        return this.audioEngine.recallScene(sceneId);
      }
      return false;
    });

    ipcMain.handle('player:play', () => {
      if (this.audioEngine) {
        return this.audioEngine.play();
      }
      return false;
    });

    ipcMain.handle('player:pause', () => {
      if (this.audioEngine) {
        return this.audioEngine.pause();
      }
      return false;
    });

    ipcMain.handle('player:seek', (event, positionSec) => {
      if (this.audioEngine) {
        return this.audioEngine.seek(positionSec);
      }
      return false;
    });

    ipcMain.handle('autotune:setEnabled', (event, enabled) => {
      if (this.audioEngine) {
        return this.audioEngine.setAutotuneEnabled(enabled);
      }
      return false;
    });

    ipcMain.handle('autotune:setSettings', (event, settings) => {
      if (this.audioEngine) {
        return this.audioEngine.setAutotuneSettings(settings);
      }
      return false;
    });

    ipcMain.handle('editor:saveKai', async (event, kaiData, originalPath) => {
      try {
        console.log('Save KAI file request:', originalPath);
        console.log('Updated lyrics:', kaiData.lyrics.length, 'lines');
        
        // Use KaiWriter to save the updated lyrics back to the KAI file
        const result = await KaiWriter.save(kaiData, originalPath);
        
        if (result.success) {
          console.log('KAI file saved successfully');
          return { success: true };
        } else {
          console.error('Failed to save KAI file:', result.error);
          return { success: false, error: result.error };
        }
      } catch (error) {
        console.error('Failed to save KAI file:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('editor:reloadKai', async (event, filePath) => {
      try {
        console.log('Reload KAI file request:', filePath);
        
        // Reload the KAI file using the existing loadKaiFile method
        const result = await this.loadKaiFile(filePath);
        
        if (result && result.success) {
          console.log('KAI file reloaded successfully');
          return { success: true };
        } else {
          console.error('Failed to reload KAI file');
          return { success: false, error: 'Failed to reload file' };
        }
      } catch (error) {
        console.error('Failed to reload KAI file:', error);
        return { success: false, error: error.message };
      }
    });
  }

  async loadKaiFile(filePath) {
    try {
      const kaiData = await KaiLoader.load(filePath);
      
      // Add original file path to the song data
      kaiData.originalFilePath = filePath;
      
      if (this.audioEngine) {
        await this.audioEngine.loadSong(kaiData);
      }
      
      this.currentSong = kaiData;
      console.log('Sending to renderer:', {
        metadata: kaiData.metadata,
        hasMetadata: !!kaiData.metadata
      });
      this.sendToRenderer('song:loaded', kaiData.metadata || {});
      this.sendToRenderer('song:data', kaiData);
      
      return {
        success: true,
        metadata: kaiData.metadata,
        meta: kaiData.meta,
        stems: kaiData.audio.sources
      };
    } catch (error) {
      console.error('Failed to load KAI file:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  sendToRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

const kaiApp = new KaiPlayerApp();

app.on('window-all-closed', () => {
  // Quit the app when all windows are closed, even on macOS
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    kaiApp.createMainWindow();
  }
});

kaiApp.initialize().catch(console.error);