export const DEFAULT_TEST_NOW = "2026-10-08T09:00:00.000Z";

export function installTestClock(value = DEFAULT_TEST_NOW, target = globalThis) {
  const NativeDate = target.Date;
  const epoch = NativeDate.parse(value);
  if (!Number.isFinite(epoch)) throw new Error(`Invalid TEST_NOW: ${value}`);
  target.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [epoch])); }
    static now() { return epoch; }
  };
  return () => { target.Date = NativeDate; };
}
