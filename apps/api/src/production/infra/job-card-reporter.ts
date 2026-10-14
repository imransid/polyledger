import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { grams, type Grams } from '@polyledger/shared';
import { toSafeNumber } from '../../common/quantities.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobCard } from '../../generated/prisma/client.js';
import { GetRawMaterialsQuery } from '../../materials/queries/get-raw-materials.js';
import { GetJobCardStockQuery } from '../../stock/queries/get-job-card-stock.js';
import { type JobCardSummary, summarize } from '../domain/summary.js';

export interface FloorStock {
  issued: Map<string, Grams>;
  returned: Map<string, Grams>;
  /** Good pieces produced on this card and not yet handed over. */
  piecesOnFloor: number;
}

@Injectable()
export class JobCardReporter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async floorStock(card: JobCard): Promise<FloorStock> {
    const lines = await this.queryBus.execute(
      new GetJobCardStockQuery(card.id, card.floorLocationId),
    );
    const stock: FloorStock = {
      issued: new Map(),
      returned: new Map(),
      piecesOnFloor: 0,
    };
    for (const line of lines) {
      if (line.itemType === 'PRODUCT') {
        stock.piecesOnFloor += line.pieces;
      } else if (line.kind === 'ISSUE') {
        stock.issued.set(line.itemId, grams(line.grams));
      } else if (line.kind === 'RETURN') {
        stock.returned.set(line.itemId, grams(-line.grams));
      }
    }
    return stock;
  }

  async summary(card: JobCard): Promise<JobCardSummary> {
    const [stock, [pieces], used] = await Promise.all([
      this.floorStock(card),
      this.prisma.$queryRaw<{ good: bigint; rejected: bigint }[]>`
        SELECT COALESCE(SUM(good_pieces), 0)::bigint AS good,
               COALESCE(SUM(rejected_pieces), 0)::bigint AS rejected
        FROM production_entries
        WHERE job_card_id = ${card.id}::uuid AND reversed_at IS NULL`,
      this.prisma.$queryRaw<
        { rawMaterialId: string; pieceGrams: bigint; runnerGrams: bigint }[]
      >`
        SELECT m.raw_material_id AS "rawMaterialId",
               SUM(m.piece_grams)::bigint AS "pieceGrams",
               SUM(m.runner_grams)::bigint AS "runnerGrams"
        FROM production_entry_materials m
        JOIN production_entries e ON e.id = m.entry_id
        WHERE e.job_card_id = ${card.id}::uuid AND e.reversed_at IS NULL
        GROUP BY m.raw_material_id`,
    ]);

    const materialIds = [
      ...new Set([
        ...stock.issued.keys(),
        ...stock.returned.keys(),
        ...used.map((row) => row.rawMaterialId),
      ]),
    ];
    const materials = await this.queryBus.execute(
      new GetRawMaterialsQuery(materialIds),
    );

    return summarize({
      plannedPieces: card.plannedPieces,
      goodPieces: toSafeNumber(pieces.good),
      rejectedPieces: toSafeNumber(pieces.rejected),
      issued: stock.issued,
      returned: stock.returned,
      used: new Map(
        used.map((row) => [
          row.rawMaterialId,
          {
            pieceGrams: grams(Number(row.pieceGrams)),
            runnerGrams: grams(Number(row.runnerGrams)),
          },
        ]),
      ),
      materials: new Map(materials.map((m) => [m.id, m])),
    });
  }
}
