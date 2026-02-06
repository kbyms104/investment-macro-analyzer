import sqlite3
import os

# Adjust path to your DB
db_path = os.path.expandvars(r"%APPDATA%\com.yun.investment-analyzer\indicators.db")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- Risk Score History (Last 20) ---")
cursor.execute(
    "SELECT datetime(timestamp, 'unixepoch'), risk_score, key_driver FROM risk_score_history ORDER BY timestamp DESC LIMIT 20"
)
rows = cursor.fetchall()
for r in rows:
    print(r)

print("\n--- Risk Score History (Sample from middle) ---")
# Get some from a year ago
cursor.execute(
    "SELECT datetime(timestamp, 'unixepoch'), risk_score, key_driver FROM risk_score_history ORDER BY timestamp ASC LIMIT 20 OFFSET 2000"
)
rows = cursor.fetchall()
for r in rows:
    print(r)

print("\n--- Indicators Count ---")
cursor.execute(
    "SELECT i.slug, COUNT(*) FROM historical_data h JOIN indicators i ON h.indicator_id = i.id GROUP BY i.slug"
)
rows = cursor.fetchall()
for r in rows:
    print(r)

conn.close()
