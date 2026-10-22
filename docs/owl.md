# Owl

A small owl perches in the tracery window's open lower right pane, at the east hall's dead end ([layout.md](layout.md#objects)). At rest it blinks and now and then tilts its head. Using it makes it turn its head to look at the visitor, then back.

## Look

`src/scene/owl/owl.ts` draws it like the room, as sparse single lines, in owl-local units: u runs right and w up from between its feet.

- **Outline** (`FOREGROUND`): a rounded body (an ellipse drawn up each side to the shoulders) and a round head over it, with no neck between. There are two ear tufts on top.
- **Face** (`FOREGROUND`): two big eye rings, each with a one-pixel pupil, and a small V beak. A worn brow V runs from above each eye down to the beak.
- **Body detail:** a folded wing down each side and three-toed feet on the ledge (`FOREGROUND_WORN`), and a few chevron feathers on the chest (`FOREGROUND_DIM`).
- **Size:** about 0.16 wide and 0.32 tall to its tufts, about 21 × 41 px from `hall-end`.

## Placement

`src/scene/owl/pixels.ts` (`owlPixels`) stands it at `OWL_PERCH`, on the open pane's bottom at s 0.15 in window-local units, 0.03 out from the wall on the opening's inner edge. It goes into the world through the window's `windowToWorld`.

The casement is swung π/3 (`OPEN_ANGLE` in `window/tracery.ts`), so from `hall-end` the leaf shows as a narrow strip at the opening's right edge. The owl stands clear of the leaf and of the opening's left edge, so no lines cross it. Like everything else in the room, walls hide it from outside the hall.

`drawScene` draws it right after the window, in the pose it's given (`REST_POSE` if none).

## Pose

`OwlPose` is `{ turn, tilt, blink }`. Only the head moves.

- **Turn:** radians about the vertical, where 0 faces the visitor. Each feature sits at an angle round the head from its front: the eyes at turn ± 0.5, the beak at turn and the tufts at turn ± 0.7. A feature's width follows how squarely it faces the visitor. An eye or the beak turned past the side isn't drawn. At rest the head is turned `REST_TURN` (0.6) to the visitor's right.
- **Tilt:** radians anticlockwise in the wall's plane. The head's lines turn about `NECK` while the body stays put.
- **Blink:** 0 is open and 1 is shut. Each eye's ring flattens as it closes, until it's a line.

## Resting animation

`owlIdle(elapsed)` gives the blink and tilt at any moment, as a pure function of time:

- **Blinks:** after each of `BLINK_GAPS` (3.2, 4.1, 2.6 and 5 s) in turn, so they don't come like clockwork. Each blink lasts `BLINK_MS` (180 ms): it closes over the first third, stays shut through the middle and opens over the last third.
- **Tilts:** 4 s into every 7 s, the head eases to `TILT_ANGLE` (0.18 rad) and back over `TILT_MS` (1.2 s), alternately left and right.

## Using it

- **Where:** it can only be used from `hall-end` facing south, the view it was designed for. There it's first in the Tab order, before the card ([selection.md](selection.md)), and its status label is "Owl".
- **Clicks and hover:** a click on it, inside `OWL_BOUNDS` (its bounds at rest in that view), uses it. That's also where the pointing hand shows ([cursor.md](cursor.md)), and where the selection carets go.
- **The look:** using it calls `lookAtVisitor`, which starts a look unless one is already playing. `owlLook` turns the head from `REST_TURN` to face the visitor over `OWL_TURN_MS` (300 ms) with ease-in-out. The head holds there for `OWL_HOLD_MS` (1.2 s) and turns back over 300 ms, `OWL_LOOK_MS` in all.

## Animation loop

- **When it runs:** while the owl can be in view (anywhere in the hall facing south, `owlInSight` in `ViewPane`). The loop runs on its own `requestAnimationFrame`, like the selection carets' bounce.
- **Each frame:** it works out the pose with `owlPose`, from the time since the loop started and the time since the look started.
- **Redrawing:** it redraws the room only when the pose changes and no other animation or the profile view is drawing over it. Other redraws, such as turns, moves and caret bounces, draw the latest pose (`owlPoseRef`).
- **Input:** it doesn't count as animating, so input isn't blocked while the owl blinks or looks.
- **Leaving the view:** this stops the loop, drops any look and puts the owl back at rest.

## Reduced motion

With reduced motion the owl holds still: no blinks and no tilts. A look still answers, but snaps the head straight round to face the visitor for `OWL_LOOK_MS`, then straight back. The setting is read when the loop starts and when each look starts. With no canvas context there's no loop.
