/** 파일 이름에 쓸 수 없는 문자를 지운다 (Windows 기준) */
export function safeFileName(text: string): string {
  return text.replace(/[\\/:*?"<>|]/g, '').trim()
}

/** 1명: "김민지_강남점_2026-09-28.vcrm", 여러 명: "고객18명_강남점_2026-09-28.vcrm" */
export function vcrmFileName(names: string[], branch: string, date: string): string {
  const who = names.length === 1 ? safeFileName(names[0]) : `고객${names.length}명`
  return `${who}_${safeFileName(branch)}_${date}.vcrm`
}

export function customersExcelFileName(branch: string, date: string): string {
  return `VOCAL_CRM_고객목록_${safeFileName(branch)}_${date}.xlsx`
}

export const ROSTER_TEMPLATE_FILE_NAME = 'VOCAL_CRM_명단등록_양식.xlsx'
