# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (Svelte 5 + Vite + Tailwind v4)
```bash
npm run dev           # Vite dev server with HMR (proxies /api → localhost:4000)
npm run build         # production build → dist/
npm run preview       # preview production build locally
npm test              # client unit tests (Vitest + jsdom, src/**/*.test.ts)
```

### Backend (`cd server` first)
```bash
npm run dev           # tsx watch with auto-reload (development)
npm run build         # tsc → dist/
npm start             # run compiled dist/index.js
npm test              # integration tests (Vitest + Supertest + mongodb-memory-server)
npx tsc -p tsconfig.test.json --noEmit   # type-check test files
```

### First-time backend setup
```bash
cd server && cp .env.example .env
# Fill in MONGODB_URI, JWT_SECRET, CSRF_SECRET
# Generate secrets: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Health check: `GET http://localhost:4000/health`

## Architecture

### Split: Svelte 5 SPA + Express API
- The frontend is a Svelte 5 SPA built with Vite. Entry point is `index.html` → `src/app.ts` → `src/App.svelte`.
- State is managed with Svelte 5 runes (`$state`, `$derived`) in `src/lib/state.svelte.ts` — a shared reactive module.
- All API calls go through `apiFetch()` in `src/lib/api.ts`, which automatically attaches credentials and CSRF header.
- Shared types live in `src/types.ts` (Expense, Recurrence, Profile, Space, SpaceMember, CurrencyRates, Summary, CategoryData, TrendData, etc.).
- The backend lives in `server/src/` and compiles to `server/dist/`. On Vercel, `api/index.ts` is the serverless entry (re-exports the Express app); `server/src/index.ts` is the local dev entry.
- Vite dev server proxies `/api` → `localhost:4000` automatically.

### Frontend architecture
```
src/
├── types.ts                    # Shared TypeScript interfaces (Expense, Recurrence, Space, etc.)
├── app.ts                      # Client entry point
├── App.svelte                  # Root component — router, modals, layout
├── app.css                     # Tailwind v4 via @import "tailwindcss"
├── lib/
│   ├── state.svelte.ts         # Reactive state (runes-based getters/setters), incl. active Space context
│   ├── api.ts                  # API wrapper + all endpoint functions (context-aware for Spaces)
│   ├── currency.ts             # Currency formatting/conversion + live rate fetching
│   ├── calculations.svelte.ts  # Async summary calculations (income, expense, category, member breakdown)
│   ├── utils.ts                # Date helpers, trend data, image compression
│   ├── charts.ts               # Canvas pie chart + trend chart renderers
│   └── constants.ts            # Static data (currencies, colors, categoryIcons)
├── components/
│   ├── AiChatPanel.svelte      # AI assistant slide-in panel (Groq-powered chat)
│   ├── AuthModal.svelte        # Login/register modal
│   ├── BottomNav.svelte        # Mobile bottom navigation bar with center Quick Add button and AI button
│   ├── BudgetOverview.svelte   # Per-category budget goal progress bars
│   ├── BulkImportModal.svelte  # Receipt bulk import review/save modal
│   ├── CurrencyModal.svelte    # Currency selector with live rates
│   ├── DeleteAllModal.svelte   # Confirm delete-all-transactions
│   ├── EditModal.svelte        # Edit expense modal (flatpickr + recurrence toggle)
│   ├── ExpenseItem.svelte      # Single expense/income row (contributor pill, recurrence badge, currency conversion)
│   ├── Header.svelte           # Top bar — "Add Entry" button (desktop only, opens Quick Add), Personal/Hub switcher, notifications, currency switcher (no hamburger)
│   ├── ImportModal.svelte      # Import result feedback modal
│   ├── IncomeForm.svelte       # Add-income form (IncomeView-only; flatpickr, Space selector, CSV import, recurrence)
│   ├── LoadingSpinner.svelte   # Loading indicator
│   ├── MemberBreakdown.svelte  # Per-Hub-member contribution chart (category-breakdown pattern)
│   ├── MobileQuickAdd.svelte   # Quick-add modal, incl. Space selector, recurrence toggle, CSV import, OCR receipt import, for either income or expense — opened from the mobile bottom nav's center button or, on desktop, the Header's "Add Entry" button (via an `open-quick-add` window event App.svelte listens for)
│   ├── PieChart.svelte         # Category pie chart
│   ├── RecurringUpcoming.svelte # Active/paused recurring transactions, filtered by a `type` ('income' | 'expense') prop — used on ExpenseView (expense) and IncomeView (income)
│   ├── Sidebar.svelte          # Left navigation (desktop only) — Expense, Income, Spaces, Summaries, AI
│   ├── TopCategories.svelte    # Top expense categories list
│   └── TrendChart.svelte       # Expense trend line chart
└── views/
    ├── ExpenseView.svelte      # Expense home — top row holds a mode dropdown (Overview/List) and, in List mode, a single consolidated Filters dropdown (search, sort, date/amount range, category, contributor, recurring-only). Overview shows summary cards, budget, recurring, charts, member breakdown, recent-10; List shows only the filter dropdown and the matching expense entries. Adding a transaction happens via the Header's "Add Entry" button (desktop) or the bottom nav's Quick Add (mobile), not on this page. Income never appears or is addable here
    ├── IncomeView.svelte       # Income list with search/sort, recurring income, add-income form, member breakdown
    ├── SpacesView.svelte       # Manage Hubs — create, rename, delete, invite, rename/remove members
    ├── SummariesView.svelte    # Weekly AI-narrated summaries
    └── AccountView.svelte      # Profile, stats, export CSV, dark mode, password, budget goals, logout, categories, danger zone
```

