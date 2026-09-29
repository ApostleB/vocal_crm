import type { CustomerStatus, Gender, Purpose } from '../types'

export const CUSTOMER_STATUSES: readonly CustomerStatus[] = ['active', 'paused', 'ended', 'moved']
export const PURPOSES: readonly Purpose[] = ['hobby', 'exam', 'audition', 'pro', 'other']
export const GENDERS: readonly Gender[] = ['F', 'M']

export const isCustomerStatus = (v: unknown): v is CustomerStatus =>
  typeof v === 'string' && (CUSTOMER_STATUSES as readonly string[]).includes(v)

export const isPurpose = (v: unknown): v is Purpose =>
  typeof v === 'string' && (PURPOSES as readonly string[]).includes(v)

export const isGender = (v: unknown): v is Gender => typeof v === 'string' && (GENDERS as readonly string[]).includes(v)
