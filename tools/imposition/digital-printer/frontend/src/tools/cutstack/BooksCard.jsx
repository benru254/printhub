import Segmented from '../../components/Segmented.jsx';

const PARTS = [
  { value: 1, label: 'Single' },
  { value: 2, label: 'Duplicate' },
  { value: 3, label: 'Triplicate' },
];

const ORDERS = [
  { value: 'sets', label: 'In sets' },
  { value: 'grouped', label: 'By colour' },
];

const BOOK_SIZES = [0, 25, 50, 100];

// Books and copies (NCR paper): how the job is bound and how many copies of each number.
export default function BooksCard({ plan, numbering, onChange }) {
  const { books, parts } = plan;
  return (
    <div className="card">
      <div className="field-label">Books</div>
      <div className="chips chips-4">
        {BOOK_SIZES.map((b) => (
          <button key={b} type="button" className={`chip ${numbering.perBook === b ? 'chip-on' : ''}`} onClick={() => onChange({ perBook: b })}>
            <span>{b === 0 ? 'No books' : b}</span>
            <span className="chip-sub">{b === 0 ? 'loose' : 'per book'}</span>
          </button>
        ))}
      </div>
      {books && (
        <p className="hint">
          {books.count} {books.count === 1 ? 'book' : 'books'} of {books.perBook}
          {books.whole ? '' : ` (the last one has ${plan.total % books.perBook})`}
        </p>
      )}

      <div className="field-label spaced">Copies of each number</div>
      <Segmented options={PARTS} value={numbering.parts} onChange={(v) => onChange({ parts: v })} label="Copies" />
      <p className="hint">
        {parts === 1
          ? 'One copy of each number.'
          : `${parts} copies of each number on carbonless (NCR) paper: ${parts === 2 ? 'white + pink' : 'white + pink + yellow'}.`}
      </p>

      {parts > 1 && (
        <>
          <div className="field-label spaced">Print order</div>
          <Segmented options={ORDERS} value={numbering.printOrder} onChange={(v) => onChange({ printOrder: v })} label="Print order" />
          <p className="hint">
            {numbering.printOrder === 'sets'
              ? 'Each sheet is printed once per copy, one after the other. Best with pre-collated NCR paper or several paper trays: sets come out ready.'
              : 'All white sheets first, then all pink (then yellow). Best when you load each paper colour by hand.'}
          </p>
        </>
      )}
    </div>
  );
}
