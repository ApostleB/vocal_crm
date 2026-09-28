import Database from 'better-sqlite3'
import { migrate } from './migrations'

export type DB = Database.Database

/** DB 파일을 열고(없으면 만들고) 마이그레이션까지 적용한다. 테스트는 ':memory:' */
export function openDatabase(filename: string): DB {
  const db = new Database(filename)
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}
