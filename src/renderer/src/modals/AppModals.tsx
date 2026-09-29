import { createContext, useContext, useMemo, useRef, useState } from 'react'
import { CustomerFormModal, type CustomerFormTarget } from './CustomerFormModal'
import { ReservationModal, type ReservationTarget } from './ReservationModal'

interface AppModalsApi {
  openReservation: (target?: ReservationTarget) => void
  openCustomerForm: (target?: CustomerFormTarget) => void
}

type Opened<T> = { key: number; target: T } | null

const AppModalsContext = createContext<AppModalsApi | null>(null)

/** 어느 화면에서든 같은 창을 열 수 있게 한 곳에서 관리한다 (Task 11 에서 수업 기록·수강권·상태 변경 창 추가) */
export function AppModalsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const seq = useRef(0)
  const [reservation, setReservation] = useState<Opened<ReservationTarget>>(null)
  const [customerForm, setCustomerForm] = useState<Opened<CustomerFormTarget>>(null)

  const api = useMemo<AppModalsApi>(
    () => ({
      openReservation: (target = {}) => setReservation({ key: ++seq.current, target }),
      openCustomerForm: (target = {}) => setCustomerForm({ key: ++seq.current, target })
    }),
    []
  )

  return (
    <AppModalsContext.Provider value={api}>
      {children}
      {reservation && <ReservationModal key={reservation.key} {...reservation.target} onClose={() => setReservation(null)} />}
      {customerForm && (
        <CustomerFormModal key={customerForm.key} {...customerForm.target} onClose={() => setCustomerForm(null)} />
      )}
    </AppModalsContext.Provider>
  )
}

export function useAppModals(): AppModalsApi {
  const ctx = useContext(AppModalsContext)
  if (!ctx) throw new Error('AppModalsProvider 안에서만 사용할 수 있습니다')
  return ctx
}
