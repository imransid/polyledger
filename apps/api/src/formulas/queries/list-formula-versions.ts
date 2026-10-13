import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import {
  type FormulaVersionView,
  withLines,
} from '../infra/formula-versions.js';

export class ListFormulaVersionsQuery extends Query<FormulaVersionView[]> {
  constructor(readonly productId: string) {
    super();
  }
}

@QueryHandler(ListFormulaVersionsQuery)
export class ListFormulaVersionsHandler implements IQueryHandler<ListFormulaVersionsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    productId,
  }: ListFormulaVersionsQuery): Promise<FormulaVersionView[]> {
    return this.prisma.formulaVersion.findMany({
      where: { productId },
      orderBy: { version: 'desc' },
      include: withLines,
    });
  }
}
