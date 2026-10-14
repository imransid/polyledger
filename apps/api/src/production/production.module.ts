import { Module } from '@nestjs/common';
import { CancelJobCardHandler } from './commands/cancel-job-card.js';
import { CloseJobCardHandler } from './commands/close-job-card.js';
import { CreateJobCardHandler } from './commands/create-job-card.js';
import { HandOverGoodsHandler } from './commands/hand-over-goods.js';
import { IssueMaterialHandler } from './commands/issue-material.js';
import { RecordProductionHandler } from './commands/record-production.js';
import { ReleaseJobCardHandler } from './commands/release-job-card.js';
import { ReturnMaterialHandler } from './commands/return-material.js';
import { ReverseProductionEntryHandler } from './commands/reverse-production-entry.js';
import { StartJobCardHandler } from './commands/start-job-card.js';
import { StopJobCardHandler } from './commands/stop-job-card.js';
import { JobCardReporter } from './infra/job-card-reporter.js';
import { JobCardsController } from './job-cards.controller.js';
import { GetIssueSuggestionHandler } from './queries/get-issue-suggestion.js';
import { GetJobCardSummaryHandler } from './queries/get-job-card-summary.js';
import { GetJobCardHandler } from './queries/get-job-card.js';
import { ListJobCardsHandler } from './queries/list-job-cards.js';
import { ListProductionEntriesHandler } from './queries/list-production-entries.js';

@Module({
  controllers: [JobCardsController],
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
    ListJobCardsHandler,
    GetJobCardHandler,
    ListProductionEntriesHandler,
    GetIssueSuggestionHandler,
    GetJobCardSummaryHandler,
  ],
})
export class ProductionModule {}
