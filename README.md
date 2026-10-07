# skatebored · scrum

A full Jira-style scrum workspace for the [skatebored](https://www.skatebored.org/) team, styled after the skatebored brand: black canvas, cream ink (`#f4dac8`), flame-red accent (`#f04c4c`), deck brown (`#3D2412`), tight Helvetica Neue display type, and pill CTAs. There's a light theme too (Settings → Switch to light theme).

## Features

| Area | What's there |
| --- | --- |
| **Board** | Active sprint board, drag & drop between columns and within them (ranking), WIP limits, swimlanes (assignee / epic / priority / subtask), quick filters, avatar filters, card context menu, inline create, complete sprint |
| **Backlog** | Sprint containers + backlog, multi-select drag & drop between sprints, start / edit / complete / delete sprints, epics panel, inline create, point totals by status |
| **Issues** | Full issue view (modal via `?selectedIssue=KEY` or page at `/browse/KEY`): inline-edited fields, workflow transitions, sub-tasks, child issues, links, attachments, comments with @mentions, history, work log and time tracking, watchers, clone, flag, delete |
| **Search** | Real JQL engine (`AND/OR/NOT`, `= != ~ !~ > >= < <= IN, NOT IN, IS [NOT] EMPTY`, `currentUser()`, `openSprints()`, relative dates like `-7d`, `ORDER BY`), basic mode, saved filters, bulk change, CSV export |
| **Reports** | Burndown, burnup, sprint report, velocity, cumulative flow, control chart, created vs resolved, pie charts, epic / version / time-tracking / workload reports |
| **Dashboards** | Configurable 2-column gadget dashboards |
| **Planning** | Timeline (roadmap Gantt with drag / resize), releases (versions), components |
| **Admin** | Projects (scrum & kanban templates), board columns & statuses, WIP limits, members, people directory and profiles |
| **Coding agents** | “Open in coding tool” on every ticket (Development panel, issue ⋯ menu, board/backlog right-click): packages the ticket — description, sub-tasks, links, epic, recent comments, branch & commit conventions — into a prompt for Claude Code, Cursor, Codex, VS Code, GitHub Copilot CLI, Rovo Dev CLI or Gemini CLI. Desktop tools open via deep link; terminal tools get a copy-ready command (Claude Code can also open a terminal directly). Prompts are trimmed to each tool's limit, with the full context kept on the clipboard / downloadable as `KEY.md`. |
| **Auth** | Clerk sign-in / sign-up with branded pages; each Clerk account is matched to a workspace member by email (created on first sign-in) |
| **Everywhere** | Notifications, global search (`/` or `⌘K`), keyboard shortcuts (`?`), recent items, account switcher for demoing different team members |

## Run it

Authentication uses [Clerk](https://clerk.com); data lives in Neon Postgres + Vercel Blob. Link the project and pull env vars once:

```bash
vercel link && vercel env pull .env.development.local --yes
```

`npm run dev` serves the `/api` functions locally (same database as production). Clerk keys go in `.env.local` (see `.env.example`), or let the Clerk CLI do it:

```bash
npx clerk auth login && npx clerk init --app <app_id> && npx clerk env pull
```

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

## Deploy

It's a static single-page app. `vercel.json` already rewrites every route to `index.html`:

```bash
npx vercel env add VITE_CLERK_PUBLISHABLE_KEY   # once per environment
npx vercel deploy --prod
```

Use a `pk_live_…` key and add your production domain in the Clerk dashboard before going live.

Any static host works if it rewrites unknown paths to `/index.html`.

## Coding-agent hand-off

Modelled on Jira's "Open in coding tool". Deep-link formats used:

| Tool | Launch |
| --- | --- |
| Claude Code | `claude-cli://open?q=…&repo=…` (or copy `claude '…'`) |
| Cursor | `cursor://anysphere.cursor-deeplink/prompt?text=…` |
| Codex | `codex://new?prompt=…&originUrl=…` |
| VS Code | `vscode://agents/new?prompt=…&workspace=…` |
| GitHub Copilot | `copilot -i '…'` |
| Rovo Dev CLI | `acli rovodev run '…'` |
| Gemini CLI | `gemini -i '…'` |

Set the project's GitHub repo (shared) and your local clone path (per browser) in the launch dialog so agents start in the right folder. Nothing is ever sent automatically: every tool shows the prompt for review first.

## Data & persistence

The workspace lives in **Neon Postgres** (provisioned through the Vercel Marketplace); attachments live in a **private Vercel Blob** store. Every API call is verified against the user's Clerk session.

| Piece | Where |
| --- | --- |
| Sync API (pull since version N / push a batch of changes) | `api/sync.ts` → `server/sync.ts` |
| Attachments (upload / authenticated download) | `api/files.ts` → `server/files.ts` |
| Record counts (signed-in only) | `api/status.ts` |
| Client sync engine + status indicator | `src/sync/` |

How it keeps data safe:

- **Per-record, field-level sync.** Each change is sent as a patch of the fields that changed, so two people editing different fields of one issue never overwrite each other. Writes to a workspace are serialized in a transaction.
- **Server-assigned issue keys.** If two people create `SKB-70` at the same moment, one is renumbered and told about it.
- **Nothing is hard-deleted.** Deleting keeps the record's last data (`deleted = true`), so it can be restored.
- **Offline-safe outbox.** Unsent changes are kept in the browser, retried with backoff, adopted by another tab if this one closes, and block sign-out until they're saved. The top-bar cloud icon shows Saved / Saving / Offline · N queued.
- **First sync.** An empty cloud is seeded from the first browser that connects. A browser connecting to an existing cloud adopts it, uploads records that exist only locally, and keeps a backup of its old local copy (`skatebored-backup:*` in localStorage).
- **Pagination.** Pulls and pushes stay well under Vercel's 4.5 MB request/response limits.

Per-person preferences (theme, recent items, board view, coding-agent settings) intentionally stay in the browser.

Run the integration test (real database + Clerk tokens, isolated throwaway workspace):

```bash
npm run test:sync
```

Optional access control (server env vars): `ALLOWED_EMAIL_DOMAINS=skatebored.org` and/or `ALLOWED_EMAILS=a@x.com,b@y.com`. Without them, anyone who can sign in to your Clerk app can use the workspace.

## Structure

```
src/
  types.ts              domain model (Project, Issue, Sprint, …)
  store/store.ts        all state + actions (history, notifications, sprint lifecycle)
  store/ui.ts           transient UI state (create modal, toasts, search)
  lib/jql.ts            JQL tokenizer / parser / evaluator
  data/seed.ts          demo workspace generator
  components/           design-system primitives + Jira atoms (avatars, lozenges, pickers)
  layout/               top nav, project sidebar, shortcuts
  features/             board, backlog, issue, reports, dashboard, search, timeline, settings…
  pages/                route components
```
