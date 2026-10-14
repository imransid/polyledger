import { Module } from '@nestjs/common';
import { SaveCompanyHandler } from './commands/save-company.js';
import { GetCompanyHandler } from './queries/get-company.js';
import { SettingsController } from './settings.controller.js';

@Module({
  controllers: [SettingsController],
  providers: [SaveCompanyHandler, GetCompanyHandler],
})
export class SettingsModule {}
