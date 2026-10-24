# Study Atlas

Study Atlas is a personal activity and focus tracker styled as a paper field journal. It runs locally without an account or backend, works offline after its first load, and keeps all activity history in IndexedDB.

## Run locally

```sh
npm install
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173`. PowerShell users can call the Windows npm shim as `npm.cmd` if script execution blocks `npm.ps1`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run preview` | Serve the production build locally. |
| `npm run build` | Typecheck and create the production/PWA build in `dist/`. |
| `npm run typecheck` | Run strict TypeScript project checks. |
| `npm run lint` | Run ESLint. |
| `npm run test` | Run the Vitest unit and IndexedDB adapter tests. |
| `npm run test:e2e` | Run the Chromium Playwright scenario. |

Playwright’s Chromium binary is installed with `npx playwright install chromium`.

## Data and architecture

- `src/model.ts` defines the activity, occurrence, focus-session, timer, settings, and repository contracts.
- `src/repository.ts` provides IndexedDB storage through `idb`. It seeds three editable activities once, and stores tasks, sessions, settings, and timer state in IndexedDB.
- `src/store.ts` connects the repository to the UI with Zustand. Daily task keys use `activityId:localDate`, so revisiting a date is idempotent. Archived activities and their history remain stored.
- `src/timerMath.ts` calculates elapsed and remaining time from persisted timestamps. A browser refresh or sleep does not pause a running timer. Paused segments are excluded. The app stores a run identifier and finalizes the timer and its session in one IndexedDB transaction; Web Locks and BroadcastChannel coordinate open tabs.
- `src/analytics.ts` summarizes scheduled tasks and non-discarded sessions for the day, week, month, and year.
- `src/dates.ts` converts instants to configured local calendar dates with `date-fns-tz`.

All session instants (`startedAt` and `endedAt`) are UTC ISO strings. Each session also stores the calendar date assigned when it is created. A timer session belongs to the local date on which it started, even if it crosses midnight; manually added time belongs to the selected date. Changing the timezone changes future date derivation and display but never rewrites stored timestamps or existing `localDate` values. Manual backfill uses a selected date, and dates after today cannot be edited.

The current streak is the number of consecutive scheduled occurrences completed through the most recent scheduled day; an unfinished current day does not break the streak until it has passed. The longest streak is the maximum completed chain of scheduled occurrences. Unscheduled weekdays are skipped, future days are excluded, and a skipped occurrence does not change the recurrence.

## Optional Supabase sync

Local IndexedDB remains the working copy. Supabase is considered only when both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. Copy `.env.example` to `.env.local`, fill in the project URL and anon key, and apply `supabase/migrations/202610240001_create_study_atlas.sql` to the project.

The browser must have a Supabase Auth session for cloud sync to start. Enable email one-time-password sign-in in the Supabase project and use **Preferences → Cloud sync** to request a sign-in link. The adapter writes locally first, queues failed writes in IndexedDB, and retries them when the app next opens. Database rows are isolated by `owner_id` RLS policies. Upserts use `updated_at` and database triggers preserve the newest remote row. No service-role key belongs in the client.

## Backup and exports

Use **Preferences → Export JSON** for a portable snapshot of activities, task marks, focus sessions, timer state, and settings. A weekly reminder appears when there is no recent export; making a backup updates the reminder date. **Import JSON** merges records by ID. **Export session ledger** downloads CSV. **Reset all data** is available in Preferences and asks for confirmation first.

## Deployment

The project includes SPA routing rules for Vercel and Netlify. GitHub Actions typechecks, lints, tests, builds, and deploys the app to GitHub Pages on pushes to `main`. The Pages build sets the `/study-atlas/` asset base; local, Vercel, and Netlify builds use `/`.

```sh
npm run build
npm run preview
```

## Accessibility and shortcuts

Visible focus rings, accessible control names, reduced-motion support, responsive navigation, and keyboard shortcuts are included. Press `N` to add an activity, `Space` to pause/resume the active timer, `1`–`4` to select a tracking period, and `Escape` to close a dialog.
