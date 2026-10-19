# CalendAI — Agent Instructions

Do **not** rewrite the product from scratch. Extract modules; keep existing OAuth, Calendar, bookings, credits, and iOS behavior.

## Autonomy (default)

Work without waiting when the next step is obvious, reversible, and already implied by the current task.

**Do without asking:** read/diagnose, fix the bug or gap in front of you, add missing files the server already requires, extract code without behavior change, run syntax/build checks, keep `AGENTS.md` / `.cursor/rules` in sync with reality.

**Stop and ask (one short question):** `git push`, force/destructive git, production env or secrets, schema/data migrations, payment/credit formula changes, product UX that has two reasonable options, anything that spends paid APIs beyond a cheap local verify.

**Anti-mistake loop:** smallest change that satisfies the goal → verify (require/boot files, `node --check`, Vite build for UI) → do not mix unrelated files in a commit. Prefer the reversible interpretation. If blocked, say what is blocked and the single decision needed — then continue everything else.

## Layout
- Frontend: `frontend/` (React, Vite, Tailwind). Entry: `frontend/src/App.jsx`.
- Backend: `backend/` (Express, Mongo/Mongoose). Entry: `backend/server.js` (~4k lines — split by domain, do not grow it).
- AI: OpenRouter + DeepSeek (`backend/services/aiService.js`), not Gemini.
- Payments: Lemon Squeezy only (ignore leftover Stripe deps).

## Deploy (Render)
These files **must stay in git** — `server.js` requires them at boot:
- `backend/models/Booking.js`
- `backend/models/OAuthHandoff.js`
- `backend/models/ProcessedPaymentEvent.js`
- `backend/models/MutualBooking.js`

Do not treat `frontend/dist/` as source of truth (gitignored; build from `frontend/src`).

## Hard constraints
- Mongo transactions (`startSession` / `withTransaction`) need a **replica set** (Atlas OK; local standalone will fail).
- Credits: fail-closed; deduct with `{ aiCredits: { $gte: cost } }`. Never invent usage if the AI response has none.
- Bookings: atomic slot claim (`status: 'active'` → `'processing'`). One shared `User` model — never redefine schemas in route files.
- Dates: ISO `YYYY-MM-DDTHH:mm:ss` or numeric constructors. Use `safeParseDate()`. Store instants + IANA timezone; do not trust `YYYY-MM-DDT00:00:00Z` as “local day”.
- Frontend storage: `safeStorage` only; wrap in try/catch. No `localStorage` at module init.
- Outlook: remain an honest placeholder until Graph exists.

## When touching god-files
Prefer new files under `backend/routes|services|models` and `frontend/src/components|pages|hooks`. Import from `server.js` / `App.jsx`; do not duplicate User/Event schemas.
