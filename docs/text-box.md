# Text box

The lower panel doubles as a text box. Clicking the welcome sign, from in front of it facing north, hides the navigation panel and types out what the sign says. The box is drawn by `drawTextBox` (`src/scene/textBox/textBox.ts`) and driven by `ViewPane`.

## Pages

The sign's text is `SIGN_PAGES` in `src/ViewPane/signText.ts`, one page per click. A newline starts a new line. Longer lines wrap between words (`wrapText`), and a word longer than a line is broken where it overflows.

Each page must fit in the box. `textBoxLayout` gives the characters per line and the lines that fit above the caret in the panel.

## Layout

- **Text:** the 5×7 font at `TEXT_SCALE`, in the bright tone. It starts `TEXT_MARGIN` pixels in from the top left, with 6 pixels between lines.
- **Caret:** a small down-pointing triangle at the same scale, inset by the margin from the bottom right.

## Typing

| Setting | Default | Does |
| --- | --- | --- |
| `TYPING_MS_PER_CHAR` | 50 ms | How long each character takes to appear. |
| `CARET_BLINK_MS` | 600 ms | How long the caret stays on, then off, once a page is typed. |

- When a page opens, its first character shows at once and one more follows every `TYPING_MS_PER_CHAR`. Spaces count as characters.
- Once the page is done it stays up, and the caret blinks until the page is moved on.
- The typing loop runs on its own `requestAnimationFrame` loop, not through `runAnimation` (see [architecture.md](architecture.md#animations)). It redraws only when a character or the caret changes, and it doesn't count as animating.
- **Reduced motion:** with reduced motion, or no canvas context, the whole page shows at once and the caret stays on.

## Moving the text on

While the box is open, a click anywhere in the pane (the room, the panels, the bands or the frame) bubbles up to `.view-pane-frame`, which moves the text on. Enter and Space do the same, from anywhere on the page:

1. While a page is still typing, a click or key press shows the rest of it at once.
2. Once it's typed, it goes to the next page.
3. After the last page, it closes the box and the navigation panel comes back.

Enter and Space follow the arrow keys' rules ([navigation.md](navigation.md#arrow-keys)). They're ignored with Alt, Ctrl or Meta held, or while focus is in a text field, and otherwise they don't scroll the page. A held key moves the text on only once, not on every repeat. On their own they don't open the sign, because a view can have more than one thing to use (the mirror and the pull in the nook). To open it from the keyboard, select it with Tab first ([selection.md](selection.md)).

Meanwhile the room's clicks don't turn or move the visitor, and the panel's buttons and the arrow keys do nothing. The pointing hand shows everywhere in the pane (see [cursor.md](cursor.md)).

## Accessibility

The panels are hidden from assistive tech, so the open page's text is also put in a visually hidden `role="status"` element (`.view-pane-status`), where screen readers announce it.
