#!/usr/bin/env node
// tools/smoke.mjs
// TSATELIER — smoke tests. Run from repo root:
//   node tools/smoke.mjs
//
// Covers the pure-compute layer only: ShellForest, WorldCoords,
// PerspectiveEngine, and the data joins. No DOM, no browser. Anything that
// needs a rendered page belongs in a different harness.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';


const RED = '\x1b[31m', GRN = '\x1b[32m', DIM = '\x1b[2m', OFF = '\x1b[0m';
let passed = 0, failed = 0, group = '';

const G = name => { group = name; console.log(`\n${DIM}${name}${OFF}`); };

function ok(desc, cond, detail = '') {
  if (cond) { passed++; console.log(`${GRN}  ok${OFF}  ${desc}`); }
  else { failed++; console.log(`${RED}FAIL${OFF}  ${desc}${detail ? '  — ' + detail : ''}`); }
}

const eq = (desc, a, b) => ok(desc, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (desc, a, b, tol = 1e-9) => ok(desc, Math.abs(a - b) <= tol, `got ${a}, want ~${b}`);

const codex    = JSON.parse(readFileSync('./data/codex.json', 'utf8'));
const layout   = JSON.parse(readFileSync('./data/layout.json', 'utf8'));
const manifest = JSON.parse(readFileSync('./data/manifest.json', 'utf8'));

const ShellForest = await import('../public/core/ShellForest.js');
const WorldCoords = await import('../public/core/WorldCoords.js');
const Perspective = await import('../public/core/PerspectiveEngine.js');
const SVGRenderer = await import('../public/core/SVGRenderer.js');

WorldCoords.configureWorld(codex);
Perspective.configureCamera(codex);

// ─── PROFILE SELECTION ───────────────────────────────────────────────────────

G('ShellForest.pickProfile — boundaries, not midpoints');
{
  const p = (w, h) => ShellForest.pickProfile(codex, w, h);
  eq('1600x720 -> wide',        p(1600, 720), 'wide');
  eq('1599x720 -> desk',        p(1599, 720), 'desk');
  eq('1024x720 -> desk',        p(1024, 720), 'desk');
  eq('1024x719 -> squat',       p(1024, 719), 'squat');
  eq('1023x719 -> tablet',      p(1023, 719), 'tablet');
  eq('640x400  -> tablet',      p(640, 400),  'tablet');
  eq('639x400  -> phone',       p(639, 400),  'phone');
  eq('0x0      -> phone',       p(0, 0),      'phone');
}

// ─── SHELL GEOMETRY ──────────────────────────────────────────────────────────

G('ShellForest.calculate — the shell tiles the viewport exactly');
{
  const px = v => parseFloat(String(v));
  const cases = [[1920, 1080], [1440, 900], [1280, 700], [900, 1200], [420, 860]];

  for (const [w, h] of cases) {
    const s = ShellForest.calculate(codex, w, h);
    const v = s.vars;
    const header = px(v['--z-header-h']), footer = px(v['--z-footer-h']), main = px(v['--z-main-h']);

    ok(`${w}x${h} (${s.profile}) header+main+footer === h`,
       header + main + footer === h, `${header}+${main}+${footer} !== ${h}`);

    if (s.stack === 'row') {
      ok(`${w}x${h} sidebar+gallery === w`,
         px(v['--z-sidebar-w']) + px(v['--z-gallery-w']) === w);
      ok(`${w}x${h} both columns full height`,
         px(v['--z-sidebar-h']) === main && px(v['--z-gallery-h']) === main);
    } else {
      ok(`${w}x${h} sidebar+gallery === main (stacked)`,
         px(v['--z-sidebar-h']) + px(v['--z-gallery-h']) === main);
    }

    ok(`${w}x${h} map fits its sidebar`, px(v['--z-map-size']) >= 120);
    ok(`${w}x${h} no NaN / undefined in stamped vars`,
       Object.entries(v).every(([, val]) =>
         val !== undefined && val !== null && !String(val).includes('NaN')),
       Object.entries(v).filter(([, x]) => String(x).includes('NaN')).map(([k]) => k).join(', '));
  }
}

G('ShellForest — the footer drawer opens without breaking the shell');
{
  const px = v => parseFloat(String(v));
  const cases = [[1920, 1080], [1440, 900], [1280, 700], [900, 1200], [420, 860]];

  for (const [w, h] of cases) {
    const shut = ShellForest.calculate(codex, w, h, false);
    const open = ShellForest.calculate(codex, w, h, true);
    const a = shut.vars, b = open.vars;

    ok(`${w}x${h} (${shut.profile}) open shell still tiles the viewport`,
       px(b['--z-header-h']) + px(b['--z-main-h']) + px(b['--z-footer-h']) === h,
       `${b['--z-header-h']}+${b['--z-main-h']}+${b['--z-footer-h']} !== ${h}`);

    ok(`${w}x${h} the drawer is taller than the bar`,
       px(b['--z-footer-h']) > px(a['--z-footer-h']),
       `${b['--z-footer-h']} vs ${a['--z-footer-h']}`);

    ok(`${w}x${h} the drawer leaves the gallery a surface`,
       px(b['--z-gallery-w']) > 0 && px(b['--z-gallery-h']) > 0);

    // Fader geometry must NOT move when the drawer opens. Sized off the live
    // footer height, the controls would resize as the drawer slid — which
    // reads as the mixer squirming rather than the drawer opening.
    ok(`${w}x${h} mixer geometry is unchanged by the drawer`,
       b['--z-fader-w'] === a['--z-fader-w'] && b['--z-mute-size'] === a['--z-mute-size'],
       `${b['--z-fader-w']} vs ${a['--z-fader-w']}`);
  }
}

G('ShellForest — palette reaches CSS');
{
  const v = ShellForest.calculate(codex, 1440, 900).vars;
  const keys = Object.keys(codex.palette);
  const missing = keys.filter(k =>
    v['--c-' + k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())] === undefined);
  ok(`all ${keys.length} palette keys emitted as --c-*`, missing.length === 0, missing.join(', '));
  ok('no --qt-* aliases remain', !Object.keys(v).some(k => k.startsWith('--qt-')));
}

