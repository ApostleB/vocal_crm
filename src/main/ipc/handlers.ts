import type { ArgsOf, Channel, ResultOf } from '@shared/api'
import { toDateString } from '@shared/domain/dates'
import type { DB } from '../db/connection'
import { createCustomer, deleteCustomer, setPinnedNote, updateCustomer } from '../store/customers'
import { addGoal, deleteGoal, renameGoal, setGoalDone } from '../store/goals'
import { deleteLesson, saveLesson } from '../store/lessons'
import { deletePass, savePass } from '../store/passes'
import { getCustomerDetail, getHome, listReservationsInRange, listSummaries } from '../store/queries'
import { cancelReservation, saveReservation } from '../store/reservations'
import { getSettings, updateSettings } from '../store/settings'
import { changeStatus, countOpenReservations } from '../store/status'

export type Handlers = {
  [C in Channel]: (...args: ArgsOf<C>) => ResultOf<C> | Promise<ResultOf<C>>
}

/** 채널별 처리 함수. clock 은 테스트에서 시각을 고정하기 위한 것 */
export function createHandlers(db: DB, clock: () => Date = () => new Date()): Handlers {
  const today = (): string => toDateString(clock())
  return {
    'settings.get': () => getSettings(db),
    'settings.update': (patch) => updateSettings(db, patch),

    'home.get': () => getHome(db, today()),

    'customers.list': () => listSummaries(db, today()),
    'customers.detail': (id) => getCustomerDetail(db, id, today()),
    'customers.create': (input) => createCustomer(db, input, clock()),
    'customers.update': (id, input) => updateCustomer(db, id, input, clock()),
    'customers.setPinnedNote': (id, note) => setPinnedNote(db, id, note, clock()),
    'customers.remove': (id) => deleteCustomer(db, id),
    'customers.countOpenReservations': (id) => countOpenReservations(db, id),
    'customers.changeStatus': (input) => changeStatus(db, input, clock()),

    'goals.add': (customerId, title) => addGoal(db, customerId, title, clock()),
    'goals.rename': (id, title) => renameGoal(db, id, title, clock()),
    'goals.setDone': (id, done) => setGoalDone(db, id, done, today(), clock()),
    'goals.remove': (id) => deleteGoal(db, id),

    'lessons.save': (input) => saveLesson(db, input, clock()),
    'lessons.remove': (id) => deleteLesson(db, id, clock()),

    'passes.save': (input) => savePass(db, input, clock()),
    'passes.remove': (id) => deletePass(db, id),

    'reservations.range': (from, to) => listReservationsInRange(db, from, to),
    'reservations.save': (input) => saveReservation(db, input, clock()),
    'reservations.cancel': (id) => cancelReservation(db, id, clock())
  }
}
