export const SESSION_LIFETIME_MS = 12 * 60 * 60_000;
export const LATE_RECORD_LIMIT_MS = 72 * 60 * 60_000;

interface Session {
  startedAt: Date;
  expiresAt: Date;
}

// A tablet can sync long after a shift ends. A record arriving after its
// sign-in expired still counts if it was made while the sign-in lasted and
// arrives within 72 hours of being made.
export function lateRecordProblem(
  session: Session,
  recordedAt: Date,
  receivedAt: Date,
): string | null {
  if (receivedAt <= session.expiresAt) {
    return null;
  }
  if (recordedAt < session.startedAt || recordedAt > session.expiresAt) {
    return 'Recorded outside the sign-in it names';
  }
  if (receivedAt.getTime() - recordedAt.getTime() > LATE_RECORD_LIMIT_MS) {
    return 'Arrived more than 72 hours after it was recorded';
  }
  return null;
}
