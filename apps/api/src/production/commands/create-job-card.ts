import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { fromDateString } from '../../common/dates.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { nextNumber } from '../../database/numbers.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import { GetActiveFormulasQuery } from '../../formulas/queries/get-active-formulas.js';
import { GetMachineQuery } from '../../machines/queries/get-machine.js';
import { GetMouldQuery } from '../../moulds/queries/get-mould.js';
import { GetSalesOrderQuery } from '../../orders/queries/get-sales-order.js';
import { GetProductQuery } from '../../products/queries/get-product.js';
import { GetLocationQuery } from '../../stock/queries/get-location.js';
import { type JobCardView, toJobCardView } from '../infra/job-cards.js';

export interface NewJobCard {
  productId: string;
  mouldId: string;
  machineId: string;
  floorLocationId: string;
  plannedPieces: number;
  plannedStartDate: string;
  salesOrderId: string | null;
}

export class CreateJobCardCommand extends Command<JobCardView> {
  constructor(
    readonly actorId: string,
    readonly jobCard: NewJobCard,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CreateJobCardCommand)
export class CreateJobCardHandler implements ICommandHandler<CreateJobCardCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    jobCard,
    idempotencyKey,
  }: CreateJobCardCommand): Promise<JobCardView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'CreateJobCard' },
        async () => {
          const frozen = await this.checkAndFreeze(jobCard);
          const card = await tx.jobCard.create({
            data: {
              ...jobCard,
              ...frozen,
              number: await nextNumber(tx, 'job_card_number', 'JC'),
              plannedStartDate: fromDateString(jobCard.plannedStartDate),
              createdById: actorId,
            },
          });
          await recordEvent(tx, 'job_card.created', {
            jobCardId: card.id,
            number: card.number,
            productId: card.productId,
            plannedPieces: card.plannedPieces,
            salesOrderId: card.salesOrderId,
          });
          return toJobCardView(card);
        },
      ),
    );
  }

  // Freezes the active formula and the weights it is applied with, so later
  // edits to the product, mould or formula never change a job in progress.
  private async checkAndFreeze(jobCard: NewJobCard) {
    const [product, mould, machine, floor, [formula]] = await Promise.all([
      this.queryBus.execute(new GetProductQuery(jobCard.productId)),
      this.queryBus.execute(new GetMouldQuery(jobCard.mouldId)),
      this.queryBus.execute(new GetMachineQuery(jobCard.machineId)),
      this.queryBus.execute(new GetLocationQuery(jobCard.floorLocationId)),
      this.queryBus.execute(new GetActiveFormulasQuery([jobCard.productId])),
    ]);

    if (!product?.isActive) {
      throw new BadRequestException('Product not found or inactive');
    }
    if (!mould || mould.productId !== product.id) {
      throw new BadRequestException(`That mould does not make ${product.code}`);
    }
    if (mould.status !== 'ACTIVE') {
      throw new BadRequestException(`Mould ${mould.code} is ${mould.status}`);
    }
    if (!machine) {
      throw new BadRequestException('Machine not found');
    }
    if (machine.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Machine ${machine.code} is ${machine.status}`,
      );
    }
    if (!floor?.isActive || floor.kind !== 'PRODUCTION_FLOOR') {
      throw new BadRequestException('Choose an active production floor');
    }
    if (jobCard.salesOrderId) {
      const order = await this.queryBus.execute(
        new GetSalesOrderQuery(jobCard.salesOrderId),
      );
      if (!order || !['CONFIRMED', 'IN_PRODUCTION'].includes(order.status)) {
        throw new BadRequestException(
          'The sales order must be CONFIRMED or IN_PRODUCTION',
        );
      }
      if (!order.lines.some((line) => line.productId === product.id)) {
        throw new BadRequestException(
          `${order.number} does not order ${product.code}`,
        );
      }
    }
    if (!formula) {
      throw new ConflictException(`No active formula for ${product.code}`);
    }

    return {
      formulaVersionId: formula.id,
      pieceWeightMg: product.pieceWeightMg,
      cavities: mould.cavities,
      runnerWeightMg: mould.runnerWeightMg,
    };
  }
}
