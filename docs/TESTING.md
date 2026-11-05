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

## Not tested: you need to check these

- **Access from Syria.** Not tested; it can only be checked from a Syrian network.
- **A real AI provider.** Not called. The worker was tested with mocks and bundled with `wrangler deploy --dry-run`, but never deployed.
- **Real devices.** Actual Windows 10/11 Edge install prompts, a real iPhone or Safari (including PDF display inside the page, where a "open in new tab" fallback is provided), and Android. Chromium emulation is not the same as these devices.
- **Very large files** (hundreds of MB), and storage quota behaviour on iOS (Safari limits storage and may evict data from websites that are not installed. Installing to the home screen and taking regular backups is advised).
