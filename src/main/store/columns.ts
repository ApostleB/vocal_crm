/** SELECT 결과를 바로 camelCase 객체로 받기 위한 컬럼 목록 */
export const customerColumns = (p = ''): string =>
  [
    `${p}id AS id`,
    `${p}name AS name`,
    `${p}phone AS phone`,
    `${p}birth_date AS birthDate`,
    `${p}gender AS gender`,
    `${p}purpose AS purpose`,
    `${p}status AS status`,
    `${p}registered_at AS registeredAt`,
    `${p}vocal_range AS vocalRange`,
    `${p}preferred_music AS preferredMusic`,
    `${p}pinned_note AS pinnedNote`,
    `${p}pause_until AS pauseUntil`,
    `${p}created_at AS createdAt`,
    `${p}updated_at AS updatedAt`
  ].join(', ')

export const GOAL_COLUMNS =
  'id, customer_id AS customerId, title, done_at AS doneAt, completed_lesson_id AS completedLessonId, created_at AS createdAt, updated_at AS updatedAt'

/** deduct_pass는 0/1 이므로 읽은 뒤 boolean으로 바꾼다 (toLesson) */
export const LESSON_COLUMNS =
  'id, customer_id AS customerId, lesson_date AS lessonDate, memo, practice, homework, deduct_pass AS deductPass, reservation_id AS reservationId, created_at AS createdAt, updated_at AS updatedAt'

export const PASS_COLUMNS =
  'id, customer_id AS customerId, count, purchased_at AS purchasedAt, amount, note, created_at AS createdAt, updated_at AS updatedAt'

export const RESERVATION_COLUMNS =
  'id, customer_id AS customerId, date, time, status, note, created_at AS createdAt, updated_at AS updatedAt'

export const STATUS_LOG_COLUMNS =
  'id, customer_id AS customerId, date, from_status AS fromStatus, to_status AS toStatus, reason, created_at AS createdAt'
