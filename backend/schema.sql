CREATE TABLE IF NOT EXISTS "User" (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'VIEWER',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "Session" (
  id         TEXT PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS "Category" (
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  parent_id INT REFERENCES "Category"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "Tag" (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS "ContentType" (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS "FieldDefinition" (
  id              SERIAL PRIMARY KEY,
  content_type_id INT NOT NULL REFERENCES "ContentType"(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  type            TEXT NOT NULL,
  required        BOOLEAN NOT NULL DEFAULT FALSE,
  options         JSONB NOT NULL DEFAULT '[]',
  sort_order      INT NOT NULL DEFAULT 0,
  UNIQUE (content_type_id, key)
);

CREATE TABLE IF NOT EXISTS "Entry" (
  id              SERIAL PRIMARY KEY,
  content_type_id INT NOT NULL REFERENCES "ContentType"(id) ON DELETE CASCADE,
  category_id     INT REFERENCES "Category"(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  data            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entry_data_gin ON "Entry" USING GIN (data);

CREATE TABLE IF NOT EXISTS "EntryTag" (
  entry_id INT NOT NULL REFERENCES "Entry"(id) ON DELETE CASCADE,
  tag_id   INT NOT NULL REFERENCES "Tag"(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, tag_id)
);