### Backend architecture
```
server/src/
├── app.ts                      # Express app setup — middleware, routes, protected cron endpoint
├── index.ts                    # Local dev server entry (listens on PORT, starts the 60s recurring timer)
├── config.ts                   # Environment variable loading (MongoDB, JWT, CSRF, Groq, Pusher, Google)
├── db.ts                       # MongoDB connection with reconnect logic (main database)
├── lib/
│   ├── pusher.ts               # Pusher real-time notifications (per-user `user-{id}` and per-Hub `space-{id}` channels)
│   ├── recurringScheduler.ts   # Atomic recurring generator: global scan (cron), per-user/per-Hub lazy catch-up, and the 60s interval used only by the standalone server
│   ├── spaceDb.ts              # Resolves each Hub's own MongoDB database/model via mongoose useDb()
│   └── expenseHandlers.ts      # Shared CRUD route logic reused by both expenses.ts and spaceExpenses.ts
├── middleware/
│   ├── auth.ts                 # JWT auth middleware (req.userId)
│   ├── spaceScope.ts           # Verifies active Hub membership; attaches req.spaceExpenseModel / req.space
│   ├── asyncHandler.ts         # Express async error wrapper
│   ├── csrf.ts                 # CSRF double-submit cookie protection
│   ├── groqRateLimiter.ts      # Burst, sliding window, and concurrency limiters for Groq
│   └── passport.ts             # Passport local + Google OAuth strategies
├── models/
│   ├── Expense.ts              # Mongoose schema — type, amount, category, date, currency, familyMember, note, recurrence
│   ├── User.ts                 # Mongoose schema — email, passwordHash, timezone, aiUsage, tokenVersion
│   ├── Space.ts                # Hub metadata — name, ownerId, members[] (userId, nickname, role, status)
│   ├── SpaceExpense.ts         # Schema compiled per-Hub against that Hub's own database (authorUserId instead of userId)
│   └── Summary.ts              # Weekly AI-narrated summary, unique per (userId, weekStartDate)
├── routes/
│   ├── auth.ts                 # POST /login, /register, /logout, GET /me, /csrf, PUT /password, /timezone, Google OAuth
│   ├── expenses.ts             # CRUD /expenses, GET /recurring, PUT /:id/recurring, POST /bulk, DELETE all (personal ledger)
│   ├── spaces.ts                # Hub CRUD, rename, delete, invite/respond, member rename/remove
│   ├── cron.ts                 # GET /recurring — protected by CRON_SECRET bearer; runs the global recurring scan
│   ├── spaceExpenses.ts        # Same CRUD/recurring shape as expenses.ts, mounted at /api/spaces/:spaceId/expenses
│   ├── ai.ts                   # POST /chat, /parse-receipt, /parse-receipts-bulk, GET /quota
│   ├── currency.ts             # GET /rates, GET /convert (proxies exchangerate-api)
│   └── summaries.ts            # GET / — lazily generates + lists weekly AI summaries
└── types/
    ├── express.d.ts            # Express Request augmentation (userId)
    └── pusher.d.ts              # Pusher type declarations
```

