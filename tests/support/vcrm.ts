import { VCRM_VERSION, type VcrmFile } from '@shared/vcrm'
import { makeCustomer } from './factories'

const TS = '2026-09-01T00:00:00.000Z'

export function sampleFile(): VcrmFile {
  return {
    format: 'vocal-crm',
    version: VCRM_VERSION,
    exportedAt: '2026-09-28T06:00:00.000Z',
    sourceBranch: '홍대점',
    targetBranch: '강남점',
    customers: [
      {
        customer: makeCustomer({ id: 'x1', name: '김민지', pinnedNote: '성대결절 이력' }),
        aliases: ['old-1'],
        goals: [{ id: 'g1', title: '두성 연결', doneAt: '2026-09-21', completedLessonId: 'l1', createdAt: TS, updatedAt: TS }],
        lessons: [
          {
            id: 'l1',
            lessonDate: '2026-09-21',
            memo: '메모',
            practice: null,
            homework: '립트릴',
            deductPass: true,
            createdAt: TS,
            updatedAt: TS
          }
        ],
        passes: [{ id: 'p1', count: 10, purchasedAt: '2026-09-01', amount: 550000, note: null, createdAt: TS, updatedAt: TS }],
        statusLogs: [{ id: 's1', date: '2026-03-02', fromStatus: null, toStatus: 'active', reason: null, createdAt: TS }]
      }
    ]
  }
}
