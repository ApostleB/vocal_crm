import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { todayString } from './today'

/**
 * 앱을 밤새 켜 두면 날짜가 바뀌어도 화면은 이전 날짜 기준 데이터를 계속 보여준다.
 * 일정 간격(기본 1분)마다, 그리고 창이 다시 포커스될 때마다 오늘 날짜를 확인해서
 * 바뀌었으면 모든 조회를 다시 불러온다.
 */
export function useDayRollover(intervalMs = 60_000): void {
  const queryClient = useQueryClient()
  const dayRef = useRef(todayString())

  useEffect(() => {
    const checkRollover = (): void => {
      const today = todayString()
      if (today !== dayRef.current) {
        dayRef.current = today
        queryClient.invalidateQueries()
      }
    }
    const interval = setInterval(checkRollover, intervalMs)
    window.addEventListener('focus', checkRollover)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', checkRollover)
    }
  }, [intervalMs, queryClient])
}