// ─── WORLD ───────────────────────────────────────────────────────────────────

G('WorldCoords — configured from codex, no local constants');
{
  eq('gridSize from codex',  WorldCoords.GRID_SIZE,   codex.world.gridSize);
  eq('cellSize from codex',  WorldCoords.CELL_SIZE,   codex.world.cellSize);
  eq('eyeHeight from codex', WorldCoords.EYE_HEIGHT,  codex.camera.eyeHeight);
  eq('nearPlane from codex', WorldCoords.NEAR_PLANE,  codex.camera.nearPlane);
}

G('WorldCoords — camera basis is orthonormal in every orientation');
{
  for (const o of ['up', 'down', 'left', 'right']) {
    const c = WorldCoords.cameraAtCell(6, 6, o);
    near(`${o}: |forward| === 1`, Math.hypot(c.f.x, c.f.z), 1);
    near(`${o}: |right| === 1`,   Math.hypot(c.r.x, c.r.z), 1);
    near(`${o}: forward ⟂ right`, c.f.x * c.r.x + c.f.z * c.r.z, 0);
    eq(`${o}: eye at codex height`, c.y, codex.camera.eyeHeight);
  }
}

G('WorldCoords — a point ahead of the camera projects forward');
{
  const cam = WorldCoords.cameraAtCell(6, 6, 'up');
  const ahead = WorldCoords.gridToWorld(6, 3);           // further "up" the grid
  const v = WorldCoords.worldToView(ahead.x, 0, ahead.z, cam);
  ok('forward point has positive view z', v.z > 0, `z = ${v.z}`);
  near('forward point is centred', v.x, 0, 1e-9);
}

