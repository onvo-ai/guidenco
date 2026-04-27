import { Camera, Loader2, Settings } from 'lucide-react';

export default function Toolbar({
  fps,
  mode,
  running,
  onModeChange,
  onSnapshot,
  onOpenSettings,
}) {
  return (
    <header style={toolbarStyle}>
      <h1 style={titleStyle}>Guidenco</h1>

      <div style={faintPillStyle}>{fps}</div>

      <div style={{ flex: 1, minWidth: 16 }} />

      <div style={toggleRowStyle}>
        <ToggleBtn active={mode === 'auto'} onClick={() => onModeChange('auto')}>Auto</ToggleBtn>
        <ToggleBtn active={mode === 'manual'} onClick={() => onModeChange('manual')}>Manual</ToggleBtn>
      </div>

      <div style={{ flex: 1, minWidth: 16 }} />

      <IconBtn onClick={onSnapshot} title="Snapshot">
        <Camera size={16} />
      </IconBtn>

      <IconBtn onClick={onOpenSettings} title="Settings">
        <Settings size={16} />
      </IconBtn>

      {running && <Loader2 size={16} className="spin" />}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .spin{animation:spin 1s linear infinite}`}</style>
    </header>
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 12px',
        borderRadius: 10,
        border: '1px solid',
        borderColor: active ? 'rgba(59,130,246,0.35)' : 'transparent',
        background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
        color: active ? '#1d4ed8' : '#4b5563',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
      type="button"
    >
      {children}
    </button>
  );
}

function IconBtn({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: '8px 10px',
        borderRadius: 10,
        border: '1px solid rgba(0,0,0,0.08)',
        background: 'rgba(0,0,0,0.03)',
        color: '#374151',
        fontSize: 13,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
      type="button"
    >
      {children}
    </button>
  );
}

const toolbarStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderBottom: '1px solid rgba(0,0,0,0.08)',
  background: 'rgba(255,255,255,0.85)',
  backdropFilter: 'blur(10px)',
  flexShrink: 0,
};

const titleStyle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#111827',
};

const faintPillStyle = {
  padding: '6px 10px',
  borderRadius: 999,
  fontSize: 12,
  border: '1px solid',
  color: '#6b7280',
  background: 'rgba(0,0,0,0.04)',
  borderColor: 'rgba(0,0,0,0.06)',
};

const toggleRowStyle = {
  display: 'inline-flex',
  gap: 4,
  padding: 3,
  borderRadius: 14,
  border: '1px solid rgba(0,0,0,0.08)',
  background: 'rgba(0,0,0,0.03)',
};