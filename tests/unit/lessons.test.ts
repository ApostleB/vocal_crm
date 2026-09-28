import { describe, expect, it } from 'vitest'
import { buildTimeline, numberLessons, previousHomework } from '@shared/domain/lessons'
import { makeLesson, makeStatusLog } from '../support/factories'

describe('numberLessons', () => {
  it('수업일 순으로, 같은 날이면 생성 순으로 회차를 매긴다', () => {
    const lessons = [
      makeLesson({ id: 'b', lessonDate: '2026-09-21' }),
      makeLesson({ id: 'c', lessonDate: '2026-09-28', createdAt: '2026-09-28T10:00:00.000Z' }),
      makeLesson({ id: 'a', lessonDate: '2026-09-14' }),
      makeLesson({ id: 'd', lessonDate: '2026-09-28', createdAt: '2026-09-28T09:00:00.000Z' })
    ]
    expect(numberLessons(lessons).map((l) => [l.id, l.number])).toEqual([
      ['a', 1],
      ['b', 2],
      ['d', 3],
      ['c', 4]
    ])
  })

  it('지난 수업을 끼워 넣으면 뒤 회차가 밀린다', () => {
    const before = numberLessons([
      makeLesson({ id: 'x', lessonDate: '2026-09-10' }),
      makeLesson({ id: 'y', lessonDate: '2026-09-20' })
    ])
    expect(before.find((l) => l.id === 'y')?.number).toBe(2)
    const after = numberLessons([...before, makeLesson({ id: 'z', lessonDate: '2026-09-15' })])
    expect(after.find((l) => l.id === 'y')?.number).toBe(3)
  })
})

describe('buildTimeline', () => {
  it('최신순, 같은 날짜면 나중에 만든 것이 위', () => {
    const lessons = numberLessons([
      makeLesson({ id: 'l1', lessonDate: '2026-03-02', createdAt: '2026-03-02T10:00:00.000Z' }),
      makeLesson({ id: 'l2', lessonDate: '2026-09-28', createdAt: '2026-09-28T10:00:00.000Z' })
    ])
    const logs = [
      makeStatusLog({ id: 'start', date: '2026-03-02', createdAt: '2026-03-02T09:00:00.000Z' }),
      makeStatusLog({
        id: 'end',
        date: '2026-09-28',
        fromStatus: 'active',
        toStatus: 'ended',
        createdAt: '2026-09-28T11:00:00.000Z'
      })
    ]
    const ids = buildTimeline(lessons, logs).map((e) =>
      e.kind === 'lesson' ? e.lesson.id : e.statusLog.id
    )
    expect(ids).toEqual(['end', 'l2', 'l1', 'start'])
  })
})

describe('previousHomework', () => {
  it('직전 회차 과제, 비어 있으면 null', () => {
    const lessons = numberLessons([
      makeLesson({ id: 'a', lessonDate: '2026-09-14', homework: '립트릴 5분' }),
      makeLesson({ id: 'b', lessonDate: '2026-09-21', homework: '  ' })
    ])
    expect(previousHomework(lessons)).toBeNull()
    expect(previousHomework(lessons, 2)).toBe('립트릴 5분')
    expect(previousHomework([])).toBeNull()
  })
})
