/**
 * 창이 앱 화면 밖으로 이동하려 하면 막는다 (파일을 창에 끌어다 놓는 경우 등).
 * 개발 서버면 같은 origin, 배포판(file://)이면 같은 index.html 경로만 허용한다.
 */
export function isAllowedNavigation(targetUrl: string, appUrl: string): boolean {
  try {
    const target = new URL(targetUrl)
    const app = new URL(appUrl)
    if (app.protocol === 'file:') return target.protocol === 'file:' && target.pathname === app.pathname
    return target.origin === app.origin
  } catch {
    return false
  }
}

/** 외부 브라우저로는 https 주소만 연다 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
