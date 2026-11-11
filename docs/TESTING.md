# What has been tested (and what has not)

## Automated: run in this build environment (Linux, Node 22, Chromium)

**Unit tests**, `npm test`, 43 tests:
- **Calculators.** Sun position (NOAA): solstice and equinox noon altitudes for Tartous, solar-noon time, sunrise azimuths. Scale and paper fit. Shoelace and Heron areas. Ramp slopes. Stair design (300 cm → 18 risers of 16.67 cm, 29.5 cm tread). ACI 318-19 section capacity, checked against a hand calculation (a = 62.09 mm, Mn = 185.6 kN·m). Required-steel round trip. β₁. Load combinations. Mix quantities. Block, tile and concrete takeoffs. Unit conversions. U-value.
- **Storage.** Create, edit and reopen the database. File blobs and versions. Duplicate with files. Cascade delete. Revisions and restore. General tasks.
- **Backup.** Full round trip into a fresh database (projects, files, mistakes). The AI token is never included. Foreign files are rejected. Merge keeps existing data.
- **App updates.** Legacy data with missing fields is migrated without loss.
- **AI worker.** Auth rejects bad tokens. Disabled by default. Provider called server-side with the key, and the key never appears in responses. The hard monthly cap refuses *before* calling the provider. The limit is clamped to €5. Provider errors release the reservation. Image and size validation.

**Browser end-to-end**, `npm run e2e`, against the production build (`vite preview`). All checks pass:
- Welcome screen, RTL/Arabic document, navigation to every section.
- Project creation, autosave, and persistence after reload.
- Site analysis (sun-path diagram, opportunities), space program (net 300 m² → gross 412.5 m²), adjacency matrix, bubble diagram, concept alternatives and matrix.
- PNG and PDF upload, a new drawing version, the version selector, side-by-side and swipe comparison, zoom, and persistence after reload.
- Printable report rendered to PDF with drawings.
- All 10 tools render. Stair, concrete and unit results checked.
- Academy plan tracking and mistake-notebook record → review → mastered.
- AI assistant against a **mocked** backend: wrong-token error, status, reply rendered with project context, network-failure message.
- Backup export, then import into a second, fresh browser profile: project and both files restored.
- **Offline:** after the service worker is installed, the app shell, projects and Arabic fonts load with the network disabled.
- **Phone** (iPhone 13 emulation): bottom navigation, no horizontal scrolling on 7 routes.
- Manifest spelled "Joudy" with a 512 px icon and `standalone` display. No unexpected console errors.
- The built `dist/` contains no provider keys or token hashes. The word "Judy" appears nowhere.

## Massing Lab (Nov 2026)

**Unit tests** (`tests/lab.test.ts`, `tests/sample-plan.test.ts`):
- **Synthetic courtyard plan** (6 px walls, door gaps, furniture, text and dimension lines):
  - Footprint is within 2% of the true area.
  - It finds 4 rooms and 1 courtyard, and detects the doors.
  - Wall thickness is estimated at about 6 px.
  - Block massing is a ring with the courtyard as a hole, and per-space heights and exploded floors work.
  - Measured areas and travel distances are correct, and elevations and sections give the expected heights.
- **Browser-rendered sample plan** (anti-aliased lines, window symbols, door arcs, Arabic labels, hatched courtyard with trees, dimension line, north arrow), against known ground truth:
  - Bounding box: 36 × 22 m (±0.3 m).
  - Footprint: 696 m² (±1%).
  - Spaces: 7 rooms and 1 courtyard, with at least 7 door links.
  - The massing outline is a clean L-shape with fewer than 20 vertices.

**Browser end-to-end**, `scripts/e2e-lab.cjs`, all checks pass:
- Dashboard call-to-action, the 6-step tutorial, and the sample plan.
- Detection: 8 spaces, 1 courtyard.
- Measured scale: footprint 697 m² against a true 696 m².
- Renaming and zoning a space, and marking an entrance.
- WebGL 3D view renders (not blank) in volumetric, exploded, and block-with-shadows modes.
- Exports produce valid **GLB / OBJ / PNG / PDF** files.
- 2D diagram plus PDF export, zoning, walking distance, bubble diagram, 5 alternatives (one applied), elevation and section, analysis, and an A3 board as PDF and PNG.
- Settings survive a reload.
- A **PDF** plan is read the same way (8 spaces).
- Studies are restored from a backup in a fresh profile.
- Phone: no horizontal scrolling, and the 3D view renders.

**Limits (known, documented in the app):**
- Walls drawn as single thin lines need the "thin lines" setting set to 0.
- Doors drawn as closed lines are not detected as doors.
- Very dense or coloured renderings need manual threshold adjustment.
- Curved walls are traced as polylines.
- Output is conceptual massing, not BIM.
- Interior furniture planning and written design critique need the AI assistant, which is still disabled.

## Massing Editor (Nov 2026)

