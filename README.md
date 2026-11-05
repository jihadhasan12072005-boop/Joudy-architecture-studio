# Joudy Architecture Studio — استوديو جودي المعماري

A private, Arabic-first (RTL) Progressive Web App made as a gift for **Joudy**, a fourth-year architecture student at Tartous University. It covers the full studio workflow for her architecture projects, engineering tools, study tracking for her 11 subjects, and an AI assistant that is ready but switched off for now (see below).

> تطبيق شخصي لجودي: مشاريع معمارية بست مراحل، أدوات هندسية دقيقة تعمل بدون إنترنت، تتبع للمواد الدراسية ودفتر أخطاء، ومساعد ذكي جاهز للتفعيل عند توفر مزود متاح رسمياً في سوريا. كل البيانات محفوظة على جهازها فقط مع نسخ احتياطي كامل.

## Status: Milestone 1 delivered

| Area | State |
|---|---|
| Premium PWA shell: welcome, dashboard, sidebar (desktop) and bottom nav (phone), install, offline, update banner | ✅ |
| **Project Studio**: create, edit, duplicate, archive, delete, autosave, revision history, and the 6 stages (site with a real sun path, concept with a weighted comparison, space program with net→gross/FAR/coverage and an adjacency matrix with a bubble diagram, drawings with versions, zoom and compare, structured design review, presentation planner) plus tasks, decisions, references and a printable PDF report | ✅ |
| Local storage (IndexedDB) for projects, images and PDFs, plus backup export/import, storage warnings and data migrations | ✅ |
| 10 engineering tools (scale, area, stairs, quantities, RC practice, materials and U-value, space schedule, checklists, units, measurement) | ✅ |
| 11 subjects: editable study plans, progress, exam dates, notes, references; mistake notebook with active review | ✅ (tracking) |
| Curated lessons, worked examples and question banks for the 11 subjects | ⏳ Milestone 2 |
| AI backend (Cloudflare Worker) with a hard €5 cap, auth, limits and a project-aware assistant UI | ✅ built and tested · **⛔ disabled**: no major provider currently supports Syria |

See [`docs/AI-FEASIBILITY.md`](docs/AI-FEASIBILITY.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/TESTING.md`](docs/TESTING.md) and [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Project structure
```
src/
  db/          IndexedDB schema, repository, backup (.zip), migrations
  lib/         sun position (NOAA), program maths, calculators (lib/calc), hooks, formatting
  data/        subjects (11) and architectural checklists / critique criteria
  components/  UI kit, icons, SVG art, drawing viewer, sun-path and bubble diagrams
  pages/       dashboard, projects, project workspace (one file per stage), tools, academy, mistakes, assistant, settings
  ai/          browser client for the private AI backend (no keys)
worker/        Cloudflare Worker: auth, limits, budget ledger (Durable Object), OpenAI-compatible provider call
tests/         unit tests (vitest + fake-indexeddb)
scripts/       e2e browser test, icon generator
```

## Academic honesty
The subject outlines and checklists are built from standard architecture and engineering curricula and published references. They are **not** official Tartous University material, and the app says so wherever they appear. Structural tools follow ACI 318-19, state their assumptions and units, and are labelled educational only.

## Privacy
There are no accounts, no analytics and no third-party requests. Fonts are self-hosted. Data never leaves the device except AI messages, and only once the assistant is enabled. The UI is private in practice (data exists only on Joudy's devices). Real server-side access control exists only in the AI backend (a hashed personal token checked on the server).
