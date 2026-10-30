import { useEffect, useState } from 'react';

// Renders a list of pages and returns them in the same order (empty until ready).
export function useRenders(pdf, indices, maxPx) {
  const [renders, setRenders] = useState([]);
  const key = indices.join(',');

  useEffect(() => {
    let alive = true;
    setRenders([]);
    Promise.all(indices.map((i) => pdf.render(i, maxPx)))
      .then((list) => alive && setRenders(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, key, maxPx]);

  return renders;
}
