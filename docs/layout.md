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
     (7/3)  |          |         [S]          |
            |          |                      |
       4/3  |        west       sign ·      east
         1  +----------+                      +--- hall-north ---+
            |  nook-side                                         |
            |                                                    |
            | [M]  nook ·      start ·              hall ·   hall-east
            |                                                    |
            nook-back                                            |
            |                                                    |
    BACK_Z  +------------- south -------------+                  |
     (−1)                                     |                  |
            |                             hall-west              |
      −4/3                                    |    hall-middle · |
            |                                 |                  |
      −8/3                                    |       hall-end · |
            |                                 |                  |
HALL_END_Z                                    +---- hall-end ----+
   (−11/3)                                                         -> x
            x −7/3     −1         0           1         2        3
```

| Wall | Runs | Notes |
| --- | --- | --- |
| `north` | x −1 → 1 at z `FAR_Z` | The far wall, facing north from the start, where the welcome sign hangs (`[S]`). |
| `east` | z `FAR_Z` → `HALL_FRONT_Z` at x 1 | What's left of the main room's right wall. |
| `hall-north` | x 1 → `HALL_X` at z `HALL_FRONT_Z` | The hall's north side. |
| `hall-east` | z `HALL_FRONT_Z` → `HALL_END_Z` at x `HALL_X` | The hall's outer (east) wall, all the way down. |
| `hall-end` | x `HALL_X` → 1 at z `HALL_END_Z` | The dead end. |
| `hall-west` | z `HALL_END_Z` → `BACK_Z` at x 1 | The hall's inner wall, carrying on the right wall's line south of the back wall. |
| `south` | x 1 → `NOOK_X` at z `BACK_Z` | The back wall, behind the start and the nook. |
| `nook-back` | z `BACK_Z` → `NOOK_FRONT_Z` at x `NOOK_X` | The nook's back (west) wall, where the mirror hangs (`[M]`). |
| `nook-side` | x `NOOK_X` → −1 at z `NOOK_FRONT_Z` | The nook's north side. |
| `west` | z `NOOK_FRONT_Z` → `FAR_Z` at x −1 | What's left of the main room's left wall. |

- **Far wall:** it's `WALL_VIEW_DISTANCE` beyond the `sign` place, which is `SIGN_STEP` (4/3, as far as the step into the nook) north of the start, so `FAR_Z` is 7/3. Facing north from the start it's a small rectangle in the middle of the view (about a third of it), the classic dungeon-crawler "narrowing box", and the sign on it is too far off to use. It's a whole number of floor tiles from the back wall, so the floor grid ends at it.
- **Consistent close-up walls:** every place the visitor stands is `WALL_VIEW_DISTANCE` (1) from the nearby walls framing it, so close-up walls look the same size everywhere. The back wall's position, `BACK_Z` (−1), is derived from it. Facing south from the start shows the back wall framed by its edges.
- **The nook:** a nook to the left of the start pushes the near part of the left wall back to `NOOK_X` (−7/3), from the back wall up to `NOOK_FRONT_Z` (1).
  - It's four 1/3-unit floor tiles deep, so the floor grid ends at its walls.
  - `NOOK_FRONT_Z` is just past where the left wall leaves the north view (z 0.8). So facing north, the nook's front corner shows as a vertical edge near the left of the view, hinting at the opening.
- **The hall:** opposite the nook, the near part of the right wall opens from the back wall up to `HALL_FRONT_Z` (1) into a hall 2 wide, which turns south and ends in a dead end at `HALL_END_Z` (−11/3).
  - Its east wall is at `HALL_X` (3), so the step in from the start is 2, not the nook's 4/3. With a shorter step the hall's south leg would sit under the main room and open a gap in the back wall; at 2 its inner wall (`hall-west`) carries on the right wall's line instead.
  - The south leg is two `HALL_STEP`s (4/3, as far as the step into the nook) long, then `WALL_VIEW_DISTANCE` to the dead end.
  - Like the nook's, its front corner shows facing north from the start, hinting at the opening.
  - All its walls are a whole number of floor tiles from the main room's, so the floor grid ends at them. Floor rows down the hall are numbered back from `BACK_Z` (negative), so the main room's flagstones stay where they were.

## Places

The spots the visitor can stand, and their exits, are in `src/scene/navigation/places.ts` (`PLACES`, `forwardFrom`).

| Place | Position | Exits |
| --- | --- | --- |
| `start` | `ORIGIN` (0, 0) | West to the nook, north to the sign, east to the hall |
| `nook` | (`NOOK_X` + `WALL_VIEW_DISTANCE`, 0) = (−4/3, 0) | East to the start |
| `sign` | (0, `SIGN_STEP`) = (0, 4/3) | South to the start |
| `hall` | (`HALL_X` − `WALL_VIEW_DISTANCE`, 0) = (2, 0) | West to the start, south to `hall-middle` |
| `hall-middle` | (2, −`HALL_STEP`) = (2, −4/3) | North to `hall`, south to `hall-end` |
| `hall-end` | (2, −2 × `HALL_STEP`) = (2, −8/3) | North to `hall-middle` |

- **From the start:** the side walls and the back wall are all 1 away.
- **From the nook:** its back wall, its side wall and the main back wall are all 1 away.
- **From the sign:** the far wall and both side walls are all 1 away.
- **From the hall:** its north and east walls are 1 away.
- **From hall-middle:** both of the hall's side walls are 1 away.
- **From hall-end:** the dead end and both of the hall's side walls are 1 away.

### Adding a place

1. If it needs new walls, add corners to `PLAN` in `room.ts` (clockwise, each with the wall running from it and a seed for its bricks), and any new constants to `src/scene/core/camera.ts`.
2. Put it `WALL_VIEW_DISTANCE` from the walls framing it, so its close-up walls match the others.
3. Add it to `PLACES` with its exits, and add the reverse exit to its neighbour. `backFrom` follows from the exits.
4. Check what it can see: `isVisible` and `visibleParts` hide what's behind walls, but check that objects (like the sign) still look right from the new spot.
5. Add its views to [What each view shows](#what-each-view-shows).

## Camera and projection

- **Camera:** it stands at an `eye` position on the floor plan and only turns about the vertical axis. Its yaw is in radians, anticlockwise from north.
- **Projection:** the focal length is `FOCAL_RATIO` (0.8) × half the canvas width, which is 128 px at 320 wide (about a 102° field of view). `projectSegment` moves world segments into camera space (`toCamera`, relative to the eye), clips them to the `NEAR` plane and projects them.
- **Hidden parts:** walls run from floor to ceiling, so visibility only depends on the floor plan.
  - `isVisible` (`room.ts`) checks whether the line from the eye to a point crosses a wall.
  - `visibleParts` samples each segment every `VISIBILITY_STEP` and bisects to find where it passes behind a wall, so only visible parts are drawn.
  - From the start almost everything is visible: only the hall's inner wall (`hall-west`) hides the far part of its south leg. From inside the nook, its side wall hides part of the main room. Down the hall, its inner wall hides the near part of the main room, but the rest shows at a slant through the opening.

## What each view shows

- **From the start:**
  - Facing north: the far wall small in the middle, with the welcome sign hanging on it, too far off to read clearly or use.
  - Facing west: the nook opening, with the mirror on its back wall. The back wall shows on the left; the far wall and the sign are out of view.
  - Facing east: the hall's opening, with the hall's east wall beyond it and its turn south showing on the right.
  - Facing south: the back wall, with a glimpse down the hall past its left corner.
- **From the nook:**
  - Facing west: the mirror, which fills most of its wall.
  - Facing east: back out to the main room.
- **From the sign:**
  - Facing north: the welcome sign close up, where it can be used.
  - Facing south: back down the room to the back wall.
- **From the hall:**
  - Facing south: down the hall to the dead end, with the main room through the opening on the right.
  - Facing west: back into the main room, with the welcome sign far off on the right.
- **From hall-middle and hall-end:**
  - Facing south: the dead end, close up from `hall-end`.
  - Facing north: back up the hall to its north wall, with the main room and the welcome sign at a slant through the opening on the left.

## Room detail

`room.ts` builds all detail in world space:

- **Edges:** each wall's floor, ceiling and corner edges, as broken lines in `FOREGROUND_WORN`.
- **Bricks:** sparse bricks on every wall, drawn as just their top and left edges, in `FOREGROUND_DIM`. Bricks under the mirror, its fixtures or the sign aren't drawn (`isUnderFixture`).
- **Flagstones:** scattered flagstone edges on a grid of 1/3-unit floor tiles, in `FOREGROUND_DIM`. Only grid lines with floor on both sides are drawn (`isOnFloor`).

Each brick, floor edge and edge-gap pattern is chosen with `hashRandom`/`hashSeed` (`src/scene/core/random.ts`) from its own world coordinates, not from one sequential stream. That way the detail stays put while the view turns instead of shimmering. The segments are built once; `roomPixels(width, height, yaw, eye)` only projects them.

## Objects

- **Welcome sign** (`src/scene/sign/`): a "WELCOME" board hanging on the north wall (`SIGN_WALL` in `room.ts`), centred at eye height and facing the start. It's used from the `sign` place facing north: clicking it there opens its text box ([text-box.md](text-box.md)).
  - **Look:** drawn like the mirror, as sparse single lines: the board's outline in `FOREGROUND`, and a nail with two cords to the board's top corners in `FOREGROUND_WORN`. The board hangs crooked: it and its text are sheared by `BOARD_RISE`, so the right side is higher and verticals stay upright.
  - **Shape:** `board.ts` holds it in sign-local units (s right, t up from the board's centre), like `mirror/frame.ts`; `signToWall` places it on the wall. The text is the pixel font at 3× (`TEXT_SCALE`), as cells `SIGN_CELL_SIZE` apart, one canvas pixel each from the `sign` place, drawn with `cellPixels` like the mirror's previews. Each glyph pixel's 3×3 cells rise together with the tilt, so the letters stay blocky.
  - **Other views:** `signPixels` (`pixels.ts`) projects it like the room, so it stays fixed on its wall and parts behind walls are hidden.
- **Mirror, curtain pull and logo plaque:** on the `nook-back` wall (`MIRROR_WALL` in `room.ts`), facing the nook's place, with the mirror's centre at eye height. The pull hangs to the mirror's right and the plaque sits in a niche below it. They're drawn in mirror-local units and keep bricks off themselves with their bounds; see [mirror.md](mirror.md).

## Draw order

`drawScene(ctx, yaw, eye, { preview?, ripple?, shimmer?, pullDrop?, plaque? })` paints in this order:

1. the background
2. the room
3. the welcome sign
4. the current site's preview on the mirror's glass, once loaded (shimmering from the previous site's preview, or distorted by the ripple, if either is playing)
5. the ripple's rings, if one is playing
6. the mirror, over the preview and rings so the frame covers their edges
7. the curtain pull, lowered by `pullDrop`
8. the logo plaque, if given (`ViewPane` always gives one)
