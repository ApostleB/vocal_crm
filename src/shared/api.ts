import type {
  Customer,
  CustomerDetail,
  CustomerInput,
  CustomerSummary,
  Goal,
  HomeData,
  Lesson,
  LessonInput,
  Pass,
  PassInput,
  Reservation,
  ReservationInput,
  ReservationWithCustomer,
  Settings,
  StatusChangeInput
} from './types'
import type { AppInfo, BackupInfo, BackupStatus } from './backupTypes'
import type { ImportDecision, ImportPreview, ImportResult, RosterPreview } from './transferTypes'

export interface ExportVcrmRequest {
  customerIds: string[]
  targetBranch: string | null
  /** 저장한 뒤 고른 고객을 '타지점 이동' 으로 바꾼다 */
  markMoved: boolean
}

/** 파일 저장 결과. 저장 창에서 취소하면 saved: false */
export interface SaveResult {
  saved: boolean
}

/** IPC 계약: 채널 이름 → 인자 튜플과 결과 타입 */
export interface ApiSpec {
  'settings.get': { args: []; result: Settings }
  'settings.update': { args: [patch: { branchName?: string; lessonMinutes?: number }]; result: Settings }

  'home.get': { args: []; result: HomeData }

  'customers.list': { args: []; result: CustomerSummary[] }
  'customers.detail': { args: [id: string]; result: CustomerDetail | null }
  'customers.create': { args: [input: CustomerInput]; result: Customer }
  'customers.update': { args: [id: string, input: CustomerInput]; result: Customer }
  'customers.setPinnedNote': { args: [id: string, note: string]; result: void }
  'customers.remove': { args: [id: string]; result: void }
  'customers.countOpenReservations': { args: [id: string]; result: number }
  'customers.changeStatus': { args: [input: StatusChangeInput]; result: { canceledReservations: number } }

  'goals.add': { args: [customerId: string, title: string]; result: Goal }
  'goals.rename': { args: [id: string, title: string]; result: void }
  'goals.setDone': { args: [id: string, done: boolean]; result: void }
  'goals.remove': { args: [id: string]; result: void }

  'lessons.save': { args: [input: LessonInput]; result: Lesson }
  'lessons.remove': { args: [id: string]; result: void }

  'passes.save': { args: [input: PassInput]; result: Pass }
  'passes.remove': { args: [id: string]; result: void }

  'reservations.range': { args: [from: string, to: string]; result: ReservationWithCustomer[] }
  'reservations.save': { args: [input: ReservationInput]; result: Reservation }
  'reservations.cancel': { args: [id: string]; result: void }

  'transfer.exportVcrm': {
    args: [request: ExportVcrmRequest]
    result: SaveResult & { count: number; moved: number; canceledReservations: number }
  }
  'transfer.openVcrm': { args: []; result: ImportPreview | null }
  'transfer.applyVcrm': { args: [token: string, decisions: ImportDecision[]]; result: ImportResult }

  'excel.exportCustomers': { args: [customerIds: string[]]; result: SaveResult }
  'excel.saveRosterTemplate': { args: []; result: SaveResult }
  'excel.openRoster': { args: []; result: RosterPreview | null }
  'excel.applyRoster': { args: [token: string, rowNumbers: number[]]; result: { added: number } }

  'app.info': { args: []; result: AppInfo }
  'app.openDataFolder': { args: []; result: void }
  'backup.status': { args: []; result: BackupStatus }
  'backup.list': { args: []; result: BackupInfo[] }
  'backup.create': { args: []; result: BackupInfo }
  /** 백업으로 되돌린 뒤 화면을 새로 불러온다 */
  'backup.restore': { args: [fileName: string]; result: void }
  'backup.exportFile': { args: []; result: SaveResult }
  /** 고른 백업 파일로 되돌린 뒤 화면을 새로 불러온다. 창에서 취소하면 restored: false */
  'backup.importFile': { args: []; result: { restored: boolean } }
}

export type Channel = keyof ApiSpec
export type ArgsOf<C extends Channel> = ApiSpec[C]['args']
export type ResultOf<C extends Channel> = ApiSpec[C]['result']

/** 채널을 빠뜨리면 컴파일 오류가 나도록 Record로 선언한다 */
const CHANNEL_MAP: Record<Channel, true> = {
  'settings.get': true,
  'settings.update': true,
  'home.get': true,
  'customers.list': true,
  'customers.detail': true,
  'customers.create': true,
  'customers.update': true,
  'customers.setPinnedNote': true,
  'customers.remove': true,
  'customers.countOpenReservations': true,
  'customers.changeStatus': true,
  'goals.add': true,
  'goals.rename': true,
  'goals.setDone': true,
  'goals.remove': true,
  'lessons.save': true,
  'lessons.remove': true,
  'passes.save': true,
  'passes.remove': true,
  'reservations.range': true,
  'reservations.save': true,
  'reservations.cancel': true,
  'transfer.exportVcrm': true,
  'transfer.openVcrm': true,
  'transfer.applyVcrm': true,
  'excel.exportCustomers': true,
  'excel.saveRosterTemplate': true,
  'excel.openRoster': true,
  'excel.applyRoster': true,
  'app.info': true,
  'app.openDataFolder': true,
  'backup.status': true,
  'backup.list': true,
  'backup.create': true,
  'backup.restore': true,
  'backup.exportFile': true,
  'backup.importFile': true
}

export const CHANNELS = Object.keys(CHANNEL_MAP) as Channel[]
