"""Debug: Check if SPX data is grouped by day for backfill"""

import sqlite3
import os

DB_PATH = os.path.join(
    os.environ["APPDATA"], "com.yun.investment-analyzer", "indicators.db"
)
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Simulate what the Rust backfill query does
print("=" * 60)
print("SIMULATING BACKFILL QUERY")
print("=" * 60)

cursor.execute("""
    SELECT CAST(strftime('%s', h.timestamp) AS INTEGER) as ts, i.slug, h.value
    FROM historical_data h
    JOIN indicators i ON h.indicator_id = i.id
    WHERE i.slug IN ('yield_curve_10y_2y', 'vix', 'buffett_indicator', 'ism_pmi', 'hy_spread', 'spx')
    ORDER BY h.timestamp ASC
""")
rows = cursor.fetchall()

print(f"Total rows fetched: {len(rows)}")

# Count by slug
from collections import Counter

slug_counts = Counter(r[1] for r in rows)
print("\nBy indicator:")
for slug, count in slug_counts.most_common():
    print(f"  {slug}: {count}")

# Check date range for SPX
spx_rows = [r for r in rows if r[1] == "spx"]
if spx_rows:
    print(f"\nSPX date range:")
    print(f"  First: {spx_rows[0][0]} = {spx_rows[0][2]}")
    print(f"  Last:  {spx_rows[-1][0]} = {spx_rows[-1][2]}")
else:
    print("\n❌ NO SPX DATA FOUND IN QUERY!")

# Check grouped by day
print("\n" + "=" * 60)
print("GROUPING BY DAY (first 10 days)")
print("=" * 60)
from collections import defaultdict

data_by_day = defaultdict(dict)
for ts, slug, value in rows[:500]:  # First 500 rows
    day = ts - (ts % 86400)
    data_by_day[day][slug] = value

sorted_days = sorted(data_by_day.keys())[:10]
for day in sorted_days:
    print(f"Day {day}:")
    for slug, val in data_by_day[day].items():
        print(f"  {slug}: {val:.2f}")

conn.close()
