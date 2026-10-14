import { NotFoundException } from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import type { Prisma } from '../../generated/prisma/client.js';
import { GetProductsQuery } from '../../products/queries/get-products.js';

export interface ChallanLine {
  productId: string;
  pieces: number;
}

// Reversals and returns lock the challan before the order and the stock,
// so two of them can't take back the same pieces.
export async function lockChallan(tx: Prisma.TransactionClient, id: string) {
  const [locked] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM delivery_challans WHERE id = ${id}::uuid FOR UPDATE`;
  if (!locked) {
    throw new NotFoundException('Delivery challan not found');
  }
  return tx.deliveryChallan.findUniqueOrThrow({
    where: { id },
    include: { lines: true },
  });
}

/** Negative pieces when a return is reversed. */
export async function addReturnedPieces(
  tx: Prisma.TransactionClient,
  challanId: string,
  lines: ChallanLine[],
): Promise<void> {
  for (const { productId, pieces } of lines) {
    await tx.deliveryChallanLine.update({
      where: { challanId_productId: { challanId, productId } },
      data: { returnedPieces: { increment: pieces } },
    });
  }
}

export async function productCodes(
  queryBus: QueryBus,
  productIds: string[],
): Promise<Map<string, string>> {
  const products = await queryBus.execute(new GetProductsQuery(productIds));
  return new Map(products.map((product) => [product.id, product.code]));
}
