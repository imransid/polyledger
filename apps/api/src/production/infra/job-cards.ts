import { ConflictException, NotFoundException } from '@nestjs/common';
import { toDateString } from '../../common/dates.js';
import { recordEvent } from '../../database/outbox.js';
import type {
  JobCard,
  Prisma,
  ProductionEntry,
  ProductionEntryMaterial,
} from '../../generated/prisma/client.js';
import { IN_WORK, type JobCardAction, TRANSITIONS } from '../domain/status.js';

export type JobCardView = Omit<JobCard, 'plannedStartDate'> & {
  plannedStartDate: string;
};

export function toJobCardView(card: JobCard): JobCardView {
  return { ...card, plannedStartDate: toDateString(card.plannedStartDate) };
}

export type EntryView = Omit<ProductionEntry, 'shiftDate'> & {
  shiftDate: string;
  materials: ProductionEntryMaterial[];
};

export function toEntryView(
  entry: ProductionEntry & { materials: ProductionEntryMaterial[] },
): EntryView {
  return { ...entry, shiftDate: toDateString(entry.shiftDate) };
}

// Every posting against a card locks it first, so checks like "pieces still
// on the floor for this card" can't race with another posting.
export async function lockJobCard(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<JobCard> {
  const [locked] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM job_cards WHERE id = ${id}::uuid FOR UPDATE`;
  if (!locked) {
    throw new NotFoundException('Job card not found');
  }
  return tx.jobCard.findUniqueOrThrow({ where: { id } });
}

export function assertCan(card: JobCard, action: JobCardAction): void {
  const { from, done } = TRANSITIONS[action];
  if (!from.includes(card.status)) {
    throw new ConflictException(
      `${card.number} is ${card.status}; only ${from.join(' or ')} job cards can be ${done}`,
    );
  }
}

export function assertInWork(card: JobCard): void {
  if (!IN_WORK.includes(card.status)) {
    throw new ConflictException(
      `${card.number} is ${card.status}; material and goods move only while it is RELEASED or RUNNING`,
    );
  }
}

export async function moveJobCard(
  tx: Prisma.TransactionClient,
  id: string,
  action: JobCardAction,
  details: { cancelReason?: string } = {},
): Promise<JobCardView> {
  const { from, to, done } = TRANSITIONS[action];
  const { count } = await tx.jobCard.updateMany({
    where: { id, status: { in: from } },
    data: { ...details, status: to },
  });
  if (count === 0) {
    const card = await tx.jobCard.findUnique({ where: { id } });
    if (!card) {
      throw new NotFoundException('Job card not found');
    }
    assertCan(card, action);
  }
  const card = await tx.jobCard.findUniqueOrThrow({ where: { id } });
  await recordEvent(tx, `job_card.${done}`, {
    jobCardId: id,
    number: card.number,
    ...details,
  });
  return toJobCardView(card);
}
