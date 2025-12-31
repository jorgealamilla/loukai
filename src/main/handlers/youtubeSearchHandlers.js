import { ipcMain, BrowserWindow, globalShortcut } from 'electron';
import youtubeSearchService from '../../shared/services/youtubeSearchService.js';

let youtubeBrowserWindow = null;

export function registerYouTubeSearchHandlers() {
  // Search YouTube karaoke videos
  ipcMain.handle('youtube:search', async (event, query) => {
    try {
      return await youtubeSearchService.searchKaraoke(query);
    } catch (error) {
      console.error('YouTube search error:', error);
      throw error;
    }
  });

  // Open video in Electron browser window
  ipcMain.handle('youtube:openVideo', async (event, videoUrl) => {
    try {
      console.log('Opening YouTube video in Electron browser:', videoUrl);

      // Close existing window if open
      if (youtubeBrowserWindow && !youtubeBrowserWindow.isDestroyed()) {
        youtubeBrowserWindow.close();
      }

      // Create new browser window in fullscreen
      youtubeBrowserWindow = new BrowserWindow({
        fullscreen: true,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      // Set up event listeners BEFORE loading URL

      // Listen for ESC key to close window immediately
      // Use a global shortcut to intercept ESC at system level

      youtubeBrowserWindow.on('focus', () => {
        // Register ESC shortcut when window is focused
        globalShortcut.register('Escape', () => {
          console.log('ESC shortcut pressed, closing YouTube window');
          if (youtubeBrowserWindow && !youtubeBrowserWindow.isDestroyed()) {
            youtubeBrowserWindow.close();
          }
        });
      });

      youtubeBrowserWindow.on('blur', () => {
        // Unregister when window loses focus
        globalShortcut.unregister('Escape');
      });

      youtubeBrowserWindow.on('closed', () => {
        // Unregister when window closes
        globalShortcut.unregister('Escape');
      });

      // Auto-close when window is closed by user
      youtubeBrowserWindow.on('closed', () => {
        youtubeBrowserWindow = null;
        console.log('YouTube window closed');
      });

      // Wait for DOM to be ready, then inject script to trigger fullscreen
      youtubeBrowserWindow.webContents.on('dom-ready', () => {
        console.log('YouTube DOM ready, attempting fullscreen...');

        // Wait for YouTube player to initialize, then trigger fullscreen (reduced to 1 second)
        setTimeout(() => {
          if (youtubeBrowserWindow && !youtubeBrowserWindow.isDestroyed()) {
            console.log('Executing fullscreen script...');
            youtubeBrowserWindow.webContents
              .executeJavaScript(
                `
              (function() {
                console.log('Attempting to trigger fullscreen...');
                
                let attempts = 0;
                const maxAttempts = 5;
                
                function tryFullscreen() {
                  attempts++;
                  console.log('Fullscreen attempt', attempts);
                  
                  // Method 1: Click YouTube's fullscreen button
                  const fullscreenButton = document.querySelector('button.ytp-fullscreen-button');
                  if (fullscreenButton) {
                    console.log('Fullscreen button found, clicking it');
                    fullscreenButton.click();
                    return true;
                  }
                  
                  // Method 2: Use video.requestFullscreen()
                  const video = document.querySelector('video');
                  if (video && video.requestFullscreen) {
                    console.log('Video element found, requesting fullscreen via API');
                    video.requestFullscreen().then(() => {
                      console.log('Fullscreen API succeeded');
                    }).catch(err => {
                      console.error('Fullscreen API failed:', err);
                    });
                    return true;
                  }
                  
                  // Method 3: Try keyboard event on player
                  const player = document.querySelector('#movie_player');
                  if (player) {
                    console.log('Player found, dispatching keyboard event');
                    const event = new KeyboardEvent('keydown', {
                      key: 'f',
                      code: 'KeyF',
                      keyCode: 70,
                      which: 70,
                      bubbles: true,
                      cancelable: true
                    });
                    player.dispatchEvent(event);
                    return true;
                  }
                  
                  console.log('Elements not ready yet, retrying...');
                  if (attempts < maxAttempts) {
                    setTimeout(tryFullscreen, 1000);
                  } else {
                    console.error('Failed to trigger fullscreen after', maxAttempts, 'attempts');
                  }
                  return false;
                }
                
                tryFullscreen();
              })();
            `
              )
              .then(() => {
                console.log('Fullscreen script executed successfully');
              })
              .catch((err) => {
                console.error('Error executing fullscreen script:', err);
              });
          }
        }, 1000);
      });

      // NOW load the URL after listeners are set up
      console.log('Loading YouTube URL...');
      await youtubeBrowserWindow.loadURL(videoUrl);

      return { success: true };
    } catch (error) {
      console.error('Error opening YouTube video:', error);
      throw error;
    }
  });

  // Close YouTube browser window
  ipcMain.handle('youtube:closeWindow', async () => {
    if (youtubeBrowserWindow && !youtubeBrowserWindow.isDestroyed()) {
      youtubeBrowserWindow.close();
      youtubeBrowserWindow = null;
    }
    return { success: true };
  });
}
