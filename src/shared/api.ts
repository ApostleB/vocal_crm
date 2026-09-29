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
  'reservations.cancel': true
}

export const CHANNELS = Object.keys(CHANNEL_MAP) as Channel[]
