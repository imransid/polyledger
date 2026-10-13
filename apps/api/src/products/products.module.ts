import { Module } from '@nestjs/common';
import { CreateProductHandler } from './commands/create-product.js';
import { UpdateProductHandler } from './commands/update-product.js';
import { ProductsController } from './products.controller.js';
import { GetProductHandler } from './queries/get-product.js';
import { ListProductsHandler } from './queries/list-products.js';

@Module({
  controllers: [ProductsController],
  providers: [
    CreateProductHandler,
    UpdateProductHandler,
    ListProductsHandler,
    GetProductHandler,
  ],
})
export class ProductsModule {}
