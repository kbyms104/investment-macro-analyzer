import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IndicatorsView } from '../components/views/IndicatorsView';
import { vi } from 'vitest';

// Fix for Lucide icons in tests if needed, though usually they render fine
// Mock IndicatorDetail to isolate list testing
vi.mock('../components/views/IndicatorDetail', () => ({
    IndicatorDetail: ({ indicator, onBack }: any) => (
        <div data-testid="indicator-detail">
            <h1>{indicator.name}</h1>
            <button onClick={onBack}>Back</button>
        </div>
    )
}));

describe('IndicatorsView', () => {
    it('renders the list of indicators', () => {
        render(<IndicatorsView />);

        // Check for static elements
        expect(screen.getByText('Filters')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Search indicators...')).toBeInTheDocument();

        // Check for indicators list items
        expect(screen.getByText('Buffett Indicator')).toBeInTheDocument();
        expect(screen.getByText('10Y-2Y Yield Curve')).toBeInTheDocument();
        expect(screen.getByText('Fear & Greed Index')).toBeInTheDocument();
    });

    it('filters indicators by category', async () => {
        render(<IndicatorsView />);

        // Initial state: Show "Buffett Indicator" (Valuation) and "Fear & Greed Index" (Sentiment)
        expect(screen.getByText('Buffett Indicator')).toBeInTheDocument();
        expect(screen.getByText('Fear & Greed Index')).toBeInTheDocument();

        // Click on 'Valuation' category filter
        // Click on 'Valuation' category filter - use getAll and take first (sidebar), or use specific text match if possible
        // The side bar buttons are just buttons with text. The table rows also contain "Valuation" in a span.
        // We'll use getAllByText('Valuation')[0] which corresponds to the filter button in the sidebar (rendered first)
        const valuationBtns = screen.getAllByText('Valuation');
        fireEvent.click(valuationBtns[0]);

        // Should show Buffett Indicator but NOT Fear & Greed Index
        expect(screen.getByText('Buffett Indicator')).toBeInTheDocument();
        expect(screen.queryByText('Fear & Greed Index')).not.toBeInTheDocument();
    });

    it('filters indicators by search term', () => {
        render(<IndicatorsView />);

        const searchInput = screen.getByPlaceholderText('Search indicators...');
        fireEvent.change(searchInput, { target: { value: 'Bitcoin' } });

        // Should show Bitcoin Dominance but NOT Buffett Indicator
        expect(screen.getByText('Bitcoin Dominance')).toBeInTheDocument();
        expect(screen.queryByText('Buffett Indicator')).not.toBeInTheDocument();
    });

    it('navigates to detail view when an indicator is clicked', () => {
        render(<IndicatorsView />);

        // Click on Buffett Indicator
        const item = screen.getByText('Buffett Indicator');
        fireEvent.click(item);

        // Check if mock IndicatorDetail is rendered
        expect(screen.getByTestId('indicator-detail')).toBeInTheDocument();
        expect(screen.getByText('Buffett Indicator')).toBeInTheDocument(); // Inside detail
    });

    it('navigates back to list view from detail view', () => {
        render(<IndicatorsView />);

        // Navigate to detail
        const item = screen.getByText('Buffett Indicator');
        fireEvent.click(item);

        // Click back
        const backBtn = screen.getByText('Back');
        fireEvent.click(backBtn);

        // Check if list is back
        expect(screen.queryByTestId('indicator-detail')).not.toBeInTheDocument();
        expect(screen.getByText('Filters')).toBeInTheDocument();
    });
});
