import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it('passes the API sentence through', () => {
    expect(
      errorMessage(409, {
        statusCode: 409,
        message: 'Not enough stock for RM-PP-01',
      }),
    ).toBe('Not enough stock for RM-PP-01');
  });

  it('puts each invalid field on its own line', () => {
    expect(
      errorMessage(400, {
        message: ['login: Too small', 'password: Required'],
      }),
    ).toBe('login: Too small\npassword: Required');
  });

  it('explains rate limits and unreadable answers in plain words', () => {
    expect(errorMessage(429, { message: 'ThrottlerException' })).toBe(
      'Too many attempts. Wait a minute and try again.',
    );
    expect(errorMessage(502, '<html>Bad gateway</html>')).toBe(
      'Something went wrong. Try again.',
    );
  });
});
