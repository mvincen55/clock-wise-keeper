import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import AdaptivePatientPages from '@/components/fof/AdaptivePatientPages';

function Form({ groups = 3, name = 'Browser-only name' }) {
  return <AdaptivePatientPages><article className="fof-sheet">
    <header className="fof-head">{name}</header>
    <section className="fof-hero">Treatment summary</section>
    <section className="fof-cards">Cost breakdown</section>
    <section className="fof-payment-options">
      <div className="fof-prepay-summary">Prepay</div>
      <div className="fof-phase-schedule">
        <div className="fof-payment-plan-head"><span className="fof-payment-kicker">Payment schedule</span></div>
        {Array.from({ length: groups }, (_, i) => <div className="fof-payment-phase" key={i}>
          <div className="fof-payment-phase-name">Treatment {i + 1}</div>
          <div data-payment-event={`payment-${i}`}>Due at treatment: $100.00</div>
        </div>)}
        <div className="fof-payment-plan-total">Total: ${groups * 100}.00</div>
      </div>
    </section>
    <section className="fof-footnotes">Complete terms</section>
    <section className="fof-signatures">Sign here</section>
    <footer className="fof-footer">Practice identity</footer>
  </article></AdaptivePatientPages>;
}

// JSDOM does not lay out pages. Model measurable content, independent of the
// component's page-selection algorithm; real Chromium PDF checks cover CSS.
function measuredHeight(base: number, phase: number, compactPhase = phase) {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    if (!this.matches('.fof-sheet')) return 1;
    const count = this.querySelectorAll('.fof-payment-phase').length;
    const overhead = this.querySelector('.fof-hero') && this.querySelector('.fof-signatures') ? base : base / 2;
    return overhead + count * (this.classList.contains('fof-composed-compact') ? compactPhase : phase);
  });
}
const composed = (container: HTMLElement) => container.querySelector('.fof-composed-output')!;
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('patient page composition', () => {
  it('keeps a fitting form on one page, including terms and signatures', () => {
    measuredHeight(300, 100);
    const { container } = render(<Form />);
    const result = composed(container);
    expect(result.querySelectorAll('.fof-sheet')).toHaveLength(1);
    expect(result.querySelectorAll('[data-payment-event]')).toHaveLength(3);
    expect(result.textContent).toContain('Complete terms');
    expect(result.textContent).toContain('Sign here');
    expect(result.querySelector('.fof-composed-compact')).toBeNull();
  });
  it('tries tighter spacing before allowing a second page', () => {
    measuredHeight(600, 150, 100);
    const { container } = render(<Form />);
    expect(composed(container).querySelectorAll('.fof-sheet')).toHaveLength(1);
    expect(composed(container).querySelector('.fof-composed-compact')).toBeTruthy();
  });
  it('splits only whole groups and preserves ordered payments exactly once', () => {
    measuredHeight(400, 140);
    const { container } = render(<Form groups={8} />);
    const pages = [...composed(container).querySelectorAll('.fof-sheet')];
    expect(pages).toHaveLength(2);
    expect([...composed(container).querySelectorAll('[data-payment-event]')].map(e => e.getAttribute('data-payment-event')))
      .toEqual(Array.from({ length: 8 }, (_, i) => `payment-${i}`));
    expect(pages[0].querySelector('.fof-signatures')).toBeNull();
    expect(pages[0].querySelector('.fof-payment-plan-total')).toBeNull();
    expect(pages[1].textContent).toContain('Total: $800.00');
    expect(pages[1].querySelectorAll('.fof-signatures')).toHaveLength(1);
    expect(pages[1].textContent).toContain('Complete terms');
    expect(pages[1].textContent).toContain('Payment schedule — continued');
    pages.forEach((page, i) => {
      expect(page.querySelector('.fof-head')?.textContent).toBe('Browser-only name');
      expect(page.querySelector('.fof-footer')?.textContent).toContain(`Page ${i + 1} of 2`);
    });
  });
  it('replaces the old presentation when the current form changes', () => {
    measuredHeight(300, 100);
    const { container, rerender } = render(<Form name="Previous name" />);
    rerender(<Form groups={1} name="Current name" />);
    expect(container.textContent).not.toContain('Previous name');
    expect(composed(container).querySelectorAll('[data-payment-event]')).toHaveLength(1);
    window.dispatchEvent(new Event('beforeprint'));
    expect(composed(container).querySelectorAll('.fof-sheet')).toHaveLength(1);
    expect(container.querySelectorAll('.fof-page-measure')).toHaveLength(0);
  });
  it('requests review instead of silently clipping an impossible two-page form', () => {
    measuredHeight(2000, 1000);
    const { container } = render(<Form groups={8} />);
    expect(composed(container).querySelector('[role="alert"]')?.textContent).toContain('Review the plan before printing');
    expect(container.querySelector('.fof-page-source')?.getAttribute('aria-hidden')).toBe('true');
    expect(composed(container).querySelectorAll('.fof-sheet')).toHaveLength(0);
    vi.restoreAllMocks();
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.closest('.fof-page-source') ? 0 : 3000;
    });
    window.dispatchEvent(new Event('beforeprint'));
    expect(composed(container).querySelector('[role="alert"]')).toBeTruthy();
  });
  it('updates the presentation when a nested component changes independently', async () => {
    measuredHeight(300, 100);
    let rename: (name: string) => void = () => {};
    function NestedHeader() {
      const [name, setName] = useState('Previous name');
      rename = setName;
      return <header className="fof-head">{name}</header>;
    }
    const { container } = render(<AdaptivePatientPages><article className="fof-sheet"><NestedHeader /></article></AdaptivePatientPages>);
    act(() => rename('Current name'));
    await waitFor(() => expect(composed(container).textContent).toContain('Current name'));
    expect(container.textContent).not.toContain('Previous name');
  });
  it('drops the previous form when a hidden print portal cannot be measured yet', () => {
    measuredHeight(300, 100);
    const { container, rerender } = render(<Form name="Previous name" />);
    vi.restoreAllMocks();
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(0);
    rerender(<Form name="Current name" />);
    expect(composed(container).children).toHaveLength(0);
    expect(container.textContent).not.toContain('Previous name');
    expect(container.querySelector('.fof-page-source')?.hasAttribute('aria-hidden')).toBe(false);
  });
});
