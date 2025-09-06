import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import initSqlJs from 'sql.js';

const app = express();
const PORT = process.env.PORT || 5050;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = join(DATA_DIR, 'r2r.sqlite');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '512kb' }));
app.use(cookieParser());

// sql.js setup (pure JS, persisted to a file)
let SQL; // module instance
let db;  // Database instance

async function initDb() {
  // In Node we must provide locateFile so sql.js can find the wasm
  SQL = await initSqlJs({
    locateFile: (file) => join(__dirname, 'node_modules', 'sql.js', 'dist', file),
  });

  if (existsSync(DB_PATH)) {
    const filebuffer = readFileSync(DB_PATH);
    db = new SQL.Database(filebuffer);
  } else {
    db = new SQL.Database();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes (
      workspace_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      text TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(workspace_id, node_id)
    );
  `);

  persistDb();
}

function persistDb() {
  // Export the database to a file
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

// Minimal helpers to mirror sqlite3's API from earlier
const dbPromise = (async () => {
  if (!db) {
    await initDb();
  }
  return {
    exec: async (sql) => {
      db.exec(sql);
      // No persistence needed for read-only; this helper is not used for SELECTs in our code
      return;
    },
    run: async (sql, ...params) => {
      const stmt = db.prepare(sql);
      stmt.run(params);
      stmt.free();
      // Persist after any mutation
      persistDb();
      // sql.js doesn't return changes/lastID easily; return a stub
      return { changes: 1, lastID: undefined };
    },
    get: async (sql, ...params) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const hasRow = stmt.step();
      const row = hasRow ? stmt.getAsObject() : undefined;
      stmt.free();
      return row;
    },
    all: async (sql, ...params) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    },
  };
})();

// Simple id generator (no uuid dep needed)
const rid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// Auth (JWT in httpOnly cookie)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
function setAuthCookie(res, token){ res.cookie('r2rauth', token, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000*60*60*24*7 }); }
function clearAuthCookie(res){ res.clearCookie('r2rauth'); }
function authMiddleware(req, res, next){
  const token = req.cookies?.r2rauth || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if(!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { return res.status(401).json({ error: 'Unauthorized' }); }
}

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if(!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const db = await dbPromise;
  try {
    const id = rid();
    const hash = await bcrypt.hash(password, 10);
  await db.run('INSERT INTO users(id,email,name,password_hash,created_at) VALUES(?,?,?,?,?)', id, String(email).trim().toLowerCase(), name||null, hash, Date.now());
    const token = jwt.sign({ sub: id, email: String(email).trim().toLowerCase() }, JWT_SECRET, { expiresIn: '7d' });
    setAuthCookie(res, token);
    res.status(201).json({ id, email, name: name||null });
  } catch (e) {
    if(String(e.message||'').includes('UNIQUE')) return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Registration failed' });
  }
});
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const db = await dbPromise;
  const row = await db.get('SELECT * FROM users WHERE email = ?', String(email).trim().toLowerCase());
  if(!row) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, row.password_hash);
  if(!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ sub: row.id, email: row.email }, JWT_SECRET, { expiresIn: '7d' });
  setAuthCookie(res, token);
  res.json({ id: row.id, email: row.email, name: row.name });
});
app.post('/api/auth/logout', (req, res)=>{ clearAuthCookie(res); res.json({ ok: true }); });
app.get('/api/auth/me', authMiddleware, (req, res)=>{ res.json({ id: req.user.sub, email: req.user.email }); });

// Workspaces CRUD (no auth required to fit current UX; attach authMiddleware if needed)
app.get('/api/workspaces', async (req, res) => {
  const db = await dbPromise;
  const rows = await db.all('SELECT id, name, created_at as createdAt FROM workspaces ORDER BY name');
  res.json(rows);
});
app.post('/api/workspaces', async (req, res) => {
  const { name } = req.body || {};
  if (!name || String(name).trim() === '') return res.status(400).json({ error: 'Name required' });
  const db = await dbPromise;
  try {
    const id = rid();
    await db.run('INSERT INTO workspaces(id,name,created_at) VALUES(?,?,?)', id, String(name).trim(), Date.now());
    res.status(201).json({ id, name: String(name).trim(), createdAt: Date.now() });
  } catch(e){
    if(String(e.message||'').includes('UNIQUE')) return res.status(409).json({ error: 'Workspace already exists' });
    res.status(500).json({ error: 'Create failed' });
  }
});
app.patch('/api/workspaces/:id', async (req, res) => {
  const { id } = req.params; const { name } = req.body || {};
  if (!name || String(name).trim() === '') return res.status(400).json({ error: 'Name required' });
  const db = await dbPromise;
  const conflict = await db.get('SELECT 1 FROM workspaces WHERE name = ? AND id <> ?', String(name).trim(), id);
  if (conflict) return res.status(409).json({ error: 'Workspace name already used' });
  const result = await db.run('UPDATE workspaces SET name = ? WHERE id = ?', String(name).trim(), id);
  // sql.js doesn't report changes; fetch to verify
  const row = await db.get('SELECT id FROM workspaces WHERE id = ?', id);
  if(!row) return res.status(404).json({ error: 'Not found' });
  res.json({ id, name: String(name).trim() });
});
app.delete('/api/workspaces/:id', async (req, res) => {
  const { id } = req.params; const db = await dbPromise;
  await db.run('DELETE FROM workspaces WHERE id = ?', id);
  const row = await db.get('SELECT id FROM workspaces WHERE id = ?', id);
  if(row) return res.status(500).json({ error: 'Delete failed' });
  await db.run('DELETE FROM notes WHERE workspace_id = ?', id);
  res.json({ ok: true });
});

// Notes API
// GET notes for a workspace
app.get('/api/workspaces/:id/notes', async (req, res) => {
  const { id } = req.params; const db = await dbPromise;
  const ws = await db.get('SELECT 1 FROM workspaces WHERE id = ?', id);
  if(!ws) return res.status(404).json({ error: 'Workspace not found' });
  const rows = await db.all('SELECT node_id as nodeId, text FROM notes WHERE workspace_id = ?', id);
  const out = {}; rows.forEach(r => { out[r.nodeId] = r.text || ''; });
  res.json(out);
});
// PUT set a node's note in a workspace
app.put('/api/workspaces/:id/notes/:nodeId', async (req, res) => {
  const { id, nodeId } = req.params; const { text } = req.body || {};
  const db = await dbPromise;
  const ws = await db.get('SELECT 1 FROM workspaces WHERE id = ?', id);
  if(!ws) return res.status(404).json({ error: 'Workspace not found' });
  const now = Date.now();
  if(text && String(text).trim() !== ''){
    await db.run('INSERT INTO notes(workspace_id,node_id,text,updated_at) VALUES(?,?,?,?) ON CONFLICT(workspace_id,node_id) DO UPDATE SET text=excluded.text, updated_at=excluded.updated_at', id, nodeId, String(text), now);
  } else {
    await db.run('DELETE FROM notes WHERE workspace_id = ? AND node_id = ?', id, nodeId);
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`R2R API server running on http://localhost:${PORT}`);
});
