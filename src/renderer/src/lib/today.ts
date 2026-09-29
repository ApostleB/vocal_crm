import { toDateString } from '@shared/domain/dates'

/** 화면에서 쓰는 오늘 날짜 (로컬 기준) */
export const todayString = (): string => toDateString(new Date())
