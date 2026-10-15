import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IS_DEVICE } from '../auth/decorators.js';
import { PrismaService } from '../database/prisma.service.js';
import { hashSecret } from './domain/pairing.js';

export interface PairedDevice {
  id: string;
  name: string;
  floorLocationId: string;
}

interface DeviceRequest {
  headers: Record<string, string | string[] | undefined>;
  device?: PairedDevice;
}

// The tablet sends the token it got when pairing; a revoked tablet's token
// is gone from the table, so it is refused like an unknown one.
@Injectable()
export class DeviceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceRequest>();
    const token = request.headers['x-device-token'];
    if (typeof token !== 'string' || token === '') {
      throw new UnauthorizedException('Pair this tablet first');
    }
    const device = await this.prisma.device.findUnique({
      where: { tokenHash: hashSecret(token) },
      select: { id: true, name: true, floorLocationId: true, revokedAt: true },
    });
    if (!device || device.revokedAt) {
      throw new UnauthorizedException('This tablet is not paired');
    }
    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });
    request.device = {
      id: device.id,
      name: device.name,
      floorLocationId: device.floorLocationId,
    };
    return true;
  }
}

/** For routes a paired tablet calls with its X-Device-Token. */
export const Device = () =>
  applyDecorators(SetMetadata(IS_DEVICE, true), UseGuards(DeviceGuard));

export const CurrentDevice = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PairedDevice =>
    context.switchToHttp().getRequest<DeviceRequest>().device!,
);
