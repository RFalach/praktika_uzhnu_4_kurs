require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const pool = require('./db');
const auth = require('./auth');

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(auth.authMiddleware);

// ============ AUTH ============
app.post('/api/auth/login', auth.login);
app.post('/api/auth/logout', auth.logout);
app.get('/api/auth/me', auth.me);

// ============ CATEGORIES ============
app.get('/api/categories', auth.requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM "Category" ORDER BY name ASC'
  );
  res.json(rows);
});

app.post('/api/categories', auth.requireRole('ADMIN'), async (req, res) => {
  const { name, parentId } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const { rows } = await pool.query(
    'INSERT INTO "Category" (name, parent_id) VALUES ($1, $2) RETURNING *',
    [name, parentId ?? null]
  );
  res.status(201).json(rows[0]);
});

app.patch('/api/categories/:id', auth.requireRole('ADMIN'), async (req, res) => {
  const { name, parentId } = req.body;
  const { rows } = await pool.query(
    'UPDATE "Category" SET name = COALESCE($1, name), parent_id = $2 WHERE id = $3 RETURNING *',
    [name ?? null, parentId ?? null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

app.delete('/api/categories/:id', auth.requireRole('ADMIN'), async (req, res) => {
  await pool.query('DELETE FROM "Category" WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ============ TAGS ============
app.get('/api/tags', auth.requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM "Tag" ORDER BY name ASC');
  res.json(rows);
});

app.post('/api/tags', auth.requireRole('ADMIN'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const { rows } = await pool.query(
    'INSERT INTO "Tag" (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
    [name]
  );
  res.status(201).json(rows[0]);
});

app.delete('/api/tags/:id', auth.requireRole('ADMIN'), async (req, res) => {
  await pool.query('DELETE FROM "Tag" WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ============ CONTENT TYPES ============
app.get('/api/content-types', auth.requireAuth, async (req, res) => {
  const { rows: types } = await pool.query(
    'SELECT * FROM "ContentType" ORDER BY name ASC'
  );

  const { rows: fields } = await pool.query(
    'SELECT * FROM "FieldDefinition" ORDER BY sort_order ASC'
  );

  const result = types.map((t) => ({
    ...t,
    fields: fields.filter((f) => f.content_type_id === t.id),
  }));

  res.json(result);
});

app.post('/api/content-types', auth.requireRole('ADMIN'), async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' });

  const { rows } = await pool.query(
    'INSERT INTO "ContentType" (name, slug) VALUES ($1, $2) RETURNING *',
    [name, slug]
  );
  res.status(201).json(rows[0]);
});

app.delete('/api/content-types/:id', auth.requireRole('ADMIN'), async (req, res) => {
  await pool.query('DELETE FROM "ContentType" WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ============ FIELD DEFINITIONS ============
app.post('/api/content-types/:id/fields', auth.requireRole('ADMIN'), async (req, res) => {
  const { key, label, type, required, options } = req.body;
  if (!key || !label || !type) {
    return res.status(400).json({ error: 'key, label, type required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO "FieldDefinition"
     (content_type_id, key, label, type, required, options)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [req.params.id, key, label, type, !!required, JSON.stringify(options ?? [])]
  );
  res.status(201).json(rows[0]);
});

app.delete('/api/fields/:id', auth.requireRole('ADMIN'), async (req, res) => {
  await pool.query('DELETE FROM "FieldDefinition" WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ============ ENTRIES ============
app.get('/api/entries', auth.requireAuth, async (req, res) => {
  const { contentTypeId, categoryId, tagId, q } = req.query;

  const conditions = [];
  const params = [];
  let i = 1;

  if (contentTypeId) {
    conditions.push(`e.content_type_id = $${i++}`);
    params.push(Number(contentTypeId));
  }
  if (categoryId) {
    conditions.push(`e.category_id = $${i++}`);
    params.push(Number(categoryId));
  }
  if (q) {
    conditions.push(`e.title ILIKE $${i++}`);
    params.push(`%${q}%`);
  }
  if (tagId) {
    conditions.push(`EXISTS (
      SELECT 1 FROM "EntryTag" et
      WHERE et.entry_id = e.id AND et.tag_id = $${i++}
    )`);
    params.push(Number(tagId));
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT e.*,
       COALESCE(
         (SELECT json_agg(json_build_object('id', t.id, 'name', t.name))
          FROM "EntryTag" et
          JOIN "Tag" t ON t.id = et.tag_id
          WHERE et.entry_id = e.id),
         '[]'
       ) AS tags
     FROM "Entry" e
     ${where}
     ORDER BY e.created_at DESC`,
    params
  );

  res.json(rows);
});

app.get('/api/entries/:id', auth.requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.*,
       COALESCE(
         (SELECT json_agg(json_build_object('id', t.id, 'name', t.name))
          FROM "EntryTag" et
          JOIN "Tag" t ON t.id = et.tag_id
          WHERE et.entry_id = e.id),
         '[]'
       ) AS tags
     FROM "Entry" e
     WHERE e.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

app.post('/api/entries', auth.requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { contentTypeId, categoryId, title, data, tagIds } = req.body;
  if (!contentTypeId || !title) {
    return res.status(400).json({ error: 'contentTypeId and title required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO "Entry" (content_type_id, category_id, title, data)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [contentTypeId, categoryId ?? null, title, JSON.stringify(data ?? {})]
    );
    const entry = rows[0];

    for (const tagId of tagIds ?? []) {
      await client.query(
        'INSERT INTO "EntryTag" (entry_id, tag_id) VALUES ($1, $2)',
        [entry.id, tagId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(entry);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

app.patch('/api/entries/:id', auth.requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  const { categoryId, title, data, tagIds } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE "Entry"
       SET category_id = COALESCE($1, category_id),
           title = COALESCE($2, title),
           data = COALESCE($3, data),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        categoryId ?? null,
        title ?? null,
        data ? JSON.stringify(data) : null,
        req.params.id,
      ]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }

    if (tagIds) {
      await client.query('DELETE FROM "EntryTag" WHERE entry_id = $1', [req.params.id]);
      for (const tagId of tagIds) {
        await client.query(
          'INSERT INTO "EntryTag" (entry_id, tag_id) VALUES ($1, $2)',
          [req.params.id, tagId]
        );
      }
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

app.delete('/api/entries/:id', auth.requireRole('ADMIN', 'EDITOR'), async (req, res) => {
  await pool.query('DELETE FROM "Entry" WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ============ START ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server on http://localhost:${PORT}`);
});
