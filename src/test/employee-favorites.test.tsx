import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import EmployeeFavoritesCard from '@/components/team/EmployeeFavoritesCard';
afterEach(cleanup);
it('shows the shared favorite answers with their onboarding question labels', () => {
  render(<EmployeeFavoritesCard favorites={{ food: 'Tacos', drink: 'Iced tea', snack: '' }} />);
  expect(screen.getByText('Favorite food')).toBeInTheDocument();
  expect(screen.getByText('Tacos')).toBeInTheDocument();
  expect(screen.getByText('Coffee or drink order')).toBeInTheDocument();
  expect(screen.queryByText('Snack that saves the day')).not.toBeInTheDocument();
});
it('explains when no favorites have been shared', () => {
  render(<EmployeeFavoritesCard favorites={{}} />);
  expect(screen.getByText(/No favorites shared yet/)).toBeInTheDocument();
});
