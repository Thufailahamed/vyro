/** Spend forecast: 3-month moving average + stddev range. Pure, no IO. */
export function forecastNextMonth(monthly: number[]): {
  prediction: number;
  low: number;
  high: number;
} {
  const last3 = monthly.slice(-3);
  if (!last3.length) return { prediction: 0, low: 0, high: 0 };
  const mean = last3.reduce((s, v) => s + v, 0) / last3.length;
  const variance = last3.reduce((s, v) => s + (v - mean) ** 2, 0) / last3.length;
  const sd = Math.sqrt(variance);
  return {
    prediction: Math.round(mean),
    low: Math.round(Math.max(0, mean - sd)),
    high: Math.round(mean + sd),
  };
}
