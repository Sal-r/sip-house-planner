# Manual Test Checklist

Run through this after deploying (or locally with Start-Planner.bat). Test once on a desktop browser and once on a phone. Open the browser console (F12) first and confirm it stays free of red errors throughout.

## First load and saved data
- [ ] In a private window, the default layout loads from templates/default-layout.json: 11 spaces, main floor showing, 42′ × 32′ footprint.
- [ ] In your normal browser, a draft you saved before the update still loads.
- [ ] Refresh after making a change: the change is still there.
- [ ] The tab shows the grid favicon.

## Floors
- [ ] Basement and Main Floor tabs switch the plan and the Rooms & Spaces panel.
- [ ] The Basement and Second Floor tabs each have a small button on their left edge, about a quarter of the tab's width. It shows − when the floor is on and + when it is off.
- [ ] Clicking + on Second Floor turns the tab on, opens it, and adds stairs matching the main floor stairs.
- [ ] Clicking − on Second Floor asks for confirmation, then removes the floor. The tab stays, dimmed and not clickable.
- [ ] The Second Floor and Basement confirmations list the same things they delete: spaces and their doorways, windows, and items.
- [ ] Clicking − on Basement asks for confirmation, dims the tab, and hides Basement in the Floor dropdown.
- [ ] Undo after removing the basement brings the floor, its spaces, and its items back.
- [ ] Clicking + on Basement turns the tab on with stairs matching the main floor stairs. On a plan with no main stairs, it adds stairs inside the footprint and the checks say the main floor needs stairs.
- [ ] With no basement, reloading the page keeps it removed, and the stairs checks no longer mention the basement.
- [ ] Importing a file saved before this option existed still shows the basement.
- [ ] On a phone, the floor tabs wrap onto a second row and the page does not scroll sideways.

## Footprint and walls
- [ ] Changing Width and Depth resizes the footprint and updates the area figures.
- [ ] Width and Depth accept tiny house sizes down to 8′ (2.4 m), such as 8.5′ × 24′. Smaller values are rejected and the old value stays.
- [ ] The Width and Depth arrows step by 0.25′ (0.05 m), and typed values snap to 3″ (5 cm), so 15.8 becomes 15.75.
- [ ] Front of House moves the FRONT OF HOUSE label; Not Set hides it.
- [ ] FRONT OF HOUSE, ENTRANCE, and the dimension labels are fully visible with the front on every side (top, bottom, left, right), in feet and metric, for a tiny footprint like 8′ × 12′ and a large one like 80′ × 80′.
- [ ] Exterior walls are dark teal and interior partition walls are gray, on screen and in the Print / PDF sheet. Half walls stay dashed.
- [ ] Changing Exterior and Interior wall thickness redraws the walls. Both are in inches, and 8.25 is kept exactly.

## Heights
- [ ] The Walls panel shows Wall Height and Floor Thickness in inches (centimeters in metric). A new layout shows 96 and 12 inches.
- [ ] Wall Height edits the open floor only. Switching to the Second Floor or Basement tab shows that floor's own height, and the help line names the floor.
- [ ] With a second floor on, the Main Floor help line shows the floor to floor height (wall height plus floor thickness) up to the Second Floor. The Basement help line shows its height up to the Main Floor.
- [ ] A new window shows Sill Height 36 and Head Height 80 inches. A new doorway shows Head Height 80 inches.
- [ ] A window sill at or above its head, or a head at or below its sill, is ignored and the field goes back to the saved value.
- [ ] A window or doorway head taller than the floor's wall height shows a Layout Checks warning, and the warning clears when the height is fixed.
- [ ] Heights survive a reload, Export Layout and Import Layout, and Undo. Switching ft and m keeps the same heights.
- [ ] A layout exported before heights existed (or a template) still loads with 8′ walls, 3′ sills, and 80 inch heads.
- [ ] At 1500px and wider the Walls panel is wide enough to show both height fields without cutting off the labels.