G('WorldCoords — walls dedupe, artwork renders at catalogued size');
{
  const walls = WorldCoords.extractWalls(layout);
  ok('walls extracted', walls.length > 0, `${walls.length}`);
  eq('no duplicate wall ids', new Set(walls.map(w => w.id)).size, walls.length);
  ok('every wall at codex height',
     walls.every(w => w.height === codex.world.wallHeight));

  const places = WorldCoords.buildArtworkPlacements(layout, manifest.curationMap);
  eq('14 placements', new Set(places.map(p => p.id)).size, 14);

  const width  = r => Math.abs(r.corners[1].x - r.corners[0].x);
  const height = r => Math.abs(r.corners[0].y - r.corners[3].y);
  const rectAt = (span, meta) =>
    WorldCoords.getArtworkWorldRect({ x: 6, y: 6, wallFace: 'top', span }, meta);

  // Real catalogue entry, real millimetres. The previous fixture here was
  // { actualWidth: 24, actualHeight: 18 } — inch-magnitude in millimetre-named
  // fields, harmless while only the ratio was read and silently 25.4x wrong the
  // moment absolute size was.
  const ix = manifest.artworkDetails.MERIDIANS_IX;
  const real = rectAt(1, ix);
  near('a work renders at its catalogued width',  width(real),  ix.actualWidth / 1000, 1e-9);
  near('a work renders at its catalogued height', height(real), ix.actualHeight / 1000, 1e-9);

  // The caps are a guard. Nothing in the catalogue reaches either, so state that
  // as an assertion rather than leaving it as an assumption — if a future work
  // does need clamping, this is where it announces itself.
  const capH  = codex.world.artwork.maxHeight;
  const capW1 = codex.world.cellSize * codex.world.artwork.maxWidthRatio;
  ok('no catalogued work needs clamping at span 1',
     Object.values(manifest.artworkDetails).every(d =>
       d.actualWidth / 1000 <= capW1 + 1e-9 && d.actualHeight / 1000 <= capH + 1e-9));

  // span multiplies the CAP, not the work. Needs a synthetic fixture because no
  // real work is wide enough to reach it: 3000 x 1000 mm, aspect exactly 3.
  const wide = { actualWidth: 3000, actualHeight: 1000 };
  const s1 = rectAt(1, wide), s2 = rectAt(2, wide);
  near('at span 1 an oversized work is clamped to the cap', width(s1), capW1, 1e-9);
  ok('span 2 admits a wider work than span 1', width(s2) > width(s1),
     `${width(s2)} vs ${width(s1)}`);
  near('clamping preserves the catalogued aspect', width(s1) / height(s1), 3, 1e-9);

  // A placement with no catalogue entry still has to produce a drawable rect.
  ok('a work with no metadata still gets a rect', rectAt(1, null) !== null);
}

// ─── OPENINGS // ─── MANIFEST ────────────────────────────────────────────────────────────────

G('manifest — catalogued inches and stored millimetres are one measurement');
{
  // dimensionsOriginal is HEIGHT x WIDTH in inches, exactly as the artist
  // catalogues it. actualWidth/actualHeight are millimetres derived from it.
  // Two representations, no comparison between them until now.
  const MM_PER_INCH = 25.4;
  const drift = [];

  for (const d of Object.values(manifest.artworkDetails)) {
    const [hIn, wIn] = String(d.dimensionsOriginal).split('x').map(Number);
    const dw = Math.abs(wIn * MM_PER_INCH - d.actualWidth);
    const dh = Math.abs(hIn * MM_PER_INCH - d.actualHeight);
    if (!(dw <= 0.5 && dh <= 0.5)) {
      drift.push(`${d.name}: ${d.dimensionsOriginal}in wants ` +
                 `${Math.round(wIn * MM_PER_INCH)}x${Math.round(hIn * MM_PER_INCH)}mm, ` +
                 `stored ${d.actualWidth}x${d.actualHeight}`);
    }
  }

  ok(`all ${Object.keys(manifest.artworkDetails).length} works agree within 0.5 mm`,
     drift.length === 0, drift.join(' | '));
}

// ─── OPENINGS ────────────────────────────────────────────────────────────────

