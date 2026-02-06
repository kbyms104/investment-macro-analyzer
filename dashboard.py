import streamlit as st
import sqlite3
import pandas as pd
import os
import plotly.express as px
from datetime import datetime

# --- CONFIGURATION ---
st.set_page_config(
    page_title="Investment Analyzer - Admin DB", page_icon="🕵️", layout="wide"
)


# --- DATABASE CONNECTION ---
def get_db_path():
    """
    Locate the database file relative to AppData or local fallback.
    """
    # 1. Try Standard AppData Location (Production/Tauri default)
    app_data = os.getenv("APPDATA")
    if app_data:
        db_path = os.path.join(app_data, "com.yun.investment-analyzer", "indicators.db")
        if os.path.exists(db_path):
            return db_path

    # 2. Try Local Dev Location (./src-tauri/data or similar)
    local_paths = [
        "./src-tauri/data/indicators.db",
        "./data/indicators.db",
        "../src-tauri/data/indicators.db",
    ]
    for path in local_paths:
        if os.path.exists(path):
            return path

    return None


DB_PATH = get_db_path()

if not DB_PATH:
    st.error(
        "❌ Database Not Found! Please check if the application has been run at least once."
    )
    st.info(f"Searched for 'indicators.db' in AppData and local folders.")
    st.stop()


@st.cache_resource
def get_connection():
    return sqlite3.connect(DB_PATH, check_same_thread=False)


conn = get_connection()

# --- SIDEBAR ---
st.sidebar.title("🕵️ Admin Dashboard")
st.sidebar.caption(f"Connected to: `{DB_PATH}`")

menu = st.sidebar.radio(
    "Navigation",
    ["Overview", "API Sources", "Data Inspector", "SQL Playground", "Cheat Sheet"],
)


# --- PAGE: OVERVIEW ---
if menu == "Overview":
    st.title("📊 System Overview")

    # 1. KPI Cards
    try:
        total_indicators = pd.read_sql(
            "SELECT COUNT(*) as count FROM indicators", conn
        ).iloc[0]["count"]
        total_rows = pd.read_sql(
            "SELECT COUNT(*) as count FROM historical_data", conn
        ).iloc[0]["count"]
        db_size = os.path.getsize(DB_PATH) / (1024 * 1024)  # MB

        c1, c2, c3 = st.columns(3)
        c1.metric("Total Indicators", total_indicators)
        c2.metric("Total Data Points", f"{total_rows:,}")
        c3.metric("DB Size", f"{db_size:.2f} MB")

        st.markdown("---")

        # 2. Data Catalog (Table View)
        st.subheader("📚 Data Catalog")

        # Fetch all metadata
        df_cat = pd.read_sql(
            """
            SELECT 
                category as Category,
                source as Source,
                name as Name,
                slug as Slug,
                refresh_interval as 'Update Freq',
                updated_at as 'Last Updated'
            FROM indicators 
            ORDER BY category, name
        """,
            conn,
        )

        # Interactive Table
        st.dataframe(
            df_cat,
            use_container_width=True,
            hide_index=True,
            column_config={
                "Slug": st.column_config.TextColumn("Slug", help="Unique identifier"),
                "Last Updated": st.column_config.DatetimeColumn(
                    "Last Updated", format="D MMM YYYY, h:mm a"
                ),
            },
        )

        # 3. Category Distribution
        with st.expander("View Category Distribution"):
            df_dist = df_cat.groupby("Category").size().reset_index(name="Count")
            fig = px.pie(
                df_dist,
                names="Category",
                values="Count",
                title="Indicators by Category",
                hole=0.4,
            )
            st.plotly_chart(fig, use_container_width=True)

    except Exception as e:
        st.error(f"Error loading overview: {e}")

# --- PAGE: API SOURCES ---
elif menu == "API Sources":
    st.title("🔌 API Data Sources")
    st.caption("Indicators grouped by data provider.")

    try:
        df = pd.read_sql("SELECT * FROM indicators ORDER BY source, slug", conn)

        # Get unique sources and sort them
        sources = sorted(df["source"].dropna().unique())

        for source in sources:
            source_df = df[df["source"] == source]
            count = len(source_df)

            # Use expander for cleaner look
            with st.expander(f"**{source}** ({count} indicators)", expanded=False):
                st.dataframe(
                    source_df[
                        ["slug", "name", "category", "refresh_interval", "updated_at"]
                    ],
                    use_container_width=True,
                    hide_index=True,
                    column_config={
                        "slug": "Slug",
                        "name": "Indicator Name",
                        "category": "Category",
                        "refresh_interval": "Update Freq",
                        "updated_at": st.column_config.DatetimeColumn(
                            "Last Updated", format="D MMM YYYY, h:mm a"
                        ),
                    },
                )
    except Exception as e:
        st.error(f"Error loading API sources: {e}")