## Lot and setback
- [ ] The top row has a Building Footprint box and a separate Lot Footprint box side by side. The lot fields stay off until Show Lot is on.
- [ ] The first time Show Lot is turned on, the lot is the house plus 20 ft on every side with the house centered, a dashed lot line and a dotted setback line (3 ft inside it) are drawn, a "Lot W × D" label shows, and the whole lot is visible in the plan.
- [ ] House From Left set to 2 ft shows a warning naming the left lot line, the distance, and the 3 ft setback. A negative value shows an error that the house goes past the lot line. Raising it to 3 ft clears the warning, and a setback of 0 clears it too.
- [ ] Setback and the lot fields accept metric entry (setback 1 m works). A new lot shows the 3 ft setback as 0.91 m.
- [ ] Center House on Lot centers the house. Changing the lot width or depth redraws the lot and its setback line.
- [ ] An outdoor space within 3 ft of a lot line shows a "may be subject to the setback" warning, and one past the line shows an error. The warning only appears on the floor the outdoor space is on.
- [ ] Rotating the house turns the lot with it, and a warning for the left side becomes a warning for the top side after a right turn.
- [ ] Turning Show Lot off hides the lines and clears the lot warnings, and turning it back on keeps the values you set. Undo steps back through lot edits.
- [ ] The lot survives a reload, Export Layout, and Import Layout. A file from before the lot existed, and all templates, open with the lot off. A damaged lot in a file falls back to off.
- [ ] Print / PDF shows the lot lines and label on each floor's page.
- [ ] At 1500, 1700, and 1906 px wide the Building Footprint, Lot Footprint, Walls, and Layout Checks boxes all fit on the top row with no sideways scrolling, and their titles and fields are not cut off. Under 1500px the Lot Footprint box follows Building Footprint.

## Utility markers and notes
- [ ] The item Suggested sizes menu has headings Notes (Note) and Utility Markers (Electrical, HVAC, Plumbing), still in A to Z order.
- [ ] Electrical draws a lightning bolt, Plumbing a water drop, and HVAC a four-blade fan, each centered in a small box. The colors read in both themes.
- [ ] A marker or note placed on a wall, on top of furniture, or in a doorway shows no Item Checks warning. A marker outside the footprint shows no warning either. Furniture still gets its checks.
- [ ] A Note shows its name as dashed-box text that wraps and shrinks to fit. Renaming it to a long sentence (up to 120 characters) works, and enlarging the box makes the text bigger.
- [ ] A note on the Main Floor does not appear on the Basement or Second Floor, and each floor's print page shows only its own notes and markers.
- [ ] Hiding Show Items hides markers and notes too.
- [ ] Switching a marker to a furniture preset turns it back into a normal item, and Undo restores the marker. Markers and notes survive a reload, Export Layout, and Import Layout.

## Outdoor spaces
- [ ] The room Type menu has Outdoor Space. The Suggested sizes menu lists Deck, Full Bath, Garage - 1 Car, Garage - 2 Car, Half Bath, Porch, Shed in A to Z order.
- [ ] Add Room, then pick Porch (or any outdoor size). The space moves to just outside the front wall, centered (the bottom wall if the front is Not Set), and the plan grows so nothing is cut off. Picking one on a space already outside only resizes it.
- [ ] An outdoor space has no Partitions walls controls to edit, Add Doorway stays off for it, and it is drawn with a dashed outline and a gray fill in both themes.
- [ ] Dragging an outdoor space anywhere, and typing negative X or Y, works. The plan area follows it, and the view does not jump when you switch floor tabs.
- [ ] A porch on the front wall pushes the ENTRANCE label, FRONT OF HOUSE, and the dimension line out past itself. A deck on the bottom or a garage on the left moves its dimension line out too. Nothing overlaps the outdoor space's own name.
- [ ] No "extends beyond the footprint" error for an outdoor space, and that error still shows for a normal room placed outside. An outdoor space overlapping a bedroom still shows the overlap error.
- [ ] The four house area figures do not change when outdoor spaces are added. The Rooms & Spaces box shows "Outdoor: N sq ft, not in the house areas." and the selected outdoor space says it is not counted in the house areas.
- [ ] Duplicating an outdoor space puts the copy beside it. Rotating the house, Undo, a reload, Export Layout, and Import Layout all keep the outdoor spaces where they were. Metric shows the outdoor area in m².
- [ ] Print / PDF includes the outdoor spaces in the plan and marks them "(outdoor)" in the room list.