G('layout — the room has exactly one opening, and it is the door');
{
  const perim = layout.filter(c => c.x === 1 || c.x === 11 || c.y === 1 || c.y === 11);
  eq('40 perimeter cells', perim.length, 40);
  eq('39 wall cells', layout.filter(c => c.isWall).length, 39);

  // A DOOR IS A CELL AND AN EDGE, AND THEY ARE NOT THE SAME OBJECT.
  //
  //   the THRESHOLD  cell (10,11) — a gap in the wall ring, isWall false
  //   the OPENING    edge (10,10).bottom — the interior's south face, which
  //                  is what extractWalls turns into a segment of kind
  //                  'opening' and what the renderer fills
  //
  // This block used to look for openings.bottom on the THRESHOLD, where there
  // is nothing to declare: the threshold is not a wall, so it has no faces.
  // The room is inset one cell inside the grid — cells 1 and 11 ARE the wall
  // ring — so every room edge lives on grid lines 1..10, never 0 or 11.
  const open = perim.filter(c => !c.isWall);
  eq('exactly one non-wall perimeter cell', open.length, 1);
  eq('the threshold is at (10,11)', `${open[0].x},${open[0].y}`, '10,11');

  const jamb = layout.find(c => c.x === 10 && c.y === 10);
  ok('the door is declared, not implied', jamb?.openings?.bottom === true);

  const walls = WorldCoords.extractWalls(layout);
  // The door sits at the south-east corner of the interior, so it has a west
  // jamb and no east one — the east end of its edge IS the corner.
  eq('the door edge is an opening', walls.find(w => w.id === 'w_9_10_10_10')?.kind, 'opening');
  eq('west jamb is wall', walls.find(w => w.id === 'w_8_10_9_10')?.kind, 'wall');
  eq('44 segments: 43 wall + 1 opening', walls.length, 44);
  eq('one opening in the whole room', walls.filter(w => w.kind === 'opening').length, 1);
  eq('43 walls', walls.filter(w => w.kind === 'wall').length, 43);
}

G('WorldCoords — every segment knows which axis it faces');
{
  const walls = WorldCoords.extractWalls(layout);
  ok('every segment carries an axis', walls.every(w => w.axis === 'x' || w.axis === 'z'));
  eq('P9 bar faces z', walls.find(w => w.id === 'w_4_6_5_6')?.axis, 'z');
  eq('corridor partition faces x', walls.find(w => w.id === 'w_7_8_7_9')?.axis, 'x');
}

G('codex — perpendicular walls get a readable value step');
{
  for (const mode of ['gallery', 'debug']) {
    const w = codex.scene.modes[mode].wall;
    const o = codex.scene.modes[mode].opening;
    ok(`${mode}: wall declares shadeX and shadeZ`,
       typeof w.shadeX === 'number' && typeof w.shadeZ === 'number');
    const ch = parseInt(w.fillNear.slice(1, 3), 16);
    const gap = Math.abs(ch * w.shadeX - ch * w.shadeZ);
    ok(`${mode}: corner step is visible`, gap >= 8, `${gap.toFixed(1)}/255`);
    ok(`${mode}: opening declares fill and stroke`,
       typeof o?.fill === 'string' && typeof o?.stroke === 'string');
  }
}

// ─── ROOM INTEGRITY ──────────────────────────────────────────────────────────

G('layout — every interior wall is a two-faced partition');
{
  const N = codex.world.gridSize;
  const faces = { top:    c => [c.x - 1, c.y - 1, c.x,     c.y - 1],
                  bottom: c => [c.x - 1, c.y,     c.x,     c.y],
                  left:   c => [c.x - 1, c.y - 1, c.x - 1, c.y],
                  right:  c => [c.x,     c.y - 1, c.x,     c.y] };
  const key = (a, b, c, d) =>
    `${Math.min(a, c)},${Math.min(b, d)},${Math.max(a, c)},${Math.max(b, d)}`;

  const edges = new Map();
  for (const cell of layout) {
    for (const side of Object.keys(faces)) {
      if (!cell.wallBorders?.[side]) continue;
      const k = key(...faces[side](cell));
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push(`(${cell.x},${cell.y}).${side}`);
    }
  }
  // THE ROOM IS NOT THE GRID.
  //
  // This predicate used to test grid lines 0 and N, i.e. the outer boundary of
  // the 11x11 grid, and expected 43 perimeter edges — which is exactly
  // 4 x 11 - 1, the perimeter of a room that FILLS the grid, less the door.
  // The room is inset: cells 1 and 11 are the wall ring, so the enclosed
  // interior is 9x9 and its boundary runs along lines 1 and 10.
  //
  // Under the old predicate every one of the 43 declared edges classified as
  // 'interior', so 35 perimeter edges were then checked for two-faced pairing
  // and correctly reported as single-faced. The layout was never wrong. The
  // arithmetic closes on the corrected predicate: 4 x 9 - 1 = 35.
  const INNER_LO = 1, INNER_HI = N - 1;
  const isPerimeter = k => {
    const [x1, y1, x2, y2] = k.split(',').map(Number);
    return (x1 === INNER_LO && x2 === INNER_LO) || (x1 === INNER_HI && x2 === INNER_HI)
        || (y1 === INNER_LO && y2 === INNER_LO) || (y1 === INNER_HI && y2 === INNER_HI);
  };

  const interior = [...edges].filter(([k]) => !isPerimeter(k));
  const perimeter = [...edges].filter(([k]) => isPerimeter(k));
  eq('35 perimeter edges (4 x 9 interior, less the door)', perimeter.length, 35);
  eq('8 interior edges (the L partition)', interior.length, 8);

  const unpaired = interior.filter(([, v]) => v.length !== 2);
  ok('every interior edge is declared from both faces', unpaired.length === 0,
     unpaired.map(([k, v]) => `${k} by ${v.join('+')}`).join('; '));

  const doubled = perimeter.filter(([, v]) => v.length !== 1);
  ok('no perimeter edge is declared twice', doubled.length === 0,
     doubled.map(([k]) => k).join('; '));
}

