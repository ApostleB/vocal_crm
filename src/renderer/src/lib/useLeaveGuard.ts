import { useEffect } from 'react'

/**
 * 저장하지 않은 입력이 있는 동안 창 닫기·앱 종료를 한 번 멈춘다.
 * 멈추면 Main 이 'will-prevent-unload' 에서 "닫을까요?" 확인 창을 띄운다 (설계 8장).
 */
export function useLeaveGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [active])
}
