/**
 * BigInt does not survive JSON.stringify by default, and every money value in
 * this system is a BigInt. Rather than sprinkle .toString() through every
 * controller, we teach BigInt how to serialise once, at startup.
 *
 * Money crosses the wire as a decimal STRING (e.g. "125000" paise), never as a
 * JS number — Number.MAX_SAFE_INTEGER is only ~90 trillion paise and, more
 * importantly, a float balance is exactly the bug class this design exists to
 * prevent.
 */
export function installBigIntJson(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}
