use anyhow::Result;
use reqwest::Client;
use crate::models::DataPoint;
use scraper::{Html, Selector};
use serde::Deserialize;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
// use chrono::TimeZone;

// URL to scrape (Official CNN is blocked, using reliable alternative)
const FNG_URL: &str = "https://feargreedmeter.com/";
const CSV_PATH: &str = "../docs/fng_recent.csv";

#[derive(Deserialize, Debug)]
struct NextData {
    props: PageProps,
}

#[derive(Deserialize, Debug)]
struct PageProps {
    pageProps: PageData,
}

#[derive(Deserialize, Debug)]
struct PageData {
    data: FgiDataWrapper,
}

#[derive(Deserialize, Debug)]
struct FgiDataWrapper {
    fgi: FgiData,
}

#[derive(Deserialize, Debug)]
struct FgiData {
    latest: LatestFgi,
}

#[derive(Deserialize, Debug)]
struct LatestFgi {
    now: f64,
    date: String, // "YYYY-MM-DD"
}

pub async fn fetch_fear_and_greed() -> Result<Vec<DataPoint>> {
    // 1. Try to fetch and update CSV first
    if let Err(e) = try_update_fng_data().await {
        println!("CNN Fetcher: Failed to update live data: {}", e);
    }

    // 2. Read from CSV (Source of Truth)
    read_fng_csv()
}

async fn try_update_fng_data() -> Result<()> {
    println!("CNN Fetcher: Scraping live data from {}", FNG_URL);

    let client = Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()?;

    let resp = client.get(FNG_URL).send().await?;
    if !resp.status().is_success() {
        return Err(anyhow::anyhow!("HTTP Error: {}", resp.status()));
    }

    let html_content = resp.text().await?;
    let document = Html::parse_document(&html_content);
    
    // Extract __NEXT_DATA__ script
    let selector = Selector::parse("#__NEXT_DATA__").unwrap();
    let script_element = document.select(&selector).next()
        .ok_or_else(|| anyhow::anyhow!("Could not find #__NEXT_DATA__ script"))?;
    
    let json_text = script_element.inner_html();
    let data: NextData = serde_json::from_str(&json_text)?;
    
    let latest = data.props.pageProps.data.fgi.latest;
    println!("CNN Fetcher: Live Data Found -> Date: {}, Value: {}", latest.date, latest.now);

    // Check if we need to append
    let runtime_path = Path::new(CSV_PATH);
    if !runtime_path.exists() {
        return Err(anyhow::anyhow!("CSV file not found at {:?}", runtime_path));
    }

    let current_content = std::fs::read_to_string(runtime_path)?;
    
    // Check if date already exists
    if !current_content.contains(&latest.date) {
        println!("CNN Fetcher: New data found! Appending to CSV...");
        let mut file = OpenOptions::new()
            .write(true)
            .append(true)
            .open(runtime_path)?;
            
        writeln!(file, "{},{}", latest.date, latest.now)?;
        println!("CNN Fetcher: CSV updated successfully.");
    } else {
        println!("CNN Fetcher: Data for {} already exists. Skipping update.", latest.date);
    }

    Ok(())
}

fn read_fng_csv() -> Result<Vec<DataPoint>> {
    let mut points = Vec::new();
    let runtime_path = Path::new(CSV_PATH);
    
    if runtime_path.exists() {
        // println!("CNN Fetcher: Reading local CSV at {:?}", runtime_path);
        let content = std::fs::read_to_string(runtime_path)?;
        
        for line in content.lines() {
            if line.starts_with("Date") { continue; }
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() < 2 { continue; }
            
            let date_str = parts[0].trim().replace(".", "-");
            let val_str = parts[1].trim();
            
            if let (Ok(date), Ok(val)) = (
                chrono::NaiveDate::parse_from_str(&date_str, "%Y-%m-%d"),
                val_str.parse::<f64>()
            ) {
                let timestamp = date.and_hms_opt(0, 0, 0).unwrap().and_utc();
                points.push(DataPoint { timestamp, value: val });
            }
        }
        
        points.sort_by_key(|p| p.timestamp);
    } else {
        println!("CNN Fetcher: Local CSV not found. Returning empty.");
    }

    Ok(points)
}
