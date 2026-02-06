"""Debug: Check ISM PMI data for bad timestamps"""

import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(
    os.environ["APPDATA"], "com.yun.investment-analyzer", "indicators.db"
)
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

print("=" * 60)
print("ISM PMI DATA CHECK")
print("=" * 60)

# Get ISM PMI id
cursor.execute("SELECT id FROM indicators WHERE slug = 'ism_pmi'")
ism_id = cursor.fetchone()
if ism_id:
    cursor.execute(
        """SELECT timestamp, value FROM historical_data WHERE indicator_id = ? ORDER BY timestamp ASC LIMIT 10""",
        (ism_id[0],),
    )
    print("First 10 ISM PMI records:")
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]}")

    cursor.execute(
        """SELECT timestamp, value FROM historical_data WHERE indicator_id = ? ORDER BY timestamp DESC LIMIT 5""",
        (ism_id[0],),
    )
    print("\nLast 5 ISM PMI records:")
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]}")

# Check minimum timestamp for each indicator used in backfill
print("\n" + "=" * 60)
print("DATE RANGE BY INDICATOR")
print("=" * 60)

for slug in [
    "yield_curve_10y_2y",
    "vix",
    "buffett_indicator",
    "ism_pmi",
    "hy_spread",
    "spx",
]:
    cursor.execute(
        """
        SELECT MIN(h.timestamp), MAX(h.timestamp)
        FROM historical_data h
        JOIN indicators i ON h.indicator_id = i.id
        WHERE i.slug = ?
    """,
        (slug,),
    )
    min_ts, max_ts = cursor.fetchone()
    print(f"{slug}:")
    print(f"  From: {min_ts}")
    print(f"  To:   {max_ts}")

conn.close()
