# CalendAI Project Context

## Project Structure
- **Monorepo** with `frontend/` (Vite/React) and `backend/` (Node.js/Express)
- Backend connects to Gemini API and manages schedules

## Date Handling (Critical for iOS/Safari)
- Safari on iOS does NOT support `new Date("YYYY-MM-DD HH:mm")` (space separator)
- Always use ISO format: `new Date("YYYY-MM-DDTHH:mm:ss")` or numeric constructors
- Use `safeParseDate()` utility from `safeStorage.js` for any string-to-date parsing

## Storage Rules
- NEVER use `localStorage` or `sessionStorage` directly in module/component scope
- ALWAYS use `safeStorage` utility (wraps with try/catch + in-memory fallback)
- ALWAYS wrap storage calls in try/catch even when using safeStorage

## iOS Compatibility
- Functions in `browserDetection.js` must be wrapped in try/catch and never called at module init
- `window`, `navigator`, `document` access must be guarded with `typeof` checks
- `Notification.permission` must be accessed lazily, never at module top level