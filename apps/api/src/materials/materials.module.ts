import { Module } from '@nestjs/common';
import { CreateRawMaterialHandler } from './commands/create-raw-material.js';
import { UpdateRawMaterialHandler } from './commands/update-raw-material.js';
import { GetRawMaterialsHandler } from './queries/get-raw-materials.js';
import { ListRawMaterialsHandler } from './queries/list-raw-materials.js';
import { RawMaterialsController } from './raw-materials.controller.js';

@Module({
  controllers: [RawMaterialsController],
  providers: [
    CreateRawMaterialHandler,
    UpdateRawMaterialHandler,
    ListRawMaterialsHandler,
    GetRawMaterialsHandler,
  ],
})
export class MaterialsModule {}
