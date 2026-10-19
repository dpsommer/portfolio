# Navigation

How the visitor turns and moves, and the navigation panel that shows and controls it. Places and exits are described in [layout.md](layout.md#places).

## Turning and moving

The visitor starts at `start` facing north, towards the welcome sign on the far wall. It's too far off to use until they step forward to it.

- **Turning:** clicking the left or right edge of the room (see [cursor.md](cursor.md) for the zones) turns a quarter turn. The visitor's `heading` (`north`, `west`, `south`, `east`; `src/scene/navigation/heading.ts`) is exposed as `data-heading` on the room canvas. The camera yaw pans over `TURN_DURATION_MS`.
- **Moving forward:** clicking the centre steps to the place ahead, if there is one (`forwardFrom` in `src/scene/navigation/places.ts`). From `start` facing west that's the `nook`, and facing north it's the `sign` place in front of the welcome sign; from either, facing back the way they came leads back to the start. The place is exposed as `data-place` on the room canvas, and the eye position moves over `MOVE_DURATION_MS`.
- **Stepping back:** the panel's down button and the down arrow key step to the place behind without turning (`backFrom`), so from the start facing east they lead into the nook.

Turns and moves follow the shared animation rules in [architecture.md](architecture.md#animations): input waits for them to finish, and reduced motion snaps to the end.

## Navigation panel

While the sign's text box is open ([text-box.md](text-box.md)), it takes the panel's place. The buttons, the arrow keys, WASD and the room's clicks do nothing until it closes.

The lower panel shows a compass and four direction buttons, drawn by `drawNavigationPanel` (`src/scene/navigation/navigationPanel.ts`). `ViewPane` redraws it on every turn and move frame, so the compass turns in step with the view.

### Compass

`compassPixels` (`src/scene/navigation/compass.ts`) draws a rose that turns with the camera, so the letter for the way the visitor faces sits at the top under a fixed marker.

Like the room's objects, it's drawn in one-pixel lines in solid tones, with no wear.

- **Window:** only the top of the rose shows: an arc of its bezel and what's inside it within `COMPASS_WINDOW` (60°) of the top. At rest that's just the faced letter; during a turn it slides away round the arc as the next one slides in.
- **Letters:** each letter's direction is a yaw (N 0, W π/2, S π, E −π/2), drawn at `letterYaw − yaw` from the top. Letters move round the arc but stay upright. The faced letter is bright and any other worn.
- **Bezel:** a band like the pane's frame: a bright outer arc and a worn inner one. At each end the outer arc rolls under into a bright scroll, like the mirror's side scrolls. Notches across it turn with the rose, one every 22.5°: long and bright at the letters, shorter and worn half-way between, and dim pips between those.
- **Rose:** inside the bezel, turning with it: a dim hub arc, a worn kite-shaped point with a dim middle line at each half-way direction (NW, SW, …), and a worn diamond bead above each letter, like the mirror's bead. They're cut off at the window's edges, under the scrolls.
- **Marker:** fixed at the top, a bright diamond like the mirror's crest, with a worn curl either side resting on the bezel.

### Buttons

The buttons (`src/scene/navigation/navButtons.ts`) sit to the compass's right in a keyboard's arrow-key layout: up on top, and down in a row with left and right.

| Button | Does |
| --- | --- |
| Left / right | Turn, as the room's edge zones do. |
| Up | Steps forward, as a centre click does. |
| Down | Steps back without turning. |

Up and down are dimmed and do nothing when there's nowhere to go. `ViewPane` hit-tests clicks with `navButtonAt`. See [cursor.md](cursor.md) for the cursor over the panel.

- **Style:** each button is a keycap drawn like the logo plaque in its niche, in one-pixel lines: a dim base with stepped corners like the frame's, a bright top face sitting up and back from it, dim lines joining their corners, and a bright outlined arrow on the face. Unusable keys are drawn all dim.

### Pressing

Whenever a turn or step plays, its key goes down, including for room clicks: a click on the room's left edge presses the left key.

- The face and its arrow sink up to `PRESS_DEPTH` pixels towards the front of the base, and the corner lines follow them.
- The key goes down over the first `KEY_PRESS_MS` of the animation and comes back up over the last `KEY_PRESS_MS` (`keyPressAt` in `ViewPane`).
- While it's held the key stays bright, even if the move ends somewhere it can't be used (stepping forward into the nook), and it dims on the last frame.
- With reduced motion there's no animation, so no key moves.

## Arrow keys

The arrow keys work the buttons (up forward, down back, left and right turn) exactly as clicking them does, through the same `pressNavButton` in `ViewPane`, including the press animation. WASD does the same (W forward, S back, A and D turn), in either case so Caps Lock makes no difference (`MOVE_KEYS`). WASD goes by the character typed, not the key's position, so it follows the labels on keyboards with other layouts.

- The listener is on `window`, so the keys work anywhere on the page.
- It ignores keys when Alt, Ctrl or Meta is held or when focus is in a text field, and otherwise prevents the default action (scrolling, or typing a letter).
- A held key repeats, so it keeps turning or stepping each time an animation ends.
- Tab, Escape, Enter and Space select and use the room's objects ([selection.md](selection.md)).
- While the sign's text box is open, the arrow keys and WASD do nothing, and Enter and Space move its text on instead ([text-box.md](text-box.md#moving-the-text-on)).
