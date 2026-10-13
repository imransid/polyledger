import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import {
  type FormulaVersionView,
  withLines,
} from '../infra/formula-versions.js';

export class GetActiveFormulasQuery extends Query<FormulaVersionView[]> {
  constructor(readonly productIds: string[]) {
    super();
  }
}

@QueryHandler(GetActiveFormulasQuery)
export class GetActiveFormulasHandler implements IQueryHandler<GetActiveFormulasQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    productIds,
  }: GetActiveFormulasQuery): Promise<FormulaVersionView[]> {
    return this.prisma.formulaVersion.findMany({
      where: { productId: { in: productIds }, isActive: true },
      include: withLines,
    });
  }
}
