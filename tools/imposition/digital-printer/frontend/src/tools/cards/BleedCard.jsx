import { fmtMm } from '@engine';
import Segmented from '../../components/Segmented.jsx';

const CHOICES = [
  { value: 'auto', label: 'Auto' },
  { value: 'mirror', label: 'Mirror' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'off', label: 'Off' },
];

const HELP = {
  auto: 'Makes bleed only when colour touches the edge of your design. Recommended.',
  mirror: 'Reflects the outer edge of the design outward. Best for photos, patterns and gradients.',
  stretch: 'Repeats the very edge colour outward. Best for plain colour backgrounds.',
  off: 'No bleed. Only for designs with white edges.',
};

// Bleed: shows if the file has bleed, and makes it when it doesn't.
export default function BleedCard({ plan, base, onChange, checking }) {
  const { needsBleed, madeBleed, inkTouches, settings } = plan;
  const choice = base.makeBleed || 'auto';

  let status;
  let ok = false;
  if (!needsBleed) {
    status = `Your file has ${fmtMm(settings.bleedUsed)} mm bleed`;
    ok = true;
  } else if (madeBleed && settings.bleedUsed > 0) {
    status = `Made ${fmtMm(settings.bleedUsed)} mm by ${madeBleed === 'mirror' ? 'mirroring the edges' : 'stretching the edge colours'}`;
    ok = true;
  } else if (choice === 'auto' && checking) {
    status = 'Checking the edges of your design…';
  } else if (choice === 'auto' && !inkTouches) {
    status = 'Not needed: the edges of your design are white';
    ok = true;
  } else {
    status = 'No bleed';
  }

  return (
    <div className="card">
      <div className="field-label">Bleed</div>
      <div className={`bleed-status ${ok ? 'bleed-ok' : ''}`}>
        {ok ? '✓ ' : ''}
        {status}
      </div>
      {needsBleed ? (
        <>
          <p className="hint">Your file has no bleed (extra design past the cut line). We can make it for you.</p>
          <div className="spaced">
            <Segmented options={CHOICES} value={choice} onChange={(v) => onChange({ makeBleed: v })} label="Make bleed" />
          </div>
          <p className="hint">{HELP[choice]}</p>
        </>
      ) : (
        <p className="hint">Bleed is extra design past the cut line, so no white edge shows after cutting.</p>
      )}
    </div>
  );
}
