require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

async function main() {
  const hash = await bcrypt.hash('admin123', 10);
  const { rows } = await pool.query(
    `INSERT INTO "User" (email, password_hash, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, role`,
    ['admin@example.com', hash, 'ADMIN']
  );
  console.log('Admin:', rows[0] || 'already exists');
  await pool.end();
}

main().catch(console.error);
