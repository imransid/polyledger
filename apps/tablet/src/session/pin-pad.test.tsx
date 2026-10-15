import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PinPad } from './pin-pad';

async function type(keys: string) {
  for (const key of keys) {
    await fireEvent.press(screen.getByRole('button', { name: key }));
  }
}

const signIn = () =>
  fireEvent.press(screen.getByRole('button', { name: 'সাইন ইন' }));

describe('PIN pad', () => {
  it('signs in only with four to six digits', async () => {
    const onSubmit = jest.fn();
    await render(<PinPad onSubmit={onSubmit} />);

    await type('258');
    await signIn();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('3টি সংখ্যা দেওয়া হয়েছে')).toBeTruthy();

    await type('0');
    await signIn();
    expect(onSubmit).toHaveBeenCalledWith('2580');
  });

  it('stops at six digits and deletes the last one', async () => {
    const onSubmit = jest.fn();
    await render(<PinPad onSubmit={onSubmit} />);

    await type('1357924');
    await fireEvent.press(screen.getByRole('button', { name: 'মুছুন' }));
    await type('8');
    await signIn();

    expect(onSubmit).toHaveBeenCalledWith('135798');
  });

  it('takes nothing while a sign-in is under way', async () => {
    const onSubmit = jest.fn();
    await render(<PinPad onSubmit={onSubmit} disabled />);

    await type('2580');
    await signIn();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('0টি সংখ্যা দেওয়া হয়েছে')).toBeTruthy();
  });
});
