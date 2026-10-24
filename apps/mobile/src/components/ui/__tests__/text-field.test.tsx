import { render, screen, userEvent } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { TextField } from '../text-field';

describe('TextField', () => {
  it('renders the label and forwards typed text', async () => {
    const onChangeText = jest.fn();
    const user = userEvent.setup();
    await render(<TextField label="Ingredient" placeholder="e.g. onion" onChangeText={onChangeText} />);

    expect(screen.getByText('Ingredient')).toBeTruthy();
    await user.type(screen.getByPlaceholderText('e.g. onion'), 'onion');

    expect(onChangeText).toHaveBeenCalled();
    expect(onChangeText.mock.calls.at(-1)?.[0]).toBe('onion');
  });

  it('shows the error message when one is passed', async () => {
    await render(<TextField label="Email" error="Enter a valid email" />);

    expect(screen.getByText('Enter a valid email')).toBeTruthy();
  });
});
