import { z } from 'zod'
import { AppError } from './result'

/** .vcrm 파일 형식 (설계 6장). 필드를 바꾸면 VCRM_VERSION 을 올리고 이전 버전 읽기를 유지한다 */
export const VCRM_FORMAT = 'vocal-crm'
export const VCRM_VERSION = 1

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const status = z.enum(['active', 'paused', 'ended', 'moved'])

const customerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().nullable(),
  birthDate: date.nullable(),
  gender: z.enum(['F', 'M']).nullable(),
  purpose: z.enum(['hobby', 'exam', 'audition', 'pro', 'other']).nullable(),
  status,
  registeredAt: date,
  vocalRange: z.string().nullable(),
  preferredMusic: z.string().nullable(),
  pinnedNote: z.string(),
  pauseUntil: date.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})

const goalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  doneAt: date.nullable(),
  completedLessonId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})

const lessonSchema = z.object({
  id: z.string().min(1),
  lessonDate: date,
  memo: z.string(),
  practice: z.string().nullable(),
  homework: z.string().nullable(),
  deductPass: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

const passSchema = z.object({
  id: z.string().min(1),
  count: z.number().int().positive(),
  purchasedAt: date,
  amount: z.number().int().nonnegative().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})

const statusLogSchema = z.object({
  id: z.string().min(1),
  date,
  fromStatus: status.nullable(),
  toStatus: status,
  reason: z.string().nullable(),
  createdAt: z.string()
})

const entrySchema = z.object({
  customer: customerSchema,
  aliases: z.array(z.string().min(1)),
  goals: z.array(goalSchema),
  lessons: z.array(lessonSchema),
  passes: z.array(passSchema),
  statusLogs: z.array(statusLogSchema)
})

const fileSchema = z.object({
  format: z.literal(VCRM_FORMAT),
  version: z.number().int().positive(),
  exportedAt: z.string(),
  sourceBranch: z.string(),
  targetBranch: z.string().nullable(),
  customers: z.array(entrySchema)
})

export type VcrmFile = z.infer<typeof fileSchema>
export type VcrmEntry = z.infer<typeof entrySchema>
export type VcrmGoal = z.infer<typeof goalSchema>
export type VcrmLesson = z.infer<typeof lessonSchema>

const invalid = (): AppError => new AppError('VCRM_INVALID', '이 파일은 읽을 수 없습니다.')

/** 파일 내용을 검증해 읽는다. 형식이 틀리면 VCRM_INVALID, 더 새 버전이면 VCRM_TOO_NEW */
export function parseVcrm(text: string): VcrmFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw invalid()
  }
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== VCRM_FORMAT) {
    throw invalid()
  }
  const version = (raw as { version?: unknown }).version
  if (typeof version === 'number' && version > VCRM_VERSION) {
    throw new AppError('VCRM_TOO_NEW', '새 버전 앱에서 만든 파일입니다. 앱을 새 버전으로 바꿔 주세요.')
  }
  const parsed = fileSchema.safeParse(raw)
  if (!parsed.success) throw invalid()
  return parsed.data
}

export function serializeVcrm(file: VcrmFile): string {
  return JSON.stringify(file, null, 2)
}
