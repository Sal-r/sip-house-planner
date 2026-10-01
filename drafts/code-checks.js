/*
 * DRAFT: building code style checks. NOT part of the app.
 *
 * Nothing loads this file. index.html and app.js do not reference it, and it
 * is not in the README feature list. It is here so the ideas are written down
 * and ready if the project ever wants them.
 *
 * This is NOT legal, engineering, or building code advice. The numbers below
 * are rounded examples in the style of the International Residential Code
 * (IRC). The Residential Code of New York State and every local building
 * department can differ, and codes change. Anyone who ships these checks must
 * check each number against the code that applies to the project, and keep the
 * on-screen wording as a hint, never a pass or fail.
 *
 * It works on an exported layout (feet, same shape as templates/*.json).
 * To try it with Node:
 *
 *   node drafts/code-checks.js templates/extreme-panels-simon.json
 */

'use strict';

// Every limit in one place, in feet unless the name says otherwise.
const LIMITS = {
  // A sleeping room needs a window or door to the outside (egress).
  egressWindowAreaSqFt: 5.7,
  egressWindowAreaGradeSqFt: 5.0, // ground floor windows may be smaller
  egressWindowMinWidth: 20 / 12,
  egressWindowMinHeight: 24 / 12,
  egressWindowMaxSill: 44 / 12,
  // Habitable rooms (living spaces and bedrooms).
  minHabitableAreaSqFt: 70,
  minHabitableSide: 7,
  minCeilingHeight: 7,
  // Hallways and exit doors.
  minHallwayWidth: 3,
  minEntranceDoorWidth: 3,
};

/** True when a window sits on an exterior wall that a room touches, along the room's length. */
function windowServesRoom(layout, room, win) {
  const e = layout.exteriorWall ?? 0;
  const touches = {
    north: room.y <= e + 0.01,
    south: room.y + room.h >= layout.depth - e - 0.01,
    west: room.x <= e + 0.01,
    east: room.x + room.w >= layout.width - e - 0.01,
  }[win.side];
  if (!touches) return false;

  const horizontal = win.side === 'north' || win.side === 'south';
  const roomStart = horizontal ? room.x : room.y;
  const roomEnd = horizontal ? room.x + room.w : room.y + room.h;
  return Math.min(win.offset + win.width, roomEnd) - Math.max(win.offset, roomStart) > 0.5;
}

/**
 * Bedrooms need a window big enough to climb out of. The area here is the
 * whole window opening. Real codes use the net clear opening, which is smaller
 * (the frame and sash take space), so this check is generous.
 */
function bedroomEgress(layout) {
  const out = [];
  for (const room of layout.rooms.filter(r => r.kind === 'private')) {
    const windows = layout.windows.filter(w => w.floor === room.floor && windowServesRoom(layout, room, w));
    const needed = room.floor === 'main' ? LIMITS.egressWindowAreaGradeSqFt : LIMITS.egressWindowAreaSqFt;
    const big = windows.some(w => {
      const height = (w.head ?? 80 / 12) - (w.sill ?? 3);
      return w.width * height >= needed
        && w.width >= LIMITS.egressWindowMinWidth
        && height >= LIMITS.egressWindowMinHeight
        && (w.sill ?? 3) <= LIMITS.egressWindowMaxSill;
    });
    if (!big) {
      out.push({ level: 'warning', text: `${room.name} may not have an egress window. Sleeping rooms usually need an outside window or door of about ${needed} sq ft, with the sill no higher than 44 in.` });
    }
  }
  return out;
}

/** Living spaces and bedrooms have a minimum area and a minimum side. */
function minimumRoomSize(layout) {
  const out = [];
  for (const room of layout.rooms.filter(r => r.kind === 'private' || r.kind === 'social')) {
    const side = Math.min(room.w, room.h);
    if (room.w * room.h < LIMITS.minHabitableAreaSqFt || side < LIMITS.minHabitableSide) {
      out.push({ level: 'warning', text: `${room.name} is ${room.w} by ${room.h} ft. Habitable rooms are usually at least ${LIMITS.minHabitableAreaSqFt} sq ft and ${LIMITS.minHabitableSide} ft on each side.` });
    }
  }
  return out;
}

/** Hallways need room to pass. Stairs have their own checks in the app. */
function hallwayWidth(layout) {
  return layout.rooms
    .filter(r => r.kind === 'circulation' && Math.min(r.w, r.h) < LIMITS.minHallwayWidth)
    .map(r => ({ level: 'warning', text: `${r.name} is ${Math.min(r.w, r.h)} ft wide. Hallways are usually at least ${LIMITS.minHallwayWidth} ft.` }));
}

/** Ceilings below the minimum height. */
function ceilingHeight(layout) {
  const out = [];
  for (const [floor, height] of Object.entries(layout.wallHeights ?? {})) {
    if (layout.rooms.some(r => r.floor === floor) && height < LIMITS.minCeilingHeight) {
      out.push({ level: 'warning', text: `The ${floor} floor walls are ${height} ft. Habitable rooms usually need at least ${LIMITS.minCeilingHeight} ft.` });
    }
  }
  return out;
}

/** Doors on an outside wall need to be wide enough to exit through. */
function entranceDoorWidth(layout) {
  const out = [];
  for (const door of layout.doors) {
    const room = layout.rooms.find(r => r.id === door.roomId);
    if (!room || door.swing === 'none') continue;
    const outside = { north: room.y, south: layout.depth - (room.y + room.h), west: room.x, east: layout.width - (room.x + room.w) }[door.side];
    if (outside <= (layout.exteriorWall ?? 0) + 0.01 && door.width < LIMITS.minEntranceDoorWidth) {
      out.push({ level: 'warning', text: `An exit door in ${room.name} is ${door.width} ft wide. Exit doors are usually at least ${LIMITS.minEntranceDoorWidth} ft.` });
    }
  }
  return out;
}

/** Runs every draft check and returns [{ level, text }]. */
function codeChecks(layout) {
  return [
    ...bedroomEgress(layout),
    ...minimumRoomSize(layout),
    ...hallwayWidth(layout),
    ...ceilingHeight(layout),
    ...entranceDoorWidth(layout),
  ];
}

if (typeof module !== 'undefined') module.exports = { codeChecks, LIMITS };

// Command line use: node drafts/code-checks.js path/to/layout.json
if (typeof require !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node drafts/code-checks.js path/to/layout.json');
    process.exit(1);
  }
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  const findings = codeChecks(saved.layout ?? saved);
  console.log(findings.length ? findings.map(f => `${f.level}: ${f.text}`).join('\n') : 'No findings.');
}
