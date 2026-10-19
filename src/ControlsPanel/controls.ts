// A key as shown, and what a screen reader reads instead if the symbol alone
// isn't clear.
export type Key = { label: string; name?: string }
export type Control = { keys: Key[]; action: string }

// The keyboard controls, kept in step with the keys ViewPane handles. Every
// character must have a glyph in the pixel font (src/scene/core/pixelFont.ts).
export const CONTROLS: Control[] = [
  { keys: [{ label: '↑', name: 'Up arrow' }, { label: '↓', name: 'Down arrow' }], action: 'Move' },
  { keys: [{ label: '←', name: 'Left arrow' }, { label: '→', name: 'Right arrow' }], action: 'Rotate' },
  { keys: [{ label: 'Tab' }], action: 'Select' },
  { keys: [{ label: 'Shift+Tab' }], action: 'Previous' },
  { keys: [{ label: 'Enter' }, { label: 'Space' }], action: 'Interact' },
  { keys: [{ label: 'Esc', name: 'Escape' }], action: 'Deselect' },
]
