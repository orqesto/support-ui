/** `/knowledge-base/merges` is retired: the Knowledge Base list decides suggested changes. */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { kbSubRoutes } from '../kbConsolidationRoutes';

const Where = () => {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
};

describe('/knowledge-base/merges', () => {
  it('lands on the suggested changes of the list, whatever tab it asked for', () => {
    render(
      <MemoryRouter initialEntries={['/knowledge-base/merges?tab=quality']}>
        <Routes>
          {kbSubRoutes((page) => page)}
          <Route path="/knowledge-base" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/knowledge-base?status=suggested_change'
    );
  });
});
