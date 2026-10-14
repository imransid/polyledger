import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import { type CompanyView, toCompanyView } from '../infra/views.js';

export class SaveCompanyCommand extends Command<CompanyView> {
  constructor(
    readonly actorId: string,
    readonly company: CompanyView,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(SaveCompanyCommand)
export class SaveCompanyHandler implements ICommandHandler<SaveCompanyCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    company,
    idempotencyKey,
  }: SaveCompanyCommand): Promise<CompanyView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'SaveCompany' },
        async () => {
          const data = { ...company, updatedById: actorId };
          const saved = await tx.companySettings.upsert({
            where: { id: 1 },
            // With the id in create too, Prisma runs one INSERT ... ON
            // CONFLICT, so two first saves can't both insert.
            create: { id: 1, ...data },
            update: data,
          });
          await recordEvent(tx, 'settings.company_saved', company);
          return toCompanyView(saved);
        },
      ),
    );
  }
}
