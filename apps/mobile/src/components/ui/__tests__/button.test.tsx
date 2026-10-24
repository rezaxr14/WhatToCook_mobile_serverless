import { render, screen, userEvent } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { FontSize } from '@/constants/theme';

import { Button } from '../button';

describe('Button', () => {
  it('renders its label and calls onPress', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<Button onPress={onPress}>Generate</Button>);

    await user.press(screen.getByRole('button', { name: 'Generate' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while disabled', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(
      <Button onPress={onPress} disabled>
        Generate
      </Button>,
    );

    await user.press(screen.getByRole('button', { name: 'Generate' }));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Generate' }).props.accessibilityState).toMatchObject({
      disabled: true,
      busy: false,
    });
  });

  it('replaces the label with a spinner while loading', async () => {
    await render(<Button loading>Generate</Button>);

    expect(screen.queryByText('Generate')).toBeNull();
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
  });

  it('applies the requested size to the label', async () => {
    await render(<Button size="sm">Small</Button>);

    expect(screen.getByText('Small')).toHaveStyle({ fontSize: FontSize.sm });
  });
});
