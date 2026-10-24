import { render, screen, userEvent } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { Chip } from '../chip';

describe('Chip', () => {
  it('reports the selected state when pressable', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<Chip label="chicken" selected onPress={onPress} />);

    const chip = screen.getByRole('button', { name: 'chicken' });
    expect(chip.props.accessibilityState).toMatchObject({ selected: true });

    await user.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes the remove affordance separately from the label', async () => {
    const onPress = jest.fn();
    const onRemove = jest.fn();
    const user = userEvent.setup();
    await render(<Chip label="salt" onPress={onPress} onRemove={onRemove} />);

    await user.press(screen.getByText('×'));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders as static text when it has no press handler', async () => {
    await render(<Chip label="baked" />);

    expect(screen.getByText('baked')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
