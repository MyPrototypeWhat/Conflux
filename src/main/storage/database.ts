import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'

const DB_FILE_NAME = 'conflux.db'
const SCHEMA_VERSION = 1

export class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private db: Database.Database | null = null
  private dbPath: string

  private constructor() {
    const userDataPath = app.getPath('userData')
    const dataDir = path.join(userDataPath, 'data')

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    this.dbPath = path.join(dataDir, DB_FILE_NAME)
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  /**
   * Initialize database connection and run migrations
   */
  initialize(): void {
    if (this.db) {
      return
    }

    console.log('[Database] Opening database at:', this.dbPath)

    this.db = new Database(this.dbPath)

    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL')

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON')

    // Run migrations
    this.runMigrations()

    console.log('[Database] Initialized successfully')
  }

  /**
   * Get database instance
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.db
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      console.log('[Database] Closing database')
      this.db.close()
      this.db = null
    }
  }

  /**
   * Run database migrations
   */
  private runMigrations(): void {
    if (!this.db) return

    // Create migrations table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `)

    // Get current version
    const row = this.db.prepare('SELECT MAX(version) as version FROM _migrations').get() as {
      version: number | null
    }
    const currentVersion = row?.version ?? 0

    console.log('[Database] Current schema version:', currentVersion)

    // Run pending migrations
    if (currentVersion < SCHEMA_VERSION) {
      console.log('[Database] Running migrations...')
      this.migrate(currentVersion)
    }
  }

  /**
   * Execute migrations from current version to target version
   */
  private migrate(fromVersion: number): void {
    if (!this.db) return

    const migrations: Record<number, () => void> = {
      1: () => this.migration_001_initial(),
    }

    const transaction = this.db.transaction(() => {
      for (let v = fromVersion + 1; v <= SCHEMA_VERSION; v++) {
        const migration = migrations[v]
        if (migration) {
          console.log(`[Database] Applying migration v${v}`)
          migration()
          this.db!.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)').run(
            v,
            Date.now()
          )
        }
      }
    })

    transaction()
    console.log('[Database] Migrations completed')
  }

  /**
   * Migration v1: Initial schema
   */
  private migration_001_initial(): void {
    if (!this.db) return

    // Config table (key-value store for settings)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    // Sessions table (placeholder - will be refined later)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        title TEXT,
        working_dir TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT
      )
    `)

    // Create index for sessions
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
    `)

    // Messages table (placeholder - structure to be discussed)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)

    // Create index for messages
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
    `)
  }

  /**
   * Get database file path
   */
  getDbPath(): string {
    return this.dbPath
  }
}

// Export singleton getter
export function getDatabase(): Database.Database {
  return DatabaseManager.getInstance().getDatabase()
}

export function initializeDatabase(): void {
  DatabaseManager.getInstance().initialize()
}

export function closeDatabase(): void {
  DatabaseManager.getInstance().close()
}
