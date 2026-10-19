# Navigation

How the visitor turns and moves, and the navigation panel that shows and controls it. Places and exits are described in [layout.md](layout.md#places).

## Turning and moving

The visitor starts at `start` facing north, towards the welcome sign.

- **Turning:** clicking the left or right edge of the room (see [cursor.md](cursor.md) for the zones) turns a quarter turn. The visitor's `heading` (`north`, `west`, `south`, `east`; `src/scene/navigation/heading.ts`) is exposed as `data-heading` on the room canvas. The camera yaw pans over `TURN_DURATION_MS`.
- **Moving forward:** clicking the centre steps to the place ahead, if there is one (`forwardFrom` in `src/scene/navigation/places.ts`). From `start` facing west that's the `nook`; from the nook facing east it's back to the start. The place is exposed as `data-place` on the room canvas, and the eye position moves over `MOVE_DURATION_MS`.
- **Stepping back:** the panel's down button and the down arrow key step to the place behind without turning (`backFrom`), so from the start facing east they lead into the nook.

Turns and moves follow the shared animation rules in [architecture.md](architecture.md#animations): input waits for them to finish, and reduced motion snaps to the end.

## Navigation panel

While the sign's text box is open ([text-box.md](text-box.md)), it takes the panel's place. The buttons, the arrow keys and the room's clicks do nothing until it closes.

The lower panel shows a compass and four direction buttons, drawn by `drawNavigationPanel` (`src/scene/navigation/navigationPanel.ts`). `ViewPane` redraws it on every turn and move frame, so the compass turns in step with the view.

### Compass

`compassPixels` (`src/scene/navigation/compass.ts`) draws a rose that turns with the camera, so the letter for the way the visitor faces sits at the top under a fixed marker.

- **Window:** only the top of the rose shows: an arc of its bezel and the letters within `COMPASS_WINDOW` (60°) of the top. At rest that's just the faced letter; during a turn it slides away round the arc as the next one slides in.
- **Letters:** each letter's direction is a yaw (N 0, W π/2, S π, E −π/2), drawn at `letterYaw − yaw` from the top. Letters move round the arc but stay upright. The faced letter is bright and any other worn.
- **Bezel:** a band like the pane's frame: a bright outer arc and a worn inner one, closed at both ends. Notches across it turn with the rose, one every 22.5°: long and bright at the letters, shorter and worn half-way between, and dim pips between those. The marker has a worn upper edge, like the frame's bevel.
- **Wear:** everything is weathered (`weather`), keyed to things that don't change between frames (the bezel's pixels, each notch's place on the rose, each letter's own pixels), so it moves with the rose instead of shimmering.

### Buttons

The buttons (`src/scene/navigation/navButtons.ts`) sit to the compass's right in a keyboard's arrow-key layout: up on top, and down in a row with left and right.

| Button | Does |
| --- | --- |
| Left / right | Turn, as the room's edge zones do. |
| Up | Steps forward, as a centre click does. |
| Down | Steps back without turning. |

Up and down are dimmed and do nothing when there's nowhere to go. `ViewPane` hit-tests clicks with `navButtonAt`. See [cursor.md](cursor.md) for the cursor over the panel.

- **Style:** each button is a worn keycap. Its base has stepped corners like the frame's. Its bright top face sits up and back from the base, like the logo plaque's face in its niche: dim lines join the face's corners to the base's, and a dotted line shades the deeper front edge below the face. The arrow on the face casts a dim shadow down and to the right. Keys are weathered per key, so each looks a little different. Unusable keys are drawn all dim, without the shadow.

### Pressing

Whenever a turn or step plays, its key goes down, including for room clicks: a click on the room's left edge presses the left key.

- The face sinks up to `PRESS_DEPTH` pixels towards the front of its base, and its arrow loses its shadow while it's down. The face and arrow are worn relative to the face, so their wear moves with them.
- The key goes down over the first `KEY_PRESS_MS` of the animation and comes back up over the last `KEY_PRESS_MS` (`keyPressAt` in `ViewPane`).
- While it's held the key stays bright, even if the move ends somewhere it can't be used (stepping forward into the nook), and it dims on the last frame.
- With reduced motion there's no animation, so no key moves.

## Arrow keys

The arrow keys work the buttons (up forward, down back, left and right turn) exactly as clicking them does, through the same `pressNavButton` in `ViewPane`, including the press animation.

- The listener is on `window`, so the keys work anywhere on the page.
- It ignores keys when Alt, Ctrl or Meta is held or when focus is in a text field, and otherwise prevents the page scrolling.
- A held key repeats, so it keeps turning or stepping each time an animation ends.
- Tab, Escape, Enter and Space select and use the room's objects ([selection.md](selection.md)).
- While the sign's text box is open, the arrow keys do nothing, and Enter and Space move its text on instead ([text-box.md](text-box.md#moving-the-text-on)).
