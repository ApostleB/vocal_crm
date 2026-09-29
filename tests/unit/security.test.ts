import { describe, expect, it } from 'vitest'
import { isAllowedNavigation, isSafeExternalUrl } from '@main/security'

describe('isAllowedNavigation', () => {
  it('개발 서버는 같은 origin 만 허용', () => {
    expect(isAllowedNavigation('http://localhost:5173/#/customers/1', 'http://localhost:5173')).toBe(true)
    expect(isAllowedNavigation('https://example.com', 'http://localhost:5173')).toBe(false)
  })

  it('배포판은 같은 index.html 만 허용, 끌어다 놓은 파일은 막는다', () => {
    const app = 'file:///C:/app/resources/app.asar/out/renderer/index.html'
    expect(isAllowedNavigation(`${app}#/settings`, app)).toBe(true)
    expect(isAllowedNavigation('file:///C:/Users/me/Documents/김민지.vcrm', app)).toBe(false)
    expect(isAllowedNavigation('not a url', app)).toBe(false)
  })
})

describe('isSafeExternalUrl', () => {
  it('https 만 허용', () => {
    expect(isSafeExternalUrl('https://github.com')).toBe(true)
    expect(isSafeExternalUrl('http://example.com')).toBe(false)
    expect(isSafeExternalUrl('file:///C:/Windows/System32/cmd.exe')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
  })
})
