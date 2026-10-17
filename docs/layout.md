# Room layout and view

How the room is laid out in the world and how the camera sees it. For interaction design (navigation, the cursor and the mirror's behaviour), see [ui.md](ui.md).

## World and units

The room is built in world space (`src/scene/core/camera.ts`):

- **Axes:** x runs east (right when facing north) and y runs up. +z is north, the starting heading. The camera is always at eye height, y 0.
- **Size:** the main room is 2 wide (`ROOM_HALF_WIDTH` 1), so x runs from −1 to 1.
- **Height:** the floor is at `FLOOR_Y` (−0.75) and the ceiling at `CEILING_Y` (0.75). That's a 3:4 ratio, matching the canvas, so facing north the wall edges run into the view's corners.

## Floor plan

`src/scene/room/room.ts` describes the room as a floor plan (`FLOOR_PLAN`, corners clockwise from above) and derives `WALLS` from it. Each wall runs from its corner to the next, left to right as seen from inside.

```
          z
          ^
   FAR_Z  |          +------- north --------+
  (1.78)  |          |                      |
          |        west                     |
       1  +----------+                      |
          |  nook-side                      |
          |                                 |
          | [M]  nook ·      start ·      east
          |                                 |
          nook-back                         |
          |                                 |
  BACK_Z  +------------- south -------------+
   (−1)                                         -> x
          x −7/3     −1         0           1
```

| Wall | Runs | Notes |
| --- | --- | --- |
| `north` | x −1 → 1 at z `FAR_Z` | The far wall, facing north from the start. |
| `east` | z `FAR_Z` → `BACK_Z` at x 1 | |
| `south` | x 1 → `NOOK_X` at z `BACK_Z` | The back wall, behind the start and the nook. |
| `nook-back` | z `BACK_Z` → `NOOK_FRONT_Z` at x `NOOK_X` | The nook's back (west) wall, where the mirror hangs (`[M]`). |
| `nook-side` | x `NOOK_X` → −1 at z `NOOK_FRONT_Z` | The nook's north side. |
| `west` | z `NOOK_FRONT_Z` → `FAR_Z` at x −1 | What's left of the main room's left wall. |

- **Far wall:** its distance `FAR_Z` is derived so the wall fills `FAR_WALL_SCALE` (0.45) of the view facing north. This gives the classic dungeon-crawler "narrowing box".
- **Consistent close-up walls:** every place the visitor stands is `WALL_VIEW_DISTANCE` (1) from the nearby walls framing it, so close-up walls look the same size everywhere. The back wall's position, `BACK_Z` (−1), is derived from it. Facing south from the start shows the back wall framed by its edges.
- **The nook:** a nook to the left of the start pushes the near part of the left wall back to `NOOK_X` (−7/3), from the back wall up to `NOOK_FRONT_Z` (1).
  - It's four 1/3-unit floor tiles deep, so the floor grid ends at its walls.
  - `NOOK_FRONT_Z` is just past where the left wall leaves the north view (z 0.8). So facing north, the nook's front corner shows as a vertical edge near the left of the view, hinting at the opening.

## Places

The spots the visitor can stand, and their exits, are in `src/scene/navigation/places.ts` (`PLACES`, `forwardFrom`).

| Place | Position | Exits |
| --- | --- | --- |
| `start` | `ORIGIN` (0, 0) | West to the nook |
| `nook` | (`NOOK_X` + `WALL_VIEW_DISTANCE`, 0) = (−4/3, 0) | East to the start |

- **From the start:** the side walls and the back wall are all 1 away.
- **From the nook:** its back wall, its side wall and the main back wall are all 1 away.

## Camera and projection

- **Camera:** it stands at an `eye` position on the floor plan and only turns about the vertical axis. Its yaw is in radians, anticlockwise from north.
- **Projection:** the focal length is `FOCAL_RATIO` (0.8) × half the canvas width, which is 128 px at 320 wide (about a 102° field of view). `projectSegment` moves world segments into camera space (`toCamera`, relative to the eye), clips them to the `NEAR` plane and projects them.
- **Hidden parts:** walls run from floor to ceiling, so visibility only depends on the floor plan.
  - `isVisible` (`room.ts`) checks whether the line from the eye to a point crosses a wall.
  - `visibleParts` samples each segment every `VISIBILITY_STEP` and bisects to find where it passes behind a wall, so only visible parts are drawn.
  - From the start everything is visible. From inside the nook, its side wall hides part of the main room.

## What each view shows

- **From the start:**
  - Facing north: the far wall in the middle, with the welcome sign in front of it.
  - Facing west: the nook opening, with the mirror on its back wall. The back wall shows on the left; the far wall and the sign are out of view.
  - Facing east: the east wall, with the back wall on the right.
  - Facing south: the back wall.
- **From the nook:**
  - Facing west: the mirror, which fills most of its wall.
  - Facing east: back out to the main room.

## Room detail

`room.ts` builds all detail in world space:

- **Edges:** each wall's floor, ceiling and corner edges, as broken lines in `FOREGROUND_WORN`.
- **Bricks:** sparse bricks on every wall, drawn as just their top and left edges, in `FOREGROUND_DIM`. Bricks the mirror covers aren't drawn.
- **Flagstones:** scattered flagstone edges on a grid of 1/3-unit floor tiles, in `FOREGROUND_DIM`. Only grid lines with floor on both sides are drawn (`isOnFloor`).

Each brick, floor edge and edge-gap pattern is chosen with `hashRandom`/`hashSeed` (`src/scene/core/random.ts`) from its own world coordinates, not from one sequential stream. That way the detail stays put while the view turns instead of shimmering. The segments are built once; `roomPixels(width, height, yaw, eye)` only projects them.

## Objects

- **Welcome signpost:** the sprite is drawn for the start position facing north. It's anchored in the world at `SIGN_POSITION` (0, `FLOOR_Y`, 1.14).
  - From any other view it's a billboard: `signPlacement` (`src/scene/draw.ts`) projects the anchor and scales the sprite by the anchor's depth. `placeSprite` moves and scales the pixels, drawing enlarged pixels as blocks.
  - It always faces the viewer. It isn't drawn when the anchor is behind the camera or hidden by a wall.
- **Mirror:** an ornate, arch-topped mirror (`src/scene/mirror/frame.ts`).
  - **Placement:** it hangs centred on the `nook-back` wall (`MIRROR_WALL` in `room.ts`), facing the nook's place, with its centre at eye height.
  - **Size:** it's 1.3 high on the 1.5-high wall, crest and pendant included, and 0.8 wide at the frame.
  - **Style:** like the room, it's sparse world-space lines, in mirror-local units (s right, t up). It's drawn in three layers:
    - dim glints on the glass
    - a worn inner glass edge
    - a bright outer frame with a diamond crest, side and corner scrolls, and a pendant with a bead
  - **Drawing:** `mirrorPixels` (`src/scene/mirror/pixels.ts`) projects it with the room's wall visibility. `MIRROR_BOUNDS` keeps bricks off it.
- **Curtain pull:** a cord and acorn-shaped handle beside the mirror (`src/scene/mirror/pull.ts`).
  - **Placement:** on the mirror's wall at s `PULL_S` (0.68), right of the mirror's side scroll. The cord hangs from the ceiling to the handle's top at t 0.12, a little above eye height. That keeps the handle clear of the brick below it.
  - **Style:** mirror-local lines like the mirror: a worn cord and a band across the handle, and a bright handle outline. `pullLayers(drop)` lowers the handle by `drop` and stretches the cord, for the tug animation.
  - **Drawing:** `pullPixels` projects it like the mirror. `PULL_BOUNDS` keeps bricks off it.
- **Logo plaque:** a block set into a niche in the mirror's wall, showing the current site's logo (`src/scene/mirror/plaque.ts`).
  - **Placement:** centred under the pull's cord at t −0.38, in a niche 0.17 units square. That's below the pull's lowest drop and clear of the brick between them.
  - **Map format:** logos are 16×16 `LogoMap`s (`#` full foreground, `+` worn, `-` dim, `.` empty), one cell per canvas pixel from the nook, like the preview.
  - **Depth:** drawn in the wall's plane in the room's "narrowing box" style. `plaqueLayers(depth, turn)` draws the niche (dim), lines from its corners to the face's corners, and the face's outline (worn). Sinking (`depth` 0 to 1) shrinks the face toward the niche's centre, lengthening those lines, and `logoCells` drops the logo a tone into shadow. Turning (`turn` 0 to 1, a half turn on the vertical axis) narrows the face and logo by `|cos(π·turn)|`.
  - **Drawing:** `plaquePixels` projects the lines like the mirror and the logo's cells as blocks, like the preview's. `PLAQUE_BOUNDS` keeps bricks off the niche.

## Draw order

`drawScene(ctx, yaw, eye, { preview?, ripple?, shimmer?, pullDrop?, plaque? })` paints in this order:

1. the background
2. the room
3. the current site's preview on the mirror's glass, once loaded (shimmering from the previous site's preview, or distorted by the ripple, if either is playing)
4. the ripple's rings, if one is playing
5. the mirror, over the preview and rings so the frame covers their edges
6. the curtain pull, lowered by `pullDrop`
7. the logo plaque, if given (`ViewPane` always gives one)
8. background-coloured backing pixels for sprites (`signpostBackingPixels`), so the room doesn't show through their outline-only art
9. the sprites themselves
