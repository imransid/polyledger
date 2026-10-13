import { NotFoundException } from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  assertProductAndMaterialsActive,
  type FormulaVersionView,
  lockProductFormulas,
  withLines,
} from '../infra/formula-versions.js';

export class ActivateFormulaVersionCommand extends Command<FormulaVersionView> {
  constructor(
    readonly actorId: string,
    readonly formulaVersionId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(ActivateFormulaVersionCommand)
export class ActivateFormulaVersionHandler implements ICommandHandler<ActivateFormulaVersionCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    formulaVersionId: id,
    idempotencyKey,
  }: ActivateFormulaVersionCommand): Promise<FormulaVersionView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ActivateFormulaVersion' },
        async () => {
          const version = await tx.formulaVersion.findUnique({
            where: { id },
            include: withLines,
          });
          if (!version) {
            throw new NotFoundException('Formula version not found');
          }
          await assertProductAndMaterialsActive(
            this.queryBus,
            version.productId,
            version.lines.map((line) => line.rawMaterialId),
          );

          await lockProductFormulas(tx, version.productId);
          await tx.formulaVersion.updateMany({
            where: { productId: version.productId, isActive: true },
            data: { isActive: false },
          });
          return tx.formulaVersion.update({
            where: { id },
            data: { isActive: true },
            include: withLines,
          });
        },
      ),
    );
  }
}
