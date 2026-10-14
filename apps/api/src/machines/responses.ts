import { z } from 'zod';
import { timestamps } from '../common/master-data.js';
import { MachineStatus } from '../generated/prisma/client.js';

export const machineResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  tonnage: z.number().int(),
  status: z.enum(MachineStatus),
  ...timestamps,
});
