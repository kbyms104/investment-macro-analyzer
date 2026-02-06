"""Check SPX data count"""

import sqlite3
import os

DB_PATH = os.path.join(
    os.environ["APPDATA"], "com.yun.investment-analyzer", "indicators.db"
)
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Get SPX indicator id
cursor.execute("SELECT id FROM indicators WHERE slug = 'spx'")
spx_id = cursor.fetchone()[0]

# Count SPX data points
cursor.execute("SELECT COUNT(*) FROM historical_data WHERE indicator_id = ?", (spx_id,))
count = cursor.fetchone()[0]

# Get date range
cursor.execute(
    """
    SELECT MIN(timestamp), MAX(timestamp) 
    FROM historical_data 
    WHERE indicator_id = ?
""",
    (spx_id,),
)
min_ts, max_ts = cursor.fetchone()

print(f"SPX Data Count: {count} records")
print(f"Date Range: {min_ts} ~ {max_ts}")
print(f"200 SMA 가능?: {'✅ 네' if count >= 200 else '❌ 아니오 (필요: 200개)'}")

conn.close()
