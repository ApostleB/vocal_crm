import type { FileAccess } from '@main/transfer/files'

/** 메모리에 파일을 두는 가짜 파일 접근. nextSavePath/nextOpenPath 가 null 이면 대화상자 취소 */
export function memoryFiles(): FileAccess & {
  store: Map<string, Buffer>
  nextSavePath: string | null
  nextOpenPath: string | null
  lastDefaultName: string | null
} {
  const store = new Map<string, Buffer>()
  const files = {
    store,
    nextSavePath: '/out/file' as string | null,
    nextOpenPath: '/in/file' as string | null,
    lastDefaultName: null as string | null,
    async chooseSavePath(defaultName: string) {
      files.lastDefaultName = defaultName
      return files.nextSavePath
    },
    async chooseOpenPath() {
      return files.nextOpenPath
    },
    async readFile(path: string) {
      const data = store.get(path)
      if (!data) throw new Error(`no file ${path}`)
      return data
    },
    async writeFile(path: string, data: Buffer | string) {
      store.set(path, typeof data === 'string' ? Buffer.from(data, 'utf-8') : data)
    }
  }
  return files
}