## Stairs
- [ ] The room Type menu has Hallway and Stairs as separate choices. Choosing Stairs shows Stair Type, Goes Up Toward, Landing, and an info line. Other types hide them.
- [ ] Each stair type draws on the plan: Straight (tread lines and arrow), Turn Left and Turn Right (a flight, a landing square, and a flight across), U Shape (two flights side by side with a landing across the end), Spiral (circle with radiating treads and a curved arrow).
- [ ] Goes Up Toward turns the stairs to Top, Right, Bottom, or Left. Turns (Left or Right) mirrors a U Shape and reverses the winding of a Spiral. Turns only shows for U Shape and Spiral, and Landing is hidden for Spiral.
- [ ] The arrow reads UP on a floor with a floor above it and DN on the top floor. The label and room name stay readable over the tread lines in both themes.
- [ ] Landing: a straight stair with 0 has none and with a depth shows a landing partway up. Stairs that turn will not go below 12 in. Changing the type to Straight clears the landing, and changing to a turn type sets 36 in.
- [ ] The info line gives the risers, the riser height, and the tread depth. Changing Wall Height or Floor Thickness changes the risers (the main floor stair follows the main floor height when there is a second floor, and the basement height when there is only a basement). Alone on one floor it says to add a basement or second floor.
- [ ] A box too short for its treads shows a Layout Checks hint about tread depth. A stair under 3 ft wide or a spiral under 5 ft across also shows a hint.
- [ ] Rotating the house keeps each stair going the same way relative to the house. Duplicate copies the stair settings. Undo restores them, and they survive a reload, Export Layout, and Import Layout.
- [ ] Adding a second floor or basement creates stairs that copy the main stair type and direction. Align All Staircases still lines the boxes up (it does not check the type).
- [ ] An older file where the stairs were hallways (or any file with a space named Stairs) opens as Straight stairs. All templates still open.

## Units
- [ ] ft / m switches every label, field, list, check message, and the grid (25 cm squares in metric).
- [ ] Switching back and forth doesn't move or resize anything.
- [ ] In metric, dragging snaps to 5 cm and typed values like 3.5 stay 3.5.
- [ ] The choice is remembered after refresh, and Print / PDF uses the chosen units.

## Rooms
- [ ] Clicking a room on the plan or picking it from the Rooms & Spaces dropdown selects it.
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

- [ ] At 1500px wide or more, Rooms & Spaces and Furniture & Fixtures sit side by side with Doorways and Windows below, and all four boxes are the same width and height.
- [ ] Below 1500px the four boxes stack in one column, and nothing is clipped.

## Undo

- [ ] Undo is off on a fresh page, turns on after a change, and turns off again when the history is used up.
- [ ] Selecting, zooming, switching floors, and changing units do not add undo steps.
- [ ] One drag is one undo step, and undo puts the thing back exactly where it was.
- [ ] Undo works for adding, removing, and editing spaces, doorways, windows, and items, and for footprint and wall changes, rotate, Reset to Defaults, and import.
- [ ] Undo switches to the floor where the change was made. Undoing the + on Second Floor while on it returns to the main floor.
- [ ] Ctrl+Z (Cmd+Z) undoes when focus is not in a text or number field, and does not undo the layout while typing in one.
- [ ] Reloading the page starts with nothing to undo.

## Suggested sizes

