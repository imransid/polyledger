import { formatCount } from '../lib/format';
import type { Messages } from './bn';

export const en: Messages = {
  otherLanguage: 'বাংলা',
  back: 'Back',
  errors: {
    offline: 'Cannot reach the server. Check the Wi-Fi.',
    tooManyAttempts: 'Too many tries. Wait a minute and try again.',
    unexpected: 'Something went wrong. Try again.',
  },
  pairing: {
    title: 'Pair this tablet',
    hint: 'Type the 8-character code from the office. You only need it once.',
    code: 'Pairing code',
    pair: 'Pair',
    pairing: 'Pairing…',
    wrongCode: 'Wrong or expired code. Ask the office for a new one.',
  },
  sync: {
    online: 'Online',
    offline: 'Offline',
    lastSynced: (moment: string) => `Last synced: ${moment}`,
    neverSynced: 'Not synced yet',
    waiting: (count: number) =>
      count === 1
        ? '1 record waiting to send'
        : `${formatCount(count)} records waiting to send`,
    failed: 'Last sync failed',
    syncNow: 'Sync now',
    syncing: 'Syncing…',
  },
  signIn: {
    pickName: 'Pick your name',
    nobody:
      'No one can sign in on this tablet yet. Sync, or ask the office to set PINs.',
    enterPin: 'Enter your PIN',
    pinEntered: (count: number) =>
      count === 1 ? '1 digit entered' : `${count} digits entered`,
    delete: 'Delete',
    signIn: 'Sign in',
    wrongPin: 'Wrong PIN. Try again.',
    lockedTitle: 'Locked for now',
    lockedOut: (minutes: number) =>
      `Too many wrong PINs. Try again on this tablet in ${formatCount(minutes)} min.`,
    needsConnection: 'Signing in needs the server. Check the Wi-Fi.',
  },
  home: {
    done: 'Done',
    jobCards: 'Job cards',
    needsSupervisor: (count: number) =>
      `Needs supervisor (${formatCount(count)})`,
    noJobCards: 'No job cards on this floor right now.',
    planned: (pieces: number) => `Planned: ${formatCount(pieces)} pcs`,
  },
  jobCardStatus: {
    PLANNED: 'Planned',
    RELEASED: 'Ready to start',
    RUNNING: 'Running',
    CLOSED: 'Closed',
    CANCELLED: 'Cancelled',
  },
  needsSupervisor: {
    hint: 'The server did not take these records. Tell your supervisor; the office will fix them.',
    empty: 'Nothing for a supervisor to look at.',
    PRODUCTION_ENTRY: 'Production',
    WASTE_ENTRY: 'Waste',
    recordedAt: (moment: string) => `Recorded: ${moment}`,
  },
};
