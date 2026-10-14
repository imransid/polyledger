import type { CompanySettings } from '../../generated/prisma/client.js';

export interface CompanyView {
  name: string;
  address: string;
  phone: string;
  bin: string | null;
}

export function toCompanyView({
  name,
  address,
  phone,
  bin,
}: CompanySettings): CompanyView {
  return { name, address, phone, bin };
}
