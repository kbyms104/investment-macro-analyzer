# PLAN: Market Calendar Data Enrichment (Option B)

Improve the Market Calendar by providing on-demand access to historical earnings data (last 4 quarters) when a user clicks on an event card. This data will be cached in the database to optimize API usage.

## Context
- **User Request**: Implement detailed earnings history (4 quarters) with a modal, tables, and charts. Use database caching.
- **Goal**: Resolve "N/A" and "--" values by providing historical context and richer detail upon user interaction.
- **Modal Style**: Overlay Modal (Option A from user feedback).
- **Critical Requirement**: **ZERO IMPACT on other menus/views.** All changes must be strictly isolated.

## Safety & Isolation Strategy
- **Scoped Backend Commands**: New Tauri commands will be prefixed or grouped in `commands/calendar.rs` to avoid name collisions.
- **Isolated DB Storage**: The `earnings_history` table is exclusive to the Market Calendar feature.
- **Local State Management**: All modal states and data fetching for the detail view will live inside `MarketCalendarView.tsx` or dedicated sub-components.
- **Component Encapsulation**: New UI components will be housed in `components/views/calendar/` (or similar) to keep the project structure clean and separate from global widgets.

### [Component] MarketCalendarView.tsx
- Update labels and conditional rendering for empty states.
- Prepare for detail fetching logic.

### [Fix] Serialization Mismatch
- **Issue**: Finnhub's `/stock/earnings` (History) uses different field names (`actual`, `estimate`, `period`) than `/calendar/earnings` (`epsActual`, `epsEstimate`, `date`).
- **Solution**: Create a dedicated `EarningsHistoryEvent` struct in `calendar.rs` to correctly map the history API response.

## Phase 1: Database & Backend Infrastructure
- [ ] **Database Migration**:
    - Create `earnings_history` table:
        - `symbol` (TEXT, PRIMARY KEY)
        - `data_json` (TEXT) - Stores the 4-quarter history array.
        - `last_updated` (DATETIME) - For cache invalidation.
- [ ] **Backend Fetcher (`calendar.rs`)**:
    - Implement `fetch_earnings_history(symbol)` method.
    - End-point: `https://finnhub.io/api/v1/stock/earnings?symbol={symbol}&token={token}`
- [ ] **Tauri Command**:
    - Implement `get_earnings_history(pool, symbol)`:
        - Check `earnings_history` table first.
        - If missing or stale (> 24h), fetch from Finnhub and save to DB.
        - Return the history list to frontend.

## Phase 2: Frontend Implementation
- [ ] **Component: `EarningsDetailModal.tsx`**:
    - Create a premium glass-styled modal.
    - **Header**: Symbol, Company Name (if available), and sector.
    - **Chart**: A simple visual representation of EPS Estimate vs Actual for the last 4 quarters.
    - **Table**: Date, Quarter, Estimate, Actual, Surprise %.
- [ ] **Integration (`MarketCalendarView.tsx`)**:
    - Add `onClick` handler to Market Event cards.
    - Manage modal state (isOpen, selectedSymbol).
    - Handle loading and error states for the history fetch.

## Phase 3: UI/UX Refinement
- [ ] **Labels Update**:
    - Change "Last EPS" to "Actual" on the main cards to avoid confusion.
- [ ] **Empty States**:
    - Provide helpful messaging when history is unavailable from the API.

## Phase 3: Noise Reduction & Final Polish
- [ ] **Data-Driven Filtering**:
    - Update `MarketCalendarView.tsx` to filter out cards where:
        - For **Earnings**: Both `eps_estimate` and `eps_actual` are null/empty.
        - For **IPO**: Both `price` and `number_of_shares` are null/empty.
    - This ensures the UI only displays "High-Value" events that actually have data provided by the API.

## Phase 4: Final Verification & Isolation
### Backend
- Verify `cargo check` and SQL migrations.
- Test the new command with a known ticker (e.g., AAPL).

### Frontend
- Verify modal animations and responsiveness.
- Verify chart rendering with real/cached data.

### Regression Testing (Mandatory)
- [ ] **OverviewView**: Confirm that the Overview dashboard is untouched and functional.
- [ ] **IndicatorsView**: Confirm that indicator charts and sync still work perfectly.
- [ ] **Sidebar**: Verify that navigation between all other menus remains smooth and error-free.
- [ ] **Settings**: Confirm API key management is unaffected.
