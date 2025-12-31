/**
 * TabNavigation - Renderer tab navigation component
 *
 * Manages tab switching between different app sections
 */

import React, { useState } from 'react';

export function TabNavigation({ requestsCount = 0 }) {
  const [activeTab, setActiveTab] = useState('youtube');

  const tabs = [
    { id: 'player', label: '🎵 Player', number: '1' },
    { id: 'library', label: '📚 Library', number: '2' },
    { id: 'youtube', label: '📺 YouTube', number: '3' },
    { id: 'mixer', label: '🎛️ Audio', number: '4' },
    { id: 'effects', label: '✨ Effects', number: '5' },
    { id: 'requests', label: '🎤 Requests', badge: requestsCount, number: '6' },
    { id: 'server', label: '🌐 Server', number: '7' },
    { id: 'create', label: '⚡ Create', number: '8' },
    { id: 'editor', label: '✏️ Edit', number: '9' },
  ];

  const handleTabClick = (tabId) => {
    // Hide all tab panes
    document.querySelectorAll('[id$="-tab"]').forEach((pane) => {
      pane.classList.add('hidden');
      pane.classList.remove('block', 'flex');
    });

    // Show selected tab pane
    const targetPane = document.getElementById(`${tabId}-tab`);
    if (targetPane) {
      targetPane.classList.remove('hidden');
      // Use flex for player tab to maintain layout
      if (tabId === 'player') {
        targetPane.classList.add('flex');
      } else {
        targetPane.classList.add('block');
      }
    }

    setActiveTab(tabId);

    // Handle resize for player tab to update canvas styling
    if (tabId === 'player' && window.kaiPlayerApp?.player?.karaokeRenderer?.resizeHandler) {
      setTimeout(() => {
        window.kaiPlayerApp.player.karaokeRenderer.resizeHandler();
      }, 10);
    }
  };

  return (
    <nav
      className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2"
      role="tablist"
    >
      <div className="flex space-x-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tab.id}-tab`}
            data-tab={tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`
              relative px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-500
              ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }
            `}
            title={`${tab.label} (Press ${tab.number})`}
          >
            <span className="text-xs opacity-50 mr-1">{tab.number}</span>
            {tab.label}
            {tab.badge > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
