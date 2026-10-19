# Keyboard selection

The room's objects, and the character card in the side panel, can be used from the keyboard as well as with the mouse. Tab selects an object in the current view, four carets mark it, and Enter or Space uses it as a click would. The selection lives in `ViewPane`, and the carets are drawn by `src/scene/selection/selection.ts`.

## What can be selected

Each object can only be selected from the view it's used from, the same view where it can be clicked (`interactablesIn` in `ViewPane`):

| View | Tab order | Enter or Space |
| --- | --- | --- |
| In front of the sign (`sign`), facing north | Welcome sign, then the card | The sign opens its text box ([text-box.md](text-box.md)) |
| Nook, facing west | Mirror, then curtain pull, then the card | The mirror ripples from the centre of its glass (`GLASS_CENTRE`) and goes to its site; the pull switches site ([mirror.md](mirror.md)) |
| Any other view, or while the profile view is open | The card | |

The character card is always usable, so it's always last in the Tab order, and in a view with nothing else it's the only thing to select. Enter or Space with it selected opens the profile view, or closes it ([character.md](character.md)).

## Keys

The keys follow the same rules as the arrow keys ([navigation.md](navigation.md#arrow-keys)): they work anywhere on the page, and they're ignored with Alt, Ctrl or Meta held or while focus is in a text field.

- **Tab / Shift+Tab:** select the next or previous object. With nothing selected they start from the first or last object. Past either end the selection clears and the key is left to the browser, so focus moves on and keyboard users are never trapped in the pane.
- **Escape:** closes the profile view if it's open, and clears the selection either way.
- **Enter / Space:** use the selected object. A held key acts only once. With nothing selected, they select and use the first room object in the view's Tab order (the sign, or the mirror). The card isn't in the room, so in a view with nothing else, or while the profile view is open, they do nothing and the key is left to the browser.
- **While an animation plays:** Tab, Enter and Space are ignored, but they still don't move focus or scroll.
- **While the text box is open:** Enter and Space move its text on, and Tab is left to the browser. Selecting the sign and pressing Enter opens the text box, and the next press moves its text on.

Turning or moving clears the selection of a room object, because it leaves the view. The card stays selected, since it never leaves view. The mouse doesn't change the selection, except that opening the profile view with a click selects the card ([character.md](character.md#profile-view)).

The visually hidden `.view-pane-status` element names the selected object ("Welcome sign", "Mirror: GitHub", "Curtain pull", "Character card: Duncan") for screen readers, unless the text box or the profile view is open.

## Carets

- **Shape:** each caret is a solid 5×5 right-angle triangle, with the right angle at the outer corner and the long side facing the object. The four carets are reflections of one another. They're drawn 1:1 in the bright tone, to match the room's one-pixel lines.
- **Position:** the carets sit `SELECTION_GAP` (3) pixels outside the object's on-screen bounds (`INTERACTABLE_BOUNDS` in `ViewPane`):
  - the sign: its board (`pixelBounds` of `signPixels`' `FOREGROUND` pixels)
  - the mirror: its frame and ornaments (`pixelBounds` of `mirrorPixels`)
  - the pull: its handle's bright outline
  - the card: its border (`CARD_BOUNDS`), on the side panel's canvas rather than the room's
- **Bounce:** `caretInset` sets the bounce. The carets rest for the first `BOUNCE_PERIOD_MS` (2 s) after an object is selected. After that, every period they dip `BOUNCE_DEPTH` (2) pixels in towards the object and back over `BOUNCE_MS` (300 ms).
- **Drawing:** the carets around a room object are drawn after the scene by `drawView`, so animation frames (the ripple, the site switch) show them too. The card's are drawn by `drawSidePanel`.
  - The bounce runs on its own `requestAnimationFrame` loop. Like the text box's typing, it doesn't count as animating.
  - The loop redraws the canvas the carets are on only when the inset changes. It redraws the room only when no other animation is drawing it and the profile view isn't covering it.
  - With reduced motion, or no canvas context, the carets stay still.

## Making an object selectable

1. Add it to `RoomInteractable` and `interactablesIn`, in Tab order before the card, for the view it's used from.
2. Give it bounds in `INTERACTABLE_BOUNDS`, measured in that view.
3. Give it a label in `interactableLabels`.
4. Handle it in `interact`, which both clicks and keys call.

Something outside the room, like the card, goes in `Interactable` instead. It draws its own carets on its own canvas, and the selection effect and the bounce loop have to redraw that canvas for it.
