# Manual Test Checklist

Run through this after deploying (or locally with Start-Planner.bat). Test once on a desktop browser and once on a phone. Open the browser console (F12) first and confirm it stays free of red errors throughout.

## First load and saved data
- [ ] In a private window, the default layout loads: 20 spaces, main floor showing, 32′ × 42′ footprint.
- [ ] In your normal browser, a draft you saved before the update still loads.
- [ ] Refresh after making a change: the change is still there.
- [ ] The tab shows the grid favicon.

## Floors
- [ ] Basement and Main Floor tabs switch the plan and the Spaces panel.
- [ ] + Second Floor adds a Second Floor tab with stairs matching the main floor stairs.
- [ ] Remove Second Floor asks for confirmation, then removes the floor.

## Footprint and walls
- [ ] Changing Width and Depth resizes the footprint and updates the area figures.
- [ ] Front of House moves the FRONT OF HOUSE label; Not Set hides it.
- [ ] Changing Exterior and Interior wall thickness redraws the walls. Both are in inches, and 8.25 is kept exactly.

## Units
- [ ] ft / m switches every label, field, list, check message, and the grid (25 cm squares in metric).
- [ ] Switching back and forth doesn't move or resize anything.
- [ ] In metric, dragging snaps to 10 cm and typed values like 3.5 stay 3.5.
- [ ] The choice is remembered after refresh, and Print / PDF uses the chosen units.

## Rooms
- [ ] Clicking a room on the plan or picking it from the Spaces dropdown selects it.
- [ ] Picking a space, doorway, window, or item on another floor switches to that floor.
- [ ] The info box above each dropdown shows the total and the count on each floor, and says "No ... yet" when empty.
- [ ] After typing in a field (for example, a door width), a single pick from any dropdown selects that record.
- [ ] The dropdowns keep keyboard focus while arrowing through them.
- [ ] Dragging a room moves it in 3″ steps.
- [ ] Typing 15.75 and 15.25 into a room's Width or Depth is kept exactly and shows as 15.75′ and 15.25′ on the plan.
- [ ] Name, Type, Floor, Partitions, Thickness, X, Y, Width, and Depth all update the plan.
- [ ] Walls On checkboxes add and remove partition walls (exterior sides are grayed out).
- [ ] Duplicate, + Add Room, and Remove (with confirmation) all work.
- [ ] Align All Staircases lines up the basement and second floor stairs with the main floor.

## Sidebar layout

- [ ] At 1500px wide or more, Spaces and Furniture & Fixtures sit side by side with Doorways and Windows below, and all four boxes are the same width and height.
- [ ] Below 1500px the four boxes stack in one column, and nothing is clipped.

## Undo

- [ ] Undo is off on a fresh page, turns on after a change, and turns off again when the history is used up.
- [ ] Selecting, zooming, switching floors, and changing units do not add undo steps.
- [ ] One drag is one undo step, and undo puts the thing back exactly where it was.
- [ ] Undo works for adding, removing, and editing spaces, doorways, windows, and items, and for footprint and wall changes, rotate, Reset to Defaults, and import.
- [ ] Undo switches to the floor where the change was made. Undoing Add Second Floor while on it returns to the main floor.
- [ ] Ctrl+Z (Cmd+Z) undoes when focus is not in a text or number field, and does not undo the layout while typing in one.
- [ ] Reloading the page starts with nothing to undo.

## Suggested sizes

- [ ] Spaces, Furniture & Fixtures, Doorways, and Windows each show: summary, dropdown, Add button, Suggested sizes menu, then the fields.
- [ ] Each Suggested sizes menu is off until something is selected, and it applies the chosen size to the selected space, doorway, window, or item.
- [ ] Half Bath and Full Bath set the space's name, type, and size. Windows, doorways, and items stay centered where they were when resized.
- [ ] The menu shows the size the selected record already has, or "Suggested sizes" when it matches none. Arrow keys work on it.
- [ ] Switching to metric relabels the menus.

## Half walls
- [ ] Half Walls checkboxes are disabled for sides with no wall and for exterior sides, and enabled once that side's wall is checked.
- [ ] Checking a Half Wall side draws that wall lighter and dashed. Unchecking the Walls On box for that side removes the wall and clears its half wall.
- [ ] Where two rooms share a wall and one says full, the full wall shows.
- [ ] Half walls survive Rotate, Duplicate Room, Export, and Import, and count in the walls area total.

## Doorways and windows
- [ ] + Add Doorway works on an enclosed room and is disabled for open plan rooms.
- [ ] Wall, Hinge, From Corner, Width, and Door Type all update the doorway; dragging slides it along the wall.
- [ ] Setting Door Type to Cased Opening (No Door) draws a dashed opening with end ticks, greys out Hinge, still cuts the wall, and can be dragged, selected, and focused by keyboard.
- [ ] A doorway on an outside wall shows the ENTRANCE label.
- [ ] + Add Window, dragging, Wall, Width, From Corner, and Remove Window all work.
- [ ] Dragging a window toward another wall moves it there, and it doesn't flicker between walls near a corner.
- [ ] Center on Room centers the selected window on its room's wall, the button names the room, and it is disabled when no room touches that wall.

## Furniture and fixtures
- [ ] + Add Item places the chosen preset in the selected room.
- [ ] Name, X, Y, Width, Depth, Rotate 90°, Duplicate, and Remove all work.
- [ ] Moving an item into a wall or another item shows it in red and adds an Item Checks warning.
- [ ] Show Items hides and shows the item layer.

## Checks and figures
- [ ] Overlapping two rooms adds an error to Layout Checks.
- [ ] Moving the main floor stairs away from the basement stairs adds a "do not line up" error.
- [ ] The four area figures update as you change the plan.

## Plan tools
- [ ] Rotate left and right turn the whole house, including doors, windows, and the front marker.
- [ ] Zoom out stops at 50% and zoom in stops at 250%.
- [ ] Dragging the bar under the plan resizes it; double-clicking fits the plan; the size is remembered after refresh.

## Keyboard
- [ ] Tab reaches the rooms on the plan and shows a dashed blue edge on the focused one.
- [ ] Arrow keys move the focused room repeatedly (focus stays on it); Shift + arrows moves 1′.
- [ ] In a confirmation dialog, Tab stays inside it and Escape closes it.

## Export, import, reset, print
- [ ] Export Layout downloads a .json file.
- [ ] Import Layout loads that file after confirming; importing a non-layout file shows "Couldn’t Import That File" and changes nothing.
- [ ] Reset to Defaults asks for confirmation, then restores the default layout.
- [ ] Print / PDF shows one landscape page per floor with a room list and no selection highlights.

## Phone
- [ ] The top buttons collapse into a Menu button, and the menu opens and closes.
- [ ] With Drag to Move off, swiping scrolls the page and tapping selects.
- [ ] With Drag to Move on, dragging moves rooms and items.

## Link preview
- [ ] Paste the live URL into a LinkedIn post draft (don't publish) or the LinkedIn Post Inspector and confirm the preview image and title appear.
