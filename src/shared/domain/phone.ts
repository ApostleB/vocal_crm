/** 숫자만 남긴다. 비어 있으면 null */
export function normalizePhone(input: string | null | undefined): string | null {
  const digits = (input ?? '').replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

/** 입력 중인 값에도 쓸 수 있게 자릿수에 따라 하이픈을 넣는다 */
export function formatPhone(value: string | null | undefined): string {
  const d = (value ?? '').replace(/\D/g, '').slice(0, 11)
  if (d.startsWith('02')) {
    if (d.length <= 2) return d
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`
  }
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}
