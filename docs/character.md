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

Clicking the card, or pressing Enter or Space with it selected, opens the profile view. Doing either again closes it, and so does Escape. Closing with a click or Escape also clears the selection (`closeProfile`). Closing with Enter or Space keeps the card selected, so the next press opens the view again.

- **Room canvas:** `drawProfile` (`profile.ts`) draws in place of the room, from `PROFILE` (`src/ViewPane/aboutText.ts`). The canvas's `data-view` is `profile`, or `room` otherwise. The view shows:
  - **Avatar:** `AVATAR_PROFILE_SIZE` (96) square, in the upper left with a dim outline.
  - **Name:** `FULL_NAME` to the avatar's right, one word per line, at twice the font's size.
  - **Title:** `CHARACTER_TITLE` ("Human Wizard") under the name, in worn text at the font's own size.
  - **Rules:** a dim rule under the avatar runs across the view. A dim rule down the middle splits the area below it into two sections.
  - **Potion:** `potionPixels` (`potion.ts`), centred in the left section. It's a corked, round-bottomed flask with a bright outline. Worn liquid with a bright surface fills it to `current / total` of the glass's inside height, neck included. A worn glint shows on the empty glass. The current and total health (`CARD_HEALTH`) are under it at twice the font's size.
  - **Equipment:** `equipmentPixels` (`equipment.ts`) in the right section. A worn "Equipment" heading sits over a 2×2 grid of dim, corner-less boxes. Each box has its item's icon over the slot's name, in worn text. Every slot reserves the tallest icon's height, so the names line up.
  - **Slots:** `EQUIPMENT` in `aboutText.ts` lists them: Weapon (keyboard), Off-Hand (mouse), Head (headphones, `HEADPHONES_MAP`) and Chest (hoodie, `HOODIE_MAP`). Each slot also has an `item` name for screen readers.
- **Lower panel:** `ABOUT_TEXT` in the text box ([text-box.md](text-box.md)), at the font's own size (`ABOUT_SCALE`). It all shows at once, with no typing and no caret.
- **Input:** the room takes no clicks and shows the blocked hand, except over the avatar ([speech bubble](#speech-bubble)). The navigation buttons and movement keys do nothing. The card stays usable, and it's the only thing Tab selects. Opening the view selects the card, however it was opened, so its carets show on the side panel. That also replaces a room object's selection, so Enter closes the view rather than using the hidden object.
- **Screen readers:** the status reads `PROFILE_DESCRIPTION`. It gives the full name and title, the health, each equipment slot and its item, then the About Me text.

The card can't be used while the sign's text is open. A click on it moves the text on, as clicks anywhere in the pane do.

## Speech bubble

An easter egg: clicking the profile view's avatar (`AVATAR_PROFILE_BOUNDS`) shows a speech bubble under the title. The pointing hand shows over the avatar.

- **Drawing:** `bubblePixels` (`bubble.ts`) draws a solid bright box with rounded corners (`CORNER_INSETS`), and a solid tail on its left pointing at the avatar, `BUBBLE_TAIL` (4) pixels long. The message is dark (`BACKGROUND`) text at twice the font's size (`BUBBLE_TEXT_SCALE`), `BUBBLE_PADDING_X` (7) and `BUBBLE_PADDING_Y` (6) in from the box's edges. The box is left out under the text's pixels, so each pixel is drawn once. The box is sized for the whole message, so it doesn't grow as the text types.
- **Placement:** lined up with the name on the left and with the avatar's bottom edge below (`BUBBLE_TOP` in `profile.ts`). `drawProfile` takes it as an optional `bubble` argument.
- **Messages:** `AVATAR_MESSAGES` (`aboutText.ts`). Each click picks one at random (`pickMessage` in `ViewPane`), never the one shown last, so every click shows a change. The random stream is `createRandom` seeded from `Date.now()` on the first click, so each visit's picks differ. Each message must be at most 13 characters to fit beside the avatar.
- **Timing:** the message types out at the sign's pace (`TYPING_MS_PER_CHAR`) and clears `BUBBLE_MS` (2 s) after it's done. A click while one is showing starts the next message at once. Closing the profile view clears it.
- **Loop:** like the text box's typing, it runs on its own `requestAnimationFrame` loop, redraws only when a character appears, and doesn't count as animating.
- **Reduced motion:** with reduced motion, or no canvas context, the whole message shows at once.
- It's mouse only. It can't be selected with Tab, and the status doesn't announce it.

## Editing the text

`CARD_NAME`, `CARD_HEALTH`, `FULL_NAME`, `CHARACTER_TITLE`, `EQUIPMENT`, `AVATAR_MESSAGES` and `ABOUT_TEXT` are in `src/ViewPane/aboutText.ts`. `CARD_HEALTH` is `{ current, total }`. At this size each number fits at most four digits. `ABOUT_TEXT` is placeholder text for now. It has to fit the text box: about 47 characters a line and 9 lines, where a newline starts a new line. Use only characters that have a glyph in `src/scene/core/pixelFont.ts`.
