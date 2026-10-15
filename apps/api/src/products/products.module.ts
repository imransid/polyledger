import { Module } from '@nestjs/common';
import { CreateProductHandler } from './commands/create-product.js';
import { UpdateProductHandler } from './commands/update-product.js';
import { ProductsController } from './products.controller.js';
import { GetProductHandler } from './queries/get-product.js';
import { GetProductsHandler } from './queries/get-products.js';
import { ListChangedProductsHandler } from './queries/list-changed-products.js';
import { ListProductsHandler } from './queries/list-products.js';

@Module({
  controllers: [ProductsController],
  providers: [
    CreateProductHandler,
    UpdateProductHandler,
    ListProductsHandler,
    GetProductHandler,
    GetProductsHandler,
    ListChangedProductsHandler,
  ],
})
export class ProductsModule {}
