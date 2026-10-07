/*
 * Smoke test: opens the real app in a browser and checks that the main things
 * work. It is for developers only. The app never loads this file.
 *
 * Run it from the project folder:
 *
 *   node tests/smoke.js
 *
 * It starts its own small web server, so nothing else needs to be running.
 * It needs Playwright. If `require('playwright')` fails, set PLAYWRIGHT_MODULE
 * to the path of the playwright package (the cloud environment has one).
 * It prints one line per check and exits with an error if any check fails.
 */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (_) {
    return require(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright');
  }
}

/** Serves the project folder over http, because the app cannot load its templates from file://. */
function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  const { chromium } = loadPlaywright();
  const server = await startServer();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();

  const results = [];
  const errors = [];
  let page;

  /** Opens a fresh page (empty browser storage) and starts collecting errors. */
  async function openApp(viewport = { width: 1500, height: 1100 }) {
    const context = await browser.newContext({ viewport });
    page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => { window.print = () => {}; });
    await page.goto(url);
    await page.waitForSelector('#plan [data-room]');
    return page;
  }

  /** Runs one check. A thrown error or a false result is a failure. */
  async function check(name, run) {
    const before = errors.length;
    try {
      const ok = await run();
      const newErrors = errors.slice(before);
      if (ok === false || newErrors.length) throw new Error(newErrors.length ? `console errors: ${newErrors.join(' | ')}` : 'returned false');
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, why: String(error.message).split('\n')[0] });
    }
  }

  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('sip-house-planner-v1')));
  const confirmIfAsked = async () => {
    if (await page.locator('#confirmYes').isVisible()) await page.click('#confirmYes');
  };
  // The sidebar shows one step at a time, so open a step before using its controls.
  const goStep = async number => page.click(`[data-step-tab="${number}"]`);
  const setField = async (id, value) => {
    await page.fill(`#${id}`, String(value));
    await page.press(`#${id}`, 'Tab');
  };

  // --- Start-up and templates ------------------------------------------------

  await openApp();
  await check('default layout loads with rooms drawn', async () => (await page.locator('#plan [data-room]').count()) > 5);
  await check('saved layout is the current version', async () => (await saved()).schemaVersion === 6);

  const templates = await page.$$eval('#templateSelect option', options => options.map(o => o.value).filter(Boolean));
  for (const value of templates) {
    await check(`template "${value}" loads`, async () => {
      await page.selectOption('#templateSelect', value);
      await confirmIfAsked();
      await page.waitForTimeout(250);
      return (await page.locator('#plan [data-room]').count()) > 0;
    });
  }
  await page.selectOption('#templateSelect', templates[0]);
  await confirmIfAsked();
  await page.waitForTimeout(250);

  // --- Editing and undo -------------------------------------------------------

  await check('Add Room then Undo restores the room count', async () => {
    await goStep(2);
    const before = (await saved()).rooms.length;
    await page.click('#addRoom');
    const added = (await saved()).rooms.length === before + 1;
    await page.click('#undo');
    return added && (await saved()).rooms.length === before;
  });

  await check('a second floor can be added and opened', async () => {
    await page.click('#upperToggle');
    await confirmIfAsked();
    await page.click('#upperTab');
    const onUpper = (await saved()).floor === 'upper';
    await page.click('#mainTab');
    return onUpper;
  });

  // --- Heights and stairs -----------------------------------------------------

  await check('wall height edits stick and change the floor to floor help', async () => {
    await goStep(1);
    await setField('wallHeight', 108);
    return (await saved()).wallHeights.main === 9 && /Floor to floor/.test(await page.textContent('#heightHelp'));
  });

  await check('every stair type draws without errors', async () => {
    await goStep(2);
    await page.selectOption('#roomSelect', 'stairs-main');
    for (const type of ['straight', 'turnLeft', 'turnRight', 'u', 'spiral']) {
      await page.selectOption('#stairType', type);
      if (!(await page.locator('[data-room="stairs-main"] .stair-art').count())) return false;
    }
    return /risers/.test(await page.textContent('#stairInfo'));
  });

  // --- Outdoor spaces, markers, lot -------------------------------------------

  await check('an outdoor space sits outside the footprint and the plan grows', async () => {
    await goStep(2);
    const before = await page.getAttribute('#plan', 'viewBox');
    await page.click('#addRoom');
    await page.selectOption('#roomPreset', 'porch');
    const state = await saved();
    const porch = state.rooms.find(r => r.kind === 'outdoor');
    const outside = porch.x >= state.width || porch.y >= state.depth || porch.x + porch.w <= 0 || porch.y + porch.h <= 0;
    return outside && (await page.getAttribute('#plan', 'viewBox')) !== before && !/beyond the/.test(await page.textContent('#issues'));
  });

  await check('item menu is grouped and the utility markers draw', async () => {
    await goStep(4);
    const headings = await page.$$eval('#itemPreset optgroup', groups => groups.map(g => g.label));
    const sorted = JSON.stringify(headings) === JSON.stringify([...headings].sort());
    await page.click('#addItem');
    await page.selectOption('#itemPreset', 'markerHvac');
    return sorted && headings.includes('UTILITY MARKERS') && (await page.locator('.marker-hvac').count()) > 0;
  });

  await check('the lot draws and warns when the house is inside the setback', async () => {
    await goStep(1);
    await page.check('#lotEnabled');
    const drawn = (await page.locator('.lot-line').count()) === 1 && (await page.locator('.setback-line').count()) === 1;
    await setField('lotLeft', 2);
    return drawn && /left lot line/.test(await page.textContent('#issues'));
  });

  await check('Rotate Building turns the house inside a fixed lot and keeps it centered', async () => {
    await page.click('#centerLot');
    const before = await saved();
    await page.click('#rotateBuildingRight');
    const after = await saved();
    const centerBefore = [before.lot.left + before.width / 2, before.lot.top + before.depth / 2];
    const centerAfter = [after.lot.left + after.width / 2, after.lot.top + after.depth / 2];
    const sameCenter = centerBefore.every((value, i) => Math.abs(value - centerAfter[i]) <= 0.13);
    const turned = after.width === before.depth && after.depth === before.width;
    const lotKept = after.lot.width === before.lot.width && after.lot.depth === before.lot.depth;
    await page.click('#rotateBuildingLeft');
    const back = await saved();
    return turned && lotKept && sameCenter && back.width === before.width && back.depth === before.depth;
  });

  await check('the toolbar rotate turns the house and the lot together', async () => {
    const before = await saved();
    await page.click('#rotateRight');
    const after = await saved();
    const swapped = after.width === before.depth && after.lot.width === before.lot.depth && after.lot.depth === before.lot.width;
    await page.click('#rotateLeft');
    return swapped;
  });

  // --- Units, saving, printing ------------------------------------------------

  await check('switching to metric and back keeps the layout', async () => {
    await goStep(1);
    const before = (await saved()).width;
    await page.click('#unitsMetric');
    const shown = await page.inputValue('#houseWidth');
    await page.click('#unitsImperial');
    return Number(shown) !== before && (await saved()).width === before;
  });

  await check('an older saved layout (version 3) still loads', async () => {
    await page.evaluate(() => {
      const old = JSON.parse(localStorage.getItem('sip-house-planner-v1'));
      old.schemaVersion = 3;
      for (const key of ['wallHeights', 'floorThickness', 'lot']) delete old[key];
      localStorage.setItem('sip-house-planner-v1', JSON.stringify(old));
    });
    await page.reload();
    await page.waitForSelector('#plan [data-room]');
    const state = await saved();
    return state.schemaVersion === 6 && state.wallHeights.main === 8 && state.lot.enabled === false;
  });

  await check('Print / PDF builds one page per floor', async () => {
    await page.click('#printPlan');
    await page.waitForTimeout(200);
    return (await page.locator('.print-page').count()) >= 2;
  });

  // --- The desktop notice ------------------------------------------------------

  await openApp({ width: 600, height: 900 });
  await check('the desktop notice shows on a narrow window and can be dismissed', async () => {
    const shown = await page.locator('#mobileNotice').isVisible();
    await page.click('#mobileNoticeDismiss');
    return shown && !(await page.locator('#mobileNotice').isVisible());
  });
  await openApp();
  await check('the desktop notice stays hidden on a wide window', async () => !(await page.locator('#mobileNotice').isVisible()));

  // The four area tiles must hold five digits (99,999 sq ft) at common screen widths.
  for (const width of [1500, 1700, 1906]) {
    await openApp({ width, height: 1000 });
    await check(`area tiles fit "99,999 sq ft" at ${width}px wide`, async () => {
      await page.evaluate(() => {
        for (const id of ['footprintArea', 'shellArea', 'clearArea', 'aboveGradeArea']) document.getElementById(id).innerHTML = '99,999<span class="area-unit"> sq ft</span>';
      });
      const clipped = await page.$$eval('.metric-row strong', tiles => tiles.filter(el => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > el.parentElement.getBoundingClientRect().right - 4));
      const pageScrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const titleCut = await page.$$eval('.dimensions-panel .panel-title h2, .lot-panel .panel-title h2', titles => titles.filter(h => h.getBoundingClientRect().right > h.closest('.panel').getBoundingClientRect().right - 4));
      return clipped.length === 0 && !pageScrolls && titleCut.length === 0;
    });
  }

  // An outdoor space only adds an ENTRANCE where its door sits on the house wall it touches.
  await openApp();
  const entranceBars = async (doors, rooms) => {
    const state = await saved();
    state.rooms.push(...rooms);
    state.doors.push(...doors);
    await page.evaluate(s => localStorage.setItem('sip-house-planner-v1', JSON.stringify(s)), state);
    await page.reload();
    await page.waitForSelector('#plan [data-room]');
    return page.locator('#plan .entrance-bar').count();
  };
  const baseState = await saved();
  const bath = { id: 'test-bath', name: 'Test Bath', floor: 'main', x: baseState.width, y: 2, w: 5, h: 8, kind: 'outdoor' };
  const bathDoor = (side, offset) => ({ id: 'test-door', roomId: 'test-bath', side, offset, width: 3, hinge: 'start', swing: 'in', head: 6.666 });
  const plainCount = await entranceBars([], []);
  await check('an outdoor door facing the house adds an entrance on the wall it touches', async () => {
    await openApp();
    return (await entranceBars([bathDoor('west', 2)], [bath])) === plainCount + 1;
  });
  await check('an outdoor door on a side away from the house adds no entrance', async () => {
    await openApp();
    return (await entranceBars([bathDoor('east', 2)], [bath])) === plainCount;
  });
  await check('an outdoor door beside the house wall, not on it, adds no entrance', async () => {
    await openApp();
    const lower = { ...bath, y: baseState.depth + 1 };
    return (await entranceBars([bathDoor('west', 2)], [lower])) === plainCount;
  });

  await check('a bath outside the house (not an outdoor space) only gets an entrance where it touches', async () => {
    const wet = { ...bath, id: 'test-bath', kind: 'wet' };
    await openApp();
    const touching = await entranceBars([bathDoor('west', 2)], [wet]);
    await openApp();
    const apart = await entranceBars([bathDoor('west', 2)], [{ ...wet, x: baseState.width + 3 }]);
    return touching === plainCount + 1 && apart === plainCount;
  });
  await check('an enclosed outdoor space draws its own walls and an open one draws none', async () => {
    const wallLines = async () => page.locator('#plan line.partition-wall').count();
    await openApp();
    const open = await entranceBars([], [bath]);
    const openWalls = await wallLines();
    await openApp();
    await entranceBars([], [{ ...bath, wallMode: 'enclosed' }]);
    const closedWalls = await wallLines();
    return open === plainCount && closedWalls === openWalls + 3;
  });
  await check('a door can be as wide as a garage door', async () => {
    await openApp();
    await entranceBars([{ ...bathDoor('west', 1), width: 16 }], [{ ...bath, h: 20, wallMode: 'enclosed' }]);
    await goStep(2);
    await page.selectOption('#roomSelect', 'test-bath');
    await goStep(3);
    await page.selectOption('#doorSelect', 'test-door');
    await setField('doorWidth', 16);
    return (await saved()).doors.find(d => d.id === 'test-door').width === 16;
  });

  // The sidebar steps: one step's panels at a time, Layout Checks always, and Back / Next walk the steps.
  const visibleStepPanels = () => page.$$eval('[data-step]', panels => panels.filter(p => !p.hidden).map(p => p.dataset.step));
  for (const width of [1500, 1700, 1906, 1200, 390]) {
    await openApp({ width, height: 1000 });
    await check(`steps show the right panels and Layout Checks stays visible at ${width}px wide`, async () => {
      const expected = { 1: ['1', '1', '1'], 2: ['2'], 3: ['3', '3'], 4: ['4'] };
      for (const step of [1, 2, 3, 4]) {
        await goStep(step);
        if (JSON.stringify(await visibleStepPanels()) !== JSON.stringify(expected[step])) return false;
        if (!(await page.locator('.findings').isVisible())) return false;
      }
      const pageScrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      return !pageScrolls;
    });
  }

  // A click can land on a shape drawn on top (an item over its room), so select with the keyboard.
  const pick = async selector => {
    await page.locator(`#plan ${selector}`).first().focus();
    await page.keyboard.press('Enter');
  };
  await openApp();
  await check('the planner opens on step 1 and Back / Next move between steps', async () => {
    const current = () => page.$eval('[aria-current="step"]', el => el.dataset.stepTab);
    const startsAtOne = (await current()) === '1' && (await page.locator('#stepBack').isHidden());
    await page.click('#stepNext');
    await page.click('#stepNext');
    await page.click('#stepNext');
    const atFour = (await current()) === '4' && (await page.locator('#stepNext').isHidden());
    await page.click('#stepBack');
    return startsAtOne && atFour && (await current()) === '3';
  });
  await check('clicking a door, window, or item on the plan opens its step', async () => {
    const current = () => page.$eval('[aria-current="step"]', el => el.dataset.stepTab);
    await goStep(1);
    await pick('[data-door]');
    const door = await current();
    await pick('[data-item]');
    const item = await current();
    await pick('[data-window]');
    return door === '3' && item === '4' && (await current()) === '3';
  });
  await check('loading a template starts again at step 1', async () => {
    await goStep(3);
    await page.selectOption('#templateSelect', templates[0]);
    await confirmIfAsked();
    await page.waitForTimeout(250);
    return (await page.$eval('[aria-current="step"]', el => el.dataset.stepTab)) === '1';
  });
  await check('clicking a room moves you from step 1 to step 2, and stays on steps 3 and 4', async () => {
    const current = () => page.$eval('[aria-current="step"]', el => el.dataset.stepTab);
    await goStep(1);
    await pick('[data-room]');
    const fromOne = await current();
    await goStep(4);
    await pick('[data-room]');
    return fromOne === '2' && (await current()) === '4';
  });

  await openApp({ width: 1920, height: 1080 });
  await check('the three floor tabs stay on one line at 1920 x 1080', async () => {
    const tops = await page.$$eval('.intro .floor-tabs button[role="tab"]', tabs => tabs.map(t => Math.round(t.getBoundingClientRect().top)));
    return tops.length === 3 && tops.every(top => top === tops[0]);
  });

  await browser.close();
  server.close();

  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n      ${r.why}`}`);
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
