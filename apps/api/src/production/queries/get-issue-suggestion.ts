import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { grams, type Grams, requiredMaterial } from '@polyledger/shared';
import { PrismaService } from '../../database/prisma.service.js';
import { GetFormulaVersionQuery } from '../../formulas/queries/get-formula-version.js';
import { GetRawMaterialsQuery } from '../../materials/queries/get-raw-materials.js';
import { JobCardReporter } from '../infra/job-card-reporter.js';

export interface IssueSuggestionLine {
  rawMaterialId: string;
  code: string;
  name: string;
  requiredGrams: Grams;
  /** Issued so far, less what came back. */
  issuedGrams: Grams;
  suggestedGrams: Grams;
}

export class GetIssueSuggestionQuery extends Query<
  IssueSuggestionLine[] | null
> {
  constructor(readonly jobCardId: string) {
    super();
  }
}

// What the planned pieces need by the frozen formula, waste allowance
// included, less what has already gone to the floor for this card.
@QueryHandler(GetIssueSuggestionQuery)
export class GetIssueSuggestionHandler implements IQueryHandler<GetIssueSuggestionQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
    private readonly reporter: JobCardReporter,
  ) {}

  async execute({
    jobCardId,
  }: GetIssueSuggestionQuery): Promise<IssueSuggestionLine[] | null> {
    const card = await this.prisma.jobCard.findUnique({
      where: { id: jobCardId },
    });
    if (!card) {
      return null;
    }
    const formula = (await this.queryBus.execute(
      new GetFormulaVersionQuery(card.formulaVersionId),
    ))!;
    const required = requiredMaterial({
      pieces: card.plannedPieces,
      pieceWeightMg: card.pieceWeightMg,
      wasteBasisPoints: formula.wasteBasisPoints,
      lineBasisPoints: formula.lines.map((line) => line.basisPoints),
    });
    const [stock, materials] = await Promise.all([
      this.reporter.floorStock(card),
      this.queryBus.execute(
        new GetRawMaterialsQuery(formula.lines.map((l) => l.rawMaterialId)),
      ),
    ]);
    const names = new Map(materials.map((m) => [m.id, m]));

    return formula.lines.map(({ rawMaterialId }, index) => {
      const issuedGrams = grams(
        (stock.issued.get(rawMaterialId) ?? 0) -
          (stock.returned.get(rawMaterialId) ?? 0),
      );
      const requiredGrams = required.lines[index];
      const { code, name } = names.get(rawMaterialId)!;
      return {
        rawMaterialId,
        code,
        name,
        requiredGrams,
        issuedGrams,
        suggestedGrams: grams(Math.max(0, requiredGrams - issuedGrams)),
      };
    });
  }
}
