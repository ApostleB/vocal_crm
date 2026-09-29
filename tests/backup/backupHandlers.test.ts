import { describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { AppEnv } from '@main/backup/env'
import { listBackups } from '@main/backup/backups'
import { openDatabase } from '@main/db/connection'
import { createHandlers } from '@main/ipc/handlers'
import { createCustomer } from '@main/store/customers'
import { updateSettings } from '@main/store/settings'
import { serializeVcrm } from '@shared/vcrm'
import { customerInput, NOW } from '../support/db'
import { memoryFiles } from '../support/files'
import { tempDir } from '../support/tempDir'
import { sampleFile } from '../support/vcrm'

function setup() {
  const dir = tempDir()
  const env: AppEnv & { reload: ReturnType<typeof vi.fn<() => void>>; openPath: ReturnType<typeof vi.fn<(p: string) => Promise<void>>> } = {
    version: '0.1.0',
    dataDir: dir,
    dbPath: join(dir, 'vocal_crm.db'),
    backupDir: join(dir, 'backups'),
    openPath: vi.fn(async () => {}),
    reload: vi.fn()
  }
  const db = openDatabase(env.dbPath)
  updateSettings(db, { branchName: '강남점' })
  const files = memoryFiles()
  return { dir, env, db, files, h: createHandlers(db, () => NOW, files, env) }
}

const names = (dbPath: string): string[] => {
  const db = new Database(dbPath, { readonly: true })
  const rows = db.prepare('SELECT name FROM customers ORDER BY name').pluck().all() as string[]
  db.close()
  return rows
}

describe('app / backup channels', () => {
  it('앱 정보와 데이터 폴더 열기', async () => {
    const { env, h } = setup()
    expect(await h['app.info']()).toEqual({ version: '0.1.0', dataDir: env.dataDir })
    await h['app.openDataFolder']()
    expect(env.openPath).toHaveBeenCalledWith(env.dataDir)
  })

  it('지금 백업 → 목록 → 상태', async () => {
    const { h } = setup()
    const b = await h['backup.create']()
    expect(b).toMatchObject({ kind: 'manual' })
    expect((await h['backup.list']()).map((x) => x.fileName)).toEqual([b.fileName])
    expect(await h['backup.status']()).toEqual({ lastExternalBackupAt: null, backupCount: 1 })
  })

  it('백업으로 복원하면 복원 전 백업을 남기고 DB 를 바꾼 뒤 다시 연다', async () => {
    const { env, db, h } = setup()
    const b = await h['backup.create']()
    createCustomer(db, customerInput({ name: '박서준' }), NOW)
    await h['backup.restore'](b.fileName)
    expect(env.reload).toHaveBeenCalledTimes(1)
    expect(names(env.dbPath)).toEqual([])
    expect(listBackups(env.backupDir).map((x) => x.kind).sort()).toEqual(['before-restore', 'manual'])
    expect(existsSync(`${env.dbPath}.restore-tmp`)).toBe(false)
  })

  it('목록에 없는 이름으로는 복원할 수 없다 (경로 조작 방지)', async () => {
    const { env, h } = setup()
    await expect(h['backup.restore']('../vocal_crm.db')).rejects.toThrow('백업을 찾을 수 없습니다.')
    expect(env.reload).not.toHaveBeenCalled()
  })

  it('백업 파일 내보내기: 이름 제안, 저장, 마지막 외부 백업 시각 기록', async () => {
    const { db, dir, files, h } = setup()
    createCustomer(db, customerInput(), NOW)
    expect(await h['backup.exportFile']()).toEqual({ saved: true })
    expect(files.lastDefaultName).toBe('VOCAL_CRM_백업_강남점_2026-09-28.vcrmbak')
    const out = join(dir, 'exported.vcrmbak')
    writeFileSync(out, files.store.get('/out/file') as Buffer)
    expect(names(out)).toEqual(['김민지'])
    expect(await h['backup.status']()).toMatchObject({ lastExternalBackupAt: NOW.toISOString() })
    files.nextSavePath = null
    expect(await h['backup.exportFile']()).toEqual({ saved: false })
  })

  it('백업 파일 불러오기: 검사 후 복원하고 다시 연다, 잘못된 파일이면 아무것도 바꾸지 않는다', async () => {
    const { env, db, files, h } = setup()
    createCustomer(db, customerInput(), NOW)
    await h['backup.exportFile']()
    const exported = files.store.get('/out/file') as Buffer
    createCustomer(db, customerInput({ name: '박서준' }), NOW)

    files.store.set('/in/file', Buffer.from('not a backup'))
    await expect(h['backup.importFile']()).rejects.toThrow('백업 파일을 읽을 수 없습니다.')
    expect(env.reload).not.toHaveBeenCalled()
    expect(names(env.dbPath)).toEqual(['김민지', '박서준'])

    files.store.set('/in/file', exported)
    expect(await h['backup.importFile']()).toEqual({ restored: true })
    expect(env.reload).toHaveBeenCalledTimes(1)
    expect(names(env.dbPath)).toEqual(['김민지'])
    expect(readFileSync(env.dbPath).length).toBeGreaterThan(0)
  })

  it('가져오기를 적용하기 직전에 "가져오기 전" 백업을 만든다', async () => {
    const { env, files, h } = setup()
    files.store.set('/in/file', Buffer.from(serializeVcrm(sampleFile()), 'utf-8'))
    const preview = await h['transfer.openVcrm']()
    await h['transfer.applyVcrm'](preview!.token, [{ incomingId: 'x1', action: 'new' }])
    expect(listBackups(env.backupDir).map((b) => b.kind)).toEqual(['before-import'])
  })

  it('env 가 없으면 백업 기능은 쓸 수 없다고 안내한다', async () => {
    const h = createHandlers(openDatabase(':memory:'), () => NOW)
    expect(() => h['backup.list']()).toThrow('이 기능을 쓸 수 없습니다.')
    expect(await h['backup.status']()).toEqual({ lastExternalBackupAt: null, backupCount: 0 })
  })
})
