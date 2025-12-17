/**
 * LyricLine - Individual lyric line editor component
 *
 * Features:
 * - Editable timing (start/end)
 * - Editable text
 * - Enable/disable toggle
 * - Singer assignment dropdown
 * - Delete button
 * - Add line after button
 * - Click line number to play that section
 */

import { PortalSelect } from './PortalSelect.jsx';

// Singer options for the dropdown
const SINGER_OPTIONS = [
  { value: '', label: 'Lead' },
  { value: 'B', label: 'Singer B' },
  { value: 'duet', label: 'Duet' },
  { value: 'backup', label: 'Backup' },
  { value: 'backup:PA', label: 'Backup PA 🔊' },
];

export function LyricLine({
  line,
  index,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onAddAfter,
  onSplit,
  onPlaySection,
  canAddAfter,
  canSplit,
  hasOverlap = false,
}) {
  const startTime = line.start || line.startTimeSec || 0;
  const endTime = line.end || line.endTimeSec || startTime + 3;
  const text = line.text || '';
  const disabled = line.disabled === true;
  // Support new singer field, with backward compatibility for legacy backup boolean
  const singer = line.singer || (line.backup === true ? 'backup' : '');
  const isBackup = singer?.startsWith('backup') || false;

  const handleStartTimeChange = (e) => {
    const value = parseFloat(e.target.value) || 0;
    onUpdate(index, { ...line, start: value, startTimeSec: value });
  };

  const handleEndTimeChange = (e) => {
    const value = parseFloat(e.target.value) || 0;
    onUpdate(index, { ...line, end: value, endTimeSec: value });
  };

  const handleTextChange = (e) => {
    onUpdate(index, { ...line, text: e.target.value });
  };

  const handleSingerChange = (e) => {
    const newSinger = e.target.value || undefined;
    // Remove legacy backup field when using new singer field
    const { backup: _backup, ...lineWithoutBackup } = line;
    onSelect(index); // Select this line to ensure immediate visual update
    onUpdate(index, { ...lineWithoutBackup, singer: newSinger });
  };

  const handleToggleDisabled = () => {
    onUpdate(index, { ...line, disabled: !disabled });
  };

  const handleLineNumberClick = (e) => {
    e.stopPropagation();
    onSelect(index); // Select the line
    onPlaySection(startTime, endTime); // And play it
  };

  // Build container classes with proper precedence
  let containerClasses =
    'lyric-line-editor flex items-center gap-2.5 mb-2.5 p-2 border-2 rounded transition-all cursor-pointer';

  // Conditional states - backup background takes priority, selection adds border
  if (isBackup) {
    // Backup lines always show yellow background
    containerClasses += ' bg-yellow-50 dark:bg-yellow-900/20';
    containerClasses += isSelected
      ? ' border-blue-500 dark:border-blue-400'
      : ' border-yellow-400 dark:border-yellow-600';
  } else if (isSelected) {
    containerClasses += ' border-blue-500 bg-blue-100 dark:border-blue-400 dark:bg-blue-900/40';
  } else if (disabled) {
    containerClasses +=
      ' opacity-50 bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-600';
  } else {
    // Default state
    containerClasses +=
      ' bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-750 hover:border-gray-400 dark:hover:border-gray-500';
  }

  return (
    <div
      className={containerClasses}
      data-index={index}
      data-start-time={startTime}
      data-end-time={endTime}
      onClick={() => onSelect(index)}
    >
      <span
        className="flex items-center justify-center min-w-[36px] h-9 bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-sm font-semibold text-gray-700 dark:text-gray-200 cursor-pointer transition-all flex-shrink-0 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500"
        onClick={handleLineNumberClick}
      >
        {index + 1}
      </span>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input
          type="number"
          className={`w-[70px] px-2 py-1.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-white text-xs text-center font-mono focus:outline-none ${
            hasOverlap
              ? 'border-2 border-red-500 dark:border-red-400 focus:border-red-600 dark:focus:border-red-300'
              : 'border border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400'
          }`}
          value={startTime.toFixed(1)}
          onChange={handleStartTimeChange}
          step="0.1"
          min="0"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(index);
          }}
          title={
            hasOverlap
              ? 'Warning: This line overlaps with the previous line for the same singer'
              : ''
          }
        />
        <span className="text-gray-500 dark:text-gray-400 font-semibold">—</span>
        <input
          type="number"
          className="w-[70px] px-2 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white text-xs text-center font-mono focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
          value={endTime.toFixed(1)}
          onChange={handleEndTimeChange}
          step="0.1"
          min="0"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(index);
          }}
        />
      </div>

      <input
        type="text"
        className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400"
        value={text}
        onChange={handleTextChange}
        placeholder="Enter lyrics..."
        onClick={(e) => {
          e.stopPropagation();
          onSelect(index);
        }}
        disabled={disabled}
      />

      <div
        className="flex items-center gap-1 flex-shrink-0 w-28"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(index);
        }}
      >
        <PortalSelect
          value={singer}
          onChange={handleSingerChange}
          options={SINGER_OPTIONS}
          className="text-xs py-1 px-2"
        />
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          className={`w-8 h-8 p-0 flex items-center justify-center border border-gray-300 dark:border-gray-600 rounded cursor-pointer transition-all ${!disabled ? 'bg-gray-200 dark:bg-gray-700 text-green-600 dark:text-green-400 hover:bg-gray-300 dark:hover:bg-gray-600' : 'bg-gray-200 dark:bg-gray-700 text-red-600 dark:text-red-400 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
          title={!disabled ? 'Disable line' : 'Enable line'}
          onClick={(e) => {
            e.stopPropagation();
            handleToggleDisabled();
          }}
        >
          <span className="material-icons text-base">
            {!disabled ? 'visibility' : 'visibility_off'}
          </span>
        </button>
        <button
          className="w-8 h-8 p-0 flex items-center justify-center border border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded cursor-pointer transition-all hover:bg-red-600 hover:border-red-600 hover:text-white dark:hover:bg-red-500 dark:hover:border-red-500"
          title="Delete line"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('Delete this lyric line?')) {
              onDelete(index);
            }
          }}
        >
          <span className="material-icons text-base">delete</span>
        </button>
        <button
          className={`w-8 h-8 p-0 flex items-center justify-center border rounded cursor-pointer transition-all ${canSplit ? 'border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-blue-600 hover:border-blue-600 hover:text-white dark:hover:bg-blue-500 dark:hover:border-blue-500' : 'opacity-30 cursor-not-allowed border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
          title={
            canSplit
              ? 'Split line at first punctuation'
              : 'Cannot split: no punctuation or would create empty line'
          }
          disabled={!canSplit}
          onClick={(e) => {
            e.stopPropagation();
            if (canSplit) {
              onSplit(index);
            }
          }}
        >
          <span className="material-icons text-base">call_split</span>
        </button>
        <button
          className={`w-8 h-8 p-0 flex items-center justify-center border rounded cursor-pointer transition-all ${canAddAfter ? 'border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-green-600 hover:border-green-600 hover:text-white dark:hover:bg-green-500 dark:hover:border-green-500' : 'opacity-30 cursor-not-allowed border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
          title={canAddAfter ? 'Add line after' : 'Not enough space (need 0.6s gap)'}
          disabled={!canAddAfter}
          onClick={(e) => {
            e.stopPropagation();
            onAddAfter(index);
          }}
        >
          <span className="material-icons text-base">add</span>
        </button>
      </div>
    </div>
  );
}
