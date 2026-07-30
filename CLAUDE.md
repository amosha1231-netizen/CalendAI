# Task Plan

## Tasks to Complete
- [x] Analyze all files
- [x] Add i18n translations for new UI elements
- [x] **Task 1: Fix OAuth redirect** - In App.jsx, ensure after Google login the user goes to dashboard, not booking
- [x] **Task 2: Equal height meeting type cards** - Add meeting type cards with equal height CSS in Booking component
- [x] **Task 3: Booking details form + WhatsApp + Email** - Add name, email, phone, notes fields + confirmation with WhatsApp button
- [x] **Task 4: Slots not available check** - Check slot availability before showing details form
- [x] **Add CSS styles** - Add styles for new cards, form, WhatsApp button
- [x] **Add backend endpoint** - Add /api/schedule/check-slot endpoint for availability validation
- [x] **Build & verify** - Run npm run build, check for errors

## Changes Summary

### 1. FIX CRITICAL BUG: OAuth Redirect (App.jsx)
- Added `currentView` state to track which view is active (dashboard vs booking)
- When auth params (`?login=success` or `?auth=success`) are detected, the initial state is set to `'dashboard'`
- The `isBookingOpen` is derived from `currentView === 'booking'`
- The `setIsBookingOpen` function now sets `currentView` to `'booking'` or `'dashboard'`

### 2. Equal Height Meeting Type Cards (Booking.jsx + index.css)
- Added 3-step booking flow: Meeting Type → Select Time → Details → Success
- Meeting type cards use flexbox with `display: flex; flex-direction: column; height: 100%; min-height: 200px`
- Cards have `margin-top: auto` on the footer to push the Select button to the bottom
- Grid layout: 1 column on mobile, 3 columns on desktop (640px+)

### 3. Booking Details Form
- Added full name, email (required), phone/WhatsApp, notes fields
- Form validation: name and email required, disabled button until filled
- Success screen shows booking details, email confirmation sent badge, and WhatsApp button

### 4. Slots Not Available Check
- Before proceeding to details, `handleProceedToDetails` calls `/api/schedule/check-slot` on the backend
- Returns `{ available: true/false }` - if false, shows error message in Hebrew/English
- Backend endpoint checks overlap with existing events using time parsing

### 5. WhatsApp Button
- On success screen, a WhatsApp button opens `wa.me/` with a pre-filled message
- Message: "Hi, I booked a meeting through CalendAI. I would appreciate a reminder."

### 6. Backend
- Added `POST /api/schedule/check-slot` endpoint that checks if a specific time slot is available
- Returns `{ available: true }` or `{ available: false, conflictingEvent: ... }`