# --- PAGE: DATA INSPECTOR ---
elif menu == "Data Inspector":
    st.title("🔍 Data Inspector")

    # 1. Filters (Hierarchical)
    df_meta = pd.read_sql(
        "SELECT slug, name, category, source FROM indicators ORDER BY category, name",
        conn,
    )

    col1, col2 = st.columns(2)

    with col1:
        # Category Filter
        categories = ["All"] + sorted(df_meta["category"].dropna().unique().tolist())
        selected_cat = st.selectbox("📂 Filter by Category", categories)

    with col2:
        # Indicator Selection (Filtered)
        if selected_cat != "All":
            filtered_df = df_meta[df_meta["category"] == selected_cat]
        else:
            filtered_df = df_meta

        selected_slug = st.selectbox(
            "📈 Select Indicator",
            filtered_df["slug"].tolist(),
            format_func=lambda x: (
                f"{x} ({filtered_df[filtered_df['slug'] == x]['name'].values[0]})"
            ),
        )

    st.markdown("---")

    if selected_slug:
        # Get Metadata
        meta = df_meta[df_meta["slug"] == selected_slug].iloc[0]
        st.info(f"**{meta['name']}** ({meta['source']}) - `{meta['category']}`")

        # 2. Load History
        query = "SELECT * FROM historical_data WHERE indicator_id = (SELECT id FROM indicators WHERE slug = ?) ORDER BY timestamp DESC"
        df_data = pd.read_sql(query, conn, params=(selected_slug,))

        if df_data.empty:
            st.warning("⚠️ No data found for this indicator.")
        else:
            # Stats
            total_pts = len(df_data)
            first_date = pd.to_datetime(df_data["timestamp"]).min()
            last_date = pd.to_datetime(df_data["timestamp"]).max()

            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Data Points", total_pts)
            c2.metric("Start Date", first_date.strftime("%Y-%m-%d"))
            c3.metric("End Date", last_date.strftime("%Y-%m-%d"))

            # Check Gaps (Simple check for > 7 days gap)
            df_data["dt"] = pd.to_datetime(df_data["timestamp"])
            df_data = df_data.sort_values("dt")
            df_data["diff"] = df_data["dt"].diff()
            max_gap = df_data["diff"].max()
            c4.metric(
                "Max Gap", f"{max_gap.days} days" if pd.notnull(max_gap) else "N/A"
            )

            # Chart (Top)
            st.subheader("📈 Chart View")
            fig = px.line(df_data, x="dt", y="value", title=f"{meta['name']} History")
            st.plotly_chart(fig, use_container_width=True)

            # Table (Bottom)
            st.markdown("---")
            st.subheader("🔢 Raw Data Grid")
            st.dataframe(
                df_data[["timestamp", "value", "metadata"]],
                use_container_width=True,
                height=500,
                column_config={
                    "timestamp": st.column_config.DatetimeColumn(
                        "Date", format="Y-MM-DD"
                    )
                },
            )


# --- PAGE: SQL PLAYGROUND ---
elif menu == "SQL Playground":
    st.title("⚡ SQL Playground")
    st.warning(
        "⚠️ Be careful! Using DELETE/UPDATE commands effectively modifies the production database."
    )

    default_query = "SELECT * FROM indicators LIMIT 50;"
    query = st.text_area("SQL Query", value=default_query, height=150)

    if st.button("Run Query", type="primary"):
        try:
            if query.strip().upper().startswith("SELECT"):
                df_result = pd.read_sql(query, conn)
                st.success(f"Query returned {len(df_result)} rows.")
                st.dataframe(df_result, use_container_width=True)
            else:
                cursor = conn.cursor()
                cursor.execute(query)
                conn.commit()
                st.success(
                    f"Command executed successfully. Rows affected: {cursor.rowcount}"
                )
        except Exception as e:
            st.error(f"SQL Error: {e}")

# --- PAGE: CHEAT SHEET ---
elif menu == "Cheat Sheet":
    st.title("📋 Indicator Cheat Sheet")
    st.caption("Easy copy-paste list of all available indicators.")

    df = pd.read_sql(
        "SELECT category, slug, name, source FROM indicators ORDER BY category, slug",
        conn,
    )

    # 1. Interactive Table
    st.subheader("Interactive Table (Click to Sort)")
    st.dataframe(df, use_container_width=True, hide_index=True)

    st.markdown("---")

    # 2. Copy-Paste Friendly Formats
    st.subheader("📝 Copy-Paste Formats")

    tab1, tab2, tab3 = st.tabs(["Markdown List", "CSV Format", "JSON Format"])

    with tab1:
        md_text = ""
        current_cat = ""
        for _, row in df.iterrows():
            if row["category"] != current_cat:
                current_cat = row["category"]
                md_text += f"\n### {current_cat}\n"
            md_text += f"- **{row['name']}** (`{row['slug']}`)\n"
        st.code(md_text, language="markdown")

    with tab2:
        csv_text = df.to_csv(index=False)
        st.code(csv_text, language="csv")

    with tab3:
        json_text = df.to_json(orient="records", indent=2)
        st.code(json_text, language="json")

# --- FOOTER ---
st.sidebar.markdown("---")
st.sidebar.caption("Investment Analyzer Admin v1.3")
