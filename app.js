/*
 * SIP House Planner
 * A concept floor plan tool. Plain JavaScript, no build step, no dependencies.
 *
 * Coordinates are in feet. The origin is the top-left corner of the
 * footprint, x grows to the right, and y grows toward the bottom.
 * Sides are named by compass direction in the data (north = top of the plan).
 *
 * Sections
 *   1. Constants
 *   2. State: defaults, validation, and loading
 *   3. Helpers and units
 *   4. Geometry
 *   5. Layout checks
 *   6. Plan drawing (SVG)
 *   7. UI panels and the main render
 *   8. Confirmation dialog
 *   9. Event handlers
 *  10. Export, import, and print
 *  11. Start-up
 */
(() => {
  'use strict';

  // ==========================================================================
  // 1. Constants
  // ==========================================================================

  const STORAGE_KEY = 'sip-house-planner-v1';
  // Earlier builds saved drafts under this key. Drafts found there are moved
  // to STORAGE_KEY the first time the page loads.
  const LEGACY_STORAGE_KEY = 'sals-sip-house-planner-v1';

  const FLOORS = ['main', 'upper', 'basement'];
  const SIDES = ['north', 'east', 'south', 'west'];
  const SIDE_NAME = { north: 'top', east: 'right', south: 'bottom', west: 'left' };
  const SIDE_LABEL = { north: 'Top', east: 'Right', south: 'Bottom', west: 'Left' };
  const FLOOR_NAME = { main: 'Main Floor', upper: 'Second Floor', basement: 'Basement' };

  // Heights, in feet. Doors and windows are measured from the floor. A window
  // sill is the bottom of the glass, and the head is the top of the opening.
  const DEFAULT_WALL_HEIGHT = 8;
  const DEFAULT_FLOOR_THICKNESS = 1;
  const DEFAULT_DOOR_HEAD = 80 / 12;
  const DEFAULT_WINDOW_SILL = 3;
  const DEFAULT_WINDOW_HEAD = 80 / 12;

  // The lot and its setback, in feet. 3 feet is a common minimum, but setbacks
  // vary by town and zone, so it is editable.
  const DEFAULT_SETBACK = 3;
  // A new lot reaches this far past the house on every side.
  const DEFAULT_LOT_MARGIN = 20;

  // Stairs. A stair is a room of kind 'stairs' with a `stair` object:
  // { type, climb, turn, landing }. `climb` is the side the first flight heads
  // toward going up, `turn` is left or right (U shape and spiral), and
  // `landing` is the flat landing's depth in feet.
  const STAIR_TYPES = ['straight', 'turnLeft', 'turnRight', 'u', 'spiral'];
  const STAIR_TYPE_NAME = { straight: 'Straight', turnLeft: 'Turn Left', turnRight: 'Turn Right', u: 'U Shape', spiral: 'Spiral' };
  const DEFAULT_LANDING = 3;
  // Hints only, not code advice: the riser the stairs aim for, and the smallest
  // tread, flight width, and spiral width before a warning shows.
  const MAX_RISER = 7.75 / 12;
  const MIN_TREAD = 10 / 12;
  const MIN_STAIR_WIDTH = 3;
  const MIN_SPIRAL_DIAMETER = 5;

  /** A stair room's settings with anything missing or invalid filled in. */
  function stairOf(room) {
    const saved = room.stair || {};
    const type = STAIR_TYPES.includes(saved.type) ? saved.type : 'straight';
    let landing = Number.isFinite(saved.landing) ? Math.min(Math.max(saved.landing, 0), 10) : 0;
    if (type === 'spiral') landing = 0;
    else if (type !== 'straight' && landing < 1) landing = DEFAULT_LANDING;
    return {
      type,
      climb: SIDES.includes(saved.climb) ? saved.climb : (room.h >= room.w ? 'north' : 'east'),
      turn: saved.turn === 'right' ? 'right' : 'left',
      landing,
    };
  }

  // Templates offered in the Templates menu. Each file is a normal exported
  // layout. The credit shown under the plan comes from the file itself.
  // The default layout is the first entry. It is what a first visit loads and
  // what Reset goes back to when no other template is loaded. To change it,
  // export a layout and save it as templates/default-layout.json.
  const DEFAULT_TEMPLATE = { id: 'default', name: 'Default Layout', file: 'templates/default-layout.json' };
  const TEMPLATES = [
    DEFAULT_TEMPLATE,
    { id: 'tiny-cottage', name: 'EXTREME PANELS TINY COTTAGE', file: 'templates/extreme-panels-tiny-cottage.json' },
    { id: 'alvin', name: 'EXTREME PANELS ALVIN', file: 'templates/extreme-panels-alvin.json' },
    { id: 'simon', name: 'EXTREME PANELS SIMON', file: 'templates/extreme-panels-simon.json' },
    { id: 'theodore', name: 'EXTREME PANELS THEODORE', file: 'templates/extreme-panels-theodore.json' },
  ];

  // The optional floors, each with the ids of its tab and its + or − button.
  const FLOOR_TOGGLES = [
    { floor: 'basement', tab: 'basementTab', toggle: 'basementToggle' },
    { floor: 'upper', tab: 'upperTab', toggle: 'upperToggle' },
  ];

  const ZOOM_MIN = 50;
  const ZOOM_MAX = 250;
  const ZOOM_STEP = 25;

  // Room types. Each one's fill color is a --room-* token in styles.css, so the
  // dark theme can mute them. An unknown type from an imported file draws as utility.
  const ROOM_KINDS = ['social', 'private', 'entry', 'wet', 'utility', 'circulation', 'stairs', 'outdoor'];

  // [name, width, depth, menu heading, marker] in feet for each entry in the item
  // Suggested sizes menu. The heading only organizes the menu, so any item can
  // go in any room. The menu sorts itself by heading, then by name. A marker
  // is a symbol or note drawn in place of a furniture label: electrical,
  // plumbing, hvac, or note. Markers skip the item checks, because they often
  // sit on a wall.
  const ITEM_PRESETS = {
    custom: ['Custom Box', 3, 3],

    bathtub: ['Bathtub', 5, 2.5, 'BATHROOM'],
    doubleVanity: ['Double Vanity', 5, 1.75, 'BATHROOM'],
    linenCabinet: ['Linen Cabinet', 2, 1.5, 'BATHROOM'],
    showerStall: ['Shower Stall', 3, 3, 'BATHROOM'],
    toilet: ['Toilet', 1.75, 2.5, 'BATHROOM'],
    tub: ['Tub / Shower', 5, 2.5, 'BATHROOM'],
    vanity: ['Vanity', 3, 1.75, 'BATHROOM'],

    bedBunk: ['Bed - Bunk', 3.25, 6.25, 'BEDROOM'],
    bedFull: ['Bed - Full', 4.5, 6.25, 'BEDROOM'],
    king: ['Bed - King', 6.5, 6.75, 'BEDROOM'],
    queen: ['Bed - Queen', 5, 6.75, 'BEDROOM'],
    twin: ['Bed - Twin', 3.25, 6.25, 'BEDROOM'],
    crib: ['Crib', 2.5, 4.5, 'BEDROOM'],
    dresser: ['Dresser', 5, 1.5, 'BEDROOM'],
    nightstand: ['Nightstand', 1.5, 1.5, 'BEDROOM'],
    wardrobe: ['Wardrobe', 3, 2, 'BEDROOM'],

    buffet: ['Buffet', 5, 1.5, 'DINING'],
    diningChair: ['Dining Chair', 1.5, 1.5, 'DINING'],
    dining: ['Dining Table', 6, 3.5, 'DINING'],
    roundTable: ['Round Table', 4, 4, 'DINING'],

    base: ['Base Cabinets', 6, 2, 'KITCHEN'],
    dishwasher: ['Dishwasher', 2, 2, 'KITCHEN'],
    island: ['Kitchen Island', 6, 3, 'KITCHEN'],
    microwave: ['Microwave', 2, 1.5, 'KITCHEN'],
    pantry: ['Pantry Cabinet', 3, 2, 'KITCHEN'],
    fridge: ['Refrigerator', 3, 2.5, 'KITCHEN'],
    kitchenSink: ['Sink', 3, 2, 'KITCHEN'],
    range: ['Stove / Range', 2.5, 2.5, 'KITCHEN'],

    dryer: ['Dryer', 2.5, 2.5, 'LAUNDRY'],
    laundrySink: ['Laundry Sink', 2, 2, 'LAUNDRY'],
    washerOnly: ['Washer', 2.5, 2.5, 'LAUNDRY'],
    washer: ['Washer / Dryer', 2.5, 2.5, 'LAUNDRY'],

    chair: ['Armchair', 3, 3, 'LIVING'],
    bookshelf: ['Bookshelf', 3, 1, 'LIVING'],
    coffee: ['Coffee Table', 4, 2, 'LIVING'],
    loveseat: ['Loveseat', 5, 3, 'LIVING'],
    sofa: ['Sofa', 7, 3, 'LIVING'],
    tvStand: ['TV Stand', 5, 1.5, 'LIVING'],
    woodStove: ['Wood Stove', 3, 3, 'LIVING'],

    handler: ['Air Handler', 2.5, 2.5, 'MECHANICAL'],
    electricalPanel: ['Electrical Panel', 2, 1, 'MECHANICAL'],
    erv: ['ERV / HRV', 2, 2, 'MECHANICAL'],
    miniSplit: ['Mini-Split Indoor Unit', 3, 1, 'MECHANICAL'],
    heater: ['Water Heater', 2, 2, 'MECHANICAL'],

    note: ['Note', 4, 1.5, 'NOTES', 'note'],

    desk: ['Desk', 5, 2.5, 'OFFICE'],
    filingCabinet: ['Filing Cabinet', 1.5, 2, 'OFFICE'],
    officeChair: ['Office Chair', 2, 2, 'OFFICE'],

    shelving: ['Shelving Unit', 4, 1.5, 'STORAGE AND WORKSHOP'],
    storageCabinet: ['Storage Cabinet', 3, 2, 'STORAGE AND WORKSHOP'],
    bench: ['Workbench', 6, 2.5, 'STORAGE AND WORKSHOP'],

    markerElectrical: ['Electrical', 1.25, 1.25, 'UTILITY MARKERS', 'electrical'],
    markerHvac: ['HVAC', 1.25, 1.25, 'UTILITY MARKERS', 'hvac'],
    markerPlumbing: ['Plumbing', 1.25, 1.25, 'UTILITY MARKERS', 'plumbing'],
  };
  const ITEM_MARKERS = ['electrical', 'plumbing', 'hvac', 'note'];

  // The menu list: headings A to Z, then names A to Z inside each heading.
  const ITEM_PRESET_MENU = Object.entries(ITEM_PRESETS)
    .filter(([key]) => key !== 'custom')
    .sort(([, a], [, b]) => a[3].localeCompare(b[3]) || a[0].localeCompare(b[0]));

  // Suggested sizes for the menu in each panel. Choosing one applies it to the
  // selected space, doorway, window, or item. Rooms vary too much for a long
  // list, so only the two bathrooms and the outdoor spaces are offered.
  // An optional fifth value sets the walls: garages and sheds are closed in,
  // decks and porches are open. Without one, the room's walls are left alone.
  const ROOM_PRESETS = {
    deck: ['Deck', 'outdoor', 12, 12, 'open'],
    fullBath: ['Full Bath', 'wet', 5, 8],
    garageOne: ['Garage - 1 Car', 'outdoor', 12, 20, 'enclosed'],
    garageTwo: ['Garage - 2 Car', 'outdoor', 22, 22, 'enclosed'],
    halfBath: ['Half Bath', 'wet', 5, 5],
    porch: ['Porch', 'outdoor', 6, 12, 'open'],
    shed: ['Shed', 'outdoor', 8, 10, 'enclosed'],
  };
  const DOOR_PRESETS = {
    closet: ['Closet', 2],
    bathroom: ['Bathroom', 2.5],
    standard: ['Standard', 3],
    double: ['Double', 5],
    wideDouble: ['Wide Double', 6],
    garageSingle: ['Garage - 1 Car', 9],
    garageDouble: ['Garage - 2 Car', 16],
  };
  const WINDOW_PRESETS = {
    small: ['Small', 2],
    standard: ['Standard', 3],
    wide: ['Wide', 4],
    large: ['Large', 6],
    picture: ['Picture', 8],
  };

  // ==========================================================================
  // 2. State: defaults, validation, and loading
  // ==========================================================================

  // Built-in fallback layout. The live default comes from templates/default-layout.json
  // (see readTemplate); this copy is used when that file can't be read,
  // for example when index.html is opened straight from disk.
  //
  // `fixtures`, `selectedFixture`, `scenario`, and `entranceMode` are kept for
  // compatibility with saved drafts and exported files. Fixtures were replaced
  // by items, but sanitizeLayout still uses them to upgrade old drafts.
  const createDefaultState = () => ({
    schemaVersion: 6,
    width: 32,
    depth: 42,
    exteriorWall: 1,
    interiorWall: 0.375,
    wallHeights: { basement: DEFAULT_WALL_HEIGHT, main: DEFAULT_WALL_HEIGHT, upper: DEFAULT_WALL_HEIGHT },
    floorThickness: DEFAULT_FLOOR_THICKNESS,
    lot: { enabled: false, width: 0, depth: 0, left: 0, top: 0, setback: DEFAULT_SETBACK },
    lot: { enabled: false, width: 0, depth: 0, left: 0, top: 0, setback: DEFAULT_SETBACK },
    zoom: 100,
    floor: 'main',
    upperEnabled: false,
    basementEnabled: true,
    templateCredit: null,
    selectedRoom: 'living',
    selectedDoor: null,
    selectedFixture: 'washer',
    scenario: 'preferred',
    entranceMode: 'front',
    frontSide: 'north',
    windows: [],
    selectedWindow: null,
    showItems: true,
    selectedItem: null,
    doors: [
      { id: 'door-bed1', roomId: 'bed1', side: 'east', offset: 9.5, width: 3, hinge: 'end', swing: 'in' },
      { id: 'door-bath1', roomId: 'bath1', side: 'east', offset: 1.5, width: 3, hinge: 'end', swing: 'in' },
      { id: 'door-bed2', roomId: 'bed2', side: 'east', offset: 0.5, width: 3, hinge: 'start', swing: 'in' },
      { id: 'door-mudroom', roomId: 'mudroom', side: 'north', offset: 0.5, width: 3, hinge: 'start', swing: 'in' },
      { id: 'door-back-entry', roomId: 'back-entry', side: 'south', offset: 0.5, width: 3, hinge: 'start', swing: 'in' },
      { id: 'door-basement-bath', roomId: 'basement-bath', side: 'east', offset: 1.5, width: 3, hinge: 'end', swing: 'in' },
      { id: 'door-secure', roomId: 'secure', side: 'east', offset: 9.5, width: 3, hinge: 'end', swing: 'in' },
      { id: 'door-flex', roomId: 'flex', side: 'west', offset: 13.5, width: 3, hinge: 'start', swing: 'in' },
    ],
    items: [
      { id: 'item-washer', name: 'Washer / Dryer', floor: 'basement', x: 1, y: 30.25, w: 2.5, h: 5 },
      { id: 'item-heater', name: 'Water Heater', floor: 'basement', x: 1, y: 36, w: 2, h: 2 },
      { id: 'item-handler', name: 'Air Handler', floor: 'basement', x: 1, y: 38.5, w: 2.5, h: 2.5 },
      { id: 'item-bed1-bed', name: 'Bed - Queen', floor: 'main', x: 1, y: 4.75, w: 6.75, h: 5 },
      { id: 'item-bed1-nightstand-1', name: 'Nightstand', floor: 'main', x: 1, y: 2.75, w: 1.5, h: 2 },
      { id: 'item-bed1-nightstand-2', name: 'Nightstand', floor: 'main', x: 1, y: 9.75, w: 1.5, h: 2 },
      { id: 'item-bed1-dresser', name: 'Dresser', floor: 'main', x: 5.5, y: 1, w: 5, h: 1.5 },
      { id: 'item-bed1-closet', name: 'Reach-In Closet', floor: 'main', x: 10.75, y: 3, w: 2, h: 6 },
      { id: 'item-bed1-desk', name: 'Desk', floor: 'main', x: 4, y: 11.75, w: 4, h: 2 },
      { id: 'item-bed2-bed', name: 'Bed - Queen', floor: 'main', x: 1, y: 31.5, w: 6.75, h: 5 },
      { id: 'item-bed2-nightstand-1', name: 'Nightstand', floor: 'main', x: 1, y: 29.5, w: 1.5, h: 2 },
      { id: 'item-bed2-nightstand-2', name: 'Nightstand', floor: 'main', x: 1, y: 36.5, w: 1.5, h: 2 },
      { id: 'item-bed2-dresser', name: 'Dresser', floor: 'main', x: 5, y: 39.5, w: 5, h: 1.5 },
      { id: 'item-bed2-closet', name: 'Reach-In Closet', floor: 'main', x: 10.75, y: 32, w: 2, h: 6 },
      { id: 'item-bed2-desk', name: 'Desk', floor: 'main', x: 3, y: 27.25, w: 4, h: 2 },
      { id: 'item-bath1-tub', name: 'Tub / Shower', floor: 'main', x: 1, y: 22.25, w: 2.5, h: 4.5 },
      { id: 'item-bath1-toilet', name: 'Toilet', floor: 'main', x: 4, y: 22.25, w: 1.75, h: 2.5 },
      { id: 'item-bath1-vanity', name: 'Vanity', floor: 'main', x: 6.25, y: 22.25, w: 2.5, h: 1.75 },
      { id: 'item-entry-bench', name: 'Bench / Cubbies', floor: 'main', x: 17.25, y: 1.5, w: 1.5, h: 4 },
      { id: 'item-back-entry-bench', name: 'Bench / Cubbies', floor: 'main', x: 17.25, y: 35.5, w: 1.5, h: 4 },
      { id: 'item-living-tv', name: 'TV Console', floor: 'main', x: 19.25, y: 1.5, w: 1.5, h: 5 },
      { id: 'item-living-sofa', name: 'Sofa', floor: 'main', x: 28, y: 1.25, w: 3, h: 7 },
      { id: 'item-living-coffee-table', name: 'Coffee Table', floor: 'main', x: 23.5, y: 2.75, w: 2, h: 4 },
      { id: 'item-living-chair-1', name: 'Armchair', floor: 'main', x: 21.5, y: 9.5, w: 3, h: 3 },
      { id: 'item-living-chair-2', name: 'Armchair', floor: 'main', x: 25, y: 9.5, w: 3, h: 3 },
      { id: 'item-dining-set', name: 'Dining Table & 6 Chairs', floor: 'main', x: 21, y: 19, w: 8, h: 6 },
      { id: 'item-kitchen-fridge', name: 'Refrigerator', floor: 'main', x: 19.25, y: 38.5, w: 3, h: 2.5 },
      { id: 'item-kitchen-counter-sink', name: 'Counter / Sink', floor: 'main', x: 22.25, y: 39, w: 6.75, h: 2 },
      { id: 'item-kitchen-counter-range', name: 'Counter / Range', floor: 'main', x: 29, y: 31, w: 2, h: 10 },
      { id: 'item-kitchen-island', name: 'Kitchen Island', floor: 'main', x: 21.5, y: 32.5, w: 4.5, h: 3 },
      { id: 'item-secure-safe', name: 'Safe', floor: 'basement', x: 1, y: 1, w: 3, h: 2.5 },
      { id: 'item-secure-shelves-1', name: 'Storage Shelves', floor: 'basement', x: 4.5, y: 1, w: 6, h: 1.5 },
      { id: 'item-secure-shelves-2', name: 'Storage Shelves', floor: 'basement', x: 1, y: 4, w: 1.5, h: 9 },
      { id: 'item-basement-bath-shower', name: 'Shower', floor: 'basement', x: 1.25, y: 22.25, w: 3, h: 4.5 },
      { id: 'item-basement-bath-toilet', name: 'Toilet', floor: 'basement', x: 5, y: 22.25, w: 1.75, h: 2.5 },
      { id: 'item-basement-bath-vanity', name: 'Vanity', floor: 'basement', x: 7.25, y: 22.25, w: 2, h: 1.75 },
      { id: 'item-laundry-sink', name: 'Utility Sink', floor: 'basement', x: 1, y: 27.5, w: 2, h: 2 },
      { id: 'item-laundry-table', name: 'Folding Table', floor: 'basement', x: 4.75, y: 31, w: 2, h: 4 },
      { id: 'item-storage-shelves-1', name: 'Storage Shelves', floor: 'basement', x: 7, y: 31.25, w: 1.5, h: 9.75 },
      { id: 'item-storage-shelves-2', name: 'Storage Shelves', floor: 'basement', x: 8.5, y: 39.5, w: 2.5, h: 1.5 },
      { id: 'item-pantry-shelves-1', name: 'Storage Shelves', floor: 'basement', x: 17, y: 39.5, w: 12.5, h: 1.5 },
      { id: 'item-pantry-shelves-2', name: 'Storage Shelves', floor: 'basement', x: 29.5, y: 31.25, w: 1.5, h: 9.75 },
      { id: 'item-pantry-freezer', name: 'Chest Freezer', floor: 'basement', x: 18, y: 31.5, w: 4, h: 2.5 },
      { id: 'item-flex-treadmill', name: 'Treadmill', floor: 'basement', x: 18, y: 1.5, w: 3, h: 6.5 },
      { id: 'item-flex-rack', name: 'Weight Rack', floor: 'basement', x: 23, y: 1, w: 4, h: 2 },
      { id: 'item-flex-bench', name: 'Weight Bench', floor: 'basement', x: 24, y: 5, w: 2, h: 4.5 },
      { id: 'item-flex-sofa', name: 'Sofa', floor: 'basement', x: 20.5, y: 21, w: 7, h: 3 },
      { id: 'item-flex-coffee-table', name: 'Coffee Table', floor: 'basement', x: 22, y: 25, w: 4, h: 2 },
      { id: 'item-flex-chair', name: 'Armchair', floor: 'basement', x: 27.75, y: 24, w: 3, h: 3 },
      { id: 'item-flex-tv', name: 'TV Console', floor: 'basement', x: 21, y: 29.25, w: 6, h: 1.5 },
    ],
    rooms: [
      { id: 'bed1', name: 'Bedroom 1', floor: 'main', x: 1, y: 1, w: 12, h: 13, kind: 'private' },
      { id: 'mudroom', name: 'Entry', floor: 'main', x: 13, y: 1, w: 6, h: 6, kind: 'entry', walls: { north: true, east: true, south: false, west: true } },
      { id: 'living', name: 'Living Room', floor: 'main', x: 19, y: 1, w: 12, h: 14, kind: 'social' },
      { id: 'hall', name: 'Hallway', floor: 'main', x: 13, y: 7, w: 6, h: 28, kind: 'circulation' },
      { id: 'stairs-main', name: 'Stairs', floor: 'main', x: 1, y: 14, w: 10, h: 8, kind: 'stairs', walls: { north: true, east: false, south: true, west: true }, wallMode: 'open' },
      { id: 'side-hall', name: 'Hall', floor: 'main', x: 11, y: 14, w: 2, h: 13, kind: 'circulation', wallMode: 'open' },
      { id: 'dining', name: 'Dining Room', floor: 'main', x: 19, y: 15, w: 12, h: 14, kind: 'social' },
      { id: 'bath1', name: 'Bathroom', floor: 'main', x: 1, y: 22, w: 10, h: 5, kind: 'wet', walls: { north: true, east: true, south: true, west: true } },
      { id: 'bed2', name: 'Bedroom 2', floor: 'main', x: 1, y: 27, w: 12, h: 14, kind: 'private' },
      { id: 'kitchen', name: 'Kitchen', floor: 'main', x: 19, y: 29, w: 12, h: 12, kind: 'social' },
      { id: 'back-entry', name: 'Back Entry', floor: 'main', x: 13, y: 35, w: 6, h: 6, kind: 'entry', wallMode: 'enclosed', walls: { north: false, east: true, south: false, west: true } },
      { id: 'secure', name: 'Secure Room', floor: 'basement', x: 1, y: 1, w: 10, h: 13, kind: 'utility', walls: { north: false, east: true, south: true, west: false } },
      { id: 'basement-hall', name: 'Hallway', floor: 'basement', x: 11, y: 1, w: 6, h: 40, kind: 'circulation', wallMode: 'open' },
      { id: 'flex', name: 'Flex Space', floor: 'basement', x: 17, y: 1, w: 14, h: 30, kind: 'utility', wallMode: 'enclosed' },
      { id: 'stairs-basement', name: 'Stairs', floor: 'basement', x: 1, y: 14, w: 10, h: 8, kind: 'stairs', walls: { north: true, east: false, south: true, west: false }, wallMode: 'open' },
      { id: 'basement-bath', name: 'Bathroom', floor: 'basement', x: 1, y: 22, w: 10, h: 5, kind: 'wet' },
      { id: 'mech', name: 'Mechanical / Laundry', floor: 'basement', x: 1, y: 27, w: 6, h: 14, kind: 'utility', walls: { north: false, east: false, south: false, west: false } },
      { id: 'basement-nook', name: 'Hallway', floor: 'basement', x: 7, y: 27, w: 4, h: 4, kind: 'circulation', wallMode: 'open' },
      { id: 'storage', name: 'Storage', floor: 'basement', x: 7, y: 31, w: 4, h: 10, kind: 'utility', walls: { north: true, east: false, south: true, west: false } },
      { id: 'pantry', name: 'Storage', floor: 'basement', x: 17, y: 31, w: 14, h: 10, kind: 'utility', walls: { north: true, east: true, south: true, west: false }, wallMode: 'open' },
    ],
    fixtures: [
      { id: 'washer', name: 'Washer / Dryer', short: 'W/D', floor: 'basement', x: 25.5, y: 18.5 },
      { id: 'heater', name: 'Water Heater', short: 'WH', floor: 'basement', x: 25.5, y: 13.5 },
      { id: 'handler', name: 'Air Handler', short: 'AH', floor: 'basement', x: 29.4, y: 14.5 },
      { id: 'return', name: 'Return grille', short: 'R', floor: 'main', x: 15, y: 18 },
    ],
  });

  /** Rounds n to the nearest multiple of step. The one rounding rule for snapping and wall thickness. */
  const roundTo = (n, step) => Math.round(n / step) * step;

  const isValidFloor = floor => FLOORS.includes(floor);

  /**
   * Keeps a template credit only when it is plain text with an https link.
   * Imported files are untrusted, so anything else is dropped.
   */
  function cleanCredit(credit) {
    const valid = credit
      && typeof credit.name === 'string'
      && typeof credit.by === 'string'
      && typeof credit.url === 'string'
      && credit.url.startsWith('https://');
    if (!valid) return null;
    return { name: credit.name.slice(0, 80), by: credit.by.slice(0, 80), url: credit.url.slice(0, 300) };
  }
  const hasFiniteBox = obj => ['x', 'y', 'w', 'h'].every(key => Number.isFinite(obj[key]));

  /**
   * Validates a saved layout (browser draft, imported file, or
   * templates/default-layout.json) and upgrades older formats to schema version 6.
   * Returns a clean state object, or null if the data isn't a layout.
   */
  function sanitizeLayout(saved) {
    const isLayout = saved
      && Number.isFinite(saved.width)
      && Number.isFinite(saved.depth)
      && Array.isArray(saved.rooms)
      && Array.isArray(saved.fixtures);
    if (!isLayout) return null;

    const base = createDefaultState();

    // Schema 1 stored only edits to the built-in rooms; merge them in.
    const rooms = saved.schemaVersion >= 2
      ? saved.rooms.filter(r => r && typeof r.id === 'string' && typeof r.name === 'string'
          && isValidFloor(r.floor) && hasFiniteBox(r))
      : base.rooms.map(r => ({ ...r, ...saved.rooms.find(x => x.id === r.id) }));

    const doors = Array.isArray(saved.doors)
      ? saved.doors.filter(d => d && typeof d.id === 'string' && typeof d.roomId === 'string'
          && Number.isFinite(d.offset) && Number.isFinite(d.width))
      : [];

    const state = {
      ...base,
      ...saved,
      schemaVersion: 6,
      rooms,
      doors,
      fixtures: base.fixtures.map(f => ({ ...f, ...saved.fixtures.find(x => x.id === f.id) })),
    };

    state.windows = Array.isArray(saved.windows)
      ? saved.windows.filter(w => w && typeof w.id === 'string' && isValidFloor(w.floor)
          && SIDES.includes(w.side) && Number.isFinite(w.offset) && Number.isFinite(w.width) && w.width > 0)
      : [];

    if (Array.isArray(saved.items)) {
      state.items = saved.items
        .filter(it => it && typeof it.id === 'string' && typeof it.name === 'string' && isValidFloor(it.floor) && hasFiniteBox(it))
        .map(it => {
          const item = { ...it };
          if (!ITEM_MARKERS.includes(item.marker)) delete item.marker;
          return item;
        });
    } else {
      // Drafts from before items existed: turn the old fixture markers into items.
      const sizes = {
        washer: [2.5, 2.5, 'Washer / Dryer'],
        heater: [2, 2, 'Water Heater'],
        handler: [2.5, 2.5, 'Air Handler'],
      };
      state.items = state.fixtures.filter(f => sizes[f.id]).map(f => {
        const [w, h, name] = sizes[f.id];
        return {
          id: `item-${f.id}`,
          name,
          floor: f.floor,
          x: roundTo(f.x - w / 2, 0.25),
          y: roundTo(f.y - h / 2, 0.25),
          w,
          h,
        };
      });
    }

    // Older drafts and files have no basement flag, and they all had a basement.
    state.basementEnabled = saved.basementEnabled !== false;
    state.templateCredit = cleanCredit(saved.templateCredit);
    if (!state.basementEnabled) {
      const basementRoomIds = new Set(state.rooms.filter(r => r.floor === 'basement').map(r => r.id));
      state.rooms = state.rooms.filter(r => r.floor !== 'basement');
      state.doors = state.doors.filter(d => !basementRoomIds.has(d.roomId));
      state.items = state.items.filter(it => it.floor !== 'basement');
      state.windows = state.windows.filter(w => w.floor !== 'basement');
    }

    // Schema 4 added heights. Older files get the defaults, and so does any
    // height that is out of range.
    const savedHeights = saved.wallHeights && typeof saved.wallHeights === 'object' ? saved.wallHeights : {};
    state.wallHeights = Object.fromEntries(FLOORS.map(floor => [
      floor,
      Number.isFinite(savedHeights[floor]) && savedHeights[floor] >= 6 && savedHeights[floor] <= 20 ? savedHeights[floor] : DEFAULT_WALL_HEIGHT,
    ]));
    if (!(Number.isFinite(state.floorThickness) && state.floorThickness >= 0.25 && state.floorThickness <= 3)) {
      state.floorThickness = DEFAULT_FLOOR_THICKNESS;
    }
    // Schema 6 added the lot. Anything out of range falls back to the default.
    const savedLot = saved.lot && typeof saved.lot === 'object' ? saved.lot : {};
    const inRange = (value, low, high, fallback) => (Number.isFinite(value) && value >= low && value <= high ? value : fallback);
    state.lot = {
      enabled: savedLot.enabled === true,
      width: inRange(savedLot.width, 0, 1000, 0),
      depth: inRange(savedLot.depth, 0, 1000, 0),
      left: inRange(savedLot.left, -1000, 1000, 0),
      top: inRange(savedLot.top, -1000, 1000, 0),
      setback: inRange(savedLot.setback, 0, 50, DEFAULT_SETBACK),
    };
    if (state.lot.width <= 0 || state.lot.depth <= 0) state.lot.enabled = false;
    state.doors = state.doors.map(d => ({
      ...d,
      head: Number.isFinite(d.head) && d.head >= 5 && d.head <= 10 ? d.head : DEFAULT_DOOR_HEAD,
    }));
    state.windows = state.windows.map(w => {
      const valid = Number.isFinite(w.sill) && Number.isFinite(w.head) && w.sill >= 0 && w.sill < w.head && w.head <= 12;
      return { ...w, sill: valid ? w.sill : DEFAULT_WINDOW_SILL, head: valid ? w.head : DEFAULT_WINDOW_HEAD };
    });

    state.rooms = state.rooms.map(r => {
      const room = { ...r };
      // Schema 5 gave stairs their own kind. Older files drew them as hallways.
      if (room.kind === 'circulation' && (room.id.startsWith('stairs') || /^stairs?$/i.test(room.name.trim()))) room.kind = 'stairs';
      if (room.kind === 'stairs') room.stair = stairOf(room);
      else delete room.stair;
      if (!(Number.isFinite(room.wallT) && room.wallT >= 0 && room.wallT <= 1)) delete room.wallT;
      if (room.walls && typeof room.walls === 'object') {
        room.walls = Object.fromEntries(SIDES.map(side => [side, room.walls[side] !== false]));
      } else {
        delete room.walls;
      }
      if (room.halfWalls && typeof room.halfWalls === 'object') {
        room.halfWalls = Object.fromEntries(SIDES.map(side => [side, room.halfWalls[side] === true]));
      } else {
        delete room.halfWalls;
      }
      return room;
    });

    if (!Number.isFinite(state.exteriorWall) || state.exteriorWall < 0 || state.exteriorWall > 2) state.exteriorWall = 1;
    if (!Number.isFinite(state.interiorWall) || state.interiorWall < 0 || state.interiorWall > 1) state.interiorWall = 0.5;
    if (![...SIDES, 'none'].includes(state.frontSide)) state.frontSide = 'north';
    if (!Number.isFinite(state.zoom) || state.zoom < ZOOM_MIN || state.zoom > ZOOM_MAX) state.zoom = 100;
    if (!['main', ...(state.basementEnabled ? ['basement'] : []), ...(state.upperEnabled ? ['upper'] : [])].includes(state.floor)) state.floor = 'main';
    return state;
  }

  /** Moves a value from an old localStorage key to a new one, once. */
  function migrateStorageKey(oldKey, newKey) {
    try {
      if (localStorage.getItem(newKey) !== null) return;
      const old = localStorage.getItem(oldKey);
      if (old === null) return;
      localStorage.setItem(newKey, old);
      localStorage.removeItem(oldKey);
    } catch (_) {
      // Storage can be unavailable (private mode, blocked cookies). Nothing to migrate.
    }
  }

  migrateStorageKey(LEGACY_STORAGE_KEY, STORAGE_KEY);

  let state = createDefaultState();
  let hasSavedDraft = false;
  try {
    const saved = sanitizeLayout(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    if (saved) {
      state = saved;
      hasSavedDraft = true;
    }
  } catch (_) {
    // A corrupt browser draft simply starts fresh.
  }

  const saveState = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Storage full or unavailable: keep working without saving.
    }
  };

  // --- Undo ---------------------------------------------------------------
  // Every change to the layout ends in render(), so undo works by comparing
  // the layout after each render with the one before it. When they differ, the
  // earlier copy goes on a stack. Selection, zoom, units, and the floor tab are
  // not part of the layout, so they never count as a step. The stack lives in
  // memory only, so it is empty again after the page reloads.
  const UNDO_LIMIT = 50;
  const undoStack = [];
  let lastLayout = null;
  // Set while a drag is in progress, so one drag is one undo step, not hundreds.
  let dragStartLayout = null;

  const layoutSnapshot = () => JSON.stringify({
    width: state.width,
    depth: state.depth,
    exteriorWall: state.exteriorWall,
    interiorWall: state.interiorWall,
    wallHeights: state.wallHeights,
    floorThickness: state.floorThickness,
    lot: state.lot,
    frontSide: state.frontSide,
    upperEnabled: state.upperEnabled,
    basementEnabled: state.basementEnabled,
    templateCredit: state.templateCredit,
    rooms: state.rooms,
    doors: state.doors,
    windows: state.windows,
    items: state.items,
  });

  function pushUndo(layout) {
    // The floor is kept so Undo can show the floor where the change happened.
    undoStack.push({ layout, floor: state.floor });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  }

  /** Called at the end of every render. */
  function trackLayoutChange() {
    const now = layoutSnapshot();
    if (lastLayout !== null && now !== lastLayout && dragStartLayout === null) pushUndo(lastLayout);
    lastLayout = now;
    $('undo').disabled = !undoStack.length;
  }

  /** Called when a drag ends: the whole drag becomes one step, if it changed anything. */
  function endDragTracking() {
    if (dragStartLayout !== null && dragStartLayout !== lastLayout) pushUndo(dragStartLayout);
    dragStartLayout = null;
    $('undo').disabled = !undoStack.length;
  }

  function undoLastChange() {
    const step = undoStack.pop();
    if (!step) return;
    Object.assign(state, JSON.parse(step.layout));
    state.floor = floorOrder().includes(step.floor) ? step.floor : 'main';
    // Marked as already seen, so render() doesn't record the undo as a new change.
    lastLayout = step.layout;
    render();
  }

  /**
   * Reads and validates a layout file. Used for the templates, including the default layout.
   * Returns { layout, problem }. When layout is null, problem says why, in words
   * that can be shown to the person.
   */
  async function readLayoutFile(path) {
    if (location.protocol === 'file:') {
      return { layout: null, problem: 'This page was opened straight from disk, and browsers block reading files that way. Start it with Start-Planner.bat or use the live site.' };
    }
    let response;
    try {
      response = await fetch(path, { cache: 'no-store' });
    } catch (_) {
      return { layout: null, problem: `The request for ${path} failed. Check your connection and try again.` };
    }
    if (!response.ok) {
      return { layout: null, problem: `${path} was not found (error ${response.status}). The templates folder needs to sit next to index.html.` };
    }
    let data;
    try {
      data = await response.json();
    } catch (_) {
      return { layout: null, problem: `${path} is not valid JSON.` };
    }
    const layout = sanitizeLayout(data && data.layout ? data.layout : data);
    if (!layout) return { layout: null, problem: `${path} is not a layout file from SIP House Planner.` };
    layout.floor = 'main';
    layout.selectedDoor = null;
    layout.selectedItem = null;
    return { layout, problem: '' };
  }

  /**
   * Reads a template. The default layout falls back to the built-in copy when
   * its file can't be read, for example when the page is opened from disk.
   */
  async function readTemplate(template) {
    const result = await readLayoutFile(template.file);
    if (result.layout || template !== DEFAULT_TEMPLATE) return result;
    return { layout: createDefaultState(), problem: '' };
  }

  // ==========================================================================
  // 3. Helpers
  // ==========================================================================

  const $ = id => document.getElementById(id);
  const svg = $('plan');
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const findRoom = id => state.rooms.find(r => r.id === id);
  const findDoor = id => state.doors.find(d => d.id === id);
  const findWindow = id => state.windows.find(w => w.id === id);
  const findItem = id => state.items.find(it => it.id === id);

  const newId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const floorName = floor => FLOOR_NAME[floor];
  const floorOrder = () => [
    'main',
    ...(state.upperEnabled ? ['upper'] : []),
    ...(state.basementEnabled ? ['basement'] : []),
  ];
  const isHorizontalSide = side => side === 'north' || side === 'south';

  // Heights. The fallback layout has no door or window heights until it is
  // sanitized, so each reader supplies the default.
  const wallHeight = floor => state.wallHeights?.[floor] ?? DEFAULT_WALL_HEIGHT;
  const doorHead = door => door.head ?? DEFAULT_DOOR_HEAD;
  const windowSill = win => win.sill ?? DEFAULT_WINDOW_SILL;
  const windowHead = win => win.head ?? DEFAULT_WINDOW_HEAD;
  /** The floor above a floor, or null on the top floor. */
  const floorAbove = floor => {
    if (floor === 'basement') return 'main';
    return floor === 'main' && state.upperEnabled ? 'upper' : null;
  };
  /** Floor level to the next floor's level: the walls plus the floor between. */
  const floorToFloor = floor => wallHeight(floor) + (state.floorThickness ?? DEFAULT_FLOOR_THICKNESS);
  /** The floor below a floor, or null on the lowest floor. */
  const floorBelow = floor => {
    if (floor === 'upper') return 'main';
    return floor === 'main' && state.basementEnabled ? 'basement' : null;
  };
  /** How far a stair room climbs: up to the next floor, or from the floor below. Alone on one floor, it assumes one floor to floor. */
  const stairRise = room => {
    const below = floorBelow(room.floor);
    return floorToFloor((floorAbove(room.floor) || !below) ? room.floor : below);
  };
  const capitalize = text => text[0].toUpperCase() + text.slice(1);

  // Number formatting for labels. Two decimals so quarter feet show as 15.75, not 15.8.

  /** The box where two boxes overlap. Its width and height are 0 when they do not touch. */
  const overlapBox = (a, b) => {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    return {
      x,
      y,
      w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
      h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
    };
  };

  /** Overlapping area of two boxes. */
  const intersection = (a, b) => {
    const overlap = overlapBox(a, b);
    return overlap.w * overlap.h;
  };

  // A room is open plan (no partition walls) or enclosed. Living spaces and
  // the main hallway default to open.
  // Outdoor spaces start open (driveway, garden, carport, deck). A garage or shed can be set to enclosed.
  const wallMode = r => r.wallMode || ((r.kind === 'outdoor' || r.kind === 'social' || r.id === 'hall') ? 'open' : 'enclosed');
  const isOutdoor = r => r.kind === 'outdoor';
  /** The lot as a box in plan coordinates (the house footprint starts at 0, 0), or null when the lot is off. */
  const lotBox = () => (state.lot?.enabled
    ? { x: -state.lot.left, y: -state.lot.top, w: state.lot.width, h: state.lot.depth }
    : null);
  /** True when a room sits entirely inside the house footprint. */
  const insideFootprint = r => r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= state.width + 0.01 && r.y + r.h <= state.depth + 0.01;
  /** A room that is not within the footprint (a garage, or a bath next to the house) has its own walls, not the SIP wall. */
  const isOutsideHouse = r => !insideFootprint(r);
  const roomWallThickness = r => (Number.isFinite(r.wallT) ? r.wallT : state.interiorWall);
  const hasSide = (r, side) => r.walls?.[side] !== false;
  const sidePosition = (r, side) => (
    side === 'north' ? r.y : side === 'south' ? r.y + r.h : side === 'west' ? r.x : r.x + r.w
  );

  /** True when a room side sits on the exterior SIP wall. A room outside the house never does. */
  const isExteriorSide = (r, side) => {
    if (isOutsideHouse(r)) return false;
    const e = state.exteriorWall;
    const pos = sidePosition(r, side);
    const limit = isHorizontalSide(side) ? state.depth : state.width;
    return pos <= e + 0.001 || pos >= limit - e - 0.001;
  };

  // --- Units ------------------------------------------------------------------
  // Layouts are always stored in feet. Metric only changes what is shown and
  // how typed values are read, so drafts and exported files work in either.
  // The choice is a browser preference, not part of the layout.

  const UNITS_KEY = 'sip-house-planner-units';
  const CM_PER_FT = 30.48;
  const M_PER_FT = 0.3048;
  const SQM_PER_SQFT = 0.09290304;

  function initialUnits() {
    try {
      const saved = localStorage.getItem(UNITS_KEY);
      if (saved === 'imperial' || saved === 'metric') return saved;
    } catch (_) {
      // Storage unavailable: fall through to the browser language.
    }
    // Feet where the browser's region is the US (or Liberia or Myanmar),
    // metric elsewhere. maximize() fills in the likely region, so "en" -> US
    // and "de" -> DE.
    let region = 'US';
    try {
      region = new Intl.Locale((navigator.language || 'en-US').split('@')[0]).maximize().region || 'US';
    } catch (_) {
      // Unparseable language tag: keep the default.
    }
    return ['US', 'LR', 'MM'].includes(region) ? 'imperial' : 'metric';
  }

  let units = initialUnits();
  const isMetric = () => units === 'metric';

  const roundText = (n, decimals = 2) => String(Math.round(n * 10 ** decimals) / 10 ** decimals);
  const meters = ft => roundText(ft * M_PER_FT, 2);

  // Snapping: the footprint, rooms, doorways, windows, and items all use 3″ or
  // 5 cm, so every size and position can land on the same grid (for example
  // 15.75′ and 15.25′).
  const snap = ft => roundTo(ft, isMetric() ? 5 / CM_PER_FT : 0.25);

  /** Keyboard nudge distance in feet: the snap step, or 1 ft (25 cm) with Shift. */
  const nudgeStep = shift => (isMetric() ? (shift ? 0.25 : 0.05) / M_PER_FT : (shift ? 1 : 0.25));

  // Display text
  const fmtLength = ft => (isMetric() ? `${meters(ft)} m` : `${roundText(ft)}′`);
  const fmtInches = ft => (isMetric() ? `${roundText(ft * CM_PER_FT, 1)} cm` : `${roundText(ft * 12, 1)}″`);
  const fmtSize = (w, h) => (isMetric() ? `${meters(w)} × ${meters(h)} m` : `${roundText(w)}′ × ${roundText(h)}′`);
  const fmtArea = (sqft, grouped = true) => {
    const value = Math.round(isMetric() ? sqft * SQM_PER_SQFT : sqft);
    return `${grouped ? value.toLocaleString() : value} ${isMetric() ? 'm²' : 'sq ft'}`;
  };
  const gridSquareText = () => (isMetric() ? '25 cm' : '1′');

  // Screen reader text
  const spokenSize = (w, h) => (isMetric()
    ? `${meters(w)} by ${meters(h)} meters`
    : `${roundText(w)} by ${roundText(h)} feet`);
  const spokenLength = ft => (isMetric() ? `${meters(ft)} meter` : `${roundText(ft)} foot`);
  const spokenArea = sqft => (isMetric()
    ? `${Math.round(sqft * SQM_PER_SQFT)} square meters`
    : `${Math.round(sqft)} square feet`);

  // Form fields. Lengths are feet or meters; wall thicknesses are inches or
  // centimeters. `valid` is the accepted range when it differs from the
  // field's min and max attributes.
  const FIELDS = {
    houseWidth: { kind: 'length', imperial: { min: 8, max: 80, step: 0.25 }, metric: { min: 2.4, max: 24.3, step: 0.05 } },
    houseDepth: { kind: 'length', imperial: { min: 8, max: 80, step: 0.25 }, metric: { min: 2.4, max: 24.3, step: 0.05 } },
    exteriorWall: { kind: 'thickness', imperial: { min: 0, max: 24, step: 0.25 }, metric: { min: 0, max: 60, step: 0.5 } },
    interiorWall: { kind: 'thickness', imperial: { min: 0, max: 12, step: 0.25 }, metric: { min: 0, max: 30, step: 0.5 } },
    roomWallT: { kind: 'thickness', imperial: { min: 0, max: 12, step: 0.25 }, metric: { min: 0, max: 30, step: 0.5 } },
    roomX: { kind: 'length', imperial: { step: 0.25, valid: [-80, 80] }, metric: { step: 0.05, valid: [-24.4, 24.4] } },
    roomY: { kind: 'length', imperial: { step: 0.25, valid: [-80, 80] }, metric: { step: 0.05, valid: [-24.4, 24.4] } },
    roomW: { kind: 'length', imperial: { min: 2, max: 80, step: 0.25 }, metric: { min: 0.6, max: 24.4, step: 0.05 } },
    roomH: { kind: 'length', imperial: { min: 2, max: 80, step: 0.25 }, metric: { min: 0.6, max: 24.4, step: 0.05 } },
    itemX: { kind: 'length', imperial: { step: 0.25, valid: [-80, 80] }, metric: { step: 0.05, valid: [-24.4, 24.4] } },
    itemY: { kind: 'length', imperial: { step: 0.25, valid: [-80, 80] }, metric: { step: 0.05, valid: [-24.4, 24.4] } },
    itemW: { kind: 'length', imperial: { min: 0.5, max: 80, step: 0.25 }, metric: { min: 0.15, max: 24.4, step: 0.05 } },
    itemH: { kind: 'length', imperial: { min: 0.5, max: 80, step: 0.25 }, metric: { min: 0.15, max: 24.4, step: 0.05 } },
    doorOffset: { kind: 'length', imperial: { min: 0, step: 0.25, valid: [0, 80] }, metric: { min: 0, step: 0.05, valid: [0, 24.4] } },
    doorWidth: { kind: 'length', imperial: { min: 2, max: 20, step: 0.25 }, metric: { min: 0.6, max: 6, step: 0.05 } },
    windowOffset: { kind: 'length', imperial: { min: 0, step: 0.25, valid: [0, 80] }, metric: { min: 0, step: 0.05, valid: [0, 24.4] } },
    windowWidth: { kind: 'length', imperial: { min: 1, max: 20, step: 0.25, valid: [1, 80] }, metric: { min: 0.3, max: 6, step: 0.05, valid: [0.3, 24.4] } },
    // Heights are typed in inches or centimeters, like wall thickness.
    wallHeight: { kind: 'thickness', imperial: { min: 72, max: 240, step: 1 }, metric: { min: 180, max: 600, step: 1 } },
    floorThickness: { kind: 'thickness', imperial: { min: 3, max: 36, step: 0.25 }, metric: { min: 8, max: 90, step: 0.5 } },
    doorHead: { kind: 'thickness', imperial: { min: 60, max: 120, step: 1 }, metric: { min: 150, max: 300, step: 1 } },
    windowSill: { kind: 'thickness', imperial: { min: 0, max: 120, step: 1 }, metric: { min: 0, max: 300, step: 1 } },
    stairLanding: { kind: 'thickness', imperial: { min: 0, max: 120, step: 1 }, metric: { min: 0, max: 300, step: 1 } },
    lotWidth: { kind: 'length', imperial: { min: 10, max: 1000, step: 0.25 }, metric: { min: 3, max: 304, step: 0.05 } },
    lotDepth: { kind: 'length', imperial: { min: 10, max: 1000, step: 0.25 }, metric: { min: 3, max: 304, step: 0.05 } },
    lotLeft: { kind: 'length', imperial: { step: 0.25, valid: [-1000, 1000] }, metric: { step: 0.05, valid: [-304, 304] } },
    lotTop: { kind: 'length', imperial: { step: 0.25, valid: [-1000, 1000] }, metric: { step: 0.05, valid: [-304, 304] } },
    lotSetback: { kind: 'length', imperial: { min: 0, max: 50, step: 0.25 }, metric: { min: 0, max: 15, step: 0.05 } },
    windowHead: { kind: 'thickness', imperial: { min: 12, max: 144, step: 1 }, metric: { min: 30, max: 360, step: 1 } },
  };

  /** A length in feet, shown in a form field. */
  const lengthField = ft => (isMetric() ? meters(ft) : roundText(ft));
  /** A wall thickness in feet, shown in a form field (inches or centimeters). */
  const thicknessField = ft => (isMetric() ? roundText(ft * CM_PER_FT, 1) : roundText(ft * 12));

  /**
   * Reads a form field in the current units and returns feet, or null when
   * the value is out of range. Thicknesses are rounded to ¼″ or 0.5 cm.
   */
  function readField(id, raw) {
    const field = FIELDS[id];
    const limits = field[units];
    const [lo, hi] = limits.valid || [limits.min, limits.max];
    const n = Number(raw);
    if (!Number.isFinite(n) || (lo !== undefined && n < lo) || (hi !== undefined && n > hi)) return null;
    if (field.kind === 'thickness') return isMetric() ? roundTo(n, 0.5) / CM_PER_FT : roundTo(n, 0.25) / 12;
    return isMetric() ? n / M_PER_FT : n;
  }

  /** Updates unit labels, field limits, and unit-dependent text in the page. */
  function applyUnits() {
    $('unitsImperial').setAttribute('aria-pressed', String(!isMetric()));
    $('unitsMetric').setAttribute('aria-pressed', String(isMetric()));
    for (const label of document.querySelectorAll('[data-unit]')) {
      const thickness = label.dataset.unit === 'thickness';
      label.textContent = isMetric() ? (thickness ? 'cm' : 'm') : (thickness ? 'in' : 'ft');
    }
    for (const [id, field] of Object.entries(FIELDS)) {
      const limits = field[units];
      for (const attr of ['min', 'max', 'step']) {
        if (limits[attr] === undefined) $(id).removeAttribute(attr);
        else $(id).setAttribute(attr, String(limits[attr]));
      }
    }
    $('unitName').textContent = isMetric() ? 'Meters' : 'Feet';
    $('gridLegend').textContent = `1 square = ${gridSquareText()}`;
    $('snapLabel').textContent = isMetric() ? '5 cm' : '3″';
  }

  // ==========================================================================
  // 4. Geometry
  // ==========================================================================

  /** Area covered by the union of rectangles, clipped to bounds (sweep line). */
  function unionArea(rects, bounds) {
    if (bounds.w <= 0 || bounds.h <= 0) return 0;
    const minX = bounds.x;
    const maxX = bounds.x + bounds.w;
    const minY = bounds.y;
    const maxY = bounds.y + bounds.h;
    const clampX = x => Math.max(minX, Math.min(maxX, x));

    const xs = [minX, maxX];
    for (const r of rects) xs.push(clampX(r.x), clampX(r.x + r.w));
    xs.sort((a, b) => a - b);

    let area = 0;
    for (let i = 1; i < xs.length; i++) {
      const left = xs[i - 1];
      const right = xs[i];
      if (right - left < 0.0001) continue;
      const intervals = rects
        .filter(r => r.x < right && r.x + r.w > left)
        .map(r => [Math.max(minY, r.y), Math.min(maxY, r.y + r.h)])
        .filter(([a, b]) => b > a)
        .sort((a, b) => a[0] - b[0]);
      let length = 0;
      let end = 0;
      for (const [a, b] of intervals) {
        length += Math.max(0, b - Math.max(a, end));
        end = Math.max(end, b);
      }
      area += (right - left) * length;
    }
    return area;
  }

  /** Opening, hinge, and swing geometry for a doorway on a room side. */
  function doorGeometry(d) {
    const r = findRoom(d.roomId);
    if (!r) return null;
    const side = d.side || 'east';
    const horizontal = isHorizontalSide(side);
    const axis = sidePosition(r, side);
    const start = horizontal ? { x: r.x + d.offset, y: axis } : { x: axis, y: r.y + d.offset };
    const end = horizontal ? { x: start.x + d.width, y: axis } : { x: axis, y: start.y + d.width };
    const hinge = d.hinge === 'end' ? end : start;
    const far = d.hinge === 'end' ? start : end;
    const inward = { north: { x: 0, y: 1 }, south: { x: 0, y: -1 }, west: { x: 1, y: 0 }, east: { x: -1, y: 0 } }[side]
      || { x: -1, y: 0 };
    const normal = d.swing === 'out' ? { x: -inward.x, y: -inward.y } : inward;
    return {
      room: r,
      side,
      horizontal,
      axis,
      start,
      end,
      hinge,
      far,
      open: { x: hinge.x + normal.x * d.width, y: hinge.y + normal.y * d.width },
      length: horizontal ? r.w : r.h,
    };
  }

  /**
   * The house wall a doorway is an entrance on, or null when it is not one.
   * A room inside the house counts when its door is in the exterior wall.
   * A room outside the house (an outdoor space, or a bath next to it) counts
   * only where its door sits on the stretch of house wall it touches. Its own side faces the opposite way, so west touches the
   * house's east wall and so on. A door on the far side, or past the end of
   * the house wall, is not an entrance.
   */
  function entranceSide(d) {
    const r = findRoom(d.roomId);
    if (!r) return null;
    const side = d.side || 'east';
    if (!isOutsideHouse(r)) return isExteriorSide(r, side) ? side : null;

    const houseSide = { north: 'south', south: 'north', west: 'east', east: 'west' }[side];
    const wallLine = { north: state.depth, south: 0, west: state.width, east: 0 }[side];
    if (Math.abs(sidePosition(r, side) - wallLine) > 0.01) return null;

    const g = doorGeometry(d);
    const doorStart = g.horizontal ? g.start.x : g.start.y;
    const wallLength = g.horizontal ? state.width : state.depth;
    const overlap = Math.min(doorStart + d.width, wallLength) - Math.max(doorStart, 0);
    return overlap > 0.01 ? houseSide : null;
  }

  /** Doorways on a floor that are entrances (see entranceSide). */
  function entranceDoors(floor) {
    return state.doors.filter(d => findRoom(d.roomId)?.floor === floor && entranceSide(d));
  }

  /** The parts of start..end that lie past a house wall of length houseLength. */
  function spansBeyondHouse(start, end, houseLength) {
    const spans = [];
    if (start < -0.01) spans.push([start, Math.min(end, 0)]);
    if (end > houseLength + 0.01) spans.push([Math.max(start, houseLength), end]);
    return spans;
  }

  /**
   * Wall segments for one enclosed room, as { o, pos, start, end, t, half, outside, shift }.
   * Inside the house they stop at the exterior wall. A room outside the house
   * (a garage) gets all its sides, drawn just inside its box, except along the
   * house wall it rests against. `shift` is that inward nudge.
   */
  function roomWallSegments(r, outside) {
    const e = state.exteriorWall;
    const W = state.width;
    const H = state.depth;
    const t = roomWallThickness(r);
    const segments = [];
    for (const side of ['north', 'south', 'west', 'east']) {
      if (!hasSide(r, side)) continue;
      const horizontal = isHorizontalSide(side);
      const pos = sidePosition(r, side);
      const half = !!r.halfWalls?.[side];
      const roomStart = horizontal ? r.x : r.y;
      const roomEnd = roomStart + (horizontal ? r.w : r.h);
      const base = { o: horizontal ? 'h' : 'v', pos, t, half, outside };

      if (outside) {
        const inward = side === 'north' || side === 'west' ? 1 : -1;
        const houseLine = { north: H, south: 0, west: W, east: 0 }[side];
        const spans = Math.abs(pos - houseLine) < 0.01
          ? spansBeyondHouse(roomStart, roomEnd, horizontal ? W : H)
          : [[roomStart, roomEnd]];
        for (const [start, end] of spans) segments.push({ ...base, start, end, shift: inward * t / 2 });
        continue;
      }

      if (horizontal ? (pos <= e + 0.001 || pos >= H - e - 0.001) : (pos <= e + 0.001 || pos >= W - e - 0.001)) continue;
      const start = Math.max(e, roomStart);
      const end = Math.min(horizontal ? W - e : H - e, roomEnd);
      if (end > start + 0.01) segments.push({ ...base, start, end, shift: 0 });
    }
    return segments;
  }

  /** Merges overlapping collinear segments, then cuts the doorway openings out of them. */
  function mergeAndCutWalls(raw, floor) {
    // Group collinear segments of the same thickness.
    const grouped = new Map();
    for (const seg of raw) {
      const key = `${seg.o}:${seg.pos.toFixed(3)}:${seg.t.toFixed(4)}:${seg.half ? 'half' : 'full'}:${seg.outside}:${seg.shift}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(seg);
    }

    const segments = [];
    for (const group of grouped.values()) {
      group.sort((a, b) => a.start - b.start);
      const merged = [];
      for (const seg of group) {
        const last = merged.at(-1);
        if (last && seg.start <= last.end + 0.01) last.end = Math.max(last.end, seg.end);
        else merged.push({ ...seg });
      }

      // A door only cuts the walls of rooms of its own kind (inside or outside the house).
      const openings = state.doors
        .filter(d => {
          const g = doorGeometry(d);
          return g && g.room.floor === floor && wallMode(g.room) === 'enclosed'
            && isOutsideHouse(g.room) === group[0].outside
            && (g.horizontal ? 'h' : 'v') === group[0].o && Math.abs(g.axis - group[0].pos) < 0.01;
        })
        .map(d => {
          const g = doorGeometry(d);
          return { start: g.horizontal ? g.start.x : g.start.y, end: g.horizontal ? g.end.x : g.end.y };
        })
        .sort((a, b) => a.start - b.start);

      for (const seg of merged) {
        let cursor = seg.start;
        for (const opening of openings) {
          if (opening.end <= cursor || opening.start >= seg.end) continue;
          if (opening.start > cursor + 0.01) segments.push({ ...seg, start: cursor, end: Math.min(opening.start, seg.end) });
          cursor = Math.max(cursor, opening.end);
          if (cursor >= seg.end) break;
        }
        if (cursor < seg.end - 0.01) segments.push({ ...seg, start: cursor });
      }
    }
    return segments;
  }

  /**
   * Builds the partition walls for one floor: every enclosed room side that
   * isn't on the exterior wall, merged where rooms share a wall, with doorway
   * openings cut out. Also returns the areas used by the metrics. Walls of rooms
   * outside the house are in `outsideSegments` and never count in those areas.
   */
  function wallModel(floor) {
    const e = state.exteriorWall;
    const W = state.width;
    const H = state.depth;
    const shell = { x: e, y: e, w: Math.max(0, W - 2 * e), h: Math.max(0, H - 2 * e) };

    const raw = [];
    for (const r of state.rooms.filter(room => room.floor === floor && wallMode(room) === 'enclosed')) {
      raw.push(...roomWallSegments(r, isOutsideHouse(r)));
    }

    const segments = mergeAndCutWalls(raw.filter(s => !s.outside), floor);
    const outsideSegments = mergeAndCutWalls(raw.filter(s => s.outside), floor);

    const rects = segments.map(s => (s.o === 'h'
      ? { x: s.start, y: s.pos - s.t / 2, w: s.end - s.start, h: s.t }
      : { x: s.pos - s.t / 2, y: s.start, w: s.t, h: s.end - s.start }));

    return {
      shell,
      raw,
      segments,
      outsideSegments,
      rects,
      shellArea: shell.w * shell.h,
      partitionArea: unionArea(rects, shell),
    };
  }

  /** Approximate floor area of a room box after subtracting partition walls. */
  function approximateRoomClear(r, model) {
    const s = model.shell;
    const x = Math.max(r.x, s.x);
    const y = Math.max(r.y, s.y);
    const right = Math.min(r.x + r.w, s.x + s.w);
    const bottom = Math.min(r.y + r.h, s.y + s.h);
    const bounds = { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
    return Math.max(0, bounds.w * bounds.h - unionArea(model.rects, bounds));
  }

  /** Where a window sits in the exterior wall. Offsets run from the top or left end. */
  function windowGeometry(w) {
    const W = state.width;
    const H = state.depth;
    const e = state.exteriorWall > 0 ? state.exteriorWall : 0.4;
    const horizontal = isHorizontalSide(w.side);
    const a = w.offset;
    const rect = w.side === 'north' ? { x: a, y: 0, w: w.width, h: e }
      : w.side === 'south' ? { x: a, y: H - e, w: w.width, h: e }
      : w.side === 'west' ? { x: 0, y: a, w: e, h: w.width }
      : { x: W - e, y: a, w: e, h: w.width };
    return { horizontal, length: horizontal ? W : H, start: a, end: a + w.width, rect, e };
  }

  /**
   * The room a window belongs to: the room whose outside wall the window
   * overlaps most. If it overlaps none, the nearest one. The selected room
   * wins a tie. Returns null when no room touches that wall.
   */
  function roomBesideWindow(w) {
    const horizontal = isHorizontalSide(w.side);
    let best = null;
    let bestScore = -Infinity;
    for (const r of state.rooms) {
      if (r.floor !== w.floor || !isExteriorSide(r, w.side)) continue;
      const start = horizontal ? r.x : r.y;
      const end = start + (horizontal ? r.w : r.h);
      // Positive: how far the window overlaps the room. Negative: the gap.
      const score = Math.min(end, w.offset + w.width) - Math.max(start, w.offset);
      if (score > bestScore || (score === bestScore && r.id === state.selectedRoom)) {
        best = r;
        bestScore = score;
      }
    }
    return best;
  }

  /** Slides a window along its wall so it is centered on the room's side of that wall. */
  function centerWindowOnRoom(w, room) {
    const horizontal = isHorizontalSide(w.side);
    const start = horizontal ? room.x : room.y;
    const span = horizontal ? room.w : room.h;
    const wallLength = horizontal ? state.width : state.depth;
    w.offset = Math.max(0, Math.min(wallLength - w.width, start + (span - w.width) / 2));
  }

  /** Turns the whole house 90° clockwise on every floor. */
  /**
   * Turns the plan 90° clockwise. By default the lot turns with the house.
   * With keepLot, only the building turns: the lot stays where it is and the
   * house keeps its center on it.
   */
  function rotateClockwise({ keepLot = false } = {}) {
    const W = state.width;
    const H = state.depth;
    const next = { north: 'east', east: 'south', south: 'west', west: 'north' };
    const turn = box => {
      const x = H - (box.y + box.h);
      const y = box.x;
      box.x = x;
      box.y = y;
      [box.w, box.h] = [box.h, box.w];
    };

    for (const d of state.doors) {
      const r = findRoom(d.roomId);
      if (!r) continue;
      const side = d.side || 'east';
      if (side === 'east' || side === 'west') {
        d.offset = r.h - d.offset - d.width;
        d.hinge = d.hinge === 'end' ? 'start' : 'end';
      }
      d.side = next[side];
    }
    for (const w of state.windows) {
      if (w.side === 'east' || w.side === 'west') w.offset = H - w.offset - w.width;
      w.side = next[w.side];
    }
    for (const r of state.rooms) {
      turn(r);
      if (r.stair) r.stair = { ...r.stair, climb: next[r.stair.climb] || r.stair.climb };
      if (r.walls) {
        r.walls = {
          north: r.walls.west !== false,
          east: r.walls.north !== false,
          south: r.walls.east !== false,
          west: r.walls.south !== false,
        };
      }
      if (r.halfWalls) {
        r.halfWalls = {
          north: r.halfWalls.west === true,
          east: r.halfWalls.north === true,
          south: r.halfWalls.east === true,
          west: r.halfWalls.south === true,
        };
      }
    }
    for (const it of state.items) turn(it);
    if (state.lot?.width > 0 && !keepLot) {
      const box = { x: -state.lot.left, y: -state.lot.top, w: state.lot.width, h: state.lot.depth };
      turn(box);
      Object.assign(state.lot, { left: -box.x, top: -box.y, width: box.w, depth: box.h });
    }
    for (const f of state.fixtures || []) {
      const x = H - f.y;
      const y = f.x;
      f.x = x;
      f.y = y;
    }
    if (next[state.frontSide]) state.frontSide = next[state.frontSide];
    state.width = H;
    state.depth = W;
    if (keepLot && state.lot?.width > 0) {
      // The turned house is H wide and W deep. Put its center back where it was.
      const centerX = state.lot.left + W / 2;
      const centerY = state.lot.top + H / 2;
      state.lot.left = snap(centerX - H / 2);
      state.lot.top = snap(centerY - W / 2);
    }
  }

  /** Where a spot on a stair lands on the plan. `along` runs the way the stairs climb, and `across` is measured from the left side when facing that way. */
  function stairPoint(room, climb, [along, across]) {
    if (climb === 'north') return { x: room.x + across, y: room.y + room.h - along };
    if (climb === 'south') return { x: room.x + room.w - across, y: room.y + along };
    if (climb === 'east') return { x: room.x + along, y: room.y + across };
    return { x: room.x + room.w - along, y: room.y + room.h - across };
  }

  /**
   * One flight of stairs, as a strip of the stair box in stair coordinates.
   * `axis` is the way it runs, `dir` is 1 or -1 along that axis, and `treads`
   * are spread evenly, so each is a step's share of the strip. Returns the
   * strip with its tread lines and the depth of one tread.
   */
  function stairFlight(axis, dir, along, across, treads) {
    const [lo, hi] = axis === 'along' ? along : across;
    const start = dir > 0 ? lo : hi;
    const lines = [];
    for (let i = 1; i <= treads; i++) {
      const pos = start + dir * (hi - lo) * i / (treads + 1);
      lines.push(axis === 'along' ? [[pos, across[0]], [pos, across[1]]] : [[along[0], pos], [along[1], pos]]);
    }
    const strip = axis === 'along' ? across : along;
    return { along, across, lines, treadDepth: (hi - lo) / (treads + 1), width: strip[1] - strip[0] };
  }

  /**
   * Lays a stair out as flights, landings, and an arrow path, all in stair
   * coordinates (see stairPoint). The risers come from the floor to floor
   * height. A landing counts as one step, so it takes one tread away.
   */
  function stairPlan(room) {
    const stair = stairOf(room);
    const vertical = stair.climb === 'north' || stair.climb === 'south';
    const length = vertical ? room.h : room.w;
    const width = vertical ? room.w : room.h;
    const rise = stairRise(room);
    const risers = Math.max(1, Math.ceil(rise / MAX_RISER - 0.001));
    const plan = { stair, length, width, rise, risers, flights: [], landings: [], path: [], spiral: stair.type === 'spiral' };
    if (plan.spiral) {
      plan.treads = risers - 1;
      return plan;
    }

    const turns = stair.type === 'turnLeft' || stair.type === 'turnRight';
    const landing = Math.min(stair.landing, length, turns ? width : length);
    const treads = Math.max(0, risers - 1 - (landing > 0 ? 1 : 0));
    const first = Math.ceil(treads / 2);
    const second = treads - first;
    const edge = 0.3;
    plan.treads = treads;

    if (stair.type === 'straight') {
      const run = (length - landing) / 2;
      if (landing > 0) {
        plan.flights.push(
          stairFlight('along', 1, [0, run], [0, width], first),
          stairFlight('along', 1, [run + landing, length], [0, width], second),
        );
        plan.landings.push({ along: [run, run + landing], across: [0, width] });
      } else {
        plan.flights.push(stairFlight('along', 1, [0, length], [0, width], treads));
      }
      plan.path = [[edge, width / 2], [length - edge, width / 2]];
    } else if (turns) {
      // The first flight hugs the side opposite the turn, so the second flight crosses the rest of the box.
      const left = stair.type === 'turnLeft';
      const near = left ? [width - landing, width] : [0, landing];
      const far = left ? [0, width - landing] : [landing, width];
      plan.flights.push(
        stairFlight('along', 1, [0, length - landing], near, first),
        stairFlight('across', left ? -1 : 1, [length - landing, length], far, second),
      );
      plan.landings.push({ along: [length - landing, length], across: near });
      const nearMiddle = (near[0] + near[1]) / 2;
      plan.path = [[edge, nearMiddle], [length - landing / 2, nearMiddle], [length - landing / 2, left ? edge : width - edge]];
    } else {
      const left = stair.turn === 'left';
      const out = left ? [width / 2, width] : [0, width / 2];
      const back = left ? [0, width / 2] : [width / 2, width];
      plan.flights.push(
        stairFlight('along', 1, [0, length - landing], out, first),
        stairFlight('along', -1, [0, length - landing], back, second),
      );
      plan.landings.push({ along: [length - landing, length], across: [0, width] });
      const outMiddle = (out[0] + out[1]) / 2;
      const backMiddle = (back[0] + back[1]) / 2;
      plan.path = [[edge, outMiddle], [length - landing / 2, outMiddle], [length - landing / 2, backMiddle], [edge, backMiddle]];
    }

    plan.minTread = Math.min(...plan.flights.map(f => f.treadDepth));
    plan.minWidth = Math.min(...plan.flights.map(f => f.width));
    return plan;
  }

  // ==========================================================================
  // 5. Layout checks
  //    Each check returns { level: 'good' | 'warning' | 'error', text }.
  // ==========================================================================

  // Two stretches along a wall count as overlapping when they share more than
  // this much. Everything snaps to 0.25′ or 5 cm, so a real overlap is always
  // larger, and this only keeps rounding noise from old files from warning.
  const WALL_OVERLAP_TOLERANCE = 0.1;

  /** True when stretches a and b, given as start and end along one wall, overlap. */
  const overlapsOnWall = (startA, endA, startB, endB) => (
    Math.min(endA, endB) - Math.max(startA, startB) > WALL_OVERLAP_TOLERANCE
  );

  function windowChecks() {
    const out = [];
    const e = state.exteriorWall;
    const windows = state.windows.filter(w => w.floor === state.floor);

    for (const w of windows) {
      const g = windowGeometry(w);
      if (g.start < e - 0.01 || g.end > g.length - e + 0.01) {
        out.push({ level: 'warning', text: `A window on the ${SIDE_NAME[w.side]} wall runs into a corner or past the wall.` });
      }
    }

    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        const a = windows[i];
        const b = windows[j];
        if (a.side === b.side && overlapsOnWall(a.offset, a.offset + a.width, b.offset, b.offset + b.width)) {
          out.push({ level: 'warning', text: `Two windows overlap on the ${SIDE_NAME[a.side]} wall.` });
        }
      }
    }

    for (const d of entranceDoors(state.floor)) {
      const g = doorGeometry(d);
      if (!g) continue;
      const wallSide = entranceSide(d);
      const a = g.horizontal ? Math.min(g.start.x, g.end.x) : Math.min(g.start.y, g.end.y);
      const b = a + d.width;
      for (const w of windows) {
        if (w.side === wallSide && overlapsOnWall(a, b, w.offset, w.offset + w.width)) {
          out.push({ level: 'warning', text: `A window overlaps the entrance door on the ${SIDE_NAME[w.side]} wall.` });
        }
      }
    }
    return out;
  }

  /** Doors and windows that reach higher than the wall they are in. */
  function heightChecks() {
    const out = [];
    const limit = wallHeight(state.floor);
    for (const w of state.windows.filter(win => win.floor === state.floor)) {
      if (windowHead(w) > limit + 0.01) {
        out.push({ level: 'warning', text: `A window on the ${SIDE_NAME[w.side]} wall is taller than the ${fmtLength(limit)} wall.` });
      }
    }
    for (const d of state.doors) {
      if (findRoom(d.roomId)?.floor === state.floor && doorHead(d) > limit + 0.01) {
        out.push({ level: 'warning', text: `A doorway in ${findRoom(d.roomId).name} is taller than the ${fmtLength(limit)} wall.` });
      }
    }
    return out;
  }

  /** Hints for the stairs on this floor. Not code advice. */
  function stairChecks(rooms) {
    const out = [];
    for (const room of rooms.filter(r => r.kind === 'stairs')) {
      if (!floorAbove(room.floor) && !floorBelow(room.floor)) continue;
      const plan = stairPlan(room);
      if (plan.spiral) {
        if (Math.min(room.w, room.h) < MIN_SPIRAL_DIAMETER) {
          out.push({ level: 'warning', text: `${room.name} is ${fmtLength(Math.min(room.w, room.h))} across. A spiral stair usually needs about ${fmtLength(MIN_SPIRAL_DIAMETER)}.` });
        }
        continue;
      }
      if (plan.minTread < MIN_TREAD - 0.01) {
        out.push({ level: 'warning', text: `${room.name} treads come out about ${fmtInches(plan.minTread)} deep. Make the box longer, or use a turn or U shape.` });
      }
      if (plan.minWidth < MIN_STAIR_WIDTH - 0.01) {
        out.push({ level: 'warning', text: `${room.name} is about ${fmtLength(plan.minWidth)} wide. Check the passage width.` });
      }
    }
    return out;
  }

  /**
   * Warnings when the house, or an outdoor space on this floor, comes closer
   * to a lot line than the setback. Quiet when the lot is off.
   */
  function lotChecks(rooms) {
    const lot = lotBox();
    if (!lot) return [];
    const setback = state.lot.setback;
    const out = [];

    const checkBox = (box, name, isOutdoorSpace) => {
      const gaps = {
        west: box.x - lot.x,
        north: box.y - lot.y,
        east: lot.x + lot.w - (box.x + box.w),
        south: lot.y + lot.h - (box.y + box.h),
      };
      for (const side of ['west', 'north', 'east', 'south']) {
        const gap = gaps[side];
        if (gap < -0.01) {
          out.push({ level: 'error', text: `${name} goes ${fmtLength(-gap)} past the ${SIDE_NAME[side]} lot line.` });
        } else if (gap < setback - 0.01) {
          const note = isOutdoorSpace ? ` Outdoor spaces may be subject to the ${fmtLength(setback)} setback.` : ` That is inside the ${fmtLength(setback)} setback.`;
          out.push({ level: 'warning', text: `${name} is ${fmtLength(gap)} from the ${SIDE_NAME[side]} lot line.${note}` });
        }
      }
    };

    checkBox({ x: 0, y: 0, w: state.width, h: state.depth }, 'The house', false);
    for (const r of rooms.filter(isOutdoor)) checkBox(r, r.name, true);
    return out;
  }

  /** The wall opening of a doorway as a box, as thick as the wall it cuts. */
  function doorwayBox(d, g) {
    const thickness = isExteriorSide(g.room, g.side) ? state.exteriorWall : roomWallThickness(g.room);
    return g.horizontal
      ? { x: g.start.x, y: g.axis - thickness / 2, w: d.width, h: thickness }
      : { x: g.axis - thickness / 2, y: g.start.y, w: thickness, h: d.width };
  }

  /** A bifold door has two panels, or four (a pair at each jamb) once it is wider than 4 feet. */
  const bifoldPanelCount = width => (width > 4 ? 4 : 2);

  /** A quarter circle swept by a door, from its hinge, along the wall, and out the way it opens. */
  function swingZone(hinge, along, across, radius) {
    const corner = { x: hinge.x + (along.x + across.x) * radius, y: hinge.y + (along.y + across.y) * radius };
    return {
      hinge,
      radius,
      along,
      across,
      box: {
        x: Math.min(hinge.x, corner.x),
        y: Math.min(hinge.y, corner.y),
        w: Math.abs(corner.x - hinge.x),
        h: Math.abs(corner.y - hinge.y),
      },
    };
  }

  /**
   * The areas a door sweeps open. A swinging door has one, a bifold has one
   * half its width (or one at each jamb, a quarter of its width each, when it
   * has four panels), and a cased opening has none.
   */
  function doorSwings(d) {
    const g = doorGeometry(d);
    if (!g || d.swing === 'none') return [];
    const across = { x: (g.open.x - g.hinge.x) / d.width, y: (g.open.y - g.hinge.y) / d.width };
    const forward = g.horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const back = { x: -forward.x, y: -forward.y };
    if (!d.bifold) return [swingZone(g.hinge, g.hinge === g.start ? forward : back, across, d.width)];
    if (bifoldPanelCount(d.width) === 2) {
      return [swingZone(g.hinge, g.hinge === g.start ? forward : back, across, d.width / 2)];
    }
    return [swingZone(g.start, forward, across, d.width / 4), swingZone(g.end, back, across, d.width / 4)];
  }

  /** True when a box reaches into the quarter circle of a door swing. */
  function boxHitsSwing(box, swing) {
    const shared = overlapBox(box, swing.box);
    if (shared.w < 0.01 || shared.h < 0.01) return false;
    // The point of the shared area nearest the hinge decides whether it is inside the arc.
    const nearestX = Math.min(Math.max(swing.hinge.x, shared.x), shared.x + shared.w);
    const nearestY = Math.min(Math.max(swing.hinge.y, shared.y), shared.y + shared.h);
    return Math.hypot(nearestX - swing.hinge.x, nearestY - swing.hinge.y) < swing.radius - 0.01;
  }

  function pointInSwing(point, swing) {
    const dx = point.x - swing.hinge.x;
    const dy = point.y - swing.hinge.y;
    const along = dx * swing.along.x + dy * swing.along.y;
    const across = dx * swing.across.x + dy * swing.across.y;
    return along >= 0 && across >= 0 && Math.hypot(dx, dy) <= swing.radius;
  }

  /** Area where two door swings cover the same floor, found by checking points in a fine grid. */
  function swingOverlapArea(a, b) {
    const cell = 0.125;
    const shared = overlapBox(a.box, b.box);
    let hits = 0;
    for (let x = shared.x + cell / 2; x < shared.x + shared.w; x += cell) {
      for (let y = shared.y + cell / 2; y < shared.y + shared.h; y += cell) {
        if (pointInSwing({ x, y }, a) && pointInSwing({ x, y }, b)) hits++;
      }
    }
    return hits * cell * cell;
  }

  const doorLabel = g => `the ${SIDE_NAME[g.side]} door on ${g.room.name}`;

  /** Items are checked against walls, the footprint, and each other. */
  function itemChecks(model) {
    const out = [];
    const bad = new Set();
    const e = state.exteriorWall;
    const W = state.width;
    const H = state.depth;
    const items = state.items.filter(it => it.floor === state.floor && !it.marker);

    const walls = model.rects.map(r => ({ ...r, kind: 'an interior wall' }));
    if (e > 0) {
      walls.push(
        { x: 0, y: 0, w: W, h: e, kind: 'the exterior wall' },
        { x: 0, y: H - e, w: W, h: e, kind: 'the exterior wall' },
        { x: 0, y: e, w: e, h: H - 2 * e, kind: 'the exterior wall' },
        { x: W - e, y: e, w: e, h: H - 2 * e, kind: 'the exterior wall' },
      );
    }

    for (const it of items) {
      if (it.x < -0.01 || it.y < -0.01 || it.x + it.w > W + 0.01 || it.y + it.h > H + 0.01) {
        out.push({ level: 'error', text: `${it.name} extends outside the footprint.` });
        bad.add(it.id);
        continue;
      }
      const hit = walls.find(wall => intersection(it, wall) > 0.01);
      if (hit) {
        out.push({ level: 'error', text: `${it.name} overlaps ${hit.kind}.` });
        bad.add(it.id);
      }
    }

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (intersection(a, b) > 0.01) {
          out.push({ level: 'warning', text: `${a.name} overlaps ${b.name}.` });
          bad.add(a.id);
          bad.add(b.id);
        }
      }
    }

    for (const d of state.doors.filter(door => findRoom(door.roomId)?.floor === state.floor)) {
      const g = doorGeometry(d);
      const swings = doorSwings(d);
      const opening = doorwayBox(d, g);
      for (const it of items) {
        if (intersection(it, opening) > 0.01) {
          out.push({ level: 'error', text: `${it.name} blocks ${doorLabel(g)}.` });
          bad.add(it.id);
        } else if (swings.some(swing => boxHitsSwing(it, swing))) {
          out.push({ level: 'warning', text: `${it.name} is in the swing of ${doorLabel(g)}.` });
          bad.add(it.id);
        }
      }
    }
    return { out, bad };
  }

  /** True when two boxes touch along an edge (or overlap) by more than 6″. */
  function roomsConnect(a, b) {
    const xOverlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const yOverlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const xGap = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w));
    const yGap = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
    return (xOverlap > 0.5 && yGap <= 0.15) || (yOverlap > 0.5 && xGap <= 0.15);
  }

  const sameBox = (a, b) =>
    Math.abs(a.x - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5 && Math.abs(a.w - b.w) <= 0.5 && Math.abs(a.h - b.h) <= 0.5;

  /** All layout checks for the current floor, shown in the Layout Checks panel. */
  function layoutChecks(model) {
    const out = [];
    const rooms = state.rooms.filter(r => r.floor === state.floor);

    // Footprint, size, and overlap
    for (const r of rooms) {
      if (!isOutdoor(r) && !insideFootprint(r)) {
        out.push({ level: 'error', text: `${r.name} extends beyond the ${fmtSize(state.width, state.depth)} footprint.` });
      }
      if (r.w < 3 || r.h < 3) {
        out.push({ level: 'warning', text: `${r.name} has a side under ${fmtLength(3)}. Check access and intended use.` });
      }
    }
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        if (intersection(rooms[i], rooms[j]) > 0.15) {
          out.push({ level: 'error', text: `${rooms[i].name} overlaps ${rooms[j].name} by ${fmtArea(intersection(rooms[i], rooms[j]), false)}.` });
        }
      }
    }

    // Main floor circulation: walk from the hallway through connected
    // hallway spaces and make sure entries and stairs are reachable.
    if (state.floor === 'main') {
      const path = findRoom('hall');
      const stairs = findRoom('stairs-main');
      const pathOnMain = path?.floor === 'main';
      if (pathOnMain && path.w < 3.5) {
        out.push({ level: 'warning', text: `The circulation path is ${fmtLength(path.w)} wide. Check passage and turning space.` });
      }

      const reach = new Set();
      if (pathOnMain) {
        const circulation = rooms.filter(r => r.kind === 'circulation' && !r.id.startsWith('stairs'));
        const queue = [path];
        reach.add(path.id);
        while (queue.length) {
          const current = queue.shift();
          for (const r of circulation) {
            if (!reach.has(r.id) && roomsConnect(current, r)) {
              reach.add(r.id);
              queue.push(r);
            }
          }
        }
      }
      const reached = target => [...reach].some(id => roomsConnect(findRoom(id), target));

      if (pathOnMain) {
        for (const r of rooms.filter(room => room.kind === 'entry')) {
          if (!reached(r)) out.push({ level: 'warning', text: `${r.name} isn’t connected to the hallway.` });
        }
      }
      const hasOtherFloor = state.basementEnabled || state.upperEnabled;
      if (pathOnMain && hasOtherFloor && stairs?.floor === 'main' && !reached(stairs)) {
        out.push({ level: 'warning', text: 'The circulation path no longer reaches the stairs.' });
      }
    }

    // Stairs line up between floors
    const mainStairs = findRoom('stairs-main');
    const basementStairs = findRoom('stairs-basement');
    if (state.basementEnabled) {
      if (!mainStairs || mainStairs.floor !== 'main' || !basementStairs || basementStairs.floor !== 'basement') {
        out.push({ level: 'warning', text: 'Main-to-basement stairs are missing from one of the floors.' });
      } else if (!sameBox(mainStairs, basementStairs)) {
        out.push({ level: 'error', text: 'Main and basement stairs do not line up. Align them before treating either floor as feasible.' });
      }
    }
    if (state.upperEnabled) {
      const upperStairs = findRoom('stairs-upper');
      if (!mainStairs || mainStairs.floor !== 'main' || !upperStairs || upperStairs.floor !== 'upper') {
        out.push({ level: 'warning', text: 'The second floor needs a stair connection to the main floor.' });
      } else if (!sameBox(mainStairs, upperStairs)) {
        out.push({ level: 'warning', text: 'Second-floor and main-floor stair footprints do not line up.' });
      }
    }

    // Basement mechanical room
    const mech = findRoom('mech');
    const bath = findRoom('basement-bath');
    if (state.floor === 'basement') {
      if (mech?.floor === 'basement' && (Math.min(mech.w, mech.h) < 5 || mech.w * mech.h < 56)) {
        out.push({ level: 'warning', text: `Mechanical room is under about ${fmtArea(56, false)} or narrower than ${fmtLength(5)}; service access needs review.` });
      }
      const adjacent = mech && bath && (
        intersection({ x: mech.x, y: mech.y, w: mech.w + 0.05, h: mech.h + 0.05 }, bath) >= 0.01
        || Math.abs(mech.y + mech.h - bath.y) <= 0.5
        || Math.abs(bath.y + bath.h - mech.y) <= 0.5
        || Math.abs(mech.x + mech.w - bath.x) <= 0.5
        || Math.abs(bath.x + bath.w - mech.x) <= 0.5
      );
      if (mech?.floor === 'basement' && bath?.floor === 'basement' && !adjacent) {
        out.push({ level: 'warning', text: 'Bath and mechanical room are no longer adjacent; laundry plumbing may be less direct.' });
      }
    }

    // Windows and entrances
    out.push(...windowChecks());
    out.push(...heightChecks());
    out.push(...stairChecks(rooms));
    out.push(...lotChecks(rooms));
    if (!FLOORS.some(floor => entranceDoors(floor).length)) {
      out.push({ level: 'warning', text: 'No entrance yet. Add a doorway on an outside wall.' });
    }

    // Doorways on this floor
    const doors = state.doors.filter(d => findRoom(d.roomId)?.floor === state.floor);
    for (const d of doors) {
      const g = doorGeometry(d);
      if (!g) continue;
      const a = g.horizontal ? g.start.x : g.start.y;
      const b = a + d.width;
      const onWall = model.raw.some(s => s.o === (g.horizontal ? 'h' : 'v')
        && Math.abs(s.pos - g.axis) < 0.01 && s.start < b && s.end > a);
      if (wallMode(g.room) === 'enclosed' && !onWall && !entranceSide(d)) {
        out.push({ level: 'warning', text: `Door on ${g.room.name} is on a side with no wall. Turn that wall on or move the doorway.` });
      }
      if (wallMode(g.room) !== 'enclosed') {
        out.push({ level: 'warning', text: `${g.room.name} is open plan; its doorway has no partition wall to cut.` });
      }
      // A swinging door needs room beside it for the leaf and trim to clear the
      // corner. A cased opening has nothing to clear, and a bifold folds back
      // against its own jamb, so both only have to fit on the wall.
      const isCased = d.swing === 'none';
      const cornerMargin = isCased || d.bifold ? 0 : 0.5;
      if (d.offset < cornerMargin - 0.001 || d.offset + d.width > g.length - cornerMargin + 0.001) {
        const kind = isCased ? 'Cased opening' : 'Bifold door';
        out.push({
          level: 'warning',
          text: cornerMargin === 0
            ? `${kind} on ${g.room.name} extends past the wall.`
            : `Door on ${g.room.name} is too close to a corner or extends past the wall.`,
        });
      }
      if (d.width < 2.5) {
        out.push({ level: 'warning', text: `Door on ${g.room.name} is under ${fmtLength(2.5)} wide. Check the intended access.` });
      }
    }
    for (let i = 0; i < doors.length; i++) {
      for (let j = i + 1; j < doors.length; j++) {
        const a = doorGeometry(doors[i]);
        const b = doorGeometry(doors[j]);
        if (!a || !b) continue;
        const sameWall = a.horizontal === b.horizontal && Math.abs(a.axis - b.axis) < 0.01;
        const startA = a.horizontal ? a.start.x : a.start.y;
        const startB = b.horizontal ? b.start.x : b.start.y;
        if (sameWall && overlapsOnWall(startA, startA + doors[i].width, startB, startB + doors[j].width)) {
          out.push({ level: 'warning', text: 'Two doorway openings overlap on the same wall.' });
          continue;
        }
        const swingsA = doorSwings(doors[i]);
        const swingsB = doorSwings(doors[j]);
        if (swingsA.some(swingA => swingsB.some(swingB => swingOverlapArea(swingA, swingB) > 0.5))) {
          out.push({ level: 'warning', text: `The swings of ${doorLabel(a)} and ${doorLabel(b)} overlap.` });
        }
      }
    }

    if (!out.length) {
      out.push({ level: 'good', text: 'No obvious overlaps or placement conflicts found. Door swings, clearances, structure, and code still need review.' });
    }
    return out;
  }

  // ==========================================================================
  // 6. Plan drawing (SVG)
  // ==========================================================================

  function element(tag, attrs = {}, parent = svg) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    parent.appendChild(el);
    return el;
  }

  function label(x, y, value, className, parent = svg) {
    const el = element('text', { x, y, class: className }, parent);
    el.textContent = value;
    return el;
  }

  /** An arrow along a path (plan points), with UP or DN at the end where the climb starts. */
  function drawStairArrow(points, goesUp, parent) {
    element('path', { d: `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`, class: 'stair-arrow' }, parent);
    const last = points.length - 1;
    const tip = points[goesUp ? last : 0];
    const before = points[goesUp ? last - 1 : 1];
    const length = Math.hypot(tip.x - before.x, tip.y - before.y) || 1;
    const dx = (tip.x - before.x) / length;
    const dy = (tip.y - before.y) / length;
    const size = 0.5;
    const base = { x: tip.x - dx * size, y: tip.y - dy * size };
    const side = size * 0.45;
    element('path', {
      d: `M ${tip.x} ${tip.y} L ${base.x - dy * side} ${base.y + dx * side} L ${base.x + dy * side} ${base.y - dx * side} Z`,
      class: 'stair-arrow-head',
    }, parent);

    // The label sits at the tail, a little way along the path.
    const tail = points[goesUp ? 0 : last];
    const next = points[goesUp ? 1 : last - 1];
    const run = Math.hypot(next.x - tail.x, next.y - tail.y) || 1;
    const text = label(tail.x + (next.x - tail.x) / run * 0.75, tail.y + (next.y - tail.y) / run * 0.75 + 0.25, goesUp ? 'UP' : 'DN', 'stair-text', parent);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '0.7px');
  }

  /** A spiral stair: a circle with a tread line every so often and an arrow winding around it. */
  function drawSpiral(room, plan, goesUp, parent) {
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const radius = Math.max(0.5, Math.min(room.w, room.h) / 2 - 0.1);
    const hub = Math.min(0.35, radius / 4);
    element('circle', { cx, cy, r: radius, class: 'stair-line' }, parent);
    element('circle', { cx, cy, r: hub, class: 'stair-line' }, parent);

    // The first tread sits behind the climb direction. Turn right winds clockwise going up.
    const startAngle = { north: Math.PI / 2, east: Math.PI, south: -Math.PI / 2, west: 0 }[plan.stair.climb];
    const sign = plan.stair.turn === 'right' ? 1 : -1;
    const spot = (angle, r) => ({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    for (let i = 1; i <= plan.treads; i++) {
      const angle = startAngle + sign * 2 * Math.PI * i / (plan.treads + 1);
      const from = spot(angle, hub);
      const to = spot(angle, radius);
      element('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: 'stair-line' }, parent);
    }
    const arc = [];
    for (let step = 0; step <= 18; step++) arc.push(spot(startAngle + sign * 2 * Math.PI * 0.85 * step / 18, radius * 0.62));
    drawStairArrow(arc, goesUp, parent);
  }

  /** Tread lines, landings, and the climb arrow for a stair room. */
  function drawStairs(room, group) {
    const plan = stairPlan(room);
    const art = element('g', { class: 'stair-art' }, group);
    const goesUp = !!floorAbove(room.floor);
    if (plan.spiral) {
      drawSpiral(room, plan, goesUp, art);
      return;
    }

    const at = spot => stairPoint(room, plan.stair.climb, spot);
    const outline = (along, across) => {
      const corners = [[along[0], across[0]], [along[1], across[0]], [along[1], across[1]], [along[0], across[1]]].map(at);
      return `M ${corners.map(p => `${p.x} ${p.y}`).join(' L ')} Z`;
    };
    for (const flight of plan.flights) {
      element('path', { d: outline(flight.along, flight.across), class: 'stair-line' }, art);
      for (const [a, b] of flight.lines) {
        const from = at(a);
        const to = at(b);
        element('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: 'stair-line' }, art);
      }
    }
    for (const landing of plan.landings) element('path', { d: outline(landing.along, landing.across), class: 'stair-line' }, art);
    drawStairArrow(plan.path.map(at), goesUp, art);
  }

  function drawRoom(r) {
    const group = element('g', {
      'data-room': r.id,
      ...(r.kind === 'stairs' ? { class: 'stairs-room' } : {}),
      'data-focus-key': `plan-room:${r.id}`,
      role: 'button',
      tabindex: '0',
      'aria-label': `${r.name}, ${spokenSize(r.w, r.h)}. Select or drag to move.`,
    });
    element('rect', {
      x: r.x,
      y: r.y,
      width: r.w,
      height: r.h,
      rx: 0.15,
      stroke: '#8aa7ac',
      class: `room room-${ROOM_KINDS.includes(r.kind) ? r.kind : 'utility'} ${r.id === 'hall' ? 'path-room' : ''} ${state.selectedRoom === r.id ? 'selected' : ''}`,
    }, group);

    if (r.kind === 'stairs') drawStairs(r, group);
    drawRoomLabel(r, group);
    element('title', {}, group).textContent = `${r.name}: ${spokenSize(r.w, r.h)}, ${spokenArea(r.w * r.h)}`;
  }

  function drawExteriorWalls() {
    const e = state.exteriorWall;
    const W = state.width;
    const H = state.depth;
    if (e <= 0) return;
    element('rect', { x: 0, y: 0, width: W, height: e, class: 'exterior-wall' });
    element('rect', { x: 0, y: H - e, width: W, height: e, class: 'exterior-wall' });
    element('rect', { x: 0, y: e, width: e, height: H - 2 * e, class: 'exterior-wall' });
    element('rect', { x: W - e, y: e, width: e, height: H - 2 * e, class: 'exterior-wall' });
  }

  /** A cased opening (a doorway with no door): a dashed line across the gap with a tick at each end. */
  function drawDoorOpening(g, group) {
    const tick = 0.45;
    const across = g.horizontal ? { x: 0, y: tick } : { x: tick, y: 0 };
    element('line', { x1: g.start.x, y1: g.start.y, x2: g.end.x, y2: g.end.y, class: 'door-opening' }, group);
    for (const end of [g.start, g.end]) {
      element('line', {
        x1: end.x - across.x,
        y1: end.y - across.y,
        x2: end.x + across.x,
        y2: end.y + across.y,
        class: 'door-opening-tick',
      }, group);
    }
    // Wider invisible stroke so the opening is easy to grab.
    element('line', { x1: g.start.x, y1: g.start.y, x2: g.end.x, y2: g.end.y, stroke: 'transparent', 'stroke-width': 0.7 }, group);
  }

  /** The dashed quarter circle a door sweeps, as an SVG path. */
  function swingArcPath(zone) {
    const a1 = Math.atan2(zone.along.y, zone.along.x);
    const a2 = Math.atan2(zone.across.y, zone.across.x);
    let turn = a2 - a1;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    let path = '';
    for (let i = 0; i <= 16; i++) {
      const a = a1 + turn * i / 16;
      path += `${i ? 'L' : 'M'}${(zone.hinge.x + Math.cos(a) * zone.radius).toFixed(3)} ${(zone.hinge.y + Math.sin(a) * zone.radius).toFixed(3)} `;
    }
    return path;
  }

  /** Quarter-circle swing path, hinge dot, and door leaf. */
  function drawDoorSwing(d, g, group) {
    const path = swingArcPath(doorSwings(d)[0]);
    element('path', { d: path, class: 'door-swing' }, group);
    // Wider invisible stroke so the swing is easy to grab.
    element('path', { d: path, fill: 'none', stroke: 'transparent', 'stroke-width': 0.7 }, group);
    element('line', { x1: g.hinge.x, y1: g.hinge.y, x2: g.open.x, y2: g.open.y, class: 'door-leaf' }, group);
    element('circle', { cx: g.hinge.x, cy: g.hinge.y, r: 0.13, class: 'door-hinge' }, group);
  }

  /**
   * A bifold door drawn partly open: each pair of panels is a V, hinged at the
   * jamb and at the fold, with its free end on the opening line. The dashed
   * quarter circle is the area the fold sweeps.
   */
  function drawBifold(d, group) {
    const openAngle = Math.PI / 6;
    for (const zone of doorSwings(d)) {
      const path = swingArcPath(zone);
      element('path', { d: path, class: 'door-swing' }, group);
      // Wider invisible stroke so the swing is easy to grab.
      element('path', { d: path, fill: 'none', stroke: 'transparent', 'stroke-width': 0.7 }, group);

      const { hinge, along, across, radius } = zone;
      const pointAt = (alongBy, acrossBy) => ({
        x: hinge.x + along.x * alongBy + across.x * acrossBy,
        y: hinge.y + along.y * alongBy + across.y * acrossBy,
      });
      const fold = pointAt(radius * Math.cos(openAngle), radius * Math.sin(openAngle));
      const freeEnd = pointAt(2 * radius * Math.cos(openAngle), 0);
      element('line', { x1: hinge.x, y1: hinge.y, x2: fold.x, y2: fold.y, class: 'door-leaf' }, group);
      element('line', { x1: fold.x, y1: fold.y, x2: freeEnd.x, y2: freeEnd.y, class: 'door-leaf' }, group);
      element('circle', { cx: hinge.x, cy: hinge.y, r: 0.13, class: 'door-hinge' }, group);
      element('circle', { cx: fold.x, cy: fold.y, r: 0.09, class: 'door-hinge' }, group);
    }
  }

  function drawInteriorDoor(d) {
    const g = doorGeometry(d);
    if (!g) return;
    const group = element('g', {
      'data-door': d.id,
      'data-focus-key': `plan-door:${d.id}`,
      class: `interior-door ${state.selectedDoor === d.id ? 'selected' : ''}`,
      role: 'button',
      tabindex: '0',
      'aria-label': `${spokenLength(d.width)} doorway on the ${SIDE_NAME[g.side] || g.side} wall of ${g.room.name}`,
    });

    if (d.swing === 'none') {
      drawDoorOpening(g, group);
      element('title', {}, group).textContent = `${g.room.name}: ${fmtLength(d.width)} cased opening, no door`;
      return;
    }
    const direction = d.swing === 'out' ? 'out' : 'in';
    if (d.bifold) {
      drawBifold(d, group);
      element('title', {}, group).textContent = `${g.room.name}: ${fmtLength(d.width)} bifold door, folds ${direction}`;
      return;
    }
    drawDoorSwing(d, g, group);
    element('title', {}, group).textContent = `${g.room.name}: ${fmtLength(d.width)} doorway, swings ${direction}`;
  }

  function drawWindow(w) {
    const g = windowGeometry(w);
    const r = g.rect;
    const group = element('g', {
      'data-window': w.id,
      'data-focus-key': `plan-window:${w.id}`,
      class: `window ${state.selectedWindow === w.id ? 'selected' : ''}`,
      role: 'button',
      tabindex: '0',
      'aria-label': `${spokenLength(w.width)} window on the ${SIDE_NAME[w.side]} wall`,
    });
    element('rect', { x: r.x, y: r.y, width: r.w, height: r.h, class: 'window-frame' }, group);

    const inset = g.e * 0.28;
    if (g.horizontal) {
      for (const y of [r.y + inset, r.y + r.h - inset]) {
        element('line', { x1: r.x, y1: y, x2: r.x + r.w, y2: y, class: 'window-pane' }, group);
      }
      element('line', { x1: r.x, y1: r.y + r.h / 2, x2: r.x + r.w, y2: r.y + r.h / 2, class: 'window-glass' }, group);
    } else {
      for (const x of [r.x + inset, r.x + r.w - inset]) {
        element('line', { x1: x, y1: r.y, x2: x, y2: r.y + r.h, class: 'window-pane' }, group);
      }
      element('line', { x1: r.x + r.w / 2, y1: r.y, x2: r.x + r.w / 2, y2: r.y + r.h, class: 'window-glass' }, group);
    }
    element('title', {}, group).textContent = `Window: ${fmtLength(w.width)} on the ${SIDE_NAME[w.side]} wall, ${fmtLength(w.offset)} from the corner`;
  }

  /**
   * How far outdoor spaces on this floor stick out past a wall, where they
   * overlap the house's length. The labels and dimension lines on that side
   * move out by this much so they stay clear of a porch or deck.
   */
  function outsideReach(side) {
    const W = state.width;
    const H = state.depth;
    let reach = 0;
    for (const r of state.rooms.filter(room => isOutdoor(room) && room.floor === state.floor)) {
      const touchesSpan = isHorizontalSide(side) ? r.x < W && r.x + r.w > 0 : r.y < H && r.y + r.h > 0;
      const past = { north: -r.y, south: r.y + r.h - H, west: -r.x, east: r.x + r.w - W }[side];
      if (touchesSpan) reach = Math.max(reach, past);
    }
    return Math.max(0, reach);
  }

  function drawFrontSide() {
    const side = state.frontSide;
    const W = state.width;
    const H = state.depth;
    if (!side || side === 'none') return;
    const reach = outsideReach(side);
    const [x, y, rotation] = {
      north: [W / 2, -2.2 - reach, 0],
      south: [W / 2, H + 2.85 + reach, 0],
      west: [-2.7 - reach, H / 2, -90],
      east: [W + 2.35 + reach, H / 2, 90],
    }[side];
    const text = label(x, y, 'FRONT OF HOUSE', 'front-label');
    if (rotation) text.setAttribute('transform', `rotate(${rotation} ${x} ${y})`);
  }

  function drawEntrance(d) {
    const g = doorGeometry(d);
    if (!g) return;
    const W = state.width;
    const H = state.depth;
    // For an outdoor space the entrance is on the house wall it touches, which
    // is not the side the door itself is on.
    const side = entranceSide(d);
    if (!side) return;
    const mid = g.horizontal ? (g.start.x + g.end.x) / 2 : (g.start.y + g.end.y) / 2;
    const reach = outsideReach(side);
    const [x, y, rotation] = side === 'north' ? [mid, -1.1 - reach, 0]
      : side === 'south' ? [mid, H + 0.85 + reach, 0]
      : side === 'west' ? [-0.8 - reach, mid, -90]
      : [W + 0.95 + reach, mid, 90];
    // The bar fills the wall from face to face, so a window in the same spot
    // is visibly in conflict. With no exterior wall, use a thin bar on the edge.
    const t = state.exteriorWall > 0 ? state.exteriorWall : 0.3;
    const bar = g.horizontal
      ? { x: g.start.x, y: side === 'north' ? 0 : H - t, width: d.width, height: t }
      : { x: side === 'west' ? 0 : W - t, y: g.start.y, width: t, height: d.width };
    element('rect', { ...bar, class: 'entrance-bar' });
    const text = label(x, y, 'ENTRANCE', 'door-label entrance-label');
    if (rotation) text.setAttribute('transform', `rotate(${rotation} ${x} ${y})`);
  }

  // Item labels: average bold character width, line spacing, and the smallest
  // text size, all as a share of the font size.
  const ITEM_LABEL_CHAR_WIDTH = 0.62;
  const ITEM_LABEL_LINE_HEIGHT = 1.2;
  const ITEM_LABEL_MIN_SIZE = 0.28;

  /** Splits a name at spaces into lines of at most maxChars. A long single word keeps its own line. */
  function wrapWords(name, maxChars) {
    const lines = [];
    let current = '';
    for (const word of name.split(' ')) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  /**
   * Wraps a name to fit text that runs along `length` and stacks lines across
   * `cross`. Returns the lines, or null when it does not fit at this size.
   */
  function fitLabel(name, size, length, cross) {
    const maxChars = Math.floor(length / (size * ITEM_LABEL_CHAR_WIDTH));
    const lines = wrapWords(name, maxChars);
    const longest = Math.max(...lines.map(line => line.length));
    const stackHeight = lines.length * size * ITEM_LABEL_LINE_HEIGHT;
    return longest <= maxChars && stackHeight <= cross ? lines : null;
  }

  /**
   * Chooses how to draw an item's name. At each font size it tries wrapped
   * horizontal text first, then vertical text if the box is taller than wide.
   * Only when nothing fits at the smallest size is the name cut off with "…".
   */
  function itemLabelLayout(it) {
    const startSize = Math.max(0.33, Math.min(0.55, Math.min(it.w, it.h) / 3.8));
    const isTall = it.h > it.w;

    for (let size = startSize; size >= ITEM_LABEL_MIN_SIZE; size -= 0.025) {
      const horizontal = fitLabel(it.name, size, it.w, it.h);
      if (horizontal) return { lines: horizontal, size, vertical: false };

      const vertical = isTall ? fitLabel(it.name, size, it.h, it.w) : null;
      if (vertical) return { lines: vertical, size, vertical: true };
    }

    // The full name is still in the hover tooltip and the item panel.
    const length = isTall ? it.h : it.w;
    const maxChars = Math.max(4, Math.floor(length / (ITEM_LABEL_MIN_SIZE * ITEM_LABEL_CHAR_WIDTH)));
    const cutName = it.name.length > maxChars ? `${it.name.slice(0, maxChars - 1)}…` : it.name;
    return { lines: [cutName], size: ITEM_LABEL_MIN_SIZE, vertical: isTall };
  }

  function drawItemLabel(it, group) {
    const { lines, size, vertical } = itemLabelLayout(it);
    const centerX = it.x + it.w / 2;
    const centerY = it.y + it.h / 2;
    // Vertical text is drawn horizontally, then the whole block is turned to
    // read bottom to top. That keeps the line spacing math the same for both.
    const parent = vertical
      ? element('g', { transform: `rotate(-90 ${centerX} ${centerY})` }, group)
      : group;
    const lineHeight = size * ITEM_LABEL_LINE_HEIGHT;

    lines.forEach((line, index) => {
      const y = centerY + (index - (lines.length - 1) / 2) * lineHeight;
      const text = label(centerX, y, line, 'item-label', parent);
      text.setAttribute('font-size', `${size}px`);
    });
  }

  // Room labels: the name and the size line share one block. The block is
  // kept inside the room minus a margin, because partition walls are drawn
  // centered on the room edge and cover part of the box.
  const ROOM_LABEL_MARGIN = 0.5;
  const ROOM_LABEL_MIN_SIZE = 0.3;
  const ROOM_SIZE_RATIO = 0.76;

  /**
   * Chooses how to draw a room's name and size. At each font size it tries
   * wrapped horizontal text first, then a turned name if the room is taller
   * than wide. A turned name reads bottom to top with the size line staying
   * horizontal below it. Only when nothing fits at the smallest size is the
   * name cut off with "…". The full name stays in the hover tooltip and the
   * side panel.
   */
  function roomLabelLayout(r) {
    const sizeText = fmtSize(r.w, r.h);
    const startSize = r.w < 7 ? 0.56 : 0.7;
    const isTall = r.h > r.w;
    const width = r.w - ROOM_LABEL_MARGIN;
    const height = r.h - ROOM_LABEL_MARGIN;
    const textWidth = (text, size) => text.length * size * ITEM_LABEL_CHAR_WIDTH;

    for (let size = startSize; size >= ROOM_LABEL_MIN_SIZE; size -= 0.02) {
      const dimSize = size * ROOM_SIZE_RATIO;
      const dimHeight = dimSize * ITEM_LABEL_LINE_HEIGHT;

      const horizontal = fitLabel(r.name, size, width, height - dimHeight);
      if (horizontal && textWidth(sizeText, dimSize) <= width) {
        return { lines: horizontal, size, dimSize, vertical: false };
      }

      if (isTall) {
        // The size line may shrink on its own so it fits across a narrow room.
        const turnedDimSize = Math.min(dimSize, width / (sizeText.length * ITEM_LABEL_CHAR_WIDTH));
        const turned = fitLabel(r.name, size, height - turnedDimSize * ITEM_LABEL_LINE_HEIGHT, width);
        if (turned && turnedDimSize >= ROOM_LABEL_MIN_SIZE) {
          return { lines: turned, size, dimSize: turnedDimSize, vertical: true };
        }
      }
    }

    const length = isTall ? height : width;
    const maxChars = Math.max(4, Math.floor(length / (ROOM_LABEL_MIN_SIZE * ITEM_LABEL_CHAR_WIDTH)));
    const cutName = r.name.length > maxChars ? `${r.name.slice(0, maxChars - 1)}…` : r.name;
    return {
      lines: [cutName],
      size: ROOM_LABEL_MIN_SIZE,
      dimSize: ROOM_LABEL_MIN_SIZE * ROOM_SIZE_RATIO,
      vertical: isTall,
    };
  }

  function drawRoomLabel(r, group) {
    const { lines, size, dimSize, vertical } = roomLabelLayout(r);
    const centerX = r.x + r.w / 2;
    const centerY = r.y + r.h / 2;
    const lineHeight = size * ITEM_LABEL_LINE_HEIGHT;
    const sizeLineHeight = dimSize * ITEM_LABEL_LINE_HEIGHT;
    const longest = Math.max(...lines.map(line => line.length));

    // A turned name takes up its text length from top to bottom. The size
    // line goes under it, and the two are centered in the room as one block.
    const nameLength = longest * size * ITEM_LABEL_CHAR_WIDTH;
    const blockHeight = vertical ? nameLength + sizeLineHeight : lines.length * lineHeight + sizeLineHeight;
    const blockTop = centerY - blockHeight / 2;
    const nameCenterY = vertical ? blockTop + nameLength / 2 : blockTop + lines.length * lineHeight / 2;

    // Text baselines sit about 80% of the way down each line.
    const nameParent = vertical
      ? element('g', { transform: `rotate(-90 ${centerX} ${nameCenterY})` }, group)
      : group;
    const nameTop = nameCenterY - lines.length * lineHeight / 2;
    lines.forEach((line, index) => {
      const text = label(centerX, nameTop + index * lineHeight + size * 0.8, line, 'room-label', nameParent);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', `${size}px`);
    });

    const sizeTop = vertical ? blockTop + nameLength : blockTop + lines.length * lineHeight;
    const dims = label(centerX, sizeTop + dimSize * 0.8, fmtSize(r.w, r.h), 'room-dim', group);
    dims.setAttribute('text-anchor', 'middle');
    dims.setAttribute('font-size', `${dimSize}px`);
  }

  /** The symbol inside a utility marker's box, drawn in a 1 x 1 space around its center. */
  function drawMarkerSymbol(marker, cx, cy, size, parent) {
    const art = element('g', { transform: `translate(${cx} ${cy}) scale(${size})`, class: `marker-symbol marker-${marker}`, 'pointer-events': 'none' }, parent);
    if (marker === 'electrical') {
      element('path', { d: 'M 0.08 -0.42 L -0.26 0.06 L -0.04 0.06 L -0.12 0.42 L 0.26 -0.1 L 0.04 -0.1 Z' }, art);
    } else if (marker === 'plumbing') {
      element('path', { d: 'M 0 -0.42 C 0.1 -0.22 0.3 -0.02 0.3 0.16 A 0.3 0.3 0 0 1 -0.3 0.16 C -0.3 -0.02 -0.1 -0.22 0 -0.42 Z' }, art);
    } else {
      // A fan: four blades around a hub.
      for (let turn = 0; turn < 4; turn++) {
        element('ellipse', { cx: 0, cy: -0.24, rx: 0.11, ry: 0.22, transform: `rotate(${turn * 90} 0 0) rotate(20 0 -0.24)` }, art);
      }
      element('circle', { cx: 0, cy: 0, r: 0.08, class: 'marker-hub' }, art);
    }
  }

  function drawItems(model) {
    const { bad } = itemChecks(model);
    for (const it of state.items.filter(item => item.floor === state.floor)) {
      const group = element('g', {
        'data-item': it.id,
        'data-focus-key': `plan-item:${it.id}`,
        class: `item ${it.marker ? `marker-item marker-item-${it.marker}` : ''} ${state.selectedItem === it.id ? 'selected' : ''} ${bad.has(it.id) ? 'conflict' : ''}`,
        role: 'button',
        tabindex: '0',
        'aria-label': `${it.name}, ${spokenSize(it.w, it.h)}. Select or drag to move.`,
      });
      element('rect', { x: it.x, y: it.y, width: it.w, height: it.h, rx: 0.12 }, group);
      if (it.marker && it.marker !== 'note') drawMarkerSymbol(it.marker, it.x + it.w / 2, it.y + it.h / 2, Math.min(it.w, it.h) * 0.85, group);
      else drawItemLabel(it, group);
      element('title', {}, group).textContent = `${it.name}: ${fmtSize(it.w, it.h)}`;
    }
  }

  /** Grid: 1′ squares with a heavier line every 5′, or 25 cm squares with a heavier line every 1 m. */
  function drawGrid(W, H) {
    const step = isMetric() ? 0.25 / M_PER_FT : 1;
    const major = isMetric() ? 4 : 5;
    for (let i = 1; i * step < W - 1e-6; i++) {
      const x = i * step;
      element('line', { x1: x, x2: x, y1: 0, y2: H, class: i % major === 0 ? 'grid-major' : 'grid-line' });
    }
    for (let i = 1; i * step < H - 1e-6; i++) {
      const y = i * step;
      element('line', { x1: 0, x2: W, y1: y, y2: y, class: i % major === 0 ? 'grid-major' : 'grid-line' });
    }
  }

  // Feet of space around the house for the labels and dimension lines. From the
  // wall outward they run: entrance label, dimension line, dimension text, then
  // FRONT OF HOUSE, which ends about 3.1 ft out. The margin leaves room past that
  // on every side, so nothing is cut off at the edge.
  const PLAN_MARGIN = 3.5;
  /**
   * The area the plan shows: the footprint plus its margin, widened to take in
   * the lot and outdoor spaces on any floor (with the same margin, for their own labels), so the
   * view does not jump between floors.
   */
  function planBounds() {
    let left = -PLAN_MARGIN;
    let top = -PLAN_MARGIN;
    let right = state.width + PLAN_MARGIN;
    let bottom = state.depth + PLAN_MARGIN;
    const lot = lotBox();
    if (lot) {
      left = Math.min(left, lot.x - PLAN_MARGIN);
      top = Math.min(top, lot.y - PLAN_MARGIN);
      right = Math.max(right, lot.x + lot.w + PLAN_MARGIN);
      bottom = Math.max(bottom, lot.y + lot.h + PLAN_MARGIN);
    }
    for (const r of state.rooms.filter(isOutdoor)) {
      left = Math.min(left, r.x - PLAN_MARGIN);
      top = Math.min(top, r.y - PLAN_MARGIN);
      right = Math.max(right, r.x + r.w + PLAN_MARGIN);
      bottom = Math.max(bottom, r.y + r.h + PLAN_MARGIN);
    }
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  /** The lot boundary, the setback line inside it, and a label with the lot size. */
  function drawLot() {
    const lot = lotBox();
    if (!lot) return;
    element('rect', { x: lot.x, y: lot.y, width: lot.w, height: lot.h, class: 'lot-line' });
    const setback = state.lot.setback;
    if (setback > 0 && lot.w > 2 * setback && lot.h > 2 * setback) {
      element('rect', { x: lot.x + setback, y: lot.y + setback, width: lot.w - 2 * setback, height: lot.h - 2 * setback, class: 'setback-line' });
    }
    const size = Math.max(0.7, Math.min(lot.w, lot.h) / 45);
    label(lot.x + size * 0.6, lot.y + size * 1.6, `Lot ${fmtSize(lot.w, lot.h)}`, 'lot-label').setAttribute('font-size', `${size}px`);
  }

  /** Draws the current floor. The SVG uses feet as its units. */
  function renderPlan(model) {
    const W = state.width;
    const H = state.depth;
    const size = planBounds();
    svg.replaceChildren();
    svg.setAttribute('viewBox', `${size.x} ${size.y} ${size.w} ${size.h}`);
    // Fit the plan inside the scroll box (a size container), then apply zoom.
    const ratio = (size.w / size.h).toFixed(5);
    svg.setAttribute('style', `width:calc(min(100cqw, 100cqh * ${ratio}) * ${state.zoom / 100});min-width:0;max-height:none;height:auto;aspect-ratio:${size.w}/${size.h};margin:0 auto`);

    element('rect', { x: 0, y: 0, width: W, height: H, class: 'outline' });
    drawGrid(W, H);
    drawLot();

    for (const r of state.rooms.filter(room => room.floor === state.floor)) drawRoom(r);
    // Half walls go down first so a full wall on the same line covers them.
    const wallsHalfFirst = [...model.segments, ...model.outsideSegments].sort((a, b) => Number(!!b.half) - Number(!!a.half));
    for (const s of wallsHalfFirst) {
      const wallClass = s.half ? 'partition-wall half-wall' : 'partition-wall';
      const line = s.pos + s.shift;
      element('line', s.o === 'h'
        ? { x1: s.start, y1: line, x2: s.end, y2: line, class: wallClass, 'stroke-width': s.t }
        : { x1: line, y1: s.start, x2: line, y2: s.end, class: wallClass, 'stroke-width': s.t });
    }
    drawExteriorWalls();
    for (const d of state.doors.filter(door => findRoom(door.roomId)?.floor === state.floor)) drawInteriorDoor(d);
    for (const w of state.windows.filter(win => win.floor === state.floor)) drawWindow(w);
    drawFrontSide();
    for (const d of entranceDoors(state.floor)) drawEntrance(d);
    if (state.showItems !== false) drawItems(model);

    // Overall dimensions
    // The lines sit past the ENTRANCE labels (which end about 1.1' from the
    // wall) so the two never touch.
    // An outdoor space on the bottom or left pushes its line out past itself.
    const bottomGap = 1.45 + outsideReach('south');
    const leftGap = 1.45 + outsideReach('west');
    element('line', { x1: 0, y1: H + bottomGap, x2: W, y2: H + bottomGap, class: 'dimension' });
    label(W / 2, H + bottomGap + 0.85, fmtLength(W), 'dimension-text');
    element('line', { x1: -leftGap, y1: 0, x2: -leftGap, y2: H, class: 'dimension' });
    // Rotated text grows leftward from its baseline, so its baseline sits
    // nearer the plan than the bottom label's does.
    const depthTextX = -(leftGap + 0.85 - 0.55);
    const depthLabel = label(depthTextX, H / 2, fmtLength(H), 'dimension-text');
    depthLabel.setAttribute('transform', `rotate(-90 ${depthTextX} ${H / 2})`);
  }

  // ==========================================================================
  // 7. UI panels and the main render
  // ==========================================================================

  /**
   * Fills a dropdown. `groups` is [{ label, options: [{ value, text }] }].
   * The options are rebuilt only when they changed, so a select that has
   * keyboard focus keeps it while the plan redraws.
   */
  function fillSelect(select, groups, selectedValue, placeholder) {
    const signature = JSON.stringify([groups, placeholder]);
    if (select.dataset.signature !== signature) {
      select.dataset.signature = signature;
      select.replaceChildren();
      if (placeholder) select.append(new Option(placeholder, ''));
      for (const group of groups) {
        const parent = document.createElement('optgroup');
        parent.label = group.label;
        for (const option of group.options) parent.append(new Option(option.text, option.value));
        select.append(parent);
      }
    }
    select.value = selectedValue || '';
  }

  /**
   * Fills a "Suggested sizes" menu. `presets` is [{ value, text }]. The menu
   * shows the preset the selected record already matches, or the placeholder
   * when it matches none, so it is never stale. It is off when nothing is selected.
   */
  function fillPresets(select, presets, enabled, matchingKey) {
    const signature = JSON.stringify(presets);
    if (select.dataset.signature !== signature) {
      select.dataset.signature = signature;
      select.replaceChildren(new Option('Suggested sizes', ''));
      // A preset with a group goes under a heading. Presets without one stay flat.
      let parent = select;
      let currentGroup;
      for (const preset of presets) {
        if (preset.group !== currentGroup) {
          currentGroup = preset.group;
          parent = select;
          if (currentGroup) {
            parent = document.createElement('optgroup');
            parent.label = currentGroup;
            select.append(parent);
          }
        }
        parent.append(new Option(preset.text, preset.value));
      }
    }
    select.value = matchingKey || '';
    select.disabled = !enabled;
  }

  const sameSize = (a, b) => Math.abs(a - b) < 0.001;
  /** True when two boxes are the same size, either way around. */
  const sameSizeBox = (w1, h1, w2, h2) => (sameSize(w1, w2) && sameSize(h1, h2)) || (sameSize(w1, h2) && sameSize(h1, w2));

  /** Info box text: the total, then how many are on each floor. */
  function fillInfo(box, total, singular, plural, countsByFloor) {
    const heading = document.createElement('strong');
    heading.textContent = total ? `${total} ${total === 1 ? singular : plural} total` : `No ${plural} yet`;
    box.replaceChildren(heading);
    if (!total) return;
    const perFloor = floorOrder().map(floor => `${floorName(floor)}: ${countsByFloor[floor] || 0}`);
    box.append(document.createElement('br'), perFloor.join(' · '));
  }

  /** Counts records by floor, e.g. { main: 4, basement: 2 }. */
  function countByFloor(records, floorOf) {
    const counts = {};
    for (const record of records) {
      const floor = floorOf(record);
      counts[floor] = (counts[floor] || 0) + 1;
    }
    return counts;
  }

  function fillChecks(listEl, checks) {
    listEl.replaceChildren();
    for (const check of checks) {
      const li = document.createElement('li');
      li.className = check.level;
      li.textContent = check.text;
      listEl.append(li);
    }
  }

  /** Rooms & Spaces panel: the info box and a dropdown of every room, grouped by floor. */
  function renderRoomList() {
    const groups = floorOrder().map(floor => ({
      label: floorName(floor),
      options: state.rooms
        .filter(r => r.floor === floor)
        .map(r => ({ value: r.id, text: `${r.name} · ${fmtSize(r.w, r.h)}` })),
    }));
    fillInfo($('roomInfo'), state.rooms.length, 'space', 'spaces', countByFloor(state.rooms, r => r.floor));
    const outdoorArea = state.rooms.filter(isOutdoor).reduce((sum, r) => sum + r.w * r.h, 0);
    if (outdoorArea > 0) $('roomInfo').append(document.createElement('br'), `Outdoor: ${fmtArea(outdoorArea)}, not in the house areas.`);
    fillSelect($('roomSelect'), groups.filter(g => g.options.length), state.selectedRoom, state.selectedRoom ? '' : 'No space selected');
    $('roomSelect').disabled = !state.rooms.length;
  }

  /** The editing fields in the Rooms & Spaces panel. */
  function renderSelectedRoom(model) {
    const room = findRoom(state.selectedRoom);
    for (const id of ['roomName', 'roomKind', 'roomFloor', 'roomWalls', 'roomWallT', 'roomX', 'roomY', 'roomW', 'roomH', 'duplicateRoom', 'deleteRoom']) {
      $(id).disabled = !room;
    }
    fillPresets(
      $('roomPreset'),
      Object.entries(ROOM_PRESETS).map(([value, [name, , w, h]]) => ({ value, text: `${name} · ${fmtSize(w, h)}` })),
      !!room,
      room && Object.keys(ROOM_PRESETS).find(key => {
        const [name, , w, h] = ROOM_PRESETS[key];
        return room.name === name && sameSizeBox(room.w, room.h, w, h);
      }),
    );
    $('roomName').value = room?.name || '';
    $('roomKind').value = room?.kind || 'utility';
    $('roomFloor').value = room?.floor || state.floor;
    $('roomWalls').value = room ? wallMode(room) : 'open';
    for (const [key, id] of [['x', 'roomX'], ['y', 'roomY'], ['w', 'roomW'], ['h', 'roomH']]) {
      $(id).value = room ? lengthField(room[key]) : '';
    }

    const wallsHidden = !room || wallMode(room) !== 'enclosed';
    $('wallControls').hidden = wallsHidden;
    $('wallTLabel').hidden = wallsHidden;
    $('roomWallT').value = room && Number.isFinite(room.wallT) ? thicknessField(room.wallT) : '';
    $('roomWallT').placeholder = `${thicknessField(state.interiorWall)} (default)`;

    for (const box of document.querySelectorAll('.wall-side')) {
      const side = box.dataset.side;
      const exterior = !!room && isExteriorSide(room, side);
      box.checked = !!room && !exterior && hasSide(room, side);
      box.disabled = !room || exterior;
      const wrapper = box.closest('label');
      wrapper.classList.toggle('exterior', exterior);
      wrapper.title = exterior ? `${box.dataset.label}: exterior SIP wall, no partition added` : '';
    }

    for (const box of document.querySelectorAll('.half-side')) {
      const side = box.dataset.side;
      const wallOn = !!room && !isExteriorSide(room, side) && hasSide(room, side);
      box.checked = wallOn && !!room.halfWalls?.[side];
      box.disabled = !wallOn;
      box.closest('label').classList.toggle('exterior', !wallOn);
    }

    renderStairControls(room);
    $('alignStairs').disabled = !findRoom('stairs-main') || (!findRoom('stairs-basement') && !findRoom('stairs-upper'));
    $('selectedClear').textContent = room && isOutdoor(room)
      ? `Outdoor space, ${fmtArea(room.w * room.h, false)}. It is not counted in the house areas.`
      : room
      ? `Approximate clear area within this ${fmtSize(room.w, room.h)} box: ${fmtArea(approximateRoomClear(room, model), false)}. Wall edges and openings affect it.`
      : 'Add a space to edit it.';
  }

  /** The stair section of the room editor. Only stairs show it. */
  function renderStairControls(room) {
    const isStairs = room?.kind === 'stairs';
    $('stairControls').hidden = !isStairs;
    if (!isStairs) return;

    const stair = stairOf(room);
    $('stairType').value = stair.type;
    $('stairClimb').value = stair.climb;
    $('stairTurn').value = stair.turn;
    $('stairLanding').value = thicknessField(stair.landing);
    $('stairTurnLabel').hidden = stair.type !== 'u' && stair.type !== 'spiral';
    $('stairLandingLabel').hidden = stair.type === 'spiral';

    const plan = stairPlan(room);
    const connected = floorAbove(room.floor) || floorBelow(room.floor);
    let info = `${plan.risers} risers of about ${fmtInches(plan.rise / plan.risers)} to climb ${fmtLength(plan.rise)}.`;
    if (!connected) info = 'Add a basement or second floor to size the risers and treads.';
    else if (plan.spiral) info += ` The spiral is ${fmtLength(Math.min(room.w, room.h))} across.`;
    else info += ` ${plan.treads} treads, about ${fmtInches(plan.minTread)} deep.`;
    $('stairInfo').textContent = info;
  }

  /** Interior Doorways panel. */
  function renderDoorList() {
    const doorFloor = d => findRoom(d.roomId)?.floor;
    if (!state.doors.some(d => d.id === state.selectedDoor && doorFloor(d) === state.floor)) state.selectedDoor = null;

    const groups = floorOrder().map(floor => ({
      label: floorName(floor),
      options: state.doors
        .filter(d => doorFloor(d) === floor)
        .map(d => ({ value: d.id, text: `${findRoom(d.roomId).name} · ${SIDE_LABEL[d.side] || d.side} Wall · ${fmtLength(d.width)}${d.swing === 'none' ? ' · Cased Opening' : d.bifold ? ' · Bifold' : ''}` })),
    }));
    fillInfo($('doorInfo'), state.doors.length, 'doorway', 'doorways', countByFloor(state.doors, doorFloor));
    fillSelect($('doorSelect'), groups.filter(g => g.options.length), state.selectedDoor, state.doors.length ? 'Select a doorway' : 'No doorways yet');
    $('doorSelect').disabled = !state.doors.length;

    const selected = findDoor(state.selectedDoor);
    fillPresets(
      $('doorPreset'),
      Object.entries(DOOR_PRESETS).map(([value, [name, width]]) => ({ value, text: `${name} · ${fmtLength(width)}` })),
      !!selected,
      selected && Object.keys(DOOR_PRESETS).find(key => sameSize(selected.width, DOOR_PRESETS[key][1])),
    );
    const room = findRoom(state.selectedRoom);
    $('addDoor').disabled = !room || wallMode(room) !== 'enclosed';
    $('addDoor').title = room && wallMode(room) === 'open' ? 'Set the selected room to Enclosed Walls to add a doorway.' : '';
    $('doorEditor').hidden = !selected;
    if (selected) {
      $('doorSide').value = selected.side;
      $('doorHinge').value = selected.hinge;
      $('doorOffset').value = lengthField(selected.offset);
      $('doorWidth').value = lengthField(selected.width);
      $('doorHead').value = thicknessField(doorHead(selected));
      $('doorSwing').value = selected.bifold ? `bifold-${selected.swing}` : selected.swing;
      // A plain opening has no hinge, so the control would do nothing.
      // A four-panel bifold has a pair at each jamb, so there is no single hinge side.
      $('doorHinge').disabled = selected.swing === 'none' || (selected.bifold && bifoldPanelCount(selected.width) === 4);
    }
  }

  /** Windows panel. */
  function renderWindowList() {
    if (!state.windows.some(w => w.id === state.selectedWindow && w.floor === state.floor)) state.selectedWindow = null;

    const groups = floorOrder().map(floor => ({
      label: floorName(floor),
      options: state.windows
        .filter(w => w.floor === floor)
        .sort((a, b) => SIDES.indexOf(a.side) - SIDES.indexOf(b.side) || a.offset - b.offset)
        .map(w => ({ value: w.id, text: `${capitalize(SIDE_NAME[w.side])} Wall · ${fmtLength(w.width)} at ${fmtLength(w.offset)}` })),
    }));
    fillInfo($('windowInfo'), state.windows.length, 'window', 'windows', countByFloor(state.windows, w => w.floor));
    fillSelect($('windowSelect'), groups.filter(g => g.options.length), state.selectedWindow, state.windows.length ? 'Select a window' : 'No windows yet');
    $('windowSelect').disabled = !state.windows.length;

    const selected = findWindow(state.selectedWindow);
    fillPresets(
      $('windowPreset'),
      Object.entries(WINDOW_PRESETS).map(([value, [name, width]]) => ({ value, text: `${name} · ${fmtLength(width)}` })),
      !!selected,
      selected && Object.keys(WINDOW_PRESETS).find(key => sameSize(selected.width, WINDOW_PRESETS[key][1])),
    );
    $('windowEditor').hidden = !selected;
    const centerRoom = selected && roomBesideWindow(selected);
    $('centerWindow').disabled = !centerRoom;
    $('centerWindow').textContent = centerRoom ? `Center on ${centerRoom.name}` : 'Center on Room';
    $('centerWindow').title = centerRoom ? '' : 'No room touches this wall.';
    if (selected) {
      $('windowSide').value = selected.side;
      $('windowOffset').value = lengthField(selected.offset);
      $('windowWidth').value = lengthField(selected.width);
      $('windowSill').value = thicknessField(windowSill(selected));
      $('windowHead').value = thicknessField(windowHead(selected));
    }
  }

  /** Furniture & Fixtures panel. */
  function renderItemList(model) {
    if (!state.items.some(it => it.id === state.selectedItem && it.floor === state.floor)) state.selectedItem = null;
    const { out, bad } = itemChecks(model);

    // Items with the same name on a floor get #1, #2, ... so they can be told apart.
    const nameTotals = {};
    for (const it of state.items) nameTotals[`${it.floor}:${it.name}`] = (nameTotals[`${it.floor}:${it.name}`] || 0) + 1;
    const nameSeen = {};
    const optionFor = it => {
      const key = `${it.floor}:${it.name}`;
      nameSeen[key] = (nameSeen[key] || 0) + 1;
      const number = nameTotals[key] > 1 ? ` #${nameSeen[key]}` : '';
      return { value: it.id, text: `${it.name}${number} · ${fmtSize(it.w, it.h)}${bad.has(it.id) ? ' !' : ''}` };
    };
    const groups = floorOrder().map(floor => ({
      label: floorName(floor),
      options: state.items.filter(it => it.floor === floor).map(optionFor),
    }));
    fillInfo($('itemInfo'), state.items.length, 'item', 'items', countByFloor(state.items, it => it.floor));
    fillSelect($('itemSelect'), groups.filter(g => g.options.length), state.selectedItem, state.items.length ? 'Select an item' : 'No items yet');
    $('itemSelect').disabled = !state.items.length;

    const selected = findItem(state.selectedItem);
    fillPresets(
      $('itemPreset'),
      ITEM_PRESET_MENU.map(([value, [name, w, h, group]]) => ({ value, group, text: `${name} · ${fmtSize(w, h)}` })),
      !!selected,
      selected && ITEM_PRESET_MENU.find(([, [name, w, h]]) => selected.name === name && sameSizeBox(selected.w, selected.h, w, h))?.[0],
    );
    $('itemEditor').hidden = !selected;
    if (selected) {
      $('itemName').value = selected.name;
      $('itemX').value = lengthField(selected.x);
      $('itemY').value = lengthField(selected.y);
      $('itemW').value = lengthField(selected.w);
      $('itemH').value = lengthField(selected.h);
    }

    const itemsOnFloor = state.items.some(it => it.floor === state.floor);
    const emptyText = itemsOnFloor ? 'No items overlap walls or each other.' : 'Add an item to check it against walls and other items.';
    fillChecks($('itemIssues'), out.length ? out : [{ level: 'good', text: emptyText }]);
    $('showItems').checked = state.showItems !== false;
  }

  /** The Lot and Setback fields. They stay disabled until Show Lot is on. */
  function renderLot() {
    const lot = state.lot;
    $('lotEnabled').checked = lot.enabled;
    for (const [id, value] of [['lotWidth', lot.width], ['lotDepth', lot.depth], ['lotLeft', lot.left], ['lotTop', lot.top], ['lotSetback', lot.setback]]) {
      $(id).value = lengthField(value);
      $(id).disabled = !lot.enabled;
    }
    $('centerLot').disabled = !lot.enabled;
  }

  /** Wall height for the open floor, the floor thickness, and the floor to floor result. */
  function renderHeights() {
    $('wallHeight').value = thicknessField(wallHeight(state.floor));
    $('floorThickness').value = thicknessField(state.floorThickness);
    const above = floorAbove(state.floor);
    $('heightHelp').textContent = above
      ? `${floorName(state.floor)} walls. Floor to floor, up to the ${floorName(above)}: ${fmtLength(floorToFloor(state.floor))}.`
      : `${floorName(state.floor)} walls. This is the top floor.`;
  }

  /** Shows an area in a tile with the unit smaller than the number, so five digits still fit. */
  function showArea(id, sqft) {
    const unit = isMetric() ? 'm²' : 'sq ft';
    const number = fmtArea(sqft).slice(0, -unit.length).trim();
    const unitText = document.createElement('span');
    unitText.className = 'area-unit';
    unitText.textContent = ` ${unit}`;
    $(id).replaceChildren(number, unitText);
  }

  function renderMetrics(model) {
    const footprint = state.width * state.depth;
    showArea('footprintArea', footprint);
    showArea('shellArea', model.shellArea);
    showArea('clearArea', Math.max(0, model.shellArea - model.partitionArea));
    showArea('aboveGradeArea', footprint * (state.upperEnabled ? 2 : 1));
  }

  // Keyboard users keep their place: when a render rebuilds the element that
  // had focus (a shape on the plan), focus moves to its replacement. Mouse and touch behavior is unchanged.
  let usingKeyboard = false;
  document.addEventListener('keydown', () => { usingKeyboard = true; }, true);
  document.addEventListener('pointerdown', () => { usingKeyboard = false; }, true);

  /**
   * The small + or − button on the left of the Basement and Second Floor tabs.
   * A floor that is off keeps its tab, dimmed, so the + button has something to sit on.
   */
  function renderFloorToggles() {
    for (const { floor, tab, toggle } of FLOOR_TOGGLES) {
      const on = floorOrder().includes(floor);
      const action = `${on ? 'Remove' : 'Add'} ${floorName(floor)}`;
      $(tab).disabled = !on;
      $(toggle).textContent = on ? '−' : '+';
      $(toggle).classList.toggle('is-remove', on);
      $(toggle).setAttribute('aria-label', action);
      $(toggle).title = action;
    }
  }

  /** Shows who a loaded template is based on, with a link to the original plan. */
  function renderTemplateCredit() {
    const box = $('templateCredit');
    const credit = state.templateCredit;
    box.hidden = !credit;
    if (!credit) {
      box.replaceChildren();
      return;
    }
    const link = document.createElement('a');
    link.href = credit.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = credit.name;
    box.replaceChildren(
      'Template based on ',
      link,
      ` by ${credit.by}. Redrawn by eye for concept use, so sizes are approximate. This is not their official plan.`,
    );
  }

  /** Redraws everything from state and saves the draft. */
  function render() {
    const focusKey = usingKeyboard ? document.activeElement?.dataset?.focusKey : null;

    if (!floorOrder().includes(state.floor)) state.floor = 'main';
    const rooms = state.rooms.filter(r => r.floor === state.floor);
    if (!rooms.some(r => r.id === state.selectedRoom)) state.selectedRoom = rooms[0]?.id || null;

    // Floor tabs and header controls
    for (const [id, floor] of [['mainTab', 'main'], ['upperTab', 'upper'], ['basementTab', 'basement']]) {
      $(id).setAttribute('aria-selected', String(state.floor === floor));
    }
    renderFloorToggles();
    $('roomFloor').querySelector('[value="upper"]').hidden = !state.upperEnabled;
    $('roomFloor').querySelector('[value="basement"]').hidden = !state.basementEnabled;
    renderTemplateCredit();

    // Units, footprint, walls, and zoom
    applyUnits();
    $('frontSide').value = state.frontSide || 'north';
    $('houseWidth').value = lengthField(state.width);
    $('houseDepth').value = lengthField(state.depth);
    $('exteriorWall').value = thicknessField(state.exteriorWall);
    $('interiorWall').value = thicknessField(state.interiorWall);
    renderHeights();
    renderLot();
    $('zoomLabel').textContent = `${state.zoom}%`;
    $('zoomOut').disabled = state.zoom <= ZOOM_MIN;
    $('zoomIn').disabled = state.zoom >= ZOOM_MAX;
    $('scaleLabel').textContent = `${fmtSize(state.width, state.depth)} footprint`;

    renderRoomList();
    const model = wallModel(state.floor);
    renderSelectedRoom(model);
    renderMetrics(model);

    const findings = layoutChecks(model);
    $('checkCount').textContent = findings.some(x => x.level !== 'good') ? `${findings.length} to review` : 'No conflicts';
    fillChecks($('issues'), findings);

    renderPlan(model);
    renderDoorList();
    renderWindowList();
    renderItemList(model);
    trackLayoutChange();
    saveState();

    if (focusKey && document.activeElement?.dataset?.focusKey !== focusKey) {
      document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
    }
  }

  // ==========================================================================
  // 8. Confirmation dialog
  // ==========================================================================

  let pendingConfirmation = null;
  let confirmationSource = null;

  /**
   * Shows the confirmation dialog. With infoOnly, it's a one-button notice.
   * Focus returns to `source` when the dialog closes.
   */
  function askConfirmation(title, detail, actionLabel, action, source, infoOnly = false) {
    pendingConfirmation = action;
    confirmationSource = source || null;
    $('confirmCancel').hidden = infoOnly;
    $('confirmYes').classList.toggle('confirm-neutral', infoOnly);
    $('confirmTitle').textContent = title;
    $('confirmDetail').textContent = detail;
    $('confirmYes').textContent = actionLabel;
    $('confirmOverlay').hidden = false;
    $('confirmCancel').focus();
  }

  function closeConfirmation(restoreFocus = true) {
    $('confirmOverlay').hidden = true;
    pendingConfirmation = null;
    if (restoreFocus) confirmationSource?.focus();
    confirmationSource = null;
  }

  $('confirmCancel').addEventListener('click', () => closeConfirmation());
  $('confirmYes').addEventListener('click', () => {
    const action = pendingConfirmation;
    const source = confirmationSource;
    closeConfirmation(false);
    action?.();
    source?.focus();
  });
  $('confirmOverlay').addEventListener('click', e => {
    if (e.target === $('confirmOverlay')) closeConfirmation();
  });
  $('confirmOverlay').addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeConfirmation();
    }
    if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      const first = $('confirmCancel');
      const last = $('confirmYes');
      if ((e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    }
  });

  // ==========================================================================
  // 9. Event handlers
  // ==========================================================================

  /** Registers a change handler that parses the field as a number. */
  function onNumberChange(id, handler) {
    $(id).addEventListener('change', e => {
      handler(Number(e.target.value), e.target.value);
      render();
    });
  }

  // --- Floors ---------------------------------------------------------------

  const openFloor = floor => {
    state.floor = floor;
    render();
  };
  $('mainTab').addEventListener('click', () => openFloor('main'));
  $('upperTab').addEventListener('click', () => openFloor('upper'));
  $('basementTab').addEventListener('click', () => openFloor('basement'));

  /** The main floor stairs box, or a box in the middle of the footprint if there are none. */
  function stairsBoxFromMain() {
    const main = findRoom('stairs-main');
    if (main) return { x: main.x, y: main.y, w: main.w, h: main.h };
    const w = 6;
    const h = Math.min(12, state.depth - 4);
    return { x: snap(state.width / 2 - w / 2), y: snap(state.depth / 2 - h / 2), w, h };
  }

  /** Adds a floor with a staircase that lines up with the main floor stairs. */
  function addStairsFloor(floor, stairsId) {
    const box = stairsBoxFromMain();
    state.rooms.push({ id: stairsId, name: 'Stairs', floor, kind: 'stairs', ...box, stair: stairOf(findRoom('stairs-main') || box) });
    state.floor = floor;
    state.selectedRoom = stairsId;
  }

  /** Deletes every space, doorway, window, and item on one floor. */
  function clearFloor(floor) {
    const roomIds = new Set(state.rooms.filter(r => r.floor === floor).map(r => r.id));
    state.doors = state.doors.filter(d => !roomIds.has(d.roomId));
    state.rooms = state.rooms.filter(r => r.floor !== floor);
    state.items = state.items.filter(it => it.floor !== floor);
    state.windows = state.windows.filter(w => w.floor !== floor);
    state.floor = 'main';
    state.selectedRoom = findRoom('living')?.id || null;
  }

  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

  /** What removing a floor deletes. Both floors use clearFloor, so both show the same list. */
  const removeFloorWarning = (count, floorName) => (
    `This will remove ${plural(count, 'space')} and their doorways, windows, and items on the ${floorName}.`
  );

  function addSecondFloor() {
    state.upperEnabled = true;
    addStairsFloor('upper', 'stairs-upper');
    render();
  }

  function removeSecondFloor() {
    const count = state.rooms.filter(r => r.floor === 'upper').length;
    askConfirmation('Remove Second Floor?', removeFloorWarning(count, 'second floor'), 'Remove Second Floor', () => {
      clearFloor('upper');
      state.upperEnabled = false;
      render();
    }, $('upperToggle'));
  }

  function addBasement() {
    state.basementEnabled = true;
    addStairsFloor('basement', 'stairs-basement');
    render();
  }

  function removeBasement() {
    const count = state.rooms.filter(r => r.floor === 'basement').length;
    askConfirmation('Remove Basement?', removeFloorWarning(count, 'basement'), 'Remove Basement', () => {
      clearFloor('basement');
      state.basementEnabled = false;
      render();
    }, $('basementToggle'));
  }

  $('upperToggle').addEventListener('click', () => (state.upperEnabled ? removeSecondFloor() : addSecondFloor()));
  $('basementToggle').addEventListener('click', () => (state.basementEnabled ? removeBasement() : addBasement()));

  // --- Footprint and wall thickness -----------------------------------------

  for (const [id, key] of [['houseWidth', 'width'], ['houseDepth', 'depth']]) {
    onNumberChange(id, (_, raw) => {
      const ft = readField(id, raw);
      if (ft !== null) state[key] = snap(ft);
    });
  }
  // Wall thicknesses are entered in inches or centimeters and stored in feet.
  for (const [id, key] of [['exteriorWall', 'exteriorWall'], ['interiorWall', 'interiorWall']]) {
    onNumberChange(id, (_, raw) => {
      const ft = raw.trim() === '' ? null : readField(id, raw);
      if (ft !== null) state[key] = ft;
    });
  }
  // --- Lot and setback ---------------------------------------------------------

  $('lotEnabled').addEventListener('change', e => {
    const lot = state.lot;
    lot.enabled = e.target.checked;
    // The first time, size the lot around the house with the house in the middle.
    if (lot.enabled && (lot.width <= 0 || lot.depth <= 0)) {
      Object.assign(lot, {
        width: state.width + 2 * DEFAULT_LOT_MARGIN,
        depth: state.depth + 2 * DEFAULT_LOT_MARGIN,
        left: DEFAULT_LOT_MARGIN,
        top: DEFAULT_LOT_MARGIN,
      });
    }
    render();
  });
  for (const [id, key] of [['lotWidth', 'width'], ['lotDepth', 'depth'], ['lotLeft', 'left'], ['lotTop', 'top'], ['lotSetback', 'setback']]) {
    onNumberChange(id, (_, raw) => {
      const ft = readField(id, raw);
      if (ft !== null) state.lot[key] = snap(ft);
    });
  }
  $('centerLot').addEventListener('click', () => {
    state.lot.left = snap((state.lot.width - state.width) / 2);
    state.lot.top = snap((state.lot.depth - state.depth) / 2);
    render();
  });

  // Heights follow the same units as thickness. The wall height belongs to the open floor.
  onNumberChange('wallHeight', (_, raw) => {
    const ft = readField('wallHeight', raw);
    if (ft !== null) state.wallHeights[state.floor] = ft;
  });
  onNumberChange('floorThickness', (_, raw) => {
    const ft = readField('floorThickness', raw);
    if (ft !== null) state.floorThickness = ft;
  });
  $('frontSide').addEventListener('change', e => {
    state.frontSide = e.target.value;
    render();
  });

  // --- Rooms ----------------------------------------------------------------

  /** First spot on a 2′ grid where a w × h box doesn't overlap any room. */
  function freePosition(floor, w, h) {
    const rooms = state.rooms.filter(r => r.floor === floor);
    for (let y = 0; y <= state.depth - h; y += 2) {
      for (let x = 0; x <= state.width - w; x += 2) {
        const trial = { x, y, w, h };
        if (rooms.every(r => intersection(trial, r) < 0.01)) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }

  /** Adds a new room, or a copy of `source`, on the current floor. */
  function createRoom(source) {
    const floor = state.floor;
    const w = source?.w ?? 10;
    const h = source?.h ?? 10;
    // A copy of an outdoor space goes beside it, since the free spots are all inside the house.
    const pos = source && isOutdoor(source) ? { x: snap(source.x + source.w + 1), y: source.y } : freePosition(floor, w, h);
    const room = {
      id: newId('space'),
      name: source ? `${source.name} Copy` : `New Room ${state.rooms.filter(r => r.floor === floor).length + 1}`,
      floor,
      x: pos.x,
      y: pos.y,
      w,
      h,
      kind: source?.kind || 'utility',
      wallMode: source ? wallMode(source) : 'enclosed',
      ...(source && Number.isFinite(source.wallT) ? { wallT: source.wallT } : {}),
      ...(source?.walls ? { walls: { ...source.walls } } : {}),
      ...(source?.halfWalls ? { halfWalls: { ...source.halfWalls } } : {}),
      ...(source?.stair ? { stair: { ...source.stair } } : {}),
    };
    state.rooms.push(room);
    state.selectedRoom = room.id;
    render();
    $('roomName').focus();
    $('roomName').select();
  }

  /** Puts an outdoor space just outside the front wall (the bottom if no front is set), centered on it. */
  function moveOutsideFront(room) {
    const side = SIDES.includes(state.frontSide) ? state.frontSide : 'south';
    if (isHorizontalSide(side)) room.x = snap((state.width - room.w) / 2);
    else room.y = snap((state.depth - room.h) / 2);
    if (side === 'north') room.y = -room.h;
    else if (side === 'south') room.y = state.depth;
    else if (side === 'west') room.x = -room.w;
    else room.x = state.width;
  }

  // Suggested sizes: applied to the selected record. Windows, doorways, and
  // items resize around their middle so they stay where they are.
  $('roomPreset').addEventListener('change', e => {
    const preset = ROOM_PRESETS[e.target.value];
    const room = findRoom(state.selectedRoom);
    if (room && preset) {
      const [name, kind, w, h, walls] = preset;
      Object.assign(room, { name, kind, w, h });
      if (walls) room.wallMode = walls;
      if (kind === 'stairs') room.stair = stairOf(room);
      else delete room.stair;
      if (kind === 'outdoor' && insideFootprint(room)) moveOutsideFront(room);
    }
    render();
  });

  /** Gives a doorway or window a new width, keeping its middle and staying on the wall. */
  function resizeAlongWall(opening, width, wallLength) {
    const centered = opening.offset + opening.width / 2 - width / 2;
    opening.width = width;
    opening.offset = snap(Math.max(0, Math.min(wallLength - width, centered)));
  }

  $('doorPreset').addEventListener('change', e => {
    const preset = DOOR_PRESETS[e.target.value];
    const door = findDoor(state.selectedDoor);
    if (door && preset) resizeAlongWall(door, preset[1], doorGeometry(door).length);
    render();
  });

  $('windowPreset').addEventListener('change', e => {
    const preset = WINDOW_PRESETS[e.target.value];
    const win = findWindow(state.selectedWindow);
    if (win && preset) resizeAlongWall(win, preset[1], windowGeometry(win).length);
    render();
  });

  $('itemPreset').addEventListener('change', e => {
    const preset = ITEM_PRESETS[e.target.value];
    const item = findItem(state.selectedItem);
    if (item && preset && e.target.value !== 'custom') {
      const [name, w, h, , marker] = preset;
      const centerX = item.x + item.w / 2;
      const centerY = item.y + item.h / 2;
      Object.assign(item, { name, w, h, x: snap(centerX - w / 2), y: snap(centerY - h / 2) });
      if (marker) item.marker = marker;
      else delete item.marker;
    }
    render();
  });

  // Picking from a dropdown also switches to that record's floor.
  $('roomSelect').addEventListener('change', e => {
    const room = findRoom(e.target.value);
    if (!room) return;
    state.floor = room.floor;
    state.selectedRoom = room.id;
    render();
  });

  $('doorSelect').addEventListener('change', e => {
    if (!e.target.value) {
      state.selectedDoor = null;
      render();
      return;
    }
    const door = findDoor(e.target.value);
    const room = door && findRoom(door.roomId);
    if (!room) return;
    state.floor = room.floor;
    state.selectedRoom = room.id;
    state.selectedDoor = door.id;
    render();
  });

  $('windowSelect').addEventListener('change', e => {
    if (!e.target.value) {
      state.selectedWindow = null;
      render();
      return;
    }
    const win = findWindow(e.target.value);
    if (!win) return;
    state.floor = win.floor;
    state.selectedWindow = win.id;
    render();
  });

  $('itemSelect').addEventListener('change', e => {
    if (!e.target.value) {
      state.selectedItem = null;
      render();
      return;
    }
    const item = findItem(e.target.value);
    if (!item) return;
    state.floor = item.floor;
    state.selectedItem = item.id;
    render();
  });

  $('addRoom').addEventListener('click', () => createRoom());
  $('duplicateRoom').addEventListener('click', () => {
    const room = findRoom(state.selectedRoom);
    if (room) createRoom(room);
  });
  $('deleteRoom').addEventListener('click', () => {
    const room = findRoom(state.selectedRoom);
    if (!room) return;
    const id = room.id;
    askConfirmation(`Remove ${room.name}?`, 'This will also remove any doorway attached to this space.', 'Remove Room', () => {
      state.rooms = state.rooms.filter(r => r.id !== id);
      state.doors = state.doors.filter(d => d.roomId !== id);
      state.selectedRoom = null;
      render();
    }, $('deleteRoom'));
  });

  /** Registers a change handler that edits the selected room. */
  /** Makes a function that runs a handler on the selected record when a field changes, then redraws. */
  const changeRegistrar = findSelected => (id, handler) => {
    $(id).addEventListener('change', e => {
      const record = findSelected();
      if (record) handler(record, e.target.value);
      render();
    });
  };
  const onRoomChange = changeRegistrar(() => findRoom(state.selectedRoom));
  const onDoorChange = changeRegistrar(() => findDoor(state.selectedDoor));
  const onWindowChange = changeRegistrar(() => findWindow(state.selectedWindow));
  const onItemChange = changeRegistrar(() => findItem(state.selectedItem));

  /** A length field: read it in the current units, snap it, and store it on the record. */
  function onLengthChange(onChange, id, key) {
    onChange(id, (record, value) => {
      const ft = readField(id, value);
      if (ft !== null) record[key] = snap(ft);
    });
  }

  onRoomChange('roomName', (room, value) => {
    const name = value.trim().slice(0, 48);
    if (name) room.name = name;
  });
  onRoomChange('roomKind', (room, value) => {
    room.kind = value;
    if (value === 'stairs') room.stair = stairOf(room);
    else delete room.stair;
  });

  // Stair settings. Each edit starts from the room's complete settings.
  const onStairChange = (id, edit) => onRoomChange(id, (room, value) => {
    const stair = stairOf(room);
    edit(stair, value);
    room.stair = stair;
  });
  onStairChange('stairType', (stair, value) => {
    if (!STAIR_TYPES.includes(value)) return;
    stair.type = value;
    if (value === 'straight' || value === 'spiral') stair.landing = 0;
    else if (stair.landing < 1) stair.landing = DEFAULT_LANDING;
  });
  onStairChange('stairClimb', (stair, value) => {
    if (SIDES.includes(value)) stair.climb = value;
  });
  onStairChange('stairTurn', (stair, value) => {
    if (value === 'left' || value === 'right') stair.turn = value;
  });
  // A landing is at least 12″ on stairs that turn. A straight stair uses 0 for none.
  onStairChange('stairLanding', (stair, value) => {
    const ft = readField('stairLanding', value);
    if (ft === null || stair.type === 'spiral') return;
    stair.landing = stair.type === 'straight' ? ft : Math.max(ft, 1);
  });
  onRoomChange('roomWalls', (room, value) => { room.wallMode = value; });
  onRoomChange('roomFloor', (room, value) => {
    if (floorOrder().includes(value)) {
      room.floor = value;
      state.floor = value;
    }
  });
  for (const [id, key] of [['roomX', 'x'], ['roomY', 'y'], ['roomW', 'w'], ['roomH', 'h']]) {
    onLengthChange(onRoomChange, id, key);
  }
  // An empty room thickness uses the interior default.
  $('roomWallT').addEventListener('change', e => {
    const room = findRoom(state.selectedRoom);
    if (!room) return;
    const value = e.target.value.trim();
    const ft = readField('roomWallT', value);
    if (value === '') delete room.wallT;
    else if (ft !== null) room.wallT = ft;
    render();
  });
  for (const box of document.querySelectorAll('.wall-side')) {
    box.addEventListener('change', () => {
      const room = findRoom(state.selectedRoom);
      if (!room || box.disabled) return;
      room.walls = { north: true, east: true, south: true, west: true, ...room.walls, [box.dataset.side]: box.checked };
      if (!box.checked && room.halfWalls) room.halfWalls = { ...room.halfWalls, [box.dataset.side]: false };
      render();
    });
  }
  for (const box of document.querySelectorAll('.half-side')) {
    box.addEventListener('change', () => {
      const room = findRoom(state.selectedRoom);
      if (!room || box.disabled) return;
      room.halfWalls = { ...room.halfWalls, [box.dataset.side]: box.checked };
      render();
    });
  }
  $('alignStairs').addEventListener('click', () => {
    const main = findRoom('stairs-main');
    if (main) {
      for (const id of ['stairs-basement', 'stairs-upper']) {
        const other = findRoom(id);
        if (other) for (const key of ['x', 'y', 'w', 'h']) other[key] = main[key];
      }
    }
    render();
  });

  // --- Doorways -------------------------------------------------------------

  $('addDoor').addEventListener('click', () => {
    const room = findRoom(state.selectedRoom);
    if (!room || wallMode(room) !== 'enclosed') return;
    const side = room.x > state.width / 2 ? 'west' : 'east';
    const width = Math.min(3, Math.max(2, room.h - 1));
    const door = {
      id: newId('door'),
      roomId: room.id,
      side,
      offset: snap(Math.max(0.5, (room.h - width) / 2)),
      width,
      hinge: 'start',
      swing: 'in',
      head: DEFAULT_DOOR_HEAD,
    };
    state.doors.push(door);
    state.selectedDoor = door.id;
    render();
    $('doorOffset').focus();
  });

  /** Registers a change handler that edits the selected doorway. */
  onDoorChange('doorSide', (door, value) => {
    door.side = value;
    const room = findRoom(door.roomId);
    const length = isHorizontalSide(door.side) ? room.w : room.h;
    door.offset = snap(Math.max(0.5, (length - door.width) / 2));
  });
  onDoorChange('doorHinge', (door, value) => { door.hinge = value; });
  onDoorChange('doorSwing', (door, value) => {
    door.swing = value.replace('bifold-', '');
    if (value.startsWith('bifold-')) door.bifold = true;
    else delete door.bifold;
  });
  for (const [id, key] of [['doorOffset', 'offset'], ['doorWidth', 'width']]) {
    onLengthChange(onDoorChange, id, key);
  }
  onDoorChange('doorHead', (door, value) => {
    const ft = readField('doorHead', value);
    if (ft !== null) door.head = ft;
  });
  $('removeDoor').addEventListener('click', () => {
    if (!state.selectedDoor) return;
    state.doors = state.doors.filter(d => d.id !== state.selectedDoor);
    state.selectedDoor = null;
    render();
  });

  // --- Windows --------------------------------------------------------------

  $('addWindow').addEventListener('click', () => {
    const room = findRoom(state.selectedRoom);
    const W = state.width;
    const H = state.depth;
    const e = state.exteriorWall;
    let side = 'north';
    let offset = W / 2 - 1.5;
    let width = 3;
    // Start on the selected room's outside wall when it has one.
    if (room && room.floor === state.floor) {
      const exteriorSide = SIDES.find(s => isExteriorSide(room, s));
      if (exteriorSide) {
        side = exteriorSide;
        const horizontal = isHorizontalSide(side);
        const a = Math.max(e, horizontal ? room.x : room.y);
        const b = Math.min((horizontal ? W : H) - e, horizontal ? room.x + room.w : room.y + room.h);
        width = Math.max(1, Math.min(3, b - a - 1));
        offset = a + (b - a - width) / 2;
      }
    }
    const win = {
      id: newId('window'),
      floor: state.floor,
      side,
      offset: snap(offset),
      width,
      sill: DEFAULT_WINDOW_SILL,
      head: DEFAULT_WINDOW_HEAD,
    };
    state.windows.push(win);
    state.selectedWindow = win.id;
    render();
  });

  $('windowSide').addEventListener('change', e => {
    const win = findWindow(state.selectedWindow);
    if (win) {
      win.side = e.target.value;
      const g = windowGeometry(win);
      win.offset = snap(Math.min(Math.max(0, win.offset), g.length - win.width));
    }
    render();
  });
  $('centerWindow').addEventListener('click', () => {
    const win = findWindow(state.selectedWindow);
    const room = win && roomBesideWindow(win);
    if (!room) return;
    centerWindowOnRoom(win, room);
    render();
  });
  for (const [id, key] of [['windowOffset', 'offset'], ['windowWidth', 'width']]) {
    onLengthChange(onWindowChange, id, key);
  }
  // The sill must stay below the head, so a value that crosses it is ignored.
  onWindowChange('windowSill', (win, value) => {
    const ft = readField('windowSill', value);
    if (ft !== null && ft < windowHead(win)) win.sill = ft;
  });
  onWindowChange('windowHead', (win, value) => {
    const ft = readField('windowHead', value);
    if (ft !== null && ft > windowSill(win)) win.head = ft;
  });
  $('removeWindow').addEventListener('click', () => {
    if (!state.selectedWindow) return;
    state.windows = state.windows.filter(w => w.id !== state.selectedWindow);
    state.selectedWindow = null;
    render();
  });

  // --- Furniture and fixtures -----------------------------------------------

  $('showItems').addEventListener('change', e => {
    state.showItems = e.target.checked;
    render();
  });

  $('addItem').addEventListener('click', () => {
    const [name, w, h] = ITEM_PRESETS.custom;
    const room = findRoom(state.selectedRoom);
    let x = 1.5;
    let y = 1.5;
    // Center new items in the selected room.
    if (room && room.floor === state.floor) {
      x = snap(room.x + room.w / 2 - w / 2);
      y = snap(room.y + room.h / 2 - h / 2);
    }
    const item = { id: newId('item'), name, floor: state.floor, x, y, w, h };
    state.items.push(item);
    state.selectedItem = item.id;
    state.showItems = true;
    render();
  });

  $('itemName').addEventListener('change', e => {
    const item = findItem(state.selectedItem);
    if (item) {
      const name = e.target.value.trim().slice(0, 120);
      if (name) item.name = name;
    }
    render();
  });
  for (const [id, key] of [['itemX', 'x'], ['itemY', 'y'], ['itemW', 'w'], ['itemH', 'h']]) {
    onLengthChange(onItemChange, id, key);
  }
  /** Turns the selected item 90° around its middle by swapping its width and depth. */
  function rotateSelectedItem() {
    const item = findItem(state.selectedItem);
    if (!item || item.floor !== state.floor) return;
    const cx = item.x + item.w / 2;
    const cy = item.y + item.h / 2;
    [item.w, item.h] = [item.h, item.w];
    item.x = snap(cx - item.w / 2);
    item.y = snap(cy - item.h / 2);
    render();
  }
  $('rotateItem').addEventListener('click', rotateSelectedItem);

  // R rotates the selected item. It is ignored while typing, while a dialog is
  // open, and when a modifier is held, so Ctrl+R still reloads the page.
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'r' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('confirmOverlay').hidden) return;
    const field = document.activeElement;
    if (field && field.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select')) return;
    if (!state.selectedItem) return;
    e.preventDefault();
    rotateSelectedItem();
  });
  $('duplicateItem').addEventListener('click', () => {
    const item = findItem(state.selectedItem);
    if (!item) return;
    const copy = { ...item, id: newId('item'), name: `${item.name} Copy`, x: item.x + 0.5, y: item.y + 0.5 };
    state.items.push(copy);
    state.selectedItem = copy.id;
    render();
  });
  $('removeItem').addEventListener('click', () => {
    const item = findItem(state.selectedItem);
    if (!item) return;
    state.items = state.items.filter(x => x.id !== item.id);
    state.selectedItem = null;
    render();
  });

  // --- Rotate and zoom ------------------------------------------------------

  $('rotateRight').addEventListener('click', () => {
    rotateClockwise();
    render();
  });
  $('rotateLeft').addEventListener('click', () => {
    rotateClockwise();
    rotateClockwise();
    rotateClockwise();
    render();
  });
  // The building turns inside the lot. The left button is three turns right.
  $('rotateBuildingRight').addEventListener('click', () => {
    rotateClockwise({ keepLot: true });
    render();
  });
  $('rotateBuildingLeft').addEventListener('click', () => {
    for (let turn = 0; turn < 3; turn++) rotateClockwise({ keepLot: true });
    render();
  });
  $('zoomOut').addEventListener('click', () => {
    state.zoom = Math.max(ZOOM_MIN, state.zoom - ZOOM_STEP);
    render();
  });
  $('zoomIn').addEventListener('click', () => {
    state.zoom = Math.min(ZOOM_MAX, state.zoom + ZOOM_STEP);
    render();
  });

  // --- Units -----------------------------------------------------------------

  function setUnits(next) {
    if (next === units) return;
    units = next;
    try {
      localStorage.setItem(UNITS_KEY, units);
    } catch (_) {
      // Storage unavailable: the choice lasts until the page is closed.
    }
    render();
  }
  // --- Color theme ------------------------------------------------------------
  // Dark is the default. index.html sets data-theme before the page paints, so
  // this only keeps the buttons in step and saves a change. The choice is a
  // browser preference, not part of the layout.

  const THEME_KEY = 'sip-house-planner-theme';

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('themeLight').setAttribute('aria-pressed', String(theme === 'light'));
    $('themeDark').setAttribute('aria-pressed', String(theme === 'dark'));
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {
      // Storage unavailable: the choice lasts until the page is closed.
    }
  }

  $('themeLight').addEventListener('click', () => setTheme('light'));
  $('themeDark').addEventListener('click', () => setTheme('dark'));
  const startingTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  $('themeLight').setAttribute('aria-pressed', String(startingTheme === 'light'));
  $('themeDark').setAttribute('aria-pressed', String(startingTheme === 'dark'));

  $('unitsImperial').addEventListener('click', () => setUnits('imperial'));
  $('unitsMetric').addEventListener('click', () => setUnits('metric'));

  // --- Plan: select, drag, and keyboard nudges -----------------------------

  const SHAPE_SELECTOR = '[data-door], [data-window], [data-room], [data-item]';
  let drag = null;

  /**
   * The exterior wall closest to a point. The window's current wall wins
   * unless another wall is clearly closer, so it doesn't flicker between two
   * walls when the pointer is near a corner.
   */
  function nearestWallSide(p, currentSide) {
    const distance = { north: p.y, south: state.depth - p.y, west: p.x, east: state.width - p.x };
    const closest = SIDES.reduce((best, side) => (distance[side] < distance[best] ? side : best));
    return distance[currentSide] <= distance[closest] + 0.75 ? currentSide : closest;
  }

  /** Pointer position in plan units (feet). */
  function planPoint(event) {
    const p = svg.createSVGPoint();
    p.x = event.clientX;
    p.y = event.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }

  // On touch screens, dragging is off by default so swiping scrolls the page;
  // the Drag to Move switch turns it on.
  const touchUI = matchMedia('(pointer: coarse)').matches;
  let dragMode = !touchUI;
  const applyDragMode = () => {
    svg.classList.toggle('tap-only', !dragMode);
    $('dragMode').checked = dragMode;
  };
  $('dragMode').addEventListener('change', e => {
    dragMode = e.target.checked;
    applyDragMode();
  });
  applyDragMode();

  function selectShape(group) {
    if (group.dataset.door) {
      state.selectedDoor = group.dataset.door;
      state.selectedRoom = findDoor(group.dataset.door).roomId;
    } else if (group.dataset.window) {
      state.selectedWindow = group.dataset.window;
    } else if (group.dataset.room) {
      state.selectedRoom = group.dataset.room;
      state.selectedDoor = null;
      state.selectedWindow = null;
    } else if (group.dataset.item) {
      state.selectedItem = group.dataset.item;
    }
  }

  // Tap mode: a tap selects.
  svg.addEventListener('click', e => {
    if (dragMode) return;
    const group = e.target.closest(SHAPE_SELECTOR);
    if (!group) return;
    selectShape(group);
    render();
  });

  svg.addEventListener('pointerdown', e => {
    if (!dragMode && e.pointerType !== 'mouse') return;
    const group = e.target.closest(SHAPE_SELECTOR);
    if (!group) return;
    const p = planPoint(e);
    if (group.dataset.door) {
      const d = findDoor(group.dataset.door);
      const g = doorGeometry(d);
      state.selectedDoor = d.id;
      state.selectedRoom = d.roomId;
      drag = { type: 'door', id: d.id, delta: (g.horizontal ? p.x - g.room.x : p.y - g.room.y) - d.offset };
    } else if (group.dataset.window) {
      const w = findWindow(group.dataset.window);
      const g = windowGeometry(w);
      state.selectedWindow = w.id;
      drag = { type: 'window', id: w.id, delta: (g.horizontal ? p.x : p.y) - w.offset };
    } else if (group.dataset.room) {
      const r = findRoom(group.dataset.room);
      state.selectedRoom = r.id;
      state.selectedDoor = null;
      state.selectedWindow = null;
      drag = { type: 'room', id: r.id, dx: p.x - r.x, dy: p.y - r.y };
    } else {
      const it = findItem(group.dataset.item);
      state.selectedItem = it.id;
      drag = { type: 'item', id: it.id, dx: p.x - it.x, dy: p.y - it.y };
    }
    dragStartLayout = lastLayout;
    svg.setPointerCapture(e.pointerId);
    render();
    e.preventDefault();
  });

  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = planPoint(e);
    if (drag.type === 'room') {
      const r = findRoom(drag.id);
      r.x = snap(p.x - drag.dx);
      r.y = snap(p.y - drag.dy);
    } else if (drag.type === 'item') {
      const it = findItem(drag.id);
      it.x = snap(p.x - drag.dx);
      it.y = snap(p.y - drag.dy);
    } else if (drag.type === 'window') {
      const w = findWindow(drag.id);
      const side = nearestWallSide(p, w.side);
      if (side !== w.side) {
        // Moved to another wall: hold the window by its middle from here on.
        w.side = side;
        drag.delta = w.width / 2;
      }
      const g = windowGeometry(w);
      w.offset = snap(Math.max(0, Math.min(g.length - w.width, (g.horizontal ? p.x : p.y) - drag.delta)));
    } else {
      const d = findDoor(drag.id);
      const g = doorGeometry(d);
      d.offset = snap(Math.max(0, Math.min(g.length - d.width, (g.horizontal ? p.x - g.room.x : p.y - g.room.y) - drag.delta)));
    }
    render();
  });

  const endDrag = () => {
    drag = null;
    endDragTracking();
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // Keyboard: Enter or Space selects a focused shape. Arrow keys move it one
  // snap step (3″ or 5 cm); Shift moves 1′ or 25 cm. Doorways and windows
  // slide along their wall.
  svg.addEventListener('keydown', e => {
    if (!['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const group = e.target.closest(SHAPE_SELECTOR);
    if (!group) return;
    e.preventDefault();
    const isArrow = e.key.startsWith('Arrow');

    if (group.dataset.window) {
      state.selectedWindow = group.dataset.window;
      if (isArrow) {
        const w = findWindow(state.selectedWindow);
        const g = windowGeometry(w);
        const amount = nudgeStep(e.shiftKey);
        const forward = g.horizontal ? e.key === 'ArrowRight' : e.key === 'ArrowDown';
        const back = g.horizontal ? e.key === 'ArrowLeft' : e.key === 'ArrowUp';
        if (forward || back) w.offset = Math.max(0, Math.min(g.length - w.width, w.offset + (forward ? amount : -amount)));
      }
      render();
      return;
    }

    if (group.dataset.room) {
      state.selectedRoom = group.dataset.room;
    } else if (group.dataset.door) {
      state.selectedDoor = group.dataset.door;
      state.selectedRoom = findDoor(state.selectedDoor).roomId;
    } else {
      state.selectedItem = group.dataset.item;
    }

    if (isArrow) {
      const amount = nudgeStep(e.shiftKey);
      if (group.dataset.door) {
        const d = findDoor(group.dataset.door);
        const g = doorGeometry(d);
        const forward = g.horizontal ? e.key === 'ArrowRight' : e.key === 'ArrowDown';
        const back = g.horizontal ? e.key === 'ArrowLeft' : e.key === 'ArrowUp';
        if (forward || back) d.offset = Math.max(0, Math.min(g.length - d.width, d.offset + (forward ? amount : -amount)));
      } else {
        const shape = group.dataset.room ? findRoom(group.dataset.room) : findItem(group.dataset.item);
        if (e.key === 'ArrowUp') shape.y -= amount;
        if (e.key === 'ArrowDown') shape.y += amount;
        if (e.key === 'ArrowLeft') shape.x -= amount;
        if (e.key === 'ArrowRight') shape.x += amount;
      }
    }
    render();
  });

  // --- Mobile notice ---------------------------------------------------------
  // Remembered for this visit only, so it comes back the next time someone
  // opens the planner on a phone.

  const NOTICE_KEY = 'sip-house-planner-mobile-notice';
  try {
    if (sessionStorage.getItem(NOTICE_KEY) === 'dismissed') $('mobileNotice').hidden = true;
  } catch (_) {
    // Storage unavailable: the notice just shows again.
  }
  $('mobileNoticeDismiss').addEventListener('click', () => {
    $('mobileNotice').hidden = true;
    try {
      sessionStorage.setItem(NOTICE_KEY, 'dismissed');
    } catch (_) {
      // Storage unavailable: it only stays hidden until the next reload.
    }
  });

  // --- Top bar menu (collapsed into a Menu button on narrow screens) ---------

  const closeMenu = () => {
    $('actionMenu').classList.remove('open');
    $('menuToggle').setAttribute('aria-expanded', 'false');
  };
  $('menuToggle').addEventListener('click', e => {
    e.stopPropagation();
    const open = !$('actionMenu').classList.contains('open');
    $('actionMenu').classList.toggle('open', open);
    $('menuToggle').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#actionMenu') && !e.target.closest('#menuToggle')) closeMenu();
  });
  $('actionMenu').addEventListener('click', e => {
    if (e.target.closest('button')) closeMenu();
  });

  $('undo').addEventListener('click', undoLastChange);

  // Ctrl+Z (Cmd+Z on a Mac). Inside a text or number field it keeps its normal
  // job of undoing typing, and it is ignored while a dialog is open.
  document.addEventListener('keydown', e => {
    const isUndoKey = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z';
    if (!isUndoKey || !$('confirmOverlay').hidden) return;
    const field = document.activeElement;
    if (field && field.matches('input:not([type="checkbox"]):not([type="radio"]), textarea')) return;
    e.preventDefault();
    undoLastChange();
  });

  // --- Templates --------------------------------------------------------------

  $('templateSelect').append(...TEMPLATES.map(t => new Option(t.name, t.id)));
  $('templateSelect').addEventListener('change', e => {
    const template = TEMPLATES.find(t => t.id === e.target.value);
    // Back to the placeholder so the same template can be picked again.
    e.target.value = '';
    if (!template) return;
    askConfirmation(
      `Load ${template.name}?`,
      'Your current layout in this browser will be replaced. Export it first if you want to keep a copy. You can also use Undo right after.',
      'Load Template',
      async () => {
        const { layout: next, problem } = await readTemplate(template);
        if (!next) {
          showTemplateProblem(problem, $('templateSelect'));
          return;
        }
        state = next;
        render();
      },
      $('templateSelect'),
    );
  });

  function showTemplateProblem(problem, returnFocusTo) {
    askConfirmation('Couldn’t Load That Template', `${problem} Nothing was changed.`, 'OK', null, returnFocusTo, true);
  }

  /** The template the current layout came from, if it was loaded from one. */
  const loadedTemplate = () => TEMPLATES.find(t => t.name === state.templateCredit?.name);

  // Reset goes back to the template that is loaded, or to the default layout
  // when the layout did not come from a template.
  $('reset').addEventListener('click', () => {
    const template = loadedTemplate() || DEFAULT_TEMPLATE;
    const target = template === DEFAULT_TEMPLATE ? 'the default layout' : `the ${template.name} template`;
    askConfirmation(
      'Reset to Defaults?',
      `Your current layout in this browser will be replaced with ${target}. Export it first if you want to keep a copy.`,
      'Reset to Defaults',
      async () => {
        const { layout: next, problem } = await readTemplate(template);
        if (!next) {
          showTemplateProblem(problem, $('reset'));
          return;
        }
        state = next;
        render();
      },
      $('reset'),
    );
  });

  // ==========================================================================
  // 10. Export, import, and print
  // ==========================================================================

  $('exportLayout').addEventListener('click', () => {
    const data = { app: 'sip-house-planner', format: 1, exportedAt: new Date().toISOString(), layout: state };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sip-house-layout-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  });

  $('importLayout').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let next = null;
    try {
      const data = JSON.parse(await file.text());
      next = sanitizeLayout(data && data.layout ? data.layout : data);
    } catch (_) {
      // Not JSON: handled below.
    }
    if (!next) {
      askConfirmation('Couldn’t Import That File', 'It isn’t a layout exported from SIP House Planner, or it’s damaged. Nothing was changed.', 'OK', null, $('importLayout'), true);
      return;
    }
    const count = next.rooms.length;
    askConfirmation('Import This Layout?', `“${file.name}” has ${count} space${count === 1 ? '' : 's'}. It will replace the layout currently in this browser.`, 'Import Layout', () => {
      state = next;
      render();
    }, $('importLayout'));
  });

  /** Builds one print page per floor (letter, landscape) in #printSheets. */
  function buildPrintSheets() {
    const host = $('printSheets');
    host.replaceChildren();

    // Print without selection highlights, then restore the selection.
    const keep = {
      floor: state.floor,
      room: state.selectedRoom,
      door: state.selectedDoor,
      item: state.selectedItem,
      window: state.selectedWindow,
    };
    state.selectedRoom = null;
    state.selectedDoor = null;
    state.selectedItem = null;
    state.selectedWindow = null;

    const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const ratio = `${planBounds().w}/${planBounds().h}`;
    for (const floor of floorOrder()) {
      state.floor = floor;
      const model = wallModel(floor);
      renderPlan(model);
      const clone = svg.cloneNode(true);
      clone.removeAttribute('id');
      clone.removeAttribute('tabindex');
      clone.setAttribute('style', `display:block;width:auto;height:100%;max-width:100%;aspect-ratio:${ratio};margin:0 auto`);

      const page = document.createElement('section');
      page.className = 'print-page';

      const head = document.createElement('header');
      head.className = 'print-head';
      const title = document.createElement('h1');
      title.textContent = floorName(floor);
      const meta = document.createElement('p');
      meta.textContent = `SIP House Planner · ${fmtSize(state.width, state.depth)} footprint · approx. ${fmtArea(Math.max(0, model.shellArea - model.partitionArea))} after walls · ${fmtLength(wallHeight(floor))} walls · ${date}`;
      head.append(title, meta);

      const plan = document.createElement('div');
      plan.className = 'print-plan';
      plan.append(clone);

      const list = document.createElement('ul');
      list.className = 'print-rooms';
      for (const r of state.rooms.filter(room => room.floor === floor)) {
        const li = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = r.name;
        li.append(name, ` ${fmtSize(r.w, r.h)}${isOutdoor(r) ? ' (outdoor)' : ''}`);
        list.append(li);
      }

      const note = document.createElement('p');
      note.className = 'print-note';
      const credit = state.templateCredit ? ` Based on ${state.templateCredit.name} by ${state.templateCredit.by}.` : '';
      note.textContent = `Concept sketch only. 1 grid square = ${gridSquareText()}. Not a construction document.${credit}`;

      page.append(head, plan, list, note);
      host.append(page);
    }

    state.floor = keep.floor;
    state.selectedWindow = keep.window;
    state.selectedRoom = keep.room;
    state.selectedDoor = keep.door;
    state.selectedItem = keep.item;
    render();
  }

  $('printPlan').addEventListener('click', () => {
    buildPrintSheets();
    window.print();
  });

  // ==========================================================================
  // 11. Start-up
  // ==========================================================================

  render();
  // First visit (no browser draft): load the default layout.
  if (!hasSavedDraft) {
    readTemplate(DEFAULT_TEMPLATE).then(({ layout: next }) => {
      state = next;
      render();
      // Loading the default layout on a first visit isn't something to undo.
      undoStack.length = 0;
      $('undo').disabled = true;
    });
  }
})();

