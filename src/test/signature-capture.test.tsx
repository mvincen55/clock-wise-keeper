/**
 * The signature pad: pointer strokes become a PNG data URL through onChange,
 * Clear reports null, Redo restores the last cleared ink. jsdom has no real
 * canvas, so the 2D context and toDataURL are stubbed — the assertions cover
 * the component's contract, not pixel output.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SignatureCapture from '@/components/consents/SignatureCapture';

const DATA_URL = 'data:image/png;base64,TESTSIG';

const ctxStub = {
  setTransform: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  drawImage: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  lineCap: '',
  lineJoin: '',
};

beforeAll(() => {
  // jsdom ships no canvas implementation; the component only needs the calls.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => DATA_URL);
});

beforeEach(() => vi.clearAllMocks());

const drawStroke = (canvas: Element) => {
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 60, clientY: 30 });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 60, clientY: 30 });
};

describe('SignatureCapture', () => {
  it('labels the pad with the role and emits a data URL after a stroke', () => {
    const onChange = vi.fn();
    render(<SignatureCapture roleLabel="Patient" onChange={onChange} />);

    expect(screen.getByText('Patient signature')).toBeInTheDocument();
    const canvas = screen.getByRole('img', { name: 'Patient signature pad' });

    drawStroke(canvas);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(DATA_URL);
    expect(ctxStub.stroke).toHaveBeenCalled();
  });

  it('shows the qualifier for an optional role', () => {
    render(<SignatureCapture roleLabel="Doctor" qualifier="(optional per office rule)" onChange={() => {}} />);
    expect(screen.getByText('(optional per office rule)')).toBeInTheDocument();
  });

  it('Clear reports null; Redo restores the cleared signature', () => {
    const onChange = vi.fn();
    render(<SignatureCapture roleLabel="Patient" onChange={onChange} />);
    const canvas = screen.getByRole('img', { name: 'Patient signature pad' });
    const clearButton = screen.getByRole('button', { name: /clear/i });
    const redoButton = screen.getByRole('button', { name: /redo/i });

    // Nothing to clear or redo on an empty pad.
    expect(clearButton).toBeDisabled();
    expect(redoButton).toBeDisabled();

    drawStroke(canvas);
    expect(clearButton).toBeEnabled();
    expect(redoButton).toBeDisabled();

    fireEvent.click(clearButton);
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(clearButton).toBeDisabled();
    expect(redoButton).toBeEnabled();

    fireEvent.click(redoButton);
    expect(onChange).toHaveBeenLastCalledWith(DATA_URL);
    expect(redoButton).toBeDisabled();
    expect(clearButton).toBeEnabled();
  });

  it('new ink after a clear invalidates the redo buffer', () => {
    const onChange = vi.fn();
    render(<SignatureCapture roleLabel="Patient" onChange={onChange} />);
    const canvas = screen.getByRole('img', { name: 'Patient signature pad' });

    drawStroke(canvas);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    drawStroke(canvas);
    // Redo would resurrect a signature the signer replaced — it must be off.
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
  });

  it('a pointer move without a pointer down draws nothing and emits nothing', () => {
    const onChange = vi.fn();
    render(<SignatureCapture roleLabel="Witness" onChange={onChange} />);
    const canvas = screen.getByRole('img', { name: 'Witness signature pad' });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 30, clientY: 30 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