G('map — the sidebar plan is derived from layout, not drawn beside it');
{
  const r = spawnSync(process.execPath, ['tools/gen-map.mjs', '--check'], { encoding: 'utf8' });
  ok('committed map matches layout.json', r.status === 0,
     (r.stderr || r.stdout || '').trim());
}

// ─── PROJECTION ──────────────────────────────────────────────────────────────

G('PerspectiveEngine — near plane is the codex value, once');
{
  const cam = WorldCoords.cameraAtCell(6, 6, 'up');
  const vp = Perspective.makeViewport(1200, 800);
  const np = codex.camera.nearPlane;

  // A point just inside the near plane projects; just outside does not.
  const inside  = { x: cam.x, y: 1.6, z: cam.z - (np + 0.05) };
  const outside = { x: cam.x, y: 1.6, z: cam.z - (np - 0.05) };

  ok('point beyond near plane is visible',
     Perspective.projectPoint(inside.x, inside.y, inside.z, cam, vp).visible);
  ok('point inside near plane is clipped',
     !Perspective.projectPoint(outside.x, outside.y, outside.z, cam, vp).visible);
}

G('PerspectiveEngine — projection is centred and monotone in depth');
{
  const cam = WorldCoords.cameraAtCell(6, 6, 'up');
  const vp = Perspective.makeViewport(1200, 800);

  const p = WorldCoords.gridToWorld(6, 3);
  const eye = codex.camera.eyeHeight;
  const at = Perspective.projectPoint(p.x, eye, p.z, cam, vp);
  near('a point at eye height on the axis lands at viewport centre', at.y, vp.height / 2, 1e-6);
  near('… and horizontally centred', at.x, vp.width / 2, 1e-6);

  const nearW = Perspective.projectPoint(p.x + 1, eye, cam.z - 2, cam, vp);
  const farW  = Perspective.projectPoint(p.x + 1, eye, cam.z - 8, cam, vp);
  ok('the same offset subtends less screen space when further away',
     Math.abs(nearW.x - vp.width / 2) > Math.abs(farW.x - vp.width / 2));
}

// ─── CAMERA ──────────────────────────────────────────────────────────────────

G('PerspectiveEngine — focal length derives from the pane, and the suite can see it');
{
  const r = codex.camera.focalLengthRatio;

  near('landscape pane: the long edge is the width',
       Perspective.makeViewport(1440, 840).focalLength, 1440 * r, 1e-9);
  near('portrait pane: the long edge is the height',
       Perspective.makeViewport(840, 1440).focalLength, 1440 * r, 1e-9);

  // Every other assertion in this file is invariant under focal length — the
  // on-axis ones cancel it, the comparative ones scale both sides by it. This
  // is the first one whose value moves when the camera moves, which is what
  // makes the single-owner rule mechanically enforced rather than merely tidy.
  //
  // A pinhole camera projects a lateral offset d at depth z to (d / z) * fl
  // pixels off centre. 1 m at 3 m is fl / 3, exactly.
  const vp  = Perspective.makeViewport(1440, 840);
  const cam = WorldCoords.cameraAtCell(6, 6, 'up');
  const off = Perspective.projectPoint(cam.x + 1, codex.camera.eyeHeight, cam.z - 3, cam, vp);

  near('1 m of lateral offset at 3 m depth projects fl/3 px off centre',
       Math.abs(off.x - vp.width / 2), vp.focalLength / 3, 1e-6);
}

// ─── OCCLUSION DEPTH ─────────────────────────────────────────────────────────

