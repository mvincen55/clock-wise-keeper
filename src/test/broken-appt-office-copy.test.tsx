import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BaOfficeCopySheet from '@/components/broken-appts/BaOfficeCopySheet';
import { completionStamp } from '@/lib/broken-appts/checklist';

// The OFFICE COPY page records reality: labeled office-only, every
// applicable action listed, incomplete ones shown as "Not completed at
// time of print" — never silently hidden.

const AT = new Date(2026, 7, 7, 10, 47);

const render = (overrides: Partial<Parameters<typeof BaOfficeCopySheet>[0]> = {}) =>
  renderToStaticMarkup(
    <BaOfficeCopySheet
      patientName="Ann Example"
      apptDateMDY="8/10/2026"
      eventLabel="Late cancellation"
      rung={3}
      eventCode="9101"
      workflowDateMDY="8/7/2026"
      staffCode="MEG"
      checklist={[
        { label: 'Post 9101 + $75 fee', completion: completionStamp('MEG', AT) },
        { label: 'Post 0002 (letter sent)', completion: null },
      ]}
      {...overrides}
    />
  );

describe('BaOfficeCopySheet', () => {
  it('is unmistakably office-only', () => {
    const html = render();
    expect(html).toContain('OFFICE COPY');
    expect(html).toContain('Broken Appointment Documentation');
    expect(html).toContain('DO NOT GIVE TO PATIENT');
  });

  it('carries the workflow context', () => {
    const html = render();
    expect(html).toContain('Ann Example');
    expect(html).toContain('8/10/2026');
    expect(html).toContain('Late cancellation');
    expect(html).toContain('Rung 3');
    expect(html).toContain('9101');
    expect(html).toContain('8/7/2026');
    expect(html).toContain('MEG');
  });

  it('completed actions show who, the date, and the exact time', () => {
    const html = render();
    expect(html).toContain('Post 9101 + $75 fee');
    expect(html).toContain('08/07/2026');
    expect(html).toContain('10:47 AM');
  });

  it('incomplete applicable actions stay visible as not completed', () => {
    const html = render();
    expect(html).toContain('Post 0002 (letter sent)');
    expect(html).toContain('Not completed at time of print');
  });

  it('starts on its own page when it follows a letter', () => {
    expect(render()).toContain('ba-office-sheet--break');
    expect(render({ startOnNewPage: false })).not.toContain('ba-office-sheet--break');
  });

  it('a blank patient name prints a written-in dash, never invented data', () => {
    const html = render({ patientName: '' });
    expect(html).toContain('—');
  });
});
