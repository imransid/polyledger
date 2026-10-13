import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import {
  type FormulaVersionView,
  withLines,
} from '../infra/formula-versions.js';

export class GetFormulaVersionQuery extends Query<FormulaVersionView | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetFormulaVersionQuery)
export class GetFormulaVersionHandler implements IQueryHandler<GetFormulaVersionQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ id }: GetFormulaVersionQuery): Promise<FormulaVersionView | null> {
    return this.prisma.formulaVersion.findUnique({
      where: { id },
      include: withLines,
    });
  }
}
