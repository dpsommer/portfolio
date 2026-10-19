# Accessibility

What the site does today to be usable without a mouse, with a screen reader and with reduced motion, and what could be improved. The details of each feature are in the docs linked below; this page gathers them in one place.

## Keyboard controls

Every key listener is on `window`, so the keys work without focusing anything on the page. They're all ignored while Alt, Ctrl or Meta is held, or while focus is in a text field (`isTypingTarget` in `ViewPane`), so browser shortcuts and typing are left alone.

| Key | Does | When | Details |
| --- | --- | --- | --- |
| ↑ or W | Step forward | There's a way forward | [navigation.md](navigation.md#arrow-keys) |
| ↓ or S | Step back without turning | There's a way back | [navigation.md](navigation.md#arrow-keys) |
| ← / → or A / D | Turn a quarter turn | Always | [navigation.md](navigation.md#arrow-keys) |
| Tab / Shift+Tab | Select the next or previous object in the view | The view has something to use | [selection.md](selection.md#keys) |
| Escape | Clear the selection | Something is selected | [selection.md](selection.md#keys) |
| Enter / Space | Use the selected object, as a click would | Something is selected | [selection.md](selection.md#keys) |
| Enter / Space | Move the sign's text on | The text box is open | [text-box.md](text-box.md#moving-the-text-on) |

- **Everything the mouse can do, the keyboard can too.** The arrow keys and WASD work the navigation buttons through the same `pressNavButton` path as clicks, including the key-press animation. Enter and Space call the same `interact` function as a click on the sign, mirror or pull.
- **No keyboard trap:** Tab past the last object (or Shift+Tab past the first) clears the selection and lets the browser move focus on. Views with nothing to select leave Tab alone entirely.
- **No accidental repeats:** held arrow and WASD keys repeat on purpose, turning or stepping each time an animation ends. A held Enter or Space acts only once, so it can't skip through the text or reopen a profile.
- **Scrolling:** the arrow keys, and Space when the pane uses it, call `preventDefault` so the page doesn't scroll under the visitor.
- **Visible selection:** the selected object is marked by four bright carets at its corners ([selection.md](selection.md#carets)), drawn in the brightest tone so they stand out from the dimmer room.
- **Input waits for animations:** keys and clicks are ignored while a turn, step, ripple or site switch plays ([architecture.md](architecture.md#animations)). Tab still doesn't move focus during an animation in a view with something to select.

## Controls panel

The Controls panel beside or under the pane ([controls-panel.md](controls-panel.md)) lists every key and what it does, so the controls are discoverable without reading docs.

- It's HTML text, not canvas, so screen readers can read it.
- It's an `<aside>` landmark labelled "Controls", with the keys as `<kbd>`s in a description list. Arrow and Escape keys carry visually hidden names ("Up arrow", "Escape"), with the symbol hidden from screen readers, so they're announced by name rather than as symbols.
- Actions are in the worn tone (6.6:1 contrast), and keys and the heading in the bright tone (16.9:1).

## Screen readers

The scene is drawn on canvases, so assistive tech can't read what's in it. The markup gives it what it can:

- **Room:** the room canvas has `role="img"` and `aria-label="Dungeon view"`. Its `data-place`, `data-heading` and `data-site` attributes record the state, but they're for tests and aren't announced.
- **Panels:** the lower and side panel canvases are `aria-hidden`, since they only repeat what the keys already control.
- **Status:** a visually hidden `role="status"` paragraph (`.view-pane-status`), which screen readers announce politely when it changes:
  - while the sign's text box is open: the current page's full text, all at once rather than letter by letter
  - otherwise, while something is selected: its name ("Welcome sign", "Mirror: GitHub", "Curtain pull")
  - otherwise: empty
- **Language:** `index.html` sets `lang="en"`.

## Reduced motion

With `prefers-reduced-motion: reduce` set, every animation snaps to its end state. The same happens when there's no canvas context.

| Animation | With reduced motion |
| --- | --- |
| Turning and stepping | The view jumps to the new heading or place. The navigation key doesn't animate down. |
| Mirror ripple | No ripple. Opening the mirror goes straight to the profile. |
| Site switch | The pull doesn't tug, the plaque doesn't turn and the glass doesn't shimmer. The new site shows at once. |
| Text box typing | The whole page appears at once. |
| Text box caret | Shown steadily, without blinking. |
| Selection carets | Shown still, without bouncing. |

The check is `prefersReducedMotion` in `ViewPane`, read when each animation starts, so changing the setting takes effect from the next action without a reload.

## Visual design

- **Contrast:** the palette (`src/scene/core/palette.ts`) against the `#0d0d0d` background:

  | Tone | Contrast | Used for |
  | --- | --- | --- |
  | `FOREGROUND` (`#f2efe6`) | 16.9:1 | Text, the sign, the mirror's frame, the carets, usable buttons |
  | `FOREGROUND_WORN` (`#9a968c`) | 6.6:1 | Weathered pixels and secondary lines |
  | `FOREGROUND_DIM` (`#5e5b55`) | 2.9:1 | The room's walls and floor, and unusable buttons |

  Text and everything that can be used are drawn in the brightest tone. The dim tone is kept for scenery and for buttons that do nothing, where low contrast is the point.
- **Text:** the text box uses the 5×7 bitmap font at 2× scale, so each letter is 10×14 canvas pixels before the pane is scaled up to fit the window.
- **Scaling:** the pane, and the Controls panel beside it, scale to the largest size that fits 90% of the window's width and 80% of its height ([pane.md](pane.md#scaling)), so larger windows make everything bigger. Because the sizes come from viewport units, browser zoom doesn't enlarge them (see the suggestions below).
- **Cursors:** the pixel-art cursors are 32 px and change with what's under them ([cursor.md](cursor.md)), so it's clear what a click will do.

## Suggested improvements

Roughly in order of impact:

1. **Describe the view in words.** The room's `aria-label` is always "Dungeon view". It could change with the place and heading, such as "Facing north at the start. A welcome sign hangs ahead. Ways on: west." Then screen reader users would know where they are, which way they face, what's in view and where they can go. The status region could announce the same after each turn or step.
2. **Announce turns and steps.** Moving with the arrow keys currently changes nothing a screen reader hears. Putting the new heading and place in the status region, as the selection already does, would confirm each move.
3. **Give the pane a real focus target.** The keys work through `window` listeners, so the pane never takes focus and focus rings never show. A focusable wrapper (`tabIndex={0}`) with a visible focus style, and a matching label, would fit how keyboard and assistive-tech users expect pages to work. It would also give screen reader users in browse mode a clear place to switch into focus mode.
4. **Expose the objects in the accessibility tree.** The sign, mirror and pull could be hidden-but-focusable `<button>`s laid over their canvas positions, with names like "Mirror: GitHub, opens profile". Then they'd show up in screen readers' lists of controls and work with switch access and voice control ("click mirror"). Tab selection could move real DOM focus to them, with the carets following.
5. **Warn before leaving the site.** Using the mirror navigates away in the same tab. Its label, or the status on selection, could say that it opens the profile (for example, "opens GitHub profile").
6. **Let the visitor control the typing.** Add a way to show text instantly without turning on reduced motion, such as a remembered setting. Or make `TYPING_MS_PER_CHAR` faster when reduced motion isn't set but the visitor has skipped several pages.
7. **Raise the contrast of the dim tone where it carries meaning.** `FOREGROUND_DIM` is 2.9:1, under WCAG's 3:1 for graphical objects. That's fine for scenery, but unusable buttons rely on it, and they also have other cues (no shadow, the blocked cursor). The room's walls and floor do show where the visitor can go. A slightly brighter dim tone, around `#64615b`, would reach 3:1 without losing the look.
8. **Name the page.** The `<title>` is "portfolio". A descriptive title, such as the owner's name and "portfolio", would help in tab lists and screen reader announcements.
9. **Fall back without canvas or JavaScript.** With no canvas or no script there's nothing to see. A `<noscript>` message, and plain links to the profiles in the markup (visually hidden or shown as a fallback), would keep the content reachable.
10. **Support touch and small screens.** On a phone the pane is scaled to fit and the edge zones work by tap, but there are no keys. Swipe gestures for turning and stepping, and checks that the tap targets are big enough when scaled down, would help.
11. **Make browser zoom work.** Everything is sized from `--canvas-pixel`, which comes from `vw` and `vh`, so zooming the page leaves the pane and the Controls text the same size on screen. That falls short of WCAG's 200% text resize. Mixing a `rem` term into `--canvas-pixel` (for example `max(<current>, 0.125rem)`) would let zoom enlarge everything. Above the size the window allows, the page would then scroll.
12. **Test with assistive tech.** Try the site with VoiceOver, NVDA and keyboard-only browsing. Consider an automated check (for example `axe-core` in a Vitest or Playwright test) to catch regressions in the markup.