- [ ] Rooms & Spaces, Furniture & Fixtures, Doorways, and Windows each show: summary, dropdown, Add button, Suggested sizes menu, then the fields.
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
- [ ] Wall, Hinge, From Corner, Width, and Door Type all update the doorway; dragging slides it along the wall in 3″ steps.
- [ ] Typing 7.1 in a doorway's From Corner becomes 7, and 7.13 becomes 7.25. Rooms, windows, and items snap the same way.
- [ ] Setting Door Type to Cased Opening (No Door) draws a dashed opening with end ticks, greys out Hinge, still cuts the wall, and can be dragged, selected, and focused by keyboard.
- [ ] Door Type: Bifold Door Folds Into or Out of Selected Room draws a V of two panels with a dashed quarter circle half the door width. Over 4′ wide it draws a pair at each jamb (four panels) and the Hinge control is disabled.
- [ ] A bifold stays a bifold after Rotate House, a reload, and Export then Import. Switching back to a swinging door or cased opening removes it.
- [ ] An item inside a bifold's quarter circle shows "is in the swing of". An item beyond half the door width does not. A bifold can sit right at a corner without a warning.
- [ ] A doorway on an outside wall shows the ENTRANCE label.
- [ ] + Add Window, dragging, Wall, Width, From Corner, and Remove Window all work.
- [ ] Dragging a window toward another wall moves it there, and it doesn't flicker between walls near a corner.
- [ ] Center on Room centers the selected window on its room's wall, the button names the room, and it is disabled when no room touches that wall.

## Furniture and fixtures
- [ ] The item Suggested sizes menu has headings in A to Z order (Bathroom, Bedroom, Dining, Kitchen, Laundry, Living, Mechanical, Office, Storage and Workshop), and the items under each heading are A to Z. The beds read Bed - Bunk, Bed - Full, Bed - King, Bed - Queen, Bed - Twin.
- [ ] Picking a preset renames and resizes the selected item, and the menu then shows that preset. An item can be placed in any room whatever its heading.
- [ ] Items in the templates (Bed - Queen, Stove / Range) show their matching size in the menu.
- [ ] + Add Item places the chosen preset in the selected room.
- [ ] Name, X, Y, Width, Depth, Rotate 90°, Duplicate, and Remove all work.
- [ ] Long item names wrap onto more lines (Round Table shows as Round, then Table), tall narrow items read bottom to top, and a name is cut off with … only when nothing else fits.
- [ ] Pressing R turns the selected item 90°. Typing the letter r in a field does nothing, and Ctrl+R still reloads the page.
- [ ] Moving an item into a wall or another item shows it in red and adds an Item Checks warning.
- [ ] Show Items hides and shows the item layer.

## Checks and figures
- [ ] An item placed in a doorway shows "blocks" in the Furniture & Fixtures checks and turns red on the plan.
- [ ] An item inside a door's swing shows "is in the swing of" and turns red. An item outside the quarter circle does not.
- [ ] Two doors whose swings cross show "The swings of ... overlap" in Layout Checks. Cased openings have no swing and are never flagged.
- [ ] The default layout and the Tiny Cottage show no door swing warnings.
- [ ] A cased opening (Door Type: Cased Opening) can sit 0.25′ from a corner, or flush with the end of the wall, with no warning. One that runs past the wall warns. A swinging door within 0.5′ of a corner still warns.
- [ ] Two windows, a window and an entrance door, or two doorways that overlap by 0.25′ on the same wall show a warning. Ones that only touch do not.
- [ ] Overlapping two rooms adds an error to Layout Checks.
- [ ] Moving the main floor stairs away from the basement stairs adds a "do not line up" error.
- [ ] The four area figures update as you change the plan.