**Unit tests** (`tests/editor-geom.test.ts`, `tests/editor-model.test.ts`):
- **Geometry:** world/local transforms; exact length and width by number; anchored scaling.
  - True circular corner fillets: area loss ≈ (4−π)r².
  - Curved edges: area gain ≈ ⅔·chord·sagitta.
  - Inserting and removing vertices.
  - Roof heights (shed, gable, hip, barrel, dome) and mesh generation.
  - Merging touching masses, and refusing to merge disconnected ones.
  - Voids: a hole, a split, and voids in a rotated mass.
- **Model:**
  - Calibration rescales the image and the masses together.
  - The project file round-trips and is validated.
  - IndexedDB v3 storage survives reopening.
  - Models and their plan images are included in backups.

**Full user cycle in a real browser** (`scripts/e2e-editor.cjs`, mouse and keyboard on the production build), all checks pass:
1. New model, upload a plan image (flagged *approximate*), change its opacity.
2. Calibrate a 24 m dimension: the image becomes exactly 30 m and the dimensions are marked *measured*.
3. Draw a rectangle traced over the plan (216.0 m² against an expected 216) and a 6-point irregular polygon.
4. Rename, set length = 20 m and 4 floors (12.8 m).
5. Drag to move, `]` to rotate, Ctrl+D, Delete, Ctrl+Z, Ctrl+Y.
6. Drag a side handle to resize.
7. Drag a vertex, drag an edge mid-handle to curve the wall (3.15 m sagitta), round all corners by 1.2 m.
8. Shed roof (3 m, east), then a curved barrel roof.
9. Draw a void, close it, undo.
10. 3D view: drag the height handle (12.8 → 15.1 m); south elevation.
11. Ctrl+S version, reload: **all masses identical**, plus names, roofs, corners, scale, image settings and the version.
12. Export PNG, GLB and the project file, then re-open the file: identical masses and image.
13. Ready-made example (2 masses on a measured plan), merge with Shift+click, undo.

A real bug was found and fixed during testing: two fast clicks in different places counted as a double-click (it added a vertex instead of curving an edge).

**Not implemented yet (stated honestly in the app):**
- Free-form NURBS or B-spline surfaces. The curved roofs are parametric (barrel, dome, wave).
- Sloped walls and tapering masses.
- Snapping to lines drawn in the image itself (snapping works on the grid and on mass vertices).
- Touch and pen editing. The editor is built for mouse and keyboard; on a phone it is usable for viewing only.

## Export integrity: the "blank file" report (Nov 2026)

**Root causes found:**
1. **Phone layout overflow (main cause of "empty pages" on phones).**
   - On the presentation-board tab, a hidden container was placed at `left: -10000px`. In a right-to-left page that widened the document to 10,390 px on a 390 px phone.
   - The editor's single-column grid (`1fr`) also grew to 619 px because the views bar wouldn't wrap.
   - Phones then zoomed the whole page out, so it looked almost empty and taps hit the wrong elements.
   - Fixed: the hidden container is now clipped, and the grids use `minmax(0, 1fr)`. Every lab tab and the editor were checked: 0 px overflow on iPhone and Android emulation.
2. **No safety net on exports.**
   - Files were downloaded directly, without any check of their content.
   - 3D captures were taken from whatever the camera showed, so a model outside the frame or a lost WebGL context gave a background-only image.

**Fixes:**
- **Preview first:** every export (PNG, PDF, GLB, OBJ, SVG, board, project file) opens a preview dialog that shows the real file before "Download file" or "Share / save" on phones.
- **Content checks:**
  - Images and PDF pages are measured, and must show at least 1% non-background pixels.
  - GLB files are parsed: they must contain meshes and triangles.
  - A failed check shows a clear Arabic message and no file is downloaded.
  - Empty designs disable the export buttons.
- **3D capture:**
  - Checks that the WebGL context is alive and the scene has meshes.
  - Auto-frames the model if it is outside the camera.
  - Waits for frames to be presented, then renders and reads the buffer.
- **WebGL memory:** contexts are released on unmount, because phones allow only a few at a time.

**Test** (`scripts/e2e-export.cjs` with `scripts/inspect-exports.cjs`): on desktop, iPhone 13 and Pixel 7 emulation, it creates designs in the Lab and the Editor, checks the in-app preview, downloads every format, then **opens each file**:
- PNG files are decoded pixel by pixel.
- PDF files are rendered with poppler.
- GLB files are parsed.
- The project file is parsed.

All checks pass. This includes an editor export with the camera pointed away from the model (auto-framed), and empty designs where export is disabled.

## Not tested: you need to check these

- **Access from Syria.** Not tested; it can only be checked from a Syrian network.
- **A real AI provider.** Not called. The worker was tested with mocks and bundled with `wrangler deploy --dry-run`, but never deployed.
- **Joudy's own plan.** The plan mentioned in the request wasn't attached (the image received was a GitHub screenshot). Upload it in the lab and check the result.
- **Real devices.** Actual Windows 10/11 Edge install prompts, a real iPhone or Safari (including PDF display inside the page, where a "open in new tab" fallback is provided), and Android. Chromium emulation is not the same as these devices.
- **Very large files** (hundreds of MB), and storage quota behaviour on iOS (Safari limits storage and may evict data from websites that are not installed. Installing to the home screen and taking regular backups is advised).
