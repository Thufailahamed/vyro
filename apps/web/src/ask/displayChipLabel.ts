/**
 * Model-emitted chips often arrive in ALL CAPS. Show them as a normal sentence;
 * the original string is still what we send back on pick.
 */
export function displayChipLabel(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4 || letters !== letters.toUpperCase()) return s;
  const lower = s.toLowerCase().replace(/\bi\b/g, 'I');
  return lower.replace(/^[a-z]/, (c) => c.toUpperCase());
}
