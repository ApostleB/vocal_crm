import { createContext, useContext, useMemo, useRef, useState } from 'react'
import { CustomerFormModal, type CustomerFormTarget } from './CustomerFormModal'
import { LessonModal, type LessonTarget } from './LessonModal'
import { PassModal, type PassTarget } from './PassModal'
import { ReservationModal, type ReservationTarget } from './ReservationModal'
import { StatusChangeModal, type StatusTarget } from './StatusChangeModal'

interface AppModalsApi {
  openLesson: (target: LessonTarget) => void
  openReservation: (target?: ReservationTarget) => void
  openCustomerForm: (target?: CustomerFormTarget) => void
  openPass: (target: PassTarget) => void
  openStatusChange: (target: StatusTarget) => void
}

type Opened<T> = { key: number; target: T } | null

const AppModalsContext = createContext<AppModalsApi | null>(null)

/** 어느 화면에서든 같은 창(수업 기록·예약·고객·수강권·상태 변경)을 열 수 있게 한 곳에서 관리한다 */
export function AppModalsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const seq = useRef(0)
  const [lesson, setLesson] = useState<Opened<LessonTarget>>(null)
  const [reservation, setReservation] = useState<Opened<ReservationTarget>>(null)
  const [customerForm, setCustomerForm] = useState<Opened<CustomerFormTarget>>(null)
  const [pass, setPass] = useState<Opened<PassTarget>>(null)
  const [status, setStatus] = useState<Opened<StatusTarget>>(null)

  const api = useMemo<AppModalsApi>(() => {
    const open = <T,>(setter: (o: Opened<T>) => void) => (target: T) => setter({ key: ++seq.current, target })
    return {
      openLesson: open(setLesson),
      openReservation: (target = {}) => setReservation({ key: ++seq.current, target }),
      openCustomerForm: (target = {}) => setCustomerForm({ key: ++seq.current, target }),
      openPass: open(setPass),
      openStatusChange: open(setStatus)
    }
  }, [])

  return (
    <AppModalsContext.Provider value={api}>
      {children}
      {lesson && (
        <LessonModal
          key={lesson.key}
          {...lesson.target}
          onClose={() => setLesson(null)}
          onBookNext={(customerId) => api.openReservation({ customerId })}
        />
      )}
      {reservation && <ReservationModal key={reservation.key} {...reservation.target} onClose={() => setReservation(null)} />}
      {customerForm && (
        <CustomerFormModal key={customerForm.key} {...customerForm.target} onClose={() => setCustomerForm(null)} />
      )}
      {pass && <PassModal key={pass.key} {...pass.target} onClose={() => setPass(null)} />}
      {status && <StatusChangeModal key={status.key} {...status.target} onClose={() => setStatus(null)} />}
    </AppModalsContext.Provider>
  )
}

export function useAppModals(): AppModalsApi {
  const ctx = useContext(AppModalsContext)
  if (!ctx) throw new Error('AppModalsProvider 안에서만 사용할 수 있습니다')
  return ctx
}
