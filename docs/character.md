# Character card

The character card fills the top of the side panel. It shows the owner's name, their GitHub avatar, small keyboard and mouse icons and a health readout. Using it opens the profile view, which covers the room with a larger avatar and the full name and puts an About Me text in the lower panel. The drawing code is in `src/scene/character/`. `ViewPane` holds the state and handles input.

## Card

`cardPixels` (`card.ts`) draws the card inside `CARD_BOUNDS`:

- **Border:** a one-pixel worn outline with its corner pixels left out. It sits `CARD_MARGIN` (9) in from the panel's edges, which leaves room for the selection carets.
- **Name:** `CARD_NAME` ("Duncan", `src/ViewPane/aboutText.ts`), centred at the top at twice the font's size. Below it is a dim rule.
- **Avatar:** a square `AVATAR_CARD_SIZE` (72) cells wide, below the name on the left, in a dim outline.
- **Icons and health:** `KEYBOARD_MAP` and `MOUSE_MAP` (`icons.ts`), then the health readout (`CARD_HEALTH`, `src/ViewPane/aboutText.ts`), stacked in that order.
  - **Rules:** a dim rule separates each one from the next, with `RULE_GAP` (3) pixels above and below it, and stops `RULE_INSET` (2) short of the column's edges.
  - **Placement:** the icons are centred in the column between the avatar's outline and the card's border. The stack as a whole is centred on the avatar's height.
  - **Health:** `healthPixels` draws the readout as a diagonal fraction. The current is in the top left and the total in the bottom right, both bold at `HEALTH_SCALE` (1). A worn slash sits centred between them, `HEALTH_SLASH_GAP` (1) row from each. The numbers are inset `HEALTH_INSET` (3) from the column's edges. The readout sits `HEALTH_GAP` (6) below the second rule, twice the other rules' gaps, so it stands apart. Bold widens every pixel of the glyphs by one to the right.
  - **Map format:** the icons use the logos' format: `#` full, `+` worn, `-` dim, `.` empty.

`drawSidePanel` clears the panel, draws the card and, while it's selected, draws the selection carets around `CARD_BOUNDS`.

## Avatar

The avatar is the GitHub profile picture, committed as `src/assets/avatar.jpg` (400×400), like the mirror's screenshots. To update it, download the new picture over that file.

`ViewPane` loads it twice on mount, at the card's size and at the profile view's, so that each copy is quantised at the size it's drawn. `loadPicture` scales the image to cover the grid. `quantisePicture` (`picture.ts`) then does two things:

- It stretches the levels (`stretchLevels`) so the photo's luminance spans the full range, clipping `LEVELS_CLIP` (2%) at each end. A dim photo would otherwise come out mostly as background.
- It quantises with the mirror's `quantisePreview`: the scene's four tones, with 4×4 ordered dithering.

`picturePixels` draws the result, leaving background cells out. Until the avatar loads, or if it fails to load, only its outline shows.

## Profile view

Clicking the card, or pressing Enter or Space with it selected, opens the profile view. Doing either again closes it, and so does Escape.

- **Room canvas:** `drawProfile` (`profile.ts`) draws in place of the room. It shows the avatar, `AVATAR_PROFILE_SIZE` (96) square, in the upper left with a dim outline. To its right is `FULL_NAME`, one word per line, at twice the font's size. The canvas's `data-view` is `profile`, or `room` otherwise.
- **Lower panel:** `ABOUT_TEXT` in the text box ([text-box.md](text-box.md)), at the font's own size (`ABOUT_SCALE`). It all shows at once, with no typing and no caret.
- **Input:** the room takes no clicks and shows the blocked hand. The navigation buttons and movement keys do nothing. The card stays usable, and it's the only thing Tab selects. Opening the view selects the card, however it was opened, so its carets show on the side panel. That also replaces a room object's selection, so Enter closes the view rather than using the hidden object.
- **Screen readers:** the status reads the full name and the About Me text.

The card can't be used while the sign's text is open. A click on it moves the text on, as clicks anywhere in the pane do.

## Editing the text

`CARD_NAME`, `CARD_HEALTH`, `FULL_NAME` and `ABOUT_TEXT` are in `src/ViewPane/aboutText.ts`. `CARD_HEALTH` is `{ current, total }`. At this size each number fits at most four digits. `ABOUT_TEXT` is placeholder text for now. It has to fit the text box: about 47 characters a line and 9 lines, where a newline starts a new line. Use only characters that have a glyph in `src/scene/core/pixelFont.ts`.
