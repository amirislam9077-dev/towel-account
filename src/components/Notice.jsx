export default function Notice({ msg, onClose }) {
  if (!msg) return null;
  return (
    <div className={`notice ${msg.type}`}>
      <span>{msg.text}</span>
      <button onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}
