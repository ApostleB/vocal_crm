import { AppError } from '@shared/result'

export interface FileFilter {
  name: string
  extensions: string[]
}

/** 파일 대화상자와 읽기·쓰기. Main 에서는 Electron 구현, 테스트에서는 메모리 구현을 쓴다 */
export interface FileAccess {
  /** 저장 위치를 고른다. 취소하면 null */
  chooseSavePath(defaultName: string, filters: FileFilter[]): Promise<string | null>
  /** 열 파일을 고른다. 취소하면 null */
  chooseOpenPath(filters: FileFilter[]): Promise<string | null>
  readFile(path: string): Promise<Buffer>
  writeFile(path: string, data: Buffer | string): Promise<void>
}

export const VCRM_FILTERS: FileFilter[] = [{ name: 'VOCAL CRM 고객 파일', extensions: ['vcrm'] }]
export const EXCEL_FILTERS: FileFilter[] = [{ name: '엑셀 파일', extensions: ['xlsx'] }]

const unavailable = (): never => {
  throw new AppError('NO_FILE_ACCESS', '파일을 열거나 저장할 수 없습니다.')
}

/** 파일 접근을 주지 않았을 때의 기본값 */
export const noFileAccess: FileAccess = {
  chooseSavePath: async () => unavailable(),
  chooseOpenPath: async () => unavailable(),
  readFile: async () => unavailable(),
  writeFile: async () => unavailable()
}
