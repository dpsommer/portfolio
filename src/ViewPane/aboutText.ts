import { HEADPHONES_MAP, HOODIE_MAP, KEYBOARD_MAP, MOUSE_MAP } from '../scene/character/icons.ts'
import type { Profile } from '../scene/character/profile.ts'

// The character card's name and health, and what the profile view it opens
// shows: the full name and title beside the avatar, the health potion and
// equipment below it, and the About Me text in the lower panel's text box.
// The About Me text is drawn at a small scale and shown all at once; it must
// fit the box (about 47 characters a line, 9 lines). A newline starts a new line.
export const CARD_NAME = 'Duncan'
// The health readout under the card's icons, current over total.
export const CARD_HEALTH = { current: 19, total: 92 }
export const FULL_NAME = 'Duncan Sommerville'
export const CHARACTER_TITLE = 'Human Wizard'
// The equipment table's slots, left to right and top to bottom.
export const EQUIPMENT = [
  { slot: 'Weapon', item: 'Keyboard', icon: KEYBOARD_MAP },
  { slot: 'Off-Hand', item: 'Mouse', icon: MOUSE_MAP },
  { slot: 'Head', item: 'Headphones', icon: HEADPHONES_MAP },
  { slot: 'Chest', item: 'Hoodie', icon: HOODIE_MAP },
]
export const ABOUT_TEXT =
  "About me: placeholder text. I'm a software developer who likes building things for the web, " +
  'pixel art and old dungeon crawlers.\n\nMore about me will go here.'

// Everything the profile view shows besides the avatar.
export const PROFILE: Profile = { fullName: FULL_NAME, title: CHARACTER_TITLE, health: CARD_HEALTH, equipment: EQUIPMENT }

// The profile view in words, for screen readers, since the canvas is hidden from them.
export const PROFILE_DESCRIPTION =
  `${FULL_NAME}, ${CHARACTER_TITLE}. Health ${CARD_HEALTH.current} of ${CARD_HEALTH.total}. ` +
  `Equipment: ${EQUIPMENT.map(({ slot, item }) => `${slot}: ${item}`).join(', ')}. ${ABOUT_TEXT}`