// ============================================================================
// Plan area resize handle
// Drag the bar under the plan to change its height, double-click to fit the
// whole plan, or use the Up and Down arrow keys (Shift for bigger steps).
// The height is remembered in this browser.
// ============================================================================
(() => {
  'use strict';

  const scroll = document.querySelector('.plan-scroll');
  const handle = document.getElementById('planResize');
  if (!scroll || !handle) return;

  const STORAGE_KEY = 'sip-house-planner-plan-height';
  const LEGACY_STORAGE_KEY = 'sals-sip-house-planner-height';
  const MIN_HEIGHT = 280;

  const currentHeight = () => scroll.getBoundingClientRect().height;
  const updateAria = h => handle.setAttribute('aria-valuenow', String(Math.round(h)));

  const apply = h => {
    h = Math.max(MIN_HEIGHT, Math.round(h));
    scroll.style.height = `${h}px`;
    updateAria(h);
    return h;
  };

  const save = h => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.round(h)));
    } catch (_) {
      // Storage unavailable: the height just won't be remembered.
    }
  };

  try {
    if (localStorage.getItem(STORAGE_KEY) === null) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy !== null) {
        localStorage.setItem(STORAGE_KEY, legacy);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved) && saved >= MIN_HEIGHT) apply(saved);
  } catch (_) {
    // Storage unavailable: keep the default height.
  }
  handle.setAttribute('aria-valuemin', String(MIN_HEIGHT));
  updateAria(currentHeight());

  let start = null;
  handle.addEventListener('pointerdown', e => {
    start = { y: e.clientY, h: currentHeight() };
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('dragging');
    e.preventDefault();
  });
  handle.addEventListener('pointermove', e => {
    if (start) apply(start.h + e.clientY - start.y);
  });
  const end = () => {
    if (!start) return;
    start = null;
    handle.classList.remove('dragging');
    save(currentHeight());
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);

  // Double-click: fit the height to the plan at the current width.
  handle.addEventListener('dblclick', () => {
    const style = getComputedStyle(scroll);
    const viewBox = document.getElementById('plan').viewBox.baseVal;
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const contentWidth = scroll.clientWidth - padX;
    if (viewBox && viewBox.width && contentWidth > 0) {
      const scrollbar = scroll.offsetHeight - scroll.clientHeight;
      save(apply(contentWidth * viewBox.height / viewBox.width + padY + scrollbar + 2));
    }
  });

  handle.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step = e.shiftKey ? 100 : 25;
    save(apply(currentHeight() + (e.key === 'ArrowDown' ? step : -step)));
  });
})();
