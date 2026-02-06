import https from 'https';

const url = "https://kr.tradingview.com/script/2bDe2JuT/";
const options = {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
};

console.log("Fetching TradingView Script...");

https.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log("Status:", res.statusCode);

        // Look for Pine Script content
        // Usually inside a code block or specific div

        const codeBlock = data.match(/study\("CnN Fear & Greed Index"[\s\S]*?\/\/\/ \w+/);
        // Pine script usually starts with 'study' or 'indicator' or 'strategy'

        // Just dump anything that looks like pine script
        // Look for "indicator(" or "study("
        const pineStart = data.indexOf('study("') !== -1 ? data.indexOf('study("') : data.indexOf('indicator("');

        if (pineStart !== -1) {
            console.log("✅ Found Pine Script Start!");
            console.log(data.substring(pineStart, pineStart + 1000));
        } else {
            // Search more generically
            if (data.includes("VIX") && data.includes("SPX")) {
                console.log("✅ Found VIX/SPX keywords (Logic likely present)");
            }
            console.log("❌ Pine Script identifier not found");
            console.log("Sample HTML:", data.substring(0, 500));
        }

    });
}).on('error', (e) => {
    console.error("Error:", e.message);
});
