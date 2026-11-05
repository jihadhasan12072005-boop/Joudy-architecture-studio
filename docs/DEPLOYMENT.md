# Deployment

The app has two independent parts:

| Part | What it is | Hosting | Cost |
|---|---|---|---|
| Frontend PWA (`/`) | Static files. All data lives in the browser (IndexedDB). | GitHub Pages (or Cloudflare Pages, Netlify, any static host) | Free |
| AI backend (`/worker`) | Cloudflare Worker that holds the provider key and enforces the budget | Cloudflare Workers free plan | Free plus AI usage (≤ €4.50) |

The frontend works fully without the backend.

## A. Frontend on GitHub Pages

1. Push this repository to GitHub (the workflow runs on `main` or `master`).
2. In the repository, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push to the default branch. The workflow `.github/workflows/deploy-pages.yml` runs the tests, builds the app and publishes `dist/`.
4. Open `https://<username>.github.io/<repo>/`.

The build uses relative paths (`base: './'`) and hash routing, so it works under any sub-path without extra configuration.

**Notes:**
- GitHub Pages sites are **public** even when the repository is private (unless you're on GitHub Enterprise). Anyone with the URL can load the *empty* app, but they can never see Joudy's data, which stays on her devices. No secrets exist in the frontend.
- GitHub restored service for Syria in Sept 2025. Pages is served from GitHub's CDN. **Reachability from Syria hasn't been tested.** Open the URL from Joudy's connection to check. If it's blocked, deploy the same `dist/` folder to Cloudflare Pages (`npx wrangler pages deploy dist`) as an alternative.
- Updates: users see a "new version available" banner. Updating replaces only the app code. Data in IndexedDB is kept and migrated (see `src/db/migrations.ts`).

### Local development
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (calculators, storage, backup, migrations, worker)
npm run build        # production build in dist/
npx vite preview --port 4173 & npm run e2e   # browser end-to-end test
```

## B. AI backend (Cloudflare Worker)

> Keep `AI_ENABLED = "false"` until a provider permits use from Syria. See `docs/AI-FEASIBILITY.md`.

```bash
cd worker
npm install
npx wrangler login

# 1. Generate Joudy's personal access token (printed once) and its hash
npm run hash-token
#    → TOKEN: give it to Joudy privately (she pastes it into Settings in the app)
#    → ACCESS_TOKEN_SHA256: store it as a secret:
npx wrangler secret put ACCESS_TOKEN_SHA256

# 2. Provider API key (never commit it, never put it in the frontend)
npx wrangler secret put PROVIDER_API_KEY

# 3. Edit wrangler.toml [vars]:
#    PROVIDER_NAME, PROVIDER_BASE_URL, PROVIDER_MODEL,
#    PRICE_INPUT_USD_PER_MTOK, PRICE_OUTPUT_USD_PER_MTOK (from the CURRENT price page),
#    ALLOWED_ORIGINS = "https://<username>.github.io"
#    and only when compliant: AI_ENABLED = "true"

npx wrangler deploy
```

Then, in the app: **Settings → AI assistant connection**. Enter the worker URL (`https://joudy-ai.<account>.workers.dev`) and the token, then press **Test connection**.

Also set a monthly spending limit or prepaid credit in the provider's own console as a second safeguard.

### Security model
- The provider key is a Worker secret. It is never sent to the browser and never logged.
- The browser holds only Joudy's personal token, stored in IndexedDB on her device and excluded from backups. The worker stores only its SHA-256 hash and compares it in constant time.
- CORS allows only the origins in `ALLOWED_ORIGINS`.
- The worker does not log request content.
- To rotate the token, run `npm run hash-token` again, then `wrangler secret put ACCESS_TOKEN_SHA256`.

## C. Moving data between devices

There is no cloud sync. (A secure sync service with authentication and encrypted storage isn't feasible within this budget and scope without new privacy risks.)

To move data: **Settings → Export backup (.zip)** on device A, transfer the file (USB, email, Drive), then **Import → Merge** on device B. The backup contains every project, drawing, PDF, task, note, quiz/mistake record and conversation. It does not contain the AI token.
