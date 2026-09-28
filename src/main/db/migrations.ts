import type { DB } from './connection'

/** 순서대로 적용. 이미 배포된 항목은 절대 수정하지 말고 새 항목을 뒤에 추가한다 */
export const MIGRATIONS: ((db: DB) => void)[] = [
  (db) => {
    db.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        birth_date TEXT,
        gender TEXT CHECK (gender IN ('F', 'M')),
        purpose TEXT CHECK (purpose IN ('hobby', 'exam', 'audition', 'pro', 'other')),
        status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'ended', 'moved')),
        registered_at TEXT NOT NULL,
        vocal_range TEXT,
        preferred_music TEXT,
        pinned_note TEXT NOT NULL DEFAULT '',
        pause_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE reservations (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('scheduled', 'done', 'canceled')),
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_reservations_date ON reservations(date, time);
      CREATE INDEX idx_reservations_customer ON reservations(customer_id, date);

      CREATE TABLE lessons (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        lesson_date TEXT NOT NULL,
        memo TEXT NOT NULL DEFAULT '',
        practice TEXT,
        homework TEXT,
        deduct_pass INTEGER NOT NULL DEFAULT 1,
        reservation_id TEXT REFERENCES reservations(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_lessons_customer ON lessons(customer_id, lesson_date);

      CREATE TABLE goals (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        done_at TEXT,
        completed_lesson_id TEXT REFERENCES lessons(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_goals_customer ON goals(customer_id);

      CREATE TABLE passes (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        count INTEGER NOT NULL CHECK (count > 0),
        purchased_at TEXT NOT NULL,
        amount INTEGER,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_passes_customer ON passes(customer_id);

      CREATE TABLE status_logs (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_status_logs_customer ON status_logs(customer_id);

      CREATE TABLE customer_aliases (
        alias_id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE
      );
    `)
  }
]

export const SCHEMA_VERSION = MIGRATIONS.length

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      MIGRATIONS[version](db)
      db.pragma(`user_version = ${version + 1}`)
    })()
  }
}
