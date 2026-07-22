const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = 'H1bOX6UdHgJAsh3iQuKZR3JEhgzBiGfS';
const SUPABASE_API = 'https://supabase.appbr.pro';
const PROJECT_REF = 'default';

async function deploy() {
  // Generate admin JWT
  const now = Math.floor(Date.now() / 1000);
  const adminToken = jwt.sign(
    {
      iss: 'supabase',
      iat: now,
      exp: now + 3600,
      role: 'supabase_admin',
    },
    JWT_SECRET,
    { algorithm: 'HS256' }
  );

  console.log('Admin JWT generated');

  // Read function code
  const codePath = path.join(__dirname, 'send-notification', 'index.ts');
  const code = fs.readFileSync(codePath, 'utf8');
  console.log(`Code length: ${code.length} bytes`);

  // Deploy via Management API
  const url = `${SUPABASE_API}/api/v1/projects/${PROJECT_REF}/functions/send-notification/deploy`;
  console.log(`Deploying to: ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'send-notification',
      body: code,
      verify_jwt: false,
    }),
  });

  const result = await response.text();
  console.log(`Status: ${response.status}`);
  console.log(`Response: ${result}`);

  if (response.ok) {
    console.log('DEPLOY SUCCESSFUL!');
  } else {
    console.error('DEPLOY FAILED!');
    process.exit(1);
  }
}

deploy().catch(console.error);