## Plan tools
- [ ] The four area tiles at the top are narrower than before. Putting a five digit area like 99,999 sq ft in each one still fits with no clipping at 1500, 1700, and 1906 px wide, in feet and in meters.
- [ ] Rotate Building (in the Building Footprint box) turns the house 90° left or right inside the lot. Width and depth swap, the rooms, doors, windows, items, stairs, outdoor spaces, and front marker turn with it, the lot does not turn, and the house stays centered on the same spot on the lot (From Left and From Top change to match). Layout Checks update for the new position.
- [ ] Three Rotate Building right turns equal one turn left, and four turns return everything to where it started. Undo steps back one turn at a time.
- [ ] With the lot off, Rotate Building still works and the lot values are kept for when it is turned back on.
- [ ] The rotate buttons above the plan still turn the whole plan, lot included, and their tooltips say so.
- [ ] Rotate left and right turn the whole house, including doors, windows, and the front marker.
- [ ] Zoom out stops at 50% and zoom in stops at 250%.
- [ ] Dragging the bar under the plan resizes it; double-clicking fits the plan; the size is remembered after refresh.

## Keyboard
- [ ] Tab reaches the rooms on the plan and shows a dashed blue edge on the focused one.
- [ ] Arrow keys move the focused room, doorway, window, or item 3″ (5 cm in metric) repeatedly and focus stays on it. Shift + arrows moves 1′ (25 cm).
- [ ] In a confirmation dialog, Tab stays inside it and Escape closes it.

## Templates
- [ ] The Templates menu lists Default Layout, Tiny Cottage, Alvin, Simon, and Theodore, and picking one asks for confirmation first.
- [ ] Each Extreme Panels template loads with 9 in exterior and 4.5 in interior walls, no basement, and a credit line with a working link at the top of the plan.
- [ ] Undo right after loading a template brings the previous layout back and hides the credit.
- [ ] Reset to Defaults on a template restores that template, including its credit. On the default layout, or a layout that did not come from a template, it restores the default layout and clears the credit.
- [ ] Print / PDF on a template mentions the credit in the note.
- [ ] Opened straight from disk (file://), picking a template explains that it needs to be served over http.

## Export, import, reset, print
- [ ] Export Layout downloads a .json file.
- [ ] Import Layout loads that file after confirming; importing a non-layout file shows "Couldn’t Import That File" and changes nothing.
- [ ] Reset to Defaults asks for confirmation and names what it will restore (the loaded template or the default layout). If the template file can't be read, it shows an error and changes nothing.
- [ ] Print / PDF shows one landscape page per floor with a room list and no selection highlights.

## Color theme
- [ ] A first visit (private window) opens in the dark theme, with the moon button highlighted.
- [ ] The sun button switches to light and the moon button switches back. The choice is still there after a reload.
- [ ] In the dark theme the plan sits on a muted gray sheet and the six room colors are softer than in the light theme, but still easy to tell apart. Room names and the size text under them are easy to read, and the dimension, ENTRANCE, and FRONT OF HOUSE labels are too. Walls and items keep their colors. In the light theme the sheet and room colors are the original ones.
- [ ] Changing a room's Type changes its color in both themes. A room from an imported file with an unknown type draws as Utility / Storage.
- [ ] Print / PDF is light even when the app is dark.
- [ ] With browser storage blocked, the page still loads dark and the switch still works for that visit.
- [ ] On a phone the sun and moon buttons are the first row of the Menu, and the top bar stays on one line.
- [ ] Text in both themes is readable: panels, inputs, dropdowns, checks (warning and error), the confirmation dialog, and disabled controls.

## Phone
- [ ] On a phone or a window narrower than 800px, a banner under the top bar says to use a desktop browser. Dismiss hides it, and it comes back in a new browser session. It does not show on a wide desktop window.
- [ ] The top buttons collapse into a Menu button, and the menu opens and closes.
- [ ] With Drag to Move off, swiping scrolls the page and tapping selects.
- [ ] With Drag to Move on, dragging moves rooms and items.

## Link preview
- [ ] Paste the live URL into a LinkedIn post draft (don't publish) or the LinkedIn Post Inspector and confirm the preview image and title appear.
