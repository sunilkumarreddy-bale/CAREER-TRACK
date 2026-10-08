import { formatBytes, monthLabel, relativeDays, toDateInput, toDateTimeInput } from './format.js';

describe('format utils', () => {
  it('keeps calendar dates stable regardless of timezone', () => {
    expect(toDateInput('2026-09-01T00:00:00.000Z')).toBe('2026-09-01');
    expect(toDateInput('')).toBe('');
  });

  it('round-trips datetime-local values in local time', () => {
    const d = new Date(2026, 8, 12, 11, 5);
    expect(toDateTimeInput(d)).toBe('2026-09-12T11:05');
    expect(new Date(toDateTimeInput(d)).getTime()).toBe(d.getTime());
  });

  it('formats relative days and sizes', () => {
    expect(relativeDays(new Date())).toBe('today');
    expect(relativeDays(new Date(Date.now() + 86400000))).toBe('tomorrow');
    expect(relativeDays(new Date(Date.now() - 3 * 86400000))).toBe('3 days ago');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(monthLabel('2026-01')).toMatch(/Jan/);
  });
});
