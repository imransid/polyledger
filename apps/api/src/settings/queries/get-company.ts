import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { type CompanyView, toCompanyView } from '../infra/views.js';

const NOT_SAVED_YET: CompanyView = {
  name: '',
  address: '',
  phone: '',
  bin: null,
};

export class GetCompanyQuery extends Query<CompanyView> {}

@QueryHandler(GetCompanyQuery)
export class GetCompanyHandler implements IQueryHandler<GetCompanyQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<CompanyView> {
    const settings = await this.prisma.companySettings.findUnique({
      where: { id: 1 },
    });
    return settings ? toCompanyView(settings) : NOT_SAVED_YET;
  }
}
