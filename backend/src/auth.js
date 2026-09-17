require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('./db');

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM "User" WHERE email = $1',
    [email]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.query(
    'INSERT INTO "Session" (id, user_id, expires_at) VALUES ($1, $2, $3)',
    [sessionId, user.id, expiresAt]
  );

  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    expires: expiresAt,
  });
  res.json({ id: user.id, email: user.email, role: user.role });
}

async function logout(req, res) {
  const sessionId = req.cookies.sessionId;
  if (sessionId) {
    await pool.query('DELETE FROM "Session" WHERE id = $1', [sessionId]);
  }
  res.clearCookie('sessionId');
  res.json({ ok: true });
}

async function me(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ id: req.user.id, email: req.user.email, role: req.user.role });
}

async function authMiddleware(req, res, next) {
  const sessionId = req.cookies.sessionId;
  if (!sessionId) return next();

  const { rows } = await pool.query(
    `SELECT u.* FROM "Session" s
     JOIN "User" u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > NOW()`,
    [sessionId]
  );

  if (rows[0]) req.user = rows[0];
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { login, logout, me, authMiddleware, requireAuth, requireRole };
