# Duncan Sommerville Web Portfolio

This repository defines a typescript-based web portfolio. The site is in the style of an old first-person point-and-click dungeon crawler game. The landing page view is of a welcome sign. Visitors can then click the edges of the view pane to turn right or left and navigate around the virtual room.

The wall to the left one space away from the starting point has a mirror on it. At the top of the mirror is a dial with left and right buttons. Clicking either button rotates the dial. Each face of the dial has a website name on it, such as LinkedIn or GitHub. When the mirror is clicked, an animation plays, showing a wave rippling out from where the viewer clicked to the edges of the mirror, similar to water surface ripples from a drop of water. After the short animation, the viewer's browser redirects them to the relevant profile on the site selected by the dial.

## UI

The room is displayed using HTML5 canvas. It uses a dark layout with off-white text. The elements of the room use the same off-white colour and are reminiscent of 8-bit pixel graphics. The walls of the room are sparse pixelized brick patterns.

The mouse cursor is a large pointer, also pixelized. At the edges of the view pane it becomes a turning arrow in that direction, and when the viewer can move forward it becomes a forward-pointing arrow when hovered in the centre of the pane.

Any text is in a medium 8-bit retro font.
