# CalendAI - Frontend UI Fixes

## Task: Ensure scheduling buttons and modals always render properly

### Issues Identified:
1. Auth loading guard shows full-screen loader when no token exists, but when token exists with null user, dashboard renders without fallback for scheduling UI.
2. No prominent "Create Event" button in the main dashboard content area - only the bottom nav "+" button.
3. ManualEventForm doesn't handle auth loading state gracefully.

### Implementation Plan:
- [x] Add prominent Floating Action Button (FAB) in dashboard for scheduling events
- [x] Wire FAB to open ManualEventForm with smooth transition
- [x] Add fallback/loading states in scheduling UI components
- [x] Add a secondary "Schedule Meeting" button in the AI prompt card area
- [x] Verify build passes