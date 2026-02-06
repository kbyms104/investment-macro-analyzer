
import pg from 'pg';
const { Client } = pg;

const client = new Client({
    connectionString: 'postgres://postgres:password@localhost:5432/investment_analyzer',
});

async function check() {
    await client.connect();
    const res = await client.query('SELECT COUNT(DISTINCT indicator_id) FROM historical_data');
    console.log('Count:', res.rows[0].count);

    // List IDs
    const res2 = await client.query('SELECT DISTINCT indicator_id FROM historical_data');
    console.log('IDs:', res2.rows.map(r => r.indicator_id));

    await client.end();
}

check().catch(e => console.error(e));