G('SVGRenderer — coplanar promotion stays local to the wall it promotes past');
{
  const walls  = WorldCoords.extractWalls(layout);
  const places = WorldCoords.buildArtworkPlacements(layout, manifest.curationMap);
  const vp = Perspective.makeViewport(1200, 800);

  // Duplicated from SVGRenderer deliberately. If the renderer's table changes,
  // this one should have to be reconsidered rather than silently agree.
  const NORMAL = {
    top:  { x: 0, z:  1 }, bottom: { x:  0, z: -1 },
    left: { x: 1, z:  0 }, right:  { x: -1, z:  0 }
  };

  const collect = (gx, gy, orientation) => {
    const camera = WorldCoords.cameraAtCell(gx, gy, orientation);
    const visible = walls.filter(w =>
      Perspective.isWallPotentiallyVisible(w, camera) &&
      Perspective.projectWall(w, camera, vp).visible);

    const out = [];
    for (const p of places) {
      const rect = WorldCoords.getArtworkWorldRect(p, null);
      if (!rect) continue;

      const n = NORMAL[rect.wallFace];
      let ax = 0, az = 0;
      for (const c of rect.corners) { ax += c.x; az += c.z; }
      ax /= rect.corners.length; az /= rect.corners.length;
      if (n.x * (camera.x - ax) + n.z * (camera.z - az) <= 0) continue;
      if (!Perspective.projectQuad(rect.corners, camera, vp).visible) continue;

      const own = SVGRenderer.farthestZ(rect.corners, camera);
      out.push({
        id: p.id,
        key: SVGRenderer.planeKeyOfArtwork(rect),
        own,
        sort: SVGRenderer.promotedZ(visible, rect, camera) ?? own
      });
    }
    return out;
  };

  const cases = [[10, 11, 'up'], [10, 6, 'left'], [3, 8, 'right'], [6, 3, 'down']];

  for (const [gx, gy, o] of cases) {
    const items = collect(gx, gy, o);
    ok(`(${gx},${gy}) ${o}: sees artwork`, items.length > 0, `${items.length}`);

    const worst = items
      .map(i => ({ ...i, d: Math.abs(i.sort - i.own) }))
      .sort((a, b) => b.d - a.d)[0];
    ok(`(${gx},${gy}) ${o}: sort key stays within one cell of true depth`,
       !worst || worst.d <= codex.world.cellSize + 1e-9,
       worst && `${worst.id} sorts at ${worst.sort} but sits at ${worst.own.toFixed(1)}`);

    const bad = [];
    for (let a = 0; a < items.length; a++)
      for (let b = a + 1; b < items.length; b++) {
        if (items[a].key !== items[b].key) continue;
        if (Math.sign(items[a].sort - items[b].sort) !==
            Math.sign(items[a].own  - items[b].own)) bad.push(`${items[a].id}/${items[b].id}`);
      }
    ok(`(${gx},${gy}) ${o}: coplanar works keep their depth order`,
       bad.length === 0, bad.join(', '));
  }
}
// ─── DATA JOINS ──────────────────────────────────────────────────────────────

G('Data joins — nothing hung without metadata, nothing curated unhung');
{
  const hung = new Set(layout.map(c => c.artworkId).filter(Boolean));
  const curated = Object.keys(manifest.curationMap || {});
  const detailed = Object.keys(manifest.artworkDetails || {});

  eq('layout cells', layout.length, codex.world.gridSize ** 2);
  eq('distinct hung works', hung.size, 14);
  eq('curationMap entries', curated.length, 14);
  eq('artworkDetails entries', detailed.length, 14);

  const unhung = curated.filter(k => !hung.has(k));
  const orphan = [...hung].filter(k => !curated.includes(k));
  const nometa = curated.filter(k => !detailed.includes(manifest.curationMap[k]));

  ok('every curated work is hung', unhung.length === 0, unhung.join(', '));
  ok('every hung work is curated', orphan.length === 0, orphan.join(', '));
  ok('every curated work has details', nometa.length === 0, nometa.join(', '));
}

// ─── VERDICT ─────────────────────────────────────────────────────────────────

console.log();
if (failed) { console.log(`${RED}${failed} failed, ${passed} passed.${OFF}\n`); process.exit(1); }
console.log(`${GRN}${passed}/${passed} passed.${OFF}\n`);