### Data model

#### Expense (Mongoose, main database — personal ledger)
```
{
  userId: ObjectId (ref: User, indexed),
  type: "income" | "expense",
  amount: Number (0–1e12),
  category: String,
  currency: String (default "USD"),
  familyMember: String,             // legacy free-text tag, superseded by Spaces — still readable/exportable
  name: String,                    // optional short title/label for the transaction
  note: String,
  date: Date,
  recurrence: {                    // null for non-recurring
    frequency: "daily" | "weekly" | "biweekly" | "monthly" | "yearly",
    nextDueDate: Date,
    endDate: Date | null,
    isActive: Boolean
  },
  timestamps: true                 // createdAt, updatedAt
}
```
- Generated recurring entries are plain expenses (no `recurrence` field) — only the template has it.
- Recurring generation is triggered three ways, all safe together (templates are claimed atomically, so no double-generation):
  1. **Lazy catch-up** — every `GET /api/expenses` / `GET /api/spaces/:spaceId/expenses` generates that user/Hub's due entries before returning, so entries always appear on next visit.
  2. **Cron endpoint** — `GET /api/cron/recurring` (requires `Authorization: Bearer CRON_SECRET`) runs the global scan across all users and every Hub's ledger.
  3. **Standalone server** — `server/src/index.ts` (local dev, dedicated host) also runs a 60s `setInterval`. Serverless `app.ts` must NOT start the interval; Vercel functions scale to zero.

#### User (Mongoose, main database)
```
{
  email: String (unique, lowercase),
  passwordHash: String,
  googleId: String (optional),
  timezone: String,                // IANA zone, client-detected; used for weekly summary boundaries
  aiUsage: { count, weeklyCount, weekStartDate },
  tokenVersion: Number,
  timestamps: true
}
```

#### Space (Mongoose, main database — one document per Hub)
```
{
  name: String,
  ownerId: ObjectId (ref: User),
  members: [{
    userId: ObjectId (ref: User),
    nickname: String,              // set at invite time; editable by the owner or the member themselves
    role: "owner" | "member",
    status: "pending" | "active",  // pending until the invitee accepts
    invitedAt: Date,
    joinedAt: Date | null
  }],
  timestamps: true
}
```
- A global cap of 3 Hubs applies across the whole app (checked on create).
- Only `active` members pass `spaceScope` and get access to that Hub's expense database.
- Deleting a Hub drops its separate `space_<id>` database and permanently removes its transactions; they are never moved into the personal ledger.

#### SpaceExpense (Mongoose, one schema compiled per Hub's own `space_<id>` database)
Same shape as `Expense`, but `authorUserId` (the contributing member) in place of `userId`/`familyMember`. Resolved via `getSpaceExpenseModel(spaceId)` in `server/src/lib/spaceDb.ts`, which calls `mongoose.connection.useDb('space_<id>', { useCache: true })` — a genuinely separate MongoDB database sharing the same underlying connection pool. Deleting a Hub calls `.dropDatabase()` on that connection.

#### Summary (Mongoose, main database — one per user per week)
```
{
  userId: ObjectId,
  weekStartDate: String,   // Monday, YYYY-MM-DD; unique per (userId, weekStartDate)
  weekEndDate: String,
  timezone: String,
  narrative: String,       // Groq-generated recap, or a numeric fallback if Groq is unavailable/rate-limited
  stats: { totalIncome, totalExpense, net, transactionCount, byCategory, previousWeekExpense },
  timestamps: true
}
```

