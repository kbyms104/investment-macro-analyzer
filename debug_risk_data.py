"""Debug script - FINAL with correct JOINs"""

import sqlite3
import os

DB_PATH = os.path.join(
    os.environ["APPDATA"], "com.yun.investment-analyzer", "indicators.db"
)
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Check indicators table
print("=" * 60)
print("INDICATORS TABLE (sample)")
print("=" * 60)
cursor.execute("SELECT id, slug, name FROM indicators LIMIT 10")
for row in cursor.fetchall():
    print(f"  {row[0]}: {row[1]} ({row[2]})")

# Get buffett_indicator id
cursor.execute("SELECT id FROM indicators WHERE slug = 'buffett_indicator'")
buffett_id = cursor.fetchone()
if buffett_id:
    print(f"\n=== BUFFETT INDICATOR (id={buffett_id[0]}) ===")
    cursor.execute(
        """SELECT timestamp, value FROM historical_data WHERE indicator_id = ? ORDER BY timestamp DESC LIMIT 15""",
        (buffett_id[0],),
    )
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]}")
else:
    print("\nBUFFETT INDICATOR NOT FOUND!")

# Get VIX id
cursor.execute("SELECT id FROM indicators WHERE slug = 'vix'")
vix_id = cursor.fetchone()
if vix_id:
    print(f"\n=== VIX (id={vix_id[0]}) ===")
    cursor.execute(
        """SELECT timestamp, value FROM historical_data WHERE indicator_id = ? ORDER BY timestamp DESC LIMIT 10""",
        (vix_id[0],),
    )
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]}")

# Get yield_curve_10y_2y id
cursor.execute("SELECT id FROM indicators WHERE slug = 'yield_curve_10y_2y'")
yc_id = cursor.fetchone()
if yc_id:
    print(f"\n=== YIELD CURVE 10Y-2Y (id={yc_id[0]}) ===")
    cursor.execute(
        """SELECT timestamp, value FROM historical_data WHERE indicator_id = ? ORDER BY timestamp DESC LIMIT 10""",
        (yc_id[0],),
    )
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]}")

# Get SPX id
cursor.execute("SELECT id FROM indicators WHERE slug = 'spx'")
spx_id = cursor.fetchone()
if spx_id:
    print(f"\n=== SPX (id={spx_id[0]}) ===")
    cursor.execute(
        """SELECT timestamp, value FROM historical_data WHERE indicator_id = ? ORDER BY timestamp DESC LIMIT 10""",
        (spx_id[0],),
    )
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]}")

# Risk score distribution
print("\n" + "=" * 60)
print("RISK SCORE DISTRIBUTION")
print("=" * 60)
cursor.execute("""
    SELECT ROUND(risk_score, 0) as score, COUNT(*) as cnt 
    FROM risk_score_history 
    GROUP BY ROUND(risk_score, 0) 
    ORDER BY score
""")
rows = cursor.fetchall()
total = sum(r[1] for r in rows) if rows else 1
for row in rows:
    pct = row[1] / total * 100
    bar = "#" * min(int(pct), 50)
    print(f"  {row[0]:3.0f}: {bar} ({row[1]} = {pct:.1f}%)")

conn.close()
print("\nDone!")
