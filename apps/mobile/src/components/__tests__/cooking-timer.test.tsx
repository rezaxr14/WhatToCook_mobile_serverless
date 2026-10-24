import { translations } from '@whattocook/shared';
import { render, screen, userEvent } from '@testing-library/react-native';
import { beforeAll, describe, expect, it } from '@jest/globals';
import i18n from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import { CookingTimer } from '../cooking-timer';

beforeAll(async () => {
  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: Object.fromEntries(
        Object.entries(translations).map(([code, translation]) => [code, { translation }]),
      ),
      interpolation: { escapeValue: false },
    });
  }
});

function renderTimer(initialMinutes = 15) {
  return render(
    <I18nextProvider i18n={i18n}>
      <CookingTimer initialMinutes={initialMinutes} />
    </I18nextProvider>,
  );
}

describe('CookingTimer', () => {
  it('starts paused at the requested duration', async () => {
    await renderTimer(15);

    expect(screen.getByText('Paused')).toBeTruthy();
    expect(screen.getByText('15:00')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  });

  it('starts, pauses and resumes', async () => {
    const user = userEvent.setup();
    await renderTimer(15);

    await user.press(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText('Cooking...')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('Paused')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText('Cooking...')).toBeTruthy();
  });

  it('adds time to the remaining duration', async () => {
    const user = userEvent.setup();
    await renderTimer(15);

    await user.press(screen.getByRole('button', { name: '+1 min' }));

    expect(screen.getByText('16:00')).toBeTruthy();
  });

  it('resets back to the initial duration', async () => {
    const user = userEvent.setup();
    await renderTimer(15);

    await user.press(screen.getByRole('button', { name: '+5 min' }));
    expect(screen.getByText('20:00')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Reset timer' }));

    expect(screen.getByText('15:00')).toBeTruthy();
    expect(screen.getByText('Paused')).toBeTruthy();
  });
});
