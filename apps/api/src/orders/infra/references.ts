import { BadRequestException } from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import { GetCustomerQuery } from '../../customers/queries/get-customer.js';
import { GetProductsQuery } from '../../products/queries/get-products.js';

export async function assertCustomerActive(
  queryBus: QueryBus,
  customerId: string,
): Promise<void> {
  const customer = await queryBus.execute(new GetCustomerQuery(customerId));
  if (!customer?.isActive) {
    throw new BadRequestException('Customer not found or inactive');
  }
}

export async function assertProductsActive(
  queryBus: QueryBus,
  productIds: string[],
): Promise<void> {
  const products = new Map(
    (await queryBus.execute(new GetProductsQuery(productIds))).map(
      (product) => [product.id, product],
    ),
  );
  for (const id of productIds) {
    const product = products.get(id);
    if (!product) {
      throw new BadRequestException(`Unknown product ${id}`);
    }
    if (!product.isActive) {
      throw new BadRequestException(`${product.code} is inactive`);
    }
  }
}
