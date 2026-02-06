import sqlite3
import os

db_path = r"C:\Users\yun\AppData\Roaming\com.yun.investment-analyzer\indicators.db"

if not os.path.exists(db_path):
    print(f"Error: DB file not found at {db_path}")
else:
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print("Tables:", tables)

        # Check columns for 'indicators' table if exists
        for t in tables:
            t_name = t[0]
            print(f"\nScheme for {t_name}:")
            cursor.execute(f"PRAGMA table_info({t_name})")
            cols = cursor.fetchall()
            for col in cols:
                print(col)

    except Exception as e:
        print(f"Error reading DB: {e}")
