import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ArgsOf, Channel, ResultOf } from '@shared/api'
import { call } from './client'

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => call('settings.get') })

export const useHome = () => useQuery({ queryKey: ['home'], queryFn: () => call('home.get') })

export const useCustomers = () => useQuery({ queryKey: ['customers'], queryFn: () => call('customers.list') })

export const useCustomerDetail = (id: string | undefined) =>
  useQuery({
    queryKey: ['customer', id],
    queryFn: () => call('customers.detail', id as string),
    enabled: Boolean(id)
  })

export const useReservationsRange = (from: string | null, to: string | null) =>
  useQuery({
    queryKey: ['reservations', from, to],
    queryFn: () => call('reservations.range', from as string, to as string),
    enabled: Boolean(from && to)
  })

export const useOpenReservationCount = (customerId: string) =>
  useQuery({
    queryKey: ['openReservations', customerId],
    queryFn: () => call('customers.countOpenReservations', customerId)
  })

/**
 * 저장·삭제용. 성공하면 모든 조회를 다시 불러온다 (데이터가 작아서 전부 갱신해도 충분히 빠르다).
 * 사용: const save = useApiMutation('lessons.save'); await save.mutateAsync([input])
 */
export function useApiMutation<C extends Channel>(channel: C) {
  const queryClient = useQueryClient()
  return useMutation<ResultOf<C>, Error, ArgsOf<C>>({
    mutationFn: (args) => call(channel, ...args),
    onSuccess: () => queryClient.invalidateQueries()
  })
}
