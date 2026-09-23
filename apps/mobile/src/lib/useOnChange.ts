import { useState } from 'react';

/**
 * Run `fn` during render whenever `value` changes — React's "adjust state when
 * a prop changes" pattern, used to reset sheet forms each time they open
 * without a setState-in-effect cascade. `fn` may only set this component's state.
 */
export function useOnChange<T>(value: T, fn: (next: T) => void) {
  const [prev, setPrev] = useState(value);
  if (!Object.is(prev, value)) {
    setPrev(value);
    fn(value);
  }
}
