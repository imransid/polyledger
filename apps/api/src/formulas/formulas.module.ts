import { Module } from '@nestjs/common';
import { ActivateFormulaVersionHandler } from './commands/activate-formula-version.js';
import { CreateFormulaVersionHandler } from './commands/create-formula-version.js';
import { FormulasController } from './formulas.controller.js';
import { GetFormulaVersionHandler } from './queries/get-formula-version.js';
import { ListFormulaVersionsHandler } from './queries/list-formula-versions.js';

@Module({
  controllers: [FormulasController],
  providers: [
    CreateFormulaVersionHandler,
    ActivateFormulaVersionHandler,
    ListFormulaVersionsHandler,
    GetFormulaVersionHandler,
  ],
})
export class FormulasModule {}
