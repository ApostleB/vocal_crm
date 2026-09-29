import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BackupInfo } from '@shared/backupTypes'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { mockApi, renderWithProviders } from './render'

const backups: BackupInfo[] = [
  { fileName: 'vocal_crm_20260928_093000_before-import.db', kind: 'before-import', createdAt: '2026-09-28 09:30:00', size: 204800 },
  { fileName: 'vocal_crm_20260927_090000_auto.db', kind: 'auto', createdAt: '2026-09-27 09:00:00', size: 200000 }
]

const api = (over: Record<string, (...args: unknown[]) => unknown> = {}) =>
  mockApi({
    'settings.get': () => ({ branchName: '강남점', lessonMinutes: 60 }),
    'backup.status': () => ({ lastExternalBackupAt: '2026-08-25T01:00:00.000Z', backupCount: 2 }),
    'backup.list': () => backups,
    'app.info': () => ({ version: '0.1.0', dataDir: 'C:\\Users\\t\\AppData\\Roaming\\VOCAL_CRM' }),
    ...over
  })

describe('설정·백업', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 28, 10, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('백업 목록, 마지막 외부 백업, 데이터 폴더와 앱 버전을 보여준다', async () => {
    api()
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByText('2026-09-28 09:30:00')).toBeInTheDocument()
    expect(screen.getByText('가져오기 전')).toBeInTheDocument()
    expect(screen.getByText('자동')).toBeInTheDocument()
    expect(screen.getByText('200 KB')).toBeInTheDocument()
    expect(screen.getByText('34일 전')).toBeInTheDocument()
    expect(screen.getByText('C:\\Users\\t\\AppData\\Roaming\\VOCAL_CRM')).toBeInTheDocument()
    expect(screen.getByText('앱 버전 0.1.0')).toBeInTheDocument()
  })

  it('지금 백업 · 백업 파일 내보내기 · 데이터 폴더 열기', async () => {
    const user = userEvent.setup()
    const invoke = api({ 'backup.create': () => backups[0], 'backup.exportFile': () => ({ saved: true }) })
    renderWithProviders(<SettingsPage />)
    await user.click(await screen.findByRole('button', { name: '지금 백업' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('backup.create'))
    await user.click(screen.getByRole('button', { name: '백업 파일 내보내기' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('backup.exportFile'))
    await user.click(screen.getByRole('button', { name: '데이터 폴더 열기' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('app.openDataFolder'))
  })

  it('이 시점으로 복원은 확인한 뒤에만 요청한다', async () => {
    const user = userEvent.setup()
    const invoke = api()
    renderWithProviders(<SettingsPage />)
    await user.click(await screen.findByRole('button', { name: '2026-09-27 09:00:00 백업으로 복원' }))
    expect(await screen.findByText(/2026-09-27 09:00:00 \(자동\) 백업으로 되돌립니다/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() => expect(screen.queryByText(/백업으로 되돌립니다/)).not.toBeInTheDocument())
    expect(invoke).not.toHaveBeenCalledWith('backup.restore', expect.anything())

    await user.click(screen.getByRole('button', { name: '2026-09-27 09:00:00 백업으로 복원' }))
    await user.click(await screen.findByRole('button', { name: '복원' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('backup.restore', 'vocal_crm_20260927_090000_auto.db'))
  })

  it('백업 파일 불러오기는 확인한 뒤 파일을 고른다', async () => {
    const user = userEvent.setup()
    const invoke = api({ 'backup.importFile': () => ({ restored: false }) })
    renderWithProviders(<SettingsPage />)
    await user.click(await screen.findByRole('button', { name: '백업 파일 불러오기' }))
    await user.click(await screen.findByRole('button', { name: '파일 고르기' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('backup.importFile'))
  })

  it('백업이 없으면 안내 문구를 보여준다', async () => {
    api({ 'backup.list': () => [], 'backup.status': () => ({ lastExternalBackupAt: null, backupCount: 0 }) })
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByText('아직 백업이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('없음')).toBeInTheDocument()
  })
})
