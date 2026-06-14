const http = require('http');

const testCases = [
  { text: "שני בשש בערב שיחת וידאו" },
  { text: "רביעי בשבע בערב שיעור מתמטיקה" },
  { text: "בימים א ג ד ה משעה שש וחצי ועד שמונה וחצי שיעור תורה בכפר יונה" }
];

async function runTest(testData) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(testData);
    console.log('\n=== Sending:', testData.text, '===\n');
    
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/parse-schedule',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          console.log('Response:', JSON.stringify(parsed, null, 2));
          resolve(parsed);
        } catch(e) {
          console.log('Parse error:', e.message);
          console.log('Raw:', body);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error('Error:', e.message);
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

async function runAll() {
  console.log('===Testing 1: "שני בשש בערב שיחת וידאו" ===');
  const r1 = await runTest(testCases[0]);
  console.log('\n===Testing 2: Add another Monday event ===');
  const r2 = await runTest(testCases[0]); // Should ADD to Monday, not replace
  console.log('\n===Testing 3: Wednesday event ===');
  const r3 = await runTest(testCases[1]);
  console.log('\n===Testing 4: Multi-day schedule ===');
  const r4 = await runTest(testCases[2]);

  // Now test GET /api/schedule
  console.log('\n=== GET /api/schedule ===\n');
  http.get('http://localhost:5000/api/schedule', (res) => {
    let body = '';
    res.on('data', (c) => body += c);
    res.on('end', () => {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
      console.log('\n=== DONE ===');
    });
  });
}

runAll().catch(console.error);