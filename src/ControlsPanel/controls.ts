// A key as shown, and what a screen reader reads instead if the symbol alone
// isn't clear.
export type Key = { label: string; name?: string }
// Each group is a set of keys, such as the arrow keys or WASD, shown
// separated by a pipe.
export type Control = { keyGroups: Key[][]; action: string }

// The keyboard controls, kept in step with the keys ViewPane handles. Every
// character must have a glyph in the pixel font (src/scene/core/pixelFont.ts).
export const CONTROLS: Control[] = [
  {
    keyGroups: [
      [{ label: '↑', name: 'Up arrow' }, { label: '↓', name: 'Down arrow' }],
      [{ label: 'W' }, { label: 'S' }],
    ],
    action: 'Move',
  },
  {
    keyGroups: [
      [{ label: '←', name: 'Left arrow' }, { label: '→', name: 'Right arrow' }],
      [{ label: 'A' }, { label: 'D' }],
    ],
    action: 'Rotate',
  },
  { keyGroups: [[{ label: 'Tab' }]], action: 'Select' },
  { keyGroups: [[{ label: 'Shift+Tab' }]], action: 'Previous' },
  { keyGroups: [[{ label: 'Enter' }, { label: 'Space' }]], action: 'Interact' },
  { keyGroups: [[{ label: 'Esc', name: 'Escape' }]], action: 'Cancel' },
]
