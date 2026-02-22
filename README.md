# xiao.sh

Minimal portfolio built with Next.js, TypeScript, React, and Tailwind CSS.

## Local development

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## OpenRouter (AI Search)

The `Ask AI` button in the search section uses OpenRouter.

1. Copy `.env.example` to `.env.local`
2. Set `OPENROUTER_API_KEY`
3. Optional: tune model rotation

Rotation behavior:

- The API route fetches the latest free models from OpenRouter (`/api/v1/models`)
- It ranks/selects a pool of free text models and rotates the primary model per request
- It sends fallback models in the same request so OpenRouter can auto-failover

Useful env vars:

- `OPENROUTER_MODELS` (comma-separated preferred models, prepended to rotation)
- `OPENROUTER_DYNAMIC_MODELS` (`true`/`false`, default `true`)
- `OPENROUTER_MODEL_POOL_SIZE` (default `8`)
- `OPENROUTER_MODELS_REFRESH_MS` (default `900000`, i.e. 15 min)

## Build

```bash
bun run build
bun run start
```

## Pull LinkedIn Post Images

To fetch all available images/video-thumbnails from each LinkedIn-linked project post:

```bash
bun run fetch:linkedin-assets
```

Output:

- Assets: `public/projects/choices/<owner-repo>/`
- Index: `public/projects/choices/manifest.json`

## Sync LinkedIn About Data (Playwright)

The `/about` page and AI context read from a Playwright-generated LinkedIn snapshot.

```bash
bun run sync:linkedin
```

Output:

- Snapshot: `src/data/linkedin-about.json`

Notes:

- The sync script now attempts full profile section scraping (`details/experience`, `details/education`, `details/skills`, etc.), following the same model used by modern Playwright LinkedIn scrapers.
- LinkedIn requires auth for full profile section access. Set `LINKEDIN_COOKIE_LI_AT` in `.env.local` to include those sections in the snapshot.
- You can also point to a Playwright session file via `LINKEDIN_STORAGE_STATE_PATH` (compatible with `joeyism/linkedin_scraper` session flow).
- Without auth cookies, the script falls back to public metadata and LinkedIn post-derived context.

Quick session setup:

```bash
bun run create:linkedin-session
```

Then set in `.env.local`:

```bash
LINKEDIN_STORAGE_STATE_PATH=/absolute/path/to/linkedin-session.json
```

## Edit content

- About section: `src/app/page.tsx`
- LinkedIn about page: `src/app/about/page.tsx`
- LinkedIn snapshot loader: `src/lib/linkedin.ts`
- Project cards and images: `src/lib/projects.ts`
- Search/card UI: `src/components/project-search.tsx`
