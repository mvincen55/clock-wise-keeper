import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReaderBody } from '@/components/library/DocBlockView';
import { parseDocBlocks } from '@/lib/doc-format';
import {
  captionFromFileName,
  handbookImageFileName,
  handbookImagePath,
  handbookImageProblem,
  headingLines,
  imageLine,
  placeImageLine,
} from '@/lib/handbook-images';

const ORG = '00000000-0000-4000-8000-000000000001';
const URL = 'https://example.test/storage/v1/object/public/org-branding/x/handbook/instrument-guide.jpg';

describe('handbook image files', () => {
  it('names files so the same picture always lands at the same address', () => {
    expect(handbookImageFileName('Instrument Guide (2).JPEG')).toBe('instrument-guide-2.jpg');
    expect(handbookImageFileName('Time Off Request Form.png')).toBe('time-off-request-form.png');
    expect(handbookImageFileName('')).toBe('picture.png');
    expect(handbookImagePath(ORG, 'Call Lights.webp')).toBe(`${ORG}/handbook/call-lights.webp`);
  });
  it('refuses files the bucket would reject', () => {
    expect(handbookImageProblem({ size: 10, type: 'application/pdf' })).toMatch(/PNG, JPEG/);
    expect(handbookImageProblem({ size: 3 * 1024 * 1024, type: 'image/png' })).toMatch(/2 MB/);
    expect(handbookImageProblem({ size: 500, type: 'image/jpeg' })).toBeNull();
  });
  it('captions from the file name and keeps square brackets out of the line', () => {
    expect(captionFromFileName('time-off-request-form.png')).toBe('Time off request form');
    expect(imageLine('Photos [set A]', URL)).toBe(`![Photos set A](${URL})`);
  });
  it('lists headings as placement choices', () => {
    expect(headingLines('# Handbook\n\ntext\n## Photos\n### Tips  \nnot # a heading')).toEqual([
      { line: 0, level: 1, title: 'Handbook' },
      { line: 3, level: 2, title: 'Photos' },
      { line: 4, level: 3, title: 'Tips' },
    ]);
  });
});

describe('placeImageLine', () => {
  const image = { caption: 'Instrument guide', url: URL };
  const line = imageLine(image.caption, image.url);

  it('drops the picture after a heading as its own paragraph', () => {
    const placed = placeImageLine('## Photos\nTake eight photos.\n', image, { kind: 'after-heading', line: 0 });
    expect(placed.text).toBe(`## Photos\n\n${line}\n\nTake eight photos.\n`);
    expect(placed.text.slice(0, placed.caret).endsWith(line)).toBe(true);
    expect(placed.alreadyPlaced).toBe(false);
  });
  it('moves a mid-sentence cursor to the end of the line instead of splitting it', () => {
    const text = 'First line here.\nSecond line.';
    const placed = placeImageLine(text, image, { kind: 'cursor', at: 5 });
    expect(placed.text).toBe(`First line here.\n\n${line}\n\nSecond line.`);
  });
  it('appends at the end with a trailing newline', () => {
    expect(placeImageLine('Only line', image, { kind: 'end' }).text).toBe(`Only line\n\n${line}\n`);
    expect(placeImageLine('', image, { kind: 'end' }).text).toBe(`${line}\n`);
  });
  it('leaves the text alone when the document already shows that picture', () => {
    const text = `Intro\n\n![Old caption](${URL})\n\nMore`;
    const placed = placeImageLine(text, image, { kind: 'end' });
    expect(placed.text).toBe(text);
    expect(placed.alreadyPlaced).toBe(true);
  });
});

describe('HandbookFigure', () => {
  it('hides a figure whose picture is not there yet', () => {
    const blocks = parseDocBlocks(['## Photos', `![Guide](${URL})`, '', 'Text after.'].join('\n'));
    render(<MemoryRouter><ReaderBody blocks={blocks} highlight="" /></MemoryRouter>);
    const img = screen.getByRole('img', { name: 'Guide' });
    expect(img.closest('figure')).not.toBeNull();
    fireEvent.error(img);
    expect(screen.queryByRole('img', { name: 'Guide' })).toBeNull();
    expect(document.querySelector('.handbook-figure')).toBeNull();
    expect(screen.getByText('Text after.')).toBeInTheDocument();
  });
});
