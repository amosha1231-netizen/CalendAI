# CalendAI - Task Checklist

## Bug Fixes to Implement

### ✅ Bug #4: Remove Mock Event
- [x] Clear "פגישה היום בשעה 2300" from schedules.json

### 🔲 Bug #1: Clean Title Extraction (AI & fallback)
- [ ] Add AI prompt instruction to strip prefix letters (ל-, את, ב-, כ-, מ-, ש-) and temporal phrases from title
- [ ] Add post-processing title cleanup in parseWithGemini and fallbackParseAdvice
- [ ] Update fallbackParse title cleanup to strip prefixes

### 🔲 Bug #2: Multi-Event Creation
- [ ] Enhance AI prompt to reliably return arrays of events for quantities
- [ ] Verify backend loop correctly inserts all events

### 🔲 Bug #3: Prevent Event Overwrite (Insert not Replace)
- [ ] Audit backend .push() vs assignment logic
- [ ] Ensure schedule[day] always uses push/append

### 🔲 Bug #5: Build & Deploy
- [ ] Run npm run build in frontend
- [ ] git add, commit, push