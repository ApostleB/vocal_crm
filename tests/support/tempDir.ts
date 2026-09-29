import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'

const dirs: string[] = []

/** 테스트마다 새 임시 폴더. 테스트가 끝나면 지운다 */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vocal-crm-test-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true })
})
