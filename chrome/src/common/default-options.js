/**
 * Default keyboard shortcuts for Universal Media Speed Controller
 * All shortcuts use 2-key combos (Ctrl + key) to avoid conflicts.
 * Uses event.code for language-independent matching.
 */

const defaults = {
  // Skip forward 10s * current speed
  'skip-forward': { key: ']', code: 'BracketRight', ctrl: true, alt: false, shift: false, meta: false },
  // Skip backward 10s * current speed
  'skip-backward': { key: '[', code: 'BracketLeft', ctrl: true, alt: false, shift: false, meta: false },
  // Small speed adjustments
  'speed-up': { key: ';', code: 'Semicolon', ctrl: true, alt: false, shift: false, meta: false },
  'slow-down': { key: "'", code: 'Quote', ctrl: true, alt: false, shift: false, meta: false },
  // Large speed adjustments
  'big-speed-up': { key: '.', code: 'Period', ctrl: true, alt: false, shift: false, meta: false },
  'big-slow-down': { key: ',', code: 'Comma', ctrl: true, alt: false, shift: false, meta: false },
  // Reset and pause
  'reset-speed': { key: '/', code: 'Slash', ctrl: true, alt: false, shift: false, meta: false },
  'pause': { key: 'y', code: 'KeyY', ctrl: true, alt: false, shift: false, meta: false },
  // Hold to temporarily change speed
  'hold-speed': { key: 'q', code: 'KeyQ', ctrl: true, alt: false, shift: false, meta: false },
  'hold-reverse': { key: '`', code: 'Backquote', ctrl: true, alt: false, shift: false, meta: false },
};
