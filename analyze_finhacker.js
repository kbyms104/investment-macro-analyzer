import https from 'https';

const url = "https://www.finhacker.cz/en/fear-and-greed-index-historical-data-and-chart/";
const options = {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
};

console.log("Fetching Finhacker...");

https.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log("Status:", res.statusCode);

        // Look for chart data patterns
        // Often: var data = [...] or generic array
        const dateMatch = data.match(/2024-\d{2}-\d{2}/);
        if (dateMatch) console.log("✅ Found Date string:", dateMatch[0]);
        else console.log("❌ Date string not found");

        // Look for array of arrays [[Date, Value], ...]
        if (data.includes("visualization.arrayToDataTable")) console.log("✅ Found Google Charts");
        if (data.includes("Highcharts")) console.log("✅ Found Highcharts");

        // Dump script tags to find data
        const scripts = data.match(/<script[\s\S]*?<\/script>/g);
        if (scripts) {
            console.log(`Found ${scripts.length} script tags.`);
            scripts.forEach((s, i) => {
                // Look for large data arrays
                if (s.includes('[[') && s.includes(']]')) {
                    console.log(`\nFound Array in Script ${i}:`);
                    console.log(s.substring(0, 500)); // Print start of script
                }
            });
        } else {
            console.log("No scripts found?");
        }
        // Dump iframe src
        if (data.includes('iframe')) console.log("✅ Iframe detected");

        // Try to find a data block
        const dataBlock = data.match(/\[.*(202[3-5]).*\]/);
        if (dataBlock) {
            console.log("✅ Found potential data array!");
            console.log("Context:", dataBlock[0].substring(0, 200));
        }

        // Dump start of HTML
        if (res.statusCode !== 200) console.log("Sample HTML:", data.substring(0, 500));

    });
}).on('error', (e) => {
    console.error("Error:", e.message);
});
