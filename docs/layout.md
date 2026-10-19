# Room layout and view

How the room is laid out in the world and how the camera sees it. For moving between places see [navigation.md](navigation.md); for the mirror and its fixtures see [mirror.md](mirror.md).

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

### Adding a place

1. If it needs new walls, add corners to `PLAN` in `room.ts` (clockwise, each with the wall running from it and a seed for its bricks), and any new constants to `src/scene/core/camera.ts`.
2. Put it `WALL_VIEW_DISTANCE` from the walls framing it, so its close-up walls match the others.
3. Add it to `PLACES` with its exits, and add the reverse exit to its neighbour. `backFrom` follows from the exits.
4. Check what it can see: `isVisible` and `visibleParts` handle hiding, but objects shown in a view (like the sign) may need checking from the new spot.
5. Add its views to [What each view shows](#what-each-view-shows).

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

- **Welcome signpost** (`src/scene/signpost/signpost.ts`): a double-outlined "WELCOME" board on a single post that sticks up `POST_PROTRUSION` pixels above it, over a fading ground line. The board is tilted by shifting pixels along `BOARD_SLOPE` rather than by canvas rotation, which keeps it crisp. It's worn: a chipped top-right corner, a crack, and outline and text pixels randomly dropped or dimmed. Clicking it opens its text box ([text-box.md](text-box.md)).
  - **Placement:** the sprite is drawn for the start position facing north, anchored in the world at `SIGN_POSITION` (on the floor, in front of the far wall).
  - **Other views:** it's a billboard that always faces the viewer. `signPlacement` (`src/scene/draw.ts`) projects the anchor and scales the sprite by the anchor's depth, and `placeSprite` moves and scales the pixels, drawing enlarged pixels as blocks. It isn't drawn when the anchor is behind the camera or hidden by a wall.
- **Mirror, curtain pull and logo plaque:** on the `nook-back` wall (`MIRROR_WALL` in `room.ts`), facing the nook's place, with the mirror's centre at eye height. The pull hangs to the mirror's right and the plaque sits in a niche below it. They're drawn in mirror-local units and keep bricks off themselves with their bounds; see [mirror.md](mirror.md).

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
