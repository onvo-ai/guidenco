import { useState } from 'react';
import { Camera, Settings } from 'lucide-react';

export default function Viewer({
  imgRef, shellRef, mode, running,
  onModeChange, onSnapshot, onOpenSettings,
  onPointerEnter, onPointerLeave, onPointerMove,
  onPointerDown, onPointerUp, onPointerCancel, onContextMenu,
}) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Full-screen stream */}
      <div
        ref={shellRef}
        style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none' }}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={onContextMenu}
      >
        <img
          ref={imgRef}
          alt="display stream"
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none', WebkitUserDrag: 'none', pointerEvents: 'none' }}
          draggable={false}
        />
      </div>

      {/* Centered top controls */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 8px',
        borderRadius: 10,
        background: 'rgba(0,0,0,0.52)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
        whiteSpace: 'nowrap',
      }}>
        {/* Auto / Manual toggle */}
        <div style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 7, background: 'rgba(255,255,255,0.07)' }}>
          <ToggleBtn active={mode === 'auto'} onClick={() => onModeChange('auto')}>Auto</ToggleBtn>
          <ToggleBtn active={mode === 'manual'} onClick={() => onModeChange('manual')}>Manual</ToggleBtn>
        </div>

        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />

        <Tip label="Snapshot">
          <IconBtn onClick={onSnapshot}><Camera size={14} /></IconBtn>
        </Tip>
        <Tip label="Settings">
          <IconBtn onClick={onOpenSettings}><Settings size={14} /></IconBtn>
        </Tip>

      </div>
    </div>
  );
}

function Tip({ label, children }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.82)',
          color: 'rgba(255,255,255,0.88)',
          fontSize: 11,
          fontWeight: 500,
          padding: '3px 8px',
          borderRadius: 5,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          {label}
        </div>
      )}
    </div>
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} type="button" style={{
      padding: '4px 10px', borderRadius: 5, border: 'none',
      background: active ? 'rgba(59,130,246,0.75)' : 'transparent',
      color: active ? '#fff' : 'rgba(255,255,255,0.5)',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

function IconBtn({ onClick, children }) {
  return (
    <button onClick={onClick} type="button" style={{
      padding: '4px 6px', borderRadius: 6, border: 'none',
      background: 'transparent', color: 'rgba(255,255,255,0.55)',
      cursor: 'pointer', display: 'flex', alignItems: 'center',
    }}>
      {children}
    </button>
  );
}
