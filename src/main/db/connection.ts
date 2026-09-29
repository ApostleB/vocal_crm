import Database from 'better-sqlite3'
import { migrate } from './migrations'

export type DB = Database.Database

/**
 * DB 파일을 열고(없으면 만들고) 마이그레이션까지 적용한다. 테스트는 ':memory:'.
 * 실패하면 파일을 닫고 오류를 다시 던진다 (열린 채로 두면 Windows 에서 손상 파일을 옮길 수 없다)
 */
export function openDatabase(filename: string): DB {
  const db = new Database(filename)
  try {
    db.pragma('foreign_keys = ON')
    migrate(db)
  } catch (err) {
    db.close()
    throw err
  }
  return db
}

/** SQLite 무결성 검사 결과가 ok 인지 */
export function checkIntegrity(db: DB): boolean {
  return db.pragma('integrity_check', { simple: true }) === 'ok'
}
