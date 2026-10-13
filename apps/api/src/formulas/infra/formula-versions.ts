import { BadRequestException } from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import type { Prisma } from '../../generated/prisma/client.js';
import { GetRawMaterialsQuery } from '../../materials/queries/get-raw-materials.js';
import { GetProductQuery } from '../../products/queries/get-product.js';

// A fixed line order keeps requiredMaterial's tie-breaks the same every time.
export const withLines = {
  lines: {
    select: { rawMaterialId: true, basisPoints: true },
    orderBy: [{ basisPoints: 'desc' }, { rawMaterialId: 'asc' }],
  },
} satisfies Prisma.FormulaVersionInclude;

export type FormulaVersionView = Prisma.FormulaVersionGetPayload<{
  include: typeof withLines;
}>;

// Serialises version numbering and activation for one product.
export async function lockProductFormulas(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`formulas:${productId}`}))`;
}

export async function assertProductAndMaterialsActive(
  queryBus: QueryBus,
  productId: string,
  rawMaterialIds: string[],
): Promise<void> {
  const product = await queryBus.execute(new GetProductQuery(productId));
  if (!product?.isActive) {
    throw new BadRequestException('Product not found or inactive');
  }

  const materials = await queryBus.execute(
    new GetRawMaterialsQuery(rawMaterialIds),
  );
  const active = new Set(
    materials.filter((material) => material.isActive).map(({ id }) => id),
  );
  const unusable = rawMaterialIds.filter((id) => !active.has(id));
  if (unusable.length > 0) {
    throw new BadRequestException(
      `Raw materials not found or inactive: ${unusable.join(', ')}`,
    );
  }
}
