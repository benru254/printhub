import { useEffect, useRef, useState } from 'react';

// Width of an element, updated when the screen is resized or rotated.
export function useWidth(initial = 320) {
  const ref = useRef(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}
