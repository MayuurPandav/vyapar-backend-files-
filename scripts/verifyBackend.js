const BASE = process.env.BACKEND_URL || 'http://localhost:5000';
const endpoints = [
  '/api/dashboard?username=admin@vyapar.com',
  '/api/revenue-timeseries?username=admin@vyapar.com&period=monthly',
  '/api/list?username=admin@vyapar.com&type=sales&page=1&limit=1'
];

async function check(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (!contentType.includes('application/json')) {
      console.error(`WARN: ${url} responded with non-JSON content-type: ${contentType}`);
      return false;
    }
    const body = await res.json();
    console.log(`OK: ${url} -> status: ${res.status}`);
    return true;
  } catch (err) {
    console.error(`FAIL: ${url} -> ${err.message}`);
    return false;
  }
}

(async () => {
  console.log(`Running backend verification against ${BASE}`);
  let allOk = true;
  for (const ep of endpoints) {
    const url = BASE + ep;
    const ok = await check(url);
    allOk = allOk && ok;
  }
  if (!allOk) {
    console.error('One or more checks failed. Ensure the backend is running and MongoDB is connected.');
    process.exit(2);
  }
  console.log('All backend checks passed.');
  process.exit(0);
})();

// Note: This script uses the global fetch API available in Node 18+.
// To run against a different URL: BACKEND_URL=http://localhost:5000 node scripts/verifyBackend.js
