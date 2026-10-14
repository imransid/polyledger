import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router';
import { text } from '@/i18n';
import { renderArea } from '@/test/render';
import { HomePage } from './home-page';

function Home() {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="gate" element={<p>Gate</p>} />
    </Routes>
  );
}

describe('home page', () => {
  it('opens the gate straight away for a guard', async () => {
    renderArea(<Home />, { mount: '/*', at: '/', role: 'GUARD' });

    expect(await screen.findByText('Gate')).toBeTruthy();
  });

  it('welcomes everyone else', async () => {
    renderArea(<Home />, { mount: '/*', at: '/', role: 'STOREKEEPER' });

    expect(
      await screen.findByText(text.home.welcome('Nasrin Akter')),
    ).toBeTruthy();
  });
});
