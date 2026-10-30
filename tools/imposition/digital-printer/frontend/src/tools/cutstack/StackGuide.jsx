import { PART_NAMES } from '@engine';

// Step-by-step: how to print, cut and stack so everything ends up in order.
export default function StackGuide({ plan }) {
  const { sheets, perSheet, parts, stacks, books, numbering, stackMode, printOrder, twoSided } = plan;
  if (!perSheet) return null;
  const label = (i) => (stackMode === 'number' ? numbering.format(i) : `page ${i + 1}`);
  const colours = PART_NAMES.slice(0, parts).join(' + ');
  const pages = plan.pages;

  let printStep;
  if (parts > 1 && printOrder === 'sets') {
    printStep = `Print all ${pages} pages (${sheets} sheets × ${parts} copies: ${colours}, one after the other).`;
  } else if (parts > 1) {
    printStep = `Print all ${pages} pages: first the ${sheets} ${PART_NAMES[0]} sheets, then the ${sheets} ${PART_NAMES[1]}${parts > 2 ? `, then the ${sheets} ${PART_NAMES[2]}` : ''}.`;
  } else {
    printStep = `Print all ${sheets} sheets${twoSided ? ' double-sided' : ''}.`;
  }

  return (
    <div className="card guide">
      <div className="field-label">How to cut and stack</div>
      <ol className="guide-steps">
        <li>
          {printStep} Keep them in order with <strong>sheet 1 on top</strong>. If your printer puts the last sheet on top,
          turn the pile over.
        </li>
        {parts > 1 && printOrder === 'grouped' && (
          <li>Put the piles together so each white sheet has its pink{parts > 2 ? ' and yellow' : ''} sheet under it (sheet 1 white, sheet 1 pink, sheet 2 white…).</li>
        )}
        <li>Cut the whole pile on the cut marks into <strong>{perSheet} stacks</strong>. Keep each stack where it was.</li>
        <li>
          Put the stacks together in order: stack 1 on top, then stack 2 under it, and so on.
          <div className="stack-list">
            {stacks.filter((s) => s.count > 0).map((s) => (
              <span key={s.slot} className="stack-chip">
                <strong>{s.slot + 1}</strong> {label(s.first)}–{label(s.last)}
              </span>
            ))}
          </div>
        </li>
        {books && (
          <li>
            Count off <strong>{books.perBook}</strong> {parts > 1 ? 'sets' : 'leaves'} for each book: {books.count} books. Staple or glue
            them on the binding edge.
          </li>
        )}
      </ol>
    </div>
  );
}
