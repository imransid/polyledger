import { Module } from '@nestjs/common';
import { CancelJobCardHandler } from './commands/cancel-job-card.js';
import { CloseJobCardHandler } from './commands/close-job-card.js';
import { CreateJobCardHandler } from './commands/create-job-card.js';
import { HandOverGoodsHandler } from './commands/hand-over-goods.js';
import { IssueMaterialHandler } from './commands/issue-material.js';
import { RecordProductionHandler } from './commands/record-production.js';
import { RecordWasteHandler } from './commands/record-waste.js';
import { ReleaseJobCardHandler } from './commands/release-job-card.js';
import { ReturnMaterialHandler } from './commands/return-material.js';
import { ReverseProductionEntryHandler } from './commands/reverse-production-entry.js';
import { ReverseWasteEntryHandler } from './commands/reverse-waste-entry.js';
import { StartJobCardHandler } from './commands/start-job-card.js';
import { StopJobCardHandler } from './commands/stop-job-card.js';
import { JobCardReporter } from './infra/job-card-reporter.js';
import { JobCardsController } from './job-cards.controller.js';
import { ProductionReportsController } from './production-reports.controller.js';
import { GetDayOutputHandler } from './queries/get-day-output.js';
import { GetIssueSuggestionHandler } from './queries/get-issue-suggestion.js';
import { GetJobCardSummaryHandler } from './queries/get-job-card-summary.js';
import { GetJobCardHandler } from './queries/get-job-card.js';
import { GetMachineBoardHandler } from './queries/get-machine-board.js';
import { GetWasteReportHandler } from './queries/get-waste-report.js';
import { ListJobCardsHandler } from './queries/list-job-cards.js';
import { ListMaterialDifferencesHandler } from './queries/list-material-differences.js';
import { ListProductionEntriesHandler } from './queries/list-production-entries.js';
import { ListWasteEntriesHandler } from './queries/list-waste-entries.js';

@Module({
  controllers: [JobCardsController, ProductionReportsController],
  providers: [
    JobCardReporter,
    CreateJobCardHandler,
    ReleaseJobCardHandler,
    StartJobCardHandler,
    StopJobCardHandler,
    CancelJobCardHandler,
    CloseJobCardHandler,
    IssueMaterialHandler,
    RecordProductionHandler,
    ReverseProductionEntryHandler,
    HandOverGoodsHandler,
    ReturnMaterialHandler,
    RecordWasteHandler,
    ReverseWasteEntryHandler,
    ListJobCardsHandler,
    GetJobCardHandler,
    ListProductionEntriesHandler,
    GetIssueSuggestionHandler,
    GetJobCardSummaryHandler,
    ListWasteEntriesHandler,
    GetWasteReportHandler,
    GetMachineBoardHandler,
    GetDayOutputHandler,
    ListMaterialDifferencesHandler,
  ],
})
export class ProductionModule {}
