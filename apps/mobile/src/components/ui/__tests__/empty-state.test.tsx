import { Text } from 'react-native';

import { render, screen } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';

import { EmptyState } from '../empty-state';

describe('EmptyState', () => {
  it('renders the title and optional subtitle', async () => {
    await render(
      <EmptyState icon="restaurant-outline" title="No recipes yet" subtitle="Add ingredients" />,
    );

    expect(screen.getByText('No recipes yet')).toBeTruthy();
    expect(screen.getByText('Add ingredients')).toBeTruthy();
  });

  it('omits the subtitle and action when they are not provided', async () => {
    await render(<EmptyState icon="cart-outline" title="Grocery list is empty" />);

    expect(screen.getByText('Grocery list is empty')).toBeTruthy();
    expect(screen.queryByText('Add ingredients')).toBeNull();
  });

  it('renders a provided action', async () => {
    await render(
      <EmptyState icon="cart-outline" title="Grocery list is empty" action={<MockAction />} />,
    );

    expect(screen.getByText('Add an item')).toBeTruthy();
  });
});

function MockAction() {
  return <Text>Add an item</Text>;
}
