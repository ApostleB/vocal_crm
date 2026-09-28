import { randomUUID } from 'node:crypto'
import { AppError } from '@shared/result'

export const newId = (): string => randomUUID()

export const iso = (d: Date): string => d.toISOString()

/** 앞뒤 공백을 지우고 비어 있으면 null */
export function blankToNull(value: string | null | undefined): string | null {
  const t = (value ?? '').trim()
  return t ? t : null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function requireDate(value: string | null | undefined, message: string): string {
  if (!value || !DATE_RE.test(value)) throw new AppError('VALIDATION', message)
  return value
}

export function optionalDate(value: string | null | undefined, message: string): string | null {
  if (value === null || value === undefined || value === '') return null
  return requireDate(value, message)
}

export function validation(message: string): AppError {
  return new AppError('VALIDATION', message)
}

export function notFound(message: string): AppError {
  return new AppError('NOT_FOUND', message)
}
