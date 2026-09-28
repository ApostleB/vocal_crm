import type { NumberedLesson, StatusLog, TimelineEntry } from '../types'

/** 수업일 → 생성 시각 순으로 정렬해 1부터 회차를 매긴다 (오름차순으로 돌려준다) */
export function numberLessons<T extends { lessonDate: string; createdAt: string }>(
  lessons: T[]
): (T & { number: number })[] {
  const sorted = [...lessons].sort(
    (a, b) => a.lessonDate.localeCompare(b.lessonDate) || a.createdAt.localeCompare(b.createdAt)
  )
  return sorted.map((lesson, i) => ({ ...lesson, number: i + 1 }))
}

/** 회차 기록과 상태 이력을 최신순으로 섞는다. 같은 날짜면 나중에 만든 것이 위 */
export function buildTimeline(lessons: NumberedLesson[], logs: StatusLog[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...lessons.map(
      (lesson): TimelineEntry => ({
        kind: 'lesson',
        date: lesson.lessonDate,
        createdAt: lesson.createdAt,
        lesson
      })
    ),
    ...logs.map(
      (statusLog): TimelineEntry => ({
        kind: 'status',
        date: statusLog.date,
        createdAt: statusLog.createdAt,
        statusLog
      })
    )
  ]
  return entries.sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  )
}

/** 직전 회차의 과제 (비어 있으면 null) */
export function previousHomework(lessonsAscending: NumberedLesson[], beforeNumber?: number): string | null {
  const candidates =
    beforeNumber === undefined
      ? lessonsAscending
      : lessonsAscending.filter((l) => l.number < beforeNumber)
  const last = candidates[candidates.length - 1]
  const homework = last?.homework?.trim()
  return homework ? homework : null
}
