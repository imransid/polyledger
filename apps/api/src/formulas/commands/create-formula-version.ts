import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { NewFormulaVersion } from '../domain/formula.js';
import {
  assertProductAndMaterialsActive,
  type FormulaVersionView,
  lockProductFormulas,
  withLines,
} from '../infra/formula-versions.js';

export class CreateFormulaVersionCommand extends Command<FormulaVersionView> {
  constructor(
    readonly actorId: string,
    readonly productId: string,
    readonly formula: NewFormulaVersion,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// New versions start inactive; nothing edits a version once it exists.
@CommandHandler(CreateFormulaVersionCommand)
export class CreateFormulaVersionHandler implements ICommandHandler<CreateFormulaVersionCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    productId,
    formula,
    idempotencyKey,
  }: CreateFormulaVersionCommand): Promise<FormulaVersionView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'CreateFormulaVersion' },
        async () => {
          await assertProductAndMaterialsActive(
            this.queryBus,
            productId,
            formula.lines.map((line) => line.rawMaterialId),
          );
          await lockProductFormulas(tx, productId);
          const { _max } = await tx.formulaVersion.aggregate({
            where: { productId },
            _max: { version: true },
          });
          return tx.formulaVersion.create({
            data: {
              productId,
              version: (_max.version ?? 0) + 1,
              wasteBasisPoints: formula.wasteBasisPoints,
              lines: { create: formula.lines },
            },
            include: withLines,
          });
        },
      ),
    );
  }
}
