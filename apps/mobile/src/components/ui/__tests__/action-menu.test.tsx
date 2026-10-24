import { render, screen, userEvent } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import { useState } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActionMenu } from '../action-menu';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Harness() {
  const [open, setOpen] = useState(true);
  const [sort, setSort] = useState('recommended');

  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <Text>{`current:${sort}`}</Text>
      <ActionMenu
        visible={open}
        title="Sort recipes"
        cancelLabel="Cancel"
        onClose={() => setOpen(false)}
        items={[
          {
            key: 'recommended',
            label: 'Recommended',
            selected: sort === 'recommended',
            onPress: () => setSort('recommended'),
          },
          {
            key: 'name',
            label: 'Name (A–Z)',
            selected: sort === 'name',
            onPress: () => setSort('name'),
          },
        ]}
      />
    </SafeAreaProvider>
  );
}

describe('ActionMenu', () => {
  it('shows its title, options and cancel affordance when open', async () => {
    await render(<Harness />);

    expect(screen.getByText('Sort recipes')).toBeTruthy();
    expect(screen.getByText('Recommended')).toBeTruthy();
    expect(screen.getByText('Name (A–Z)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('runs the selected option and closes itself', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(screen.getByText('Name (A–Z)'));

    expect(screen.getByText('current:name')).toBeTruthy();
    expect(screen.queryByText('Sort recipes')).toBeNull();
  });

  it('closes without choosing when cancelled', async () => {
    const user = userEvent.setup();
    await render(<Harness />);

    await user.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Sort recipes')).toBeNull();
  });
});
