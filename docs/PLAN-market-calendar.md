# PLAN-market-calendar.md - Market Calendar Detailed Design

## 1. 🔍 Context & Goals
**User Request**: Implement a comprehensive Market Calendar (Earnings & IPOs) using Finnhub free data.
- **Scope**: Full market scan (All symbols available via Finnhub).
- **Persistence**: Permanent storage in SQLite for historical analysis.
- **UI**: Collapsible card in Dashboard.
- **Rich Data**: Include all investor-relevant fields (EPS, Revenue, PriceTargets for IPOs, etc.).

---

## 2. 🏗️ System Architecture

### Phase 1: Database & Persistence
- **Table**: `market_events`
  - `id`: `TEXT PRIMARY KEY` (Generated from symbol + date + type)
  - `event_type`: `TEXT` ('earnings', 'ipo')
  - `symbol`: `TEXT`
  - `event_date`: `TEXT` (ISO 8601)
  - `event_time`: `TEXT` (Optional, for AM/PM earnings)
  - `data_json`: `TEXT` (Detailed payload)
  - `is_synced`: `BOOLEAN` (To track if full details were fetched)

### Phase 2: Backend Fetcher (`fetcher/calendar.rs`)
- **Earnings Sync**: `https://finnhub.io/api/v1/calendar/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Fetch +7 days and -7일 (to catch missed ones) daily.
- **IPO Sync**: `https://finnhub.io/api/v1/calendar/ipo?from=YYYY-MM-DD&to=YYYY-MM-DD`
- **Orchestrator Integration**: Add a dedicated `sync_market_calendar` task to the scheduler.

### Phase 3: Frontend UI Components
- **`MarketEventCard.tsx`**: A reusable card showing Ticker, Event Type, Date, and Key Data (e.g., $1.20 EPS Est).
- **`DashboardCalendar.tsx`**: A collapsible section in `OverviewView` (Dashboard) that groups events by "Today", "Tomorrow", and "Upcoming".
- **Dynamic Icons**: Different icons for Earnings (📊) and IPOs (🚀).

---

## 3. 🎨 UI/UX Detailed Wireframe (Conceptual)
```
[ 📅 Market Calendar (Collapse/Expand) ]
---------------------------------------
| TODAY (Feb 08)                      |
| (📊) NVDA - Earnings (After Close)  |
|      Est. EPS: $4.60 | Rev: $11B    |
---------------------------------------
| TOMORROW (Feb 09)                   |
| (🚀) STNK - IPO (Nasdaq)            |
|      Price: $15.00 | Shares: 2M     |
---------------------------------------
```

---

## 4. ✅ Verification Tasks
- [ ] Run migration and verify table schema.
- [ ] Manual test: Fetch next 30 days and check DB row count.
- [ ] UI Test: Verify "Collapse" state persists or behaves smoothly.
- [ ] Data Check: Confirm `data_json` contains EPS/Revenue fields.

---

## 5. ⚠️ Constraints & Edge Cases
- **Rate Limits**: Finnhub Free tier is 60/min. Scanning "everything" might need chunking if we fetch large date ranges.
- **Empty Data**: Some symbols might lack estimates; handle N/A gracefully.
- **Timezones**: Always store in UTC, display in local browser time.
