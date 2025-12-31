import { useEffect, useState } from 'react';

/**
 * KeyboardNavigationManager - Provides keyboard-only navigation for the entire app
 *
 * Keyboard shortcuts:
 * - Tab/Shift+Tab: Navigate between focusable elements
 * - Arrow keys: Navigate tabs and lists
 * - Enter/Space: Activate buttons and select items
 * - Number keys (1-9): Quick switch to tabs
 * - P: Play/Pause
 * - S: Stop
 * - N: Next song
 * - M: Toggle mute
 * - +/-: Volume up/down
 * - Escape: Close modals/dialogs
 */
export function KeyboardNavigationManager() {
  const [helpVisible, setHelpVisible] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        // Allow Escape to blur input fields
        if (e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }

      // Tab navigation shortcuts (1-9 for tabs)
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const tabIndex = parseInt(e.key) - 1;
        const tabs = [
          'player',
          'library',
          'youtube',
          'mixer',
          'effects',
          'requests',
          'server',
          'create',
          'editor',
        ];
        if (tabs[tabIndex]) {
          switchToTab(tabs[tabIndex]);
        }
        return;
      }

      // Playback controls
      switch (e.key.toLowerCase()) {
        case 'p':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            window.kaiAPI?.player?.togglePlayPause?.();
          }
          break;
        case 's':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            window.kaiAPI?.player?.stop?.();
          }
          break;
        case 'n':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            window.kaiAPI?.queue?.playNext?.();
          }
          break;
        case 'm':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            toggleMute();
          }
          break;
        case '=':
        case '+':
          e.preventDefault();
          adjustVolume(5);
          break;
        case '-':
        case '_':
          e.preventDefault();
          adjustVolume(-5);
          break;
        case '?':
          if (e.shiftKey) {
            e.preventDefault();
            setHelpVisible(!helpVisible);
          }
          break;
      }

      // Arrow key navigation for tabs
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const tabBar = document.querySelector('[role="tablist"]');
        if (tabBar && document.activeElement?.closest('[role="tablist"]')) {
          e.preventDefault();
          navigateTabs(e.key === 'ArrowRight' ? 1 : -1);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [helpVisible]);

  const switchToTab = (tabId) => {
    // Hide all tabs
    document.querySelectorAll('[id$="-tab"]').forEach((pane) => {
      pane.classList.add('hidden');
      pane.classList.remove('block', 'flex');
    });

    // Show selected tab
    const targetPane = document.getElementById(`${tabId}-tab`);
    if (targetPane) {
      targetPane.classList.remove('hidden');
      if (tabId === 'player') {
        targetPane.classList.add('flex');
      } else {
        targetPane.classList.add('block');
      }
    }

    // Update active tab button
    document.querySelectorAll('[role="tab"]').forEach((tab) => {
      tab.setAttribute('aria-selected', 'false');
      tab.classList.remove('bg-blue-600', 'text-white');
      tab.classList.add('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
    });

    const activeTab = document.querySelector(`[role="tab"][data-tab="${tabId}"]`);
    if (activeTab) {
      activeTab.setAttribute('aria-selected', 'true');
      activeTab.classList.remove(
        'bg-gray-200',
        'dark:bg-gray-700',
        'text-gray-700',
        'dark:text-gray-300'
      );
      activeTab.classList.add('bg-blue-600', 'text-white');
      activeTab.focus();
    }
  };

  const navigateTabs = (direction) => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);
    if (currentIndex !== -1) {
      const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
      tabs[nextIndex].focus();
    }
  };

  const toggleMute = async () => {
    const mixer = await window.kaiAPI?.mixer?.getState?.();
    if (mixer) {
      await window.kaiAPI?.mixer?.setMasterVolume?.(mixer.masterVolume > 0 ? 0 : 100);
    }
  };

  const adjustVolume = async (delta) => {
    const mixer = await window.kaiAPI?.mixer?.getState?.();
    if (mixer) {
      const newVolume = Math.max(0, Math.min(100, mixer.masterVolume + delta));
      await window.kaiAPI?.mixer?.setMasterVolume?.(newVolume);
    }
  };

  return (
    <>
      {helpVisible && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setHelpVisible(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
              ⌨️ Keyboard Shortcuts
            </h2>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
                  Navigation
                </h3>
                <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">1-9</kbd> Quick
                    switch to tabs
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Tab</kbd>{' '}
                    Navigate forward
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Shift+Tab</kbd>{' '}
                    Navigate backward
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">←→</kbd>{' '}
                    Navigate tabs (when focused)
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Enter</kbd>{' '}
                    Activate button/select item
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Esc</kbd> Close
                    modal/blur input
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">
                  Playback
                </h3>
                <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">P</kbd>{' '}
                    Play/Pause
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">S</kbd> Stop
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">N</kbd> Next
                    song
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">Audio</h3>
                <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">M</kbd> Toggle
                    mute
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">+</kbd> Volume
                    up
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">-</kbd> Volume
                    down
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2 text-gray-900 dark:text-white">Admin</h3>
                <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">
                      Ctrl+Shift+Alt+F
                    </kbd>{' '}
                    Toggle fullscreen
                  </div>
                  <div>
                    <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">Shift+?</kbd>{' '}
                    Show this help
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setHelpVisible(false)}
              className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors"
            >
              Close (Esc)
            </button>
          </div>
        </div>
      )}
    </>
  );
}
