import { describe, expect, it } from 'vitest';
import { menuFor } from './navigation';

const paths = (role: Parameters<typeof menuFor>[0]) =>
  menuFor(role).map((item) => item.path);

describe('menuFor', () => {
  it('shows users to the owner only', () => {
    expect(paths('OWNER')).toContain('/users');
    expect(paths('MANAGER')).not.toContain('/users');
  });

  it('shows operators only production', () => {
    expect(paths('OPERATOR')).toEqual(['/production']);
  });

  it('shows guards only the gate', () => {
    expect(paths('GUARD')).toEqual(['/gate']);
  });

  it('shows tablets to supervisors and up', () => {
    expect(paths('SUPERVISOR')).toContain('/tablets');
    expect(paths('STOREKEEPER')).not.toContain('/tablets');
    expect(paths('OPERATOR')).not.toContain('/tablets');
  });

  it('shows settings to the owner only', () => {
    expect(paths('OWNER')).toContain('/settings');
    expect(paths('MANAGER')).not.toContain('/settings');
  });
});
