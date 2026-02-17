const https = require('https');
//測試指令
//node load_test_node.js

const URL = 'https://calcomtripletech4.zeabur.app/hnp/%E5%81%A5%E7%94%B2%E9%A0%90%E7%B4%84?uid=U6c6c169fa11b9695945cb99a754c618a&returnTo=%2Fhnp%2F%E5%81%A5%E7%94%B2%E9%A0%90%E7%B4%84%3Fuid%3DU6c6c169fa11b9695945cb99a753333';

const CONCURRENCY = 50; // Simultaneous requests

async function makeRequest(id) {
  return new Promise((resolve) => {
    const start = Date.now();
    https.get(URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const location = res.headers.location;
        const isError = data.includes("too many clients");
        const isRedirect = status >= 300 && status < 400;
        
        console.log(`[Req ${id}] Status: ${status}, Duration: ${duration}ms, DB Error: ${isError}`);
        resolve({ status, isError });
      });
    }).on('error', (e) => {
      console.error(`[Req ${id}] Failed: ${e.message}`);
      resolve({ status: 'failed', isError: true });
    });
  });
}

async function runLoadTest() {
  console.log(`Starting load test with ${CONCURRENCY} concurrent requests...`);
  const promises = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    promises.push(makeRequest(i + 1));
  }
  
  const results = await Promise.all(promises);
  // Fail only if DB error or status >= 400 (Client/Server Error)
  const failures = results.filter(r => r.isError || r.status >= 400).length;
  console.log(`\nTest Complete.`);
  console.log(`Total Requests: ${CONCURRENCY}`);
  console.log(`Failures/DB Errors: ${failures}`);
}

runLoadTest();
