import https from 'https';

const url = "https://edition.cnn.com/markets/fear-and-greed";
const options = {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
};

console.log("Fetching CNN...");

https.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log("Status:", res.statusCode);

        // 1. Look for score
        const scoreMatch = data.match(/"score":([\d\.]+)/);
        if (scoreMatch) console.log("✅ Found Score:", scoreMatch[1]);
        else console.log("❌ 'score' key not found");

        // 2. Look for historical data
        if (data.includes('fear_and_greed_historical')) {
            console.log("✅ Found 'fear_and_greed_historical'");
            const idx = data.indexOf('fear_and_greed_historical');
            console.log("CONTEXT:", data.substring(idx - 100, idx + 1000));
        } else console.log("❌ 'fear_and_greed_historical' not found");

        // 3. Look for hydration
        if (data.includes('__NEXT_DATA__')) console.log("✅ Found __NEXT_DATA__");
        else console.log("❌ __NEXT_DATA__ not found");

        // Dump part of HTML if nothing found
        if (!scoreMatch) {
            console.log("Sample HTML:", data.substring(0, 500));
            // Look for any number that looks like a score
            const fearText = data.match(/Fear & Greed Index.*?class="market-fng-gauge__value">(\d+)</s);
            if (fearText) console.log("✅ Found Score via HTML Scraping:", fearText[1]);
        }
    });
}).on('error', (e) => {
    console.error("Error:", e.message);
});
