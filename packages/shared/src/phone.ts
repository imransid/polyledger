// Bangladeshi mobile numbers, written either way people write them.
export const BANGLADESH_MOBILE = /^(?:\+880|0)1\d{9}$/;

/** +8801712345678: the form the API stores. */
export function toInternationalPhone(phone: string): string {
  return phone.replace(/^0/, '+880');
}

/** 01712345678: the form people read and type. */
export function toLocalPhone(phone: string): string {
  return phone.replace(/^\+880/, '0');
}