### State model
`src/lib/state.svelte.ts` owns all reactive state using Svelte 5 runes. Views and components import getter/setter functions to read/write state. The `expense[]` array is the single source of truth **for whatever context is currently active** (personal or a specific Hub). Budget goals persist to `localStorage` (`sw_budget_goals`). Currency preferences persist to `localStorage` too. AI chat history is held in memory per session.

Key state:
- `_expense` — all transactions for the active context (personal or the current Hub), synced from server via Pusher + polling
- `_currentCurrency` — active display currency (persisted to localStorage)
- `_budgetGoals` — per-category spending limits (persisted to localStorage)
- `_spaces` — Hubs the user is an active member of
- `_currentSpaceId` — the active Hub, or `null` for Personal; switching calls `switchSpace()` in `api.ts`, which re-fetches `_expense` and re-subscribes the Hub's Pusher channel
- `_pendingInvites` — Hubs where the user has a pending invite, shown in the Header Notifications dropdown and refreshed through Pusher user-channel events
- `_aiChatHistory` — AI conversation messages (in-memory only)
- `_currentView` — current route view (expense | income | spaces | summaries | account | ai)
- `_expenseMode` — sub-mode of the Expense view (overview | list), driven by a second URL path segment (`/expense` vs `/expense/list`)

### Auth & CSRF flow
1. On mount, `App.svelte` calls `fetchCsrfToken()` → `GET /api/auth/csrf` → sets `sw_csrf` cookie + in-memory token.
2. `checkSession()` verifies existing session via `GET /api/auth/me`.
3. Login/register sets a signed JWT in an HttpOnly `sw_session` cookie (7-day expiry).
4. After authentication, the client refreshes the CSRF token because it is bound to the new session cookie.
5. Every `POST/PUT/PATCH/DELETE` includes `x-csrf-token` via `apiFetch()`.
6. The JWT contains a `tokenVersion` field validated on every request.

Logout uses the shared confirmation dialog before clearing the local session.

Transaction deletion only updates local state after the server confirms success. Expense loads use generation checks so stale polling/Pusher responses cannot restore a successfully deleted transaction.

### API endpoints

