// A friendly tip. Explains why something matters. Never blocks the user.

const ICON = { info: 'i', caution: '!', risk: '!' };

export default function TutorNote({ note, onDismiss }) {
  return (
    <div className={`note note-${note.level}`}>
      <span className="note-icon" aria-hidden>{ICON[note.level]}</span>
      <div className="note-body">
        <div className="note-title">{note.title}</div>
        <div className="note-text">{note.text}</div>
      </div>
      <button type="button" className="note-ok" onClick={() => onDismiss(note.id)}>
        Got it
      </button>
    </div>
  );
}
