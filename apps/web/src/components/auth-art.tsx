/** Decorative live-poll card beside the auth forms. */
export function AuthArt() {
  return (
    <aside className="auth-art" aria-hidden>
      <div className="auth-art-card">
        <span className="live-badge"><i /> LIVE</span>
        <p>Which technology interests you most?</p>
        {[["AI", 46], ["Cloud", 24], ["Cybersecurity", 18], ["Web development", 12]].map(([label, value]) => (
          <div key={label} className="auth-art-bar"><span style={{ width: `${value}%` }} /><b>{label}</b><i>{value}%</i></div>
        ))}
        <small>142 participants · results update live</small>
      </div>
    </aside>
  );
}
