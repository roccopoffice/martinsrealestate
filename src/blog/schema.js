export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_employee ON sessions(employee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    email TEXT,
    success INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip, created_at)`,
  `CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    r2_key TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    alt TEXT NOT NULL DEFAULT '',
    caption TEXT NOT NULL DEFAULT '',
    uploaded_by TEXT REFERENCES employees(id),
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    template TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
    author_id TEXT REFERENCES employees(id),
    author_name TEXT NOT NULL DEFAULT '',
    author_title TEXT NOT NULL DEFAULT '',
    author_bio TEXT NOT NULL DEFAULT '',
    featured_media_id TEXT REFERENCES media(id),
    seo_title TEXT NOT NULL DEFAULT '',
    seo_description TEXT NOT NULL DEFAULT '',
    og_image_id TEXT REFERENCES media(id),
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_posts_status_published ON posts(status, published_at)`,
  `CREATE INDEX IF NOT EXISTS idx_posts_updated ON posts(updated_at)`,
  `CREATE TABLE IF NOT EXISTS post_blocks (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_post_blocks_post ON post_blocks(post_id, position)`,
  `CREATE TABLE IF NOT EXISTS article_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    viewed_on TEXT NOT NULL,
    visitor_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (post_id, viewed_on, visitor_hash)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_views_post_day ON article_views(post_id, viewed_on)`
];

export async function applySchema(db) {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.prepare(statement).run();
  }
}
