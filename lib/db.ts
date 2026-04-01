import Database from 'better-sqlite3'
import path from 'path'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = path.join(process.cwd(), 'vcc_insurance.db')
  db = new Database(dbPath)

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  initSchema(db)
  return db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subcontractors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      trade TEXT,
      tier TEXT CHECK(tier IN ('primary', 'second')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sub_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewing', 'approved', 'rejected')),
      uploaded_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT,
      reviewer_notes TEXT,
      FOREIGN KEY (sub_id) REFERENCES subcontractors(id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      doc_type TEXT CHECK(doc_type IN ('accord25', 'policy')),
      filename TEXT,
      filepath TEXT,
      extracted_text TEXT,
      processed_at TEXT,
      FOREIGN KEY (submission_id) REFERENCES submissions(id)
    );

    CREATE TABLE IF NOT EXISTS ai_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER UNIQUE NOT NULL,
      cg_numbers TEXT DEFAULT '[]',
      limits_found TEXT DEFAULT '{}',
      limits_met INTEGER DEFAULT 0,
      issues TEXT DEFAULT '[]',
      flags TEXT DEFAULT '[]',
      raw_response TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (submission_id) REFERENCES submissions(id)
    );

    CREATE TABLE IF NOT EXISTS reviewer_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      flag_type TEXT,
      description TEXT,
      severity TEXT CHECK(severity IN ('low', 'medium', 'high')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (submission_id) REFERENCES submissions(id)
    );

    CREATE TABLE IF NOT EXISTS schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade TEXT NOT NULL,
      gl_per_occurrence INTEGER,
      gl_aggregate INTEGER,
      workers_comp INTEGER,
      auto_liability INTEGER,
      umbrella INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      severity TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  // Seed schedule if empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM schedule').get() as { cnt: number }
  if (count.cnt === 0) {
    const insert = db.prepare(`
      INSERT INTO schedule (trade, gl_per_occurrence, gl_aggregate, workers_comp, auto_liability, umbrella, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run('General Contractor', 1000000, 2000000, 1000000, 1000000, 5000000, 'Standard GC requirements')
    insert.run('Electrical', 1000000, 2000000, 500000, 1000000, 2000000, 'Electrical subcontractor requirements')
    insert.run('Plumbing', 1000000, 2000000, 500000, 1000000, 2000000, 'Plumbing subcontractor requirements')
  }
}

export default getDb
