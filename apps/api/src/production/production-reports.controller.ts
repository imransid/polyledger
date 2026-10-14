import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import { Roles } from '../auth/decorators.js';
import { dateRangeQuery } from '../common/list-query.js';
import { GetMachineBoardQuery } from './queries/get-machine-board.js';
import {
  GetWasteReportQuery,
  WASTE_REPORT_GROUPS,
} from './queries/get-waste-report.js';
import { PRODUCTION_READERS } from './roles.js';
import { ApiOkResponse } from '@nestjs/swagger';
import { machineBoardResponse } from './responses.js';

const wasteReportQuery = dateRangeQuery.safeExtend({
  groupBy: z.enum(WASTE_REPORT_GROUPS),
});

@Roles(...PRODUCTION_READERS)
@Controller('production')
export class ProductionReportsController {
  constructor(private readonly queryBus: QueryBus) {}

  /** What each machine is doing now and has made today; retired ones left out. */
  @Get('machine-board')
  @ApiOkResponse({ standardSchema: machineBoardResponse })
  machineBoard() {
    return this.queryBus.execute(new GetMachineBoardQuery());
  }

  /** Waste by shift date. */
  @Get('waste-report')
  wasteReport(
    @Query({ schema: wasteReportQuery })
    query: z.infer<typeof wasteReportQuery>,
  ) {
    return this.queryBus.execute(
      new GetWasteReportQuery(query.groupBy, query.from, query.to),
    );
  }
}
