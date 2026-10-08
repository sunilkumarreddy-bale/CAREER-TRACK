import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Pipeline } from '../pages/Dashboard.jsx';
import StatusBadge from './StatusBadge.jsx';

describe('StatusBadge & Pipeline', () => {
  it('renders the status with a matching class', () => {
    render(<StatusBadge status="Final Round" />);
    expect(screen.getByText('Final Round')).toHaveClass('badge-final-round');
  });

  it('shows a count for every status and links to filtered lists', () => {
    const byStatus = { Applied: 3, Screening: 1, Interview: 2, 'Final Round': 0, Offer: 1, Rejected: 2 };
    render(
      <MemoryRouter>
        <Pipeline byStatus={byStatus} total={9} />
      </MemoryRouter>,
    );
    const offer = screen.getByRole('link', { name: /Offer 1/ });
    expect(offer).toHaveAttribute('href', '/applications?status=Offer');
    expect(screen.getByRole('link', { name: /Final Round 0/ })).toHaveAttribute('href', '/applications?status=Final%20Round');
  });
});
