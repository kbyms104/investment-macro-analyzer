import sqlite3
import shutil
import os

# Use os.environ or hardcode for safety
appdata = os.environ.get("APPDATA", r"C:\Users\yun\AppData\Roaming")
db_path = os.path.join(appdata, "com.yun.investment-analyzer", "indicators.db")
temp_db = "check_data_v3.db"

# Copy DB to avoid locks
try:
    shutil.copy2(db_path, temp_db)
except FileNotFoundError:
    print(f"Database not found at {db_path}")
    exit(1)
except Exception as e:
    print(f"Copy failed: {e}")
    exit(1)

try:
    conn = sqlite3.connect(temp_db)
    cursor = conn.cursor()

    indicators = [
        "yield_curve_10y_2y",
        "vix",
        "buffett_indicator",
        "ism_pmi",
        "hy_spread",
    ]

    print(f"{'Indicator':<25} | {'Count':<10} | {'Oldest':<12} | {'Newest':<12}")
    print("-" * 65)

    for slug in indicators:
        cursor.execute(
            """
            SELECT COUNT(h.value), MIN(date(h.timestamp)), MAX(date(h.timestamp))
            FROM indicators i 
            LEFT JOIN historical_data h ON i.id = h.indicator_id 
            WHERE i.slug = ?
        """,
            (slug,),
        )
        row = cursor.fetchone()
        if row:
            count, oldest, newest = row
            oldest = str(oldest) if oldest else "None"
            newest = str(newest) if newest else "None"
            print(f"{slug:<25} | {count:<10} | {oldest:<12} | {newest:<12}")
        else:
            print(f"{slug:<25} | {'0':<10} | {'None':<12} | {'None':<12}")

    conn.close()

except Exception as e:
    print(f"Database error: {e}")

# Cleanup
try:
    os.remove(temp_db)
except:
    pass
