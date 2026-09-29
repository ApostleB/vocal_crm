import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'

const dirs: string[] = []
const dbs: { open: boolean; close(): void }[] = []

/** 테스트마다 새 임시 폴더. 테스트가 끝나면 지운다 */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vocal-crm-test-'))
  dirs.push(dir)
  return dir
}

/**
 * 임시 폴더 안에서 연 DB 를 테스트가 끝날 때 닫는다.
 * Windows 는 열려 있는 파일을 지울 수 없어서, 닫지 않으면 임시 폴더 정리가 EBUSY 로 실패한다.
 */
export function closeAfterTest<T extends { open: boolean; close(): void }>(db: T): T {
  dbs.push(db)
  return db
}

afterEach(() => {
  while (dbs.length > 0) {
    const db = dbs.pop() as { open: boolean; close(): void }
    if (db.open) db.close()
  }
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true })
})
