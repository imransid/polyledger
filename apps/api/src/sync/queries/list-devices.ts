import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { type DeviceView, toDeviceView } from '../infra/views.js';

/** Every tablet, revoked ones last. */
export class ListDevicesQuery extends Query<DeviceView[]> {}

@QueryHandler(ListDevicesQuery)
export class ListDevicesHandler implements IQueryHandler<ListDevicesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(): Promise<DeviceView[]> {
    const devices = await this.prisma.device.findMany({
      orderBy: [
        { revokedAt: { sort: 'desc', nulls: 'first' } },
        { name: 'asc' },
      ],
    });
    return devices.map(toDeviceView);
  }
}
