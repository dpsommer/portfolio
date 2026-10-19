# Keyboard selection

The room's objects can be used from the keyboard as well as with the mouse. Tab selects an object in the current view, four carets mark it, and Enter or Space uses it as a click would. The selection lives in `ViewPane`, and the carets are drawn by `src/scene/selection/selection.ts`.

## What can be selected

Each object can only be selected from the view it's used from, the same view where it can be clicked (`interactablesIn` in `ViewPane`):

| View | Tab order | Enter or Space |
| --- | --- | --- |
| Start, facing north | Welcome sign | Opens its text box ([text-box.md](text-box.md)) |
| Nook, facing west | Mirror, then curtain pull | The mirror ripples from the centre of its glass (`GLASS_CENTRE`) and goes to its site; the pull switches site ([mirror.md](mirror.md)) |

Other views have nothing to select.

## Keys

The keys follow the same rules as the arrow keys ([navigation.md](navigation.md#arrow-keys)): they work anywhere on the page, and they're ignored with Alt, Ctrl or Meta held or while focus is in a text field.

- **Tab / Shift+Tab:** select the next or previous object. With nothing selected they start from the first or last object. Past either end the selection clears and the key is left to the browser, so focus moves on and keyboard users are never trapped in the pane. In a view with nothing to select, Tab is left to the browser.
- **Escape:** clears the selection.
- **Enter / Space:** use the selected object. A held key acts only once.
- **While an animation plays:** Tab, Enter and Space are ignored, but in a view with something to select they still don't move focus or scroll.
- **While the text box is open:** Enter and Space move its text on, and Tab is left to the browser. Selecting the sign and pressing Enter opens the text box, and the next press moves its text on.

Turning or moving clears the selection, because the object leaves the view. The mouse doesn't change the selection.

The visually hidden `.view-pane-status` element names the selected object ("Welcome sign", "Mirror: GitHub", "Curtain pull") for screen readers, unless the text box is open.

## Carets

- **Shape:** each caret is a solid 5×5 right-angle triangle, with the right angle at the outer corner and the long side facing the object. The four carets are reflections of one another. They're drawn 1:1 in the bright tone, to match the room's one-pixel lines.
- **Position:** the carets sit `SELECTION_GAP` (3) pixels outside the object's on-screen bounds (`INTERACTABLE_BOUNDS` in `ViewPane`):
  - the sign: its board (`signBoardBounds`)
  - the mirror: its frame and ornaments (`pixelBounds` of `mirrorPixels`)
  - the pull: its handle's bright outline
- **Bounce:** `caretInset` sets the bounce. The carets rest for the first `BOUNCE_PERIOD_MS` (2 s) after an object is selected. After that, every period they dip `BOUNCE_DEPTH` (2) pixels in towards the object and back over `BOUNCE_MS` (300 ms).
- **Drawing:** the carets are drawn after the scene by `drawView`, so animation frames (the ripple, the site switch) show them too.
  - The bounce runs on its own `requestAnimationFrame` loop. Like the text box's typing, it doesn't count as animating.
  - The loop redraws the room only when the inset changes and no other animation is drawing it.
  - With reduced motion, or no canvas context, the carets stay still.

## Making an object selectable

1. Add it to `Interactable` and `interactablesIn`, in Tab order, for the view it's used from.
2. Give it bounds in `INTERACTABLE_BOUNDS`, measured in that view.
3. Give it a label in `interactableLabel`.
4. Handle it in `interact`, which both clicks and keys call.
