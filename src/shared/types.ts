export type CustomerStatus = 'active' | 'paused' | 'ended' | 'moved'
export type Purpose = 'hobby' | 'exam' | 'audition' | 'pro' | 'other'
export type Gender = 'F' | 'M'
export type ReservationStatus = 'scheduled' | 'done' | 'canceled'

export interface Customer {
  id: string
  name: string
  phone: string | null
  birthDate: string | null
  gender: Gender | null
  purpose: Purpose | null
  status: CustomerStatus
  registeredAt: string
  vocalRange: string | null
  preferredMusic: string | null
  pinnedNote: string
  pauseUntil: string | null
  createdAt: string
  updatedAt: string
}

export interface Goal {
  id: string
  customerId: string
  title: string
  doneAt: string | null
  completedLessonId: string | null
  createdAt: string
  updatedAt: string
}

export interface Lesson {
  id: string
  customerId: string
  lessonDate: string
  memo: string
  practice: string | null
  homework: string | null
  deductPass: boolean
  reservationId: string | null
  createdAt: string
  updatedAt: string
}

export interface Pass {
  id: string
  customerId: string
  count: number
  purchasedAt: string
  amount: number | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface Reservation {
  id: string
  customerId: string
  date: string
  time: string
  status: ReservationStatus
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface StatusLog {
  id: string
  customerId: string
  date: string
  fromStatus: CustomerStatus | null
  toStatus: CustomerStatus
  reason: string | null
  createdAt: string
}

export interface Settings {
  branchName: string | null
  lessonMinutes: number
}

/** 고객 등록·수정 창에서 보내는 값 */
export interface CustomerInput {
  name: string
  phone: string | null
  birthDate: string | null
  gender: Gender | null
  purpose: Purpose | null
  registeredAt: string
  vocalRange: string | null
  preferredMusic: string | null
  pinnedNote: string
}

/** 수업 기록 창에서 보내는 값. id가 있으면 수정 */
export interface LessonInput {
  id?: string
  customerId: string
  lessonDate: string
  memo: string
  practice: string | null
  homework: string | null
  deductPass: boolean
  reservationId: string | null
  completedGoalIds: string[]
}

/** 예약 창에서 보내는 값. id가 있으면 수정 */
export interface ReservationInput {
  id?: string
  customerId: string
  date: string
  time: string
  note: string | null
}

export interface PassInput {
  id?: string
  customerId: string
  count: number
  purchasedAt: string
  amount: number | null
  note: string | null
}

export interface StatusChangeInput {
  customerId: string
  toStatus: CustomerStatus
  date: string
  reason: string | null
  pauseUntil: string | null
}

/** 홈 표와 고객 선택에 쓰는 고객 요약 */
export interface CustomerSummary {
  id: string
  name: string
  phone: string | null
  purpose: Purpose | null
  status: CustomerStatus
  pinnedNote: string
  goalsDone: number
  goalsTotal: number
  lessonCount: number
  lastLessonDate: string | null
  nextReservation: { date: string; time: string } | null
  remainingPasses: number | null
}

export interface ReservationWithCustomer {
  reservation: Reservation
  customerName: string
  hasPinnedNote: boolean
  /** 아직 기록 안 된 예약이면 이번에 기록될 회차, 기록 완료·취소면 null */
  lessonNumber: number | null
  remainingPasses: number | null
}

export interface HomeData {
  today: string
  stats: { active: number; today: number; unbooked: number; passExhausted: number }
  todayReservations: ReservationWithCustomer[]
  missedReservations: ReservationWithCustomer[]
  unbooked: { id: string; name: string; lastLessonDate: string | null }[]
  customers: CustomerSummary[]
}

export interface NumberedLesson extends Lesson {
  number: number
}

export type TimelineEntry =
  | { kind: 'lesson'; date: string; createdAt: string; lesson: NumberedLesson }
  | { kind: 'status'; date: string; createdAt: string; statusLog: StatusLog }

export interface CustomerDetail {
  customer: Customer
  goals: Goal[]
  lessons: NumberedLesson[]
  timeline: TimelineEntry[]
  passes: Pass[]
  totalPassCount: number
  remainingPasses: number | null
  nextReservation: Reservation | null
}
