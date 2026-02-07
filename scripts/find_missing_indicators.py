import sqlite3
import os


def find_db_path():
    possible_paths = [
        os.path.join(
            os.getenv("APPDATA"), "com.yun.investment-analyzer", "indicators.db"
        )
        if os.getenv("APPDATA")
        else None,
        os.path.join(
            os.getenv("LOCALAPPDATA"), "com.yun.investment-analyzer", "indicators.db"
        )
        if os.getenv("LOCALAPPDATA")
        else None,
        os.path.join(os.getenv("APPDATA"), "com.yun.investment-analyzer", "data.db")
        if os.getenv("APPDATA")
        else None,
        os.path.join(
            os.getenv("LOCALAPPDATA"), "com.yun.investment-analyzer", "data.db"
        )
        if os.getenv("LOCALAPPDATA")
        else None,
        "src-tauri/data.db",
        "data.db",
        "investment_data.db",
    ]

    for path in possible_paths:
        if path and os.path.exists(path):
            return path
    return None


def find_missing_indicators():
    db_path = find_db_path()
    if not db_path:
        print("❌ Error: Could not find 'data.db' in any expected location.")
        return

    print(f"✅ Found Database: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Get all indicators and their data counts
        cursor.execute("""
            SELECT i.slug, i.source, COUNT(h.indicator_id) as count
            FROM indicators i
            LEFT JOIN historical_data h ON i.id = h.indicator_id
            GROUP BY i.slug
            ORDER BY count ASC
        """)

        results = cursor.fetchall()

        missing_indicators = []
        for slug, source, count in results:
            if count == 0:
                missing_indicators.append((slug, source))

        if not missing_indicators:
            print("✅ All indicators have data!")
        else:
            print(f"❌ Found {len(missing_indicators)} indicators with NO DATA:")
            print("-" * 50)
            print(f"{'SLUG':<30} | {'SOURCE':<15}")
            print("-" * 50)
            for slug, source in missing_indicators:
                print(f"{slug:<30} | {source:<15}")
            print("-" * 50)

    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    find_missing_indicators()
