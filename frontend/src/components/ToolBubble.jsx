import {
  MousePointerClick,
  Move,
  ScrollText,
  Globe,
  Terminal,
  Type,
  Zap,
  GripHorizontal,
} from 'lucide-react';

const ICON_MAP = {
  left_click: MousePointerClick,
  right_click: MousePointerClick,
  double_click: MousePointerClick,
  hover: Move,
  scroll: ScrollText,
  web_search: Globe,
  type: Type,
  type_text: Type,
  key: Terminal,
  drag: GripHorizontal,
};

export default function ToolBubble({ tools }) {
  if (!tools || tools.length === 0) return null;
  return (
    <div style={groupStyle}>
      {tools.map((t, i) => {
        const Icon = ICON_MAP[t.type] || Zap;
        return (
          <div key={i} style={rowStyle}>
            <div style={iconStyle}><Icon size={13} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={titleStyle}>{t.type.replace(/_/g, ' ')}</span>
              <span style={metaStyle}>
                {t.x1 !== undefined ? ` (${t.x1},${t.y1})→(${t.x2},${t.y2})` : ''}
                {t.x !== undefined && t.y !== undefined ? ` (${t.x}, ${t.y})` : t.x !== undefined ? ` (${t.x}, ?)` : ''}
                {t.text ? ` "${t.text}"` : ''}
                {t.query ? ` "${t.query}"` : ''}
                {t.key ? ` [${t.key}]` : ''}
                {t.amount !== undefined ? ` ×${t.amount}` : ''}
                {t.max_results !== undefined ? ` top ${t.max_results}` : ''}
                {t.seconds !== undefined ? ` ${t.seconds}s` : ''}
                {t.type === 'task_done' ? (t.success ? ' ✓' : ' ✗') : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const groupStyle = { display: 'flex', flexDirection: 'column', gap: 2 };
const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'rgba(255,255,255,0.65)',
};
const iconStyle = {
  width: 20,
  height: 20,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,0.07)',
  color: 'rgba(255,255,255,0.4)',
  flexShrink: 0,
};
const titleStyle = {
  fontWeight: 600,
  color: 'rgba(255,255,255,0.82)',
  textTransform: 'capitalize',
};
const metaStyle = { color: 'rgba(255,255,255,0.38)', marginLeft: 4 };
