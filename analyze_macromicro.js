import https from 'https';

const url = "https://en.macromicro.me/charts/50108/cnn-fear-and-greed";
const options = {
    headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://en.macromicro.me/"
    }
};

console.log("Fetching MacroMicro...");

https.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log("Status:", res.statusCode);

        // 1. Look for Highcharts series data often found in script tags
        // Pattern: "c30225": [[timestamp, value], ...]  (Some random ID key)

        // Look for generic chart data array patterns [[16..., ...], [16..., ...]]
        const dataMatch = data.match(/\[\[\d{10,13},\s*[\d\.]+\]/);

        if (dataMatch) {
            console.log("✅ Found Data Array Pattern!");
            const idx = data.indexOf(dataMatch[0]);
            console.log("Context:", data.substring(idx - 50, idx + 200));
        } else {
            console.log("❌ Data pattern not found");

            // Dump some HTML
            console.log("Sample HTML:", data.substring(0, 500));
        }

        // Look for window.chartConfig or similar
        if (data.includes("chart_data")) console.log("✅ Found 'chart_data'");

    });
}).on('error', (e) => {
    console.error("Error:", e.message);
});