| Method | Path | Description |
|--------|------|--------------|
| GET | `/health` | Health check |
| POST | `/api/auth/register` | Register new account |
| POST | `/api/auth/login` | Login (email/password) |
| POST | `/api/auth/logout` | Logout (clear session) |
| GET | `/api/auth/me` | Get current user profile |
| GET | `/api/auth/csrf` | Get CSRF token |
| PUT | `/api/auth/password` | Change password |
| PUT | `/api/auth/timezone` | Update IANA timezone |
| GET | `/api/auth/google` | Start Google OAuth flow |
| GET | `/api/auth/google/callback` | Google OAuth callback |
| GET | `/api/expenses` | List personal expenses (sorted by date desc) |
| POST | `/api/expenses` | Create personal expense (with optional `recurrence`) |
| PUT | `/api/expenses/:id` | Update personal expense fields |
| DELETE | `/api/expenses/:id` | Delete single personal expense |
| DELETE | `/api/expenses` | Delete all personal expenses (requires `confirm: true`) |
| GET | `/api/expenses/recurring` | List active personal recurring templates |
| PUT | `/api/expenses/:id/recurring` | Update personal recurrence (frequency, endDate, isActive, nextDueDate) |
| POST | `/api/expenses/bulk` | Bulk create from CSV rows (max 500) |
| GET | `/api/spaces` | List Hubs you're an active member of |
| GET | `/api/spaces/invites` | List Hubs where you have a pending invite |
| POST | `/api/spaces` | Create a Hub (`{ name }`; rejected once 3 exist app-wide) |
| PATCH | `/api/spaces/:id` | Rename a Hub (owner only) |
| DELETE | `/api/spaces/:id` | Delete a Hub and drop its database (owner only, `confirm: true`) |
| POST | `/api/spaces/:id/members` | Invite an existing account by email (owner only, pending until accepted) |
| PATCH | `/api/spaces/:id/members/:userId` | Rename a member's nickname (self or owner) |
| DELETE | `/api/spaces/:id/members/:userId` | Remove a member, or leave the Hub |
| POST | `/api/spaces/:id/invites/respond` | Accept or decline a pending invite (`{ accept }`) |
| GET/POST/PUT/DELETE | `/api/spaces/:spaceId/expenses/...` | Same CRUD/recurring/bulk shape as `/api/expenses`, scoped to that Hub's own database |
| GET | `/api/currency/rates?base=` | Get currency conversion rates |
| GET | `/api/currency/convert` | Convert a single amount between currencies |
| GET | `/api/summaries` | Weekly AI-narrated summaries (generates the latest completed week's on first request) |
| GET | `/api/cron/recurring` | Global recurring scan — requires `Authorization: Bearer <CRON_SECRET>`; invoked by the GitHub Actions `Recurring Cron` workflow |
| GET | `/api/ai/quota` | Get AI usage quota (weekly remaining) |
| POST | `/api/ai/chat` | AI chat assistant (can add/edit/delete transactions via tool calls) |
| POST | `/api/ai/parse-receipt` | AI receipt OCR (single, optional `pro` mode) |
| POST | `/api/ai/parse-receipts-bulk` | AI receipt OCR (batch, max 10, optional `pro` mode) |

### Features summary
- **Transactions**: Add/edit/delete income and expense entries with category, date, currency, notes
- **Spaces (Hubs)**: Share a ledger with other accounts. Each Hub is a separate MongoDB database (`useDb()`), invited by email with owner-approval-free accept/decline through Header Notifications, contributor nicknames shown on every row/export/chart, up to 3 Hubs app-wide. Deleting a Hub drops its database and transactions. Replaces the old free-text "family member" tag
- **Recurring transactions**: Templates with daily/weekly/biweekly/monthly/yearly frequency, auto-generated by server scheduler, for both the personal ledger and every Hub
- **Expense home**: `ExpenseView` is the app's landing page. Its top row holds a mode dropdown (Overview/List); there is no add-expense form or button on the page itself — adding a transaction goes through the Header's "Add Entry" button on desktop or the bottom nav's Quick Add on mobile, both opening the same Quick Add modal. Overview shows summary cards, budget, recurring expenses, pie/trend charts, per-member breakdown, and a recent-10 glance list. List drops all of that down to just a single consolidated Filters dropdown (search, sort, date/amount range, category, contributor, recurring-only) plus the matching expense entries. URL reflects the mode: `/expense` (overview) vs `/expense/list`. Income never appears here or is addable here; it lives entirely in IncomeView (its own summary cards, recurring income, add-income form, list, per-member breakdown)
- **AI assistant**: Chat with your financial data (can act on it via tool calls), receipt OCR (single + bulk, with an optional higher-accuracy "OCR Pro" mode)
- **Weekly summaries**: Lazily-generated, cached, AI-narrated recap of income/expenses/net/top categories per week
- **Budget goals**: Per-category spending targets with progress tracking
- **Multi-currency**: Live exchange rates, per-transaction currency, unified display currency
- **Import/Export**: CSV import (via IncomeForm on IncomeView, and MobileQuickAdd — opened from the mobile bottom nav or the Header's "Add Entry" button on desktop), CSV export in AccountView, AI bulk receipt OCR import (with Basic/Pro toggle) via MobileQuickAdd.
- **Dark mode**: System-aware toggle with localStorage persistence
- **Real-time sync**: Pusher WebSocket events (per-user and per-Hub channels) + 5-min polling fallback
- **Mobile**: Responsive layout with bottom navigation bar (Expense, Income, + Quick Add, Account, AI) on mobile and sidebar on desktop (lg+). Bottom nav has a concave center cutout with a raised gradient Quick Add button. The AI button opens the AI chat panel as a modal. The hamburger menu is removed entirely — mobile uses the bottom nav exclusively. Header buttons are centered on mobile, right-aligned on desktop.

### CI/CD
- GitHub Actions CI runs on push/PR to `main` (`.github/workflows/ci.yml`)
- Jobs: Type Check Client (`tsc --noEmit`), Type Check Server (`tsc --noEmit` + test tsconfig), Build Client (`vite build`), Build Server (`tsc`), Test Client (`npm test`), Test Server (`npm test`), Svelte Check (optional, `continue-on-error`)
- `.github/workflows/recurring-cron.yml` pings `GET /api/cron/recurring` every 15 min (requires the `CRON_SECRET` repo secret). The endpoint is idempotent, so overlapping runs are harmless.
- The root `tsconfig.json` excludes `server/` because the server uses `NodeNext` module resolution vs the client's `bundler` mode
- **The full CI suite must be run locally before every commit. There are no exceptions.** Run:
  ```bash
  npm run build                  # client build
  npx tsc --noEmit               # client type check
  npm test                       # client tests
  cd server && npm run build     # server type check + compile
  npx tsc -p tsconfig.test.json --noEmit   # server test type check
  npm test                       # server tests
  ```

### Testing
- Client: `src/**/*.test.ts` — pure logic (currency, calculations, utils, charts). jsdom environment, svelte plugin for `.svelte.ts` runes.
- Server: `server/test/**/*.test.ts` — route/middleware integration with Supertest against `mongodb-memory-server` (pinned to 6.0.19; 7.x needs AVX2). Runs in one worker so exactly one in-memory mongod is alive; the binary caches in `server/.mongodb-binaries` (git-ignored).
- `server/test/app.test.ts` boots the full Express app and MUST stay alphabetically first: it sets `MONGODB_URI` to the in-memory server before the first `src/config.ts` import, and config freezes env at import. Never add static imports of `src/**` modules to that file — import them dynamically inside hooks/tests.

### Documentation policy
- This file must be updated after every session or meaningful change before committing.
- The architecture tree, component list, API endpoints, data model, state model, and features summary sections all need review when:
  - A new component, view, or module is added or removed
  - A new API route is added, removed, or changed
  - A new state variable or data model field is introduced
  - A feature flow or constraint changes
- Keeping this file current ensures Claude has accurate context for future work.

### Adding a new feature
1. Add TypeScript interfaces in `src/types.ts` if needed.
2. Add state getters/setters in `src/lib/state.svelte.ts` if needed.
3. Add API function in `src/lib/api.ts` using `apiFetch()`.
4. Create a component in `src/components/` or view in `src/views/`.
5. Import and use it in `src/App.svelte` or the relevant view.
6. If adding a new API route, create in `server/src/routes/` and register in `server/src/app.ts`.

### Key constraints
- All personal expense queries on the server filter by `req.userId`.
- All Hub expense routes run behind `spaceScope`, which verifies an **active** membership record before attaching `req.spaceExpenseModel` — never scope a Hub by filtering the main database with a `spaceId` field, since the whole point is a physically separate database per Hub.
- State-changing requests must have `Content-Type: application/json`.
- The frontend uses DOM methods (`textContent`) for user-supplied data to prevent XSS.
- Tailwind v4 is configured via `@import "tailwindcss"` in `src/app.css` — no config file needed.
- Flatpickr is used for date inputs and loaded from npm (not CDN at build time).
- Recurring templates are the expense document itself; generated instances are separate plain expenses (no `recurrence` field). This holds for both the personal ledger and Hub ledgers.
- AI endpoints are rate-limited per user (burst + sliding window) and per API key (Groq concurrency slots), against a single weekly quota (`AI_WEEKLY_LIMIT`).
- bcrypt cost factor is 12.
- Bulk import is capped at 500 rows with per-row validation (personal ledger only).
- All `:id` / `:userId` / `:spaceId` route params are guarded with `ObjectId.isValid()` before DB access.
- `PUSHER_*` env vars enable real-time sync; omitting them falls back to 5-min polling only.
- The Hub cap (`MAX_SPACES_GLOBAL` in `server/src/models/Space.ts`) is global across the whole app, not per user.
