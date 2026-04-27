import { useState, useEffect } from 'react';
import { Monitor, Bot, ChevronDown, ChevronLeft } from 'lucide-react';
import { API_BASE } from '../lib/constants.js';

const SECTIONS = [
  { key: 'system', label: 'System', icon: Monitor },
  { key: 'agent',  label: 'Agent',  icon: Bot },
];


const LLM_PROVIDERS = [
  { value: 'ollama_cloud', label: 'Ollama Cloud' },
  { value: 'ollama',       label: 'Ollama (local)' },
  { value: 'openai',       label: 'OpenAI' },
  { value: 'anthropic',    label: 'Anthropic' },
  { value: 'openrouter',   label: 'OpenRouter' },
  { value: 'custom',       label: 'Custom' },
];

const PROVIDER_URLS = {
  ollama_cloud: 'https://ollama.com/v1',
  ollama:       'http://localhost:11434/v1',
  openai:       'https://api.openai.com/v1',
  anthropic:    'https://api.anthropic.com/v1',
  openrouter:   'https://openrouter.ai/api/v1',
  custom:       '',
};

export default function SettingsModal({ open, onClose, settings, updateSettings }) {
  const [section, setSection] = useState('system');
  const [serverSettings, setServerSettings] = useState(null);

  useEffect(() => {
    if (open) {
      fetch(`${API_BASE}/settings`)
        .then((r) => r.json())
        .then((d) => { if (d.status === 'ok') setServerSettings(d.data); })
        .catch(() => {});
    }
  }, [open]);

  function saveServerSection(sectionKey, patch) {
    const body = { [sectionKey]: patch };
    fetch(`${API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'ok')
          setServerSettings((prev) => ({ ...prev, [sectionKey]: { ...prev?.[sectionKey], ...patch } }));
      })
      .catch(() => {});
  }

  if (!open) return null;

  function handleBackdrop(e) { if (e.target === e.currentTarget) onClose(); }

  const activeSection = SECTIONS.find((s) => s.key === section);

  return (
    <div style={backdropStyle} onClick={handleBackdrop}>
      <div style={modalStyle}>
        <nav style={navStyle}>
          <button onClick={onClose} style={backBtnStyle} type="button">
            <ChevronLeft size={14} strokeWidth={2} />
            <span>Back to app</span>
          </button>
          <div style={{ marginTop: 8 }}>
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  style={{
                    ...navBtnStyle,
                    background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.45)',
                    fontWeight: active ? 600 : 400,
                  }}
                  type="button"
                >
                  <Icon size={15} strokeWidth={1.7} />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div style={contentStyle}>
          <h2 style={pageTitleStyle}>{activeSection?.label}</h2>

          {section === 'system' && (
            <SystemSection
              network={serverSettings?.network}
              io={serverSettings?.io}
              onSaveNetwork={(patch) => saveServerSection('network', patch)}
              onSaveIO={(patch) => saveServerSection('io', patch)}
            />
          )}

          {section === 'agent' && (
            <AgentSection
              llm={serverSettings?.llm}
              instructions={settings.additionalInstructions}
              onSaveLLM={(patch) => saveServerSection('llm', patch)}
              onInstructionsChange={(v) => updateSettings({ additionalInstructions: v })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── System section (Network + I/O) ── */

function SystemSection({ network, io, onSaveNetwork, onSaveIO }) {
  const [netType, setNetType]   = useState('wifi');
  const [ssid, setSsid]         = useState('');
  const [password, setPassword] = useState('');
  const [networks, setNetworks] = useState([]);
  const [connected, setConnected] = useState('');
  const [dirty, setDirty]       = useState(false);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (network) {
      setNetType(network.type || 'wifi');
      setSsid(network.ssid || network.live_ssid || '');
      setPassword(network.password || '');
      setDirty(false);
    }
  }, [network]);

  useEffect(() => {
    fetch(`${API_BASE}/settings/wifi-networks`)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'ok') {
          setNetworks(d.data.networks || []);
          setConnected(d.data.connected || '');
          setSsid((prev) => prev || d.data.connected || '');
        }
      })
      .catch(() => {});
  }, []);

  function mark() { setDirty(true); }

  function handleSave() {
    setSaving(true);
    onSaveNetwork({ type: netType, ssid, password });
    setTimeout(() => { setSaving(false); setDirty(false); }, 600);
  }

  const ssidOptions = networks.includes(ssid) || !ssid
    ? networks
    : [ssid, ...networks];

  return (
    <div>
      <GroupLabel>Network</GroupLabel>
      <FieldGroup>
        <Row label="Type">
          <Select value={netType} onChange={(e) => { setNetType(e.target.value); mark(); }}>
            <option value="wifi">Wi-Fi</option>
            <option value="ethernet">Ethernet</option>
          </Select>
        </Row>
        {netType === 'wifi' && <>
          <Divider />
          <Row label="Network name">
            <Select
              value={ssid}
              onChange={(e) => { setSsid(e.target.value); mark(); }}
            >
              {ssidOptions.length === 0 && <option value="">Scanning…</option>}
              {ssidOptions.map((n) => (
                <option key={n} value={n}>
                  {n}{n === connected ? ' ✓' : ''}
                </option>
              ))}
            </Select>
          </Row>
          <Divider />
          <Row label="Password">
            <input
              type="password"
              style={baseInputStyle}
              value={password}
              onChange={(e) => { setPassword(e.target.value); mark(); }}
              placeholder="Wi-Fi password"
              autoComplete="new-password"
            />
          </Row>
        </>}
      </FieldGroup>

      {dirty && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>
            {saving ? 'Saved' : 'Save'}
          </button>
        </div>
      )}

      <IOSubsection io={io} onSave={onSaveIO} />
    </div>
  );
}

function IOSubsection({ io, onSave }) {
  const [input,   setInput]   = useState('hdmi');
  const [output,  setOutput]  = useState('usb');
  const [machine, setMachine] = useState('windows');
  const [dirty,   setDirty]   = useState(false);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    if (io) {
      setInput(io.input   || 'hdmi');
      setOutput(io.output || 'usb');
      setMachine(io.machine || 'windows');
      setDirty(false);
    }
  }, [io]);

  function mark() { setDirty(true); }

  function handleSave() {
    setSaving(true);
    onSave({ input, output, machine });
    setTimeout(() => { setSaving(false); setDirty(false); }, 600);
  }

  return (
    <>
      <GroupLabel style={{ marginTop: 28 }}>Hardware</GroupLabel>
      <FieldGroup>
        <Row label="Input type">
          <Select value={input} onChange={(e) => { setInput(e.target.value); mark(); }}>
            <option value="hdmi">HDMI</option>
            <option value="usb-c">USB-C</option>
          </Select>
        </Row>
        <Divider />
        <Row label="Output type">
          <Select value={output} onChange={(e) => { setOutput(e.target.value); mark(); }}>
            <option value="usb">USB</option>
            <option value="bluetooth">Bluetooth</option>
          </Select>
        </Row>
        <Divider />
        <Row label="Machine type">
          <Select value={machine} onChange={(e) => { setMachine(e.target.value); mark(); }}>
            <option value="windows">Windows</option>
            <option value="mac">Mac</option>
            <option value="linux">Linux</option>
          </Select>
        </Row>
      </FieldGroup>
      {dirty && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>
            {saving ? 'Saved' : 'Save'}
          </button>
        </div>
      )}
    </>
  );
}

/* ── Agent section (LLM + Instructions) ── */

function AgentSection({ llm, instructions, onSaveLLM, onInstructionsChange }) {
  const [provider, setProvider] = useState('ollama');
  const [url,      setUrl]      = useState(PROVIDER_URLS.ollama);
  const [apiKey,   setApiKey]   = useState('');
  const [model,    setModel]    = useState('');
  const [models,   setModels]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [dirty,    setDirty]    = useState(false);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (llm) {
      setProvider(llm.provider || 'ollama');
      setUrl(llm.url || PROVIDER_URLS[llm.provider] || '');
      setApiKey(llm.api_key || '');
      setModel(llm.model || '');
      setDirty(false);
    }
  }, [llm]);

  function fetchModels() {
    setLoading(true);
    fetch(`${API_BASE}/settings/models`)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'ok') {
          const list = d.data.models || [];
          setModels(list);
          if (list.length && !list.includes(model)) setModel(list[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (llm) fetchModels();
  }, [llm]);

  function handleProviderChange(v) {
    setProvider(v);
    setUrl(PROVIDER_URLS[v] || '');
    setModel('');
    setModels([]);
    setDirty(true);
  }

  function mark() { setDirty(true); }

  function handleSave() {
    setSaving(true);
    onSaveLLM({ provider, url, api_key: apiKey, model });
    setTimeout(() => { setSaving(false); setDirty(false); }, 600);
  }

  const isCustom = provider === 'custom';
  const modelOptions = models.includes(model) || !model ? models : [model, ...models];

  return (
    <div>
      <GroupLabel>Model</GroupLabel>
      <FieldGroup>
        <Row label="Provider">
          <Select value={provider} onChange={(e) => handleProviderChange(e.target.value)}>
            {LLM_PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </Row>
        <Divider />
        <Row label="URL">
          <input
            type="text"
            style={isCustom ? baseInputStyle : { ...baseInputStyle, color: 'rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.04)', cursor: 'default' }}
            value={url}
            readOnly={!isCustom}
            onChange={(e) => { setUrl(e.target.value); mark(); }}
            placeholder="http://localhost:11434"
            autoComplete="off"
            spellCheck={false}
          />
        </Row>
        <Divider />
        <Row label="API key">
          <input
            type="password"
            style={baseInputStyle}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); mark(); }}
            placeholder="sk-…"
            autoComplete="new-password"
          />
        </Row>
        <Divider />
        <Row label="Model">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Select value={model} onChange={(e) => { setModel(e.target.value); mark(); }}>
              {modelOptions.length === 0
                ? <option value="">No models loaded</option>
                : modelOptions.map((m) => <option key={m} value={m}>{m}</option>)
              }
            </Select>
            <button onClick={fetchModels} title="Refresh models" style={refreshBtnStyle} disabled={loading}>
              {loading ? '…' : '↻'}
            </button>
          </div>
        </Row>
      </FieldGroup>

      {dirty && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>
            {saving ? 'Saved' : 'Save'}
          </button>
        </div>
      )}

      <GroupLabel style={{ marginTop: 28 }}>Instructions</GroupLabel>
      <p style={descStyle}>Appended to the system prompt on every agent step.</p>
      <textarea
        value={instructions}
        onChange={(e) => onInstructionsChange(e.target.value)}
        placeholder="e.g. Always maximize windows before acting."
        style={textareaStyle}
        spellCheck={false}
      />
    </div>
  );
}

/* ── Primitives ── */

function Select({ children, disabled, value, defaultValue, onChange }) {
  return (
    <div style={{ position: 'relative', width: 200 }}>
      <select
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={onChange}
        style={{
          ...selectStyle,
          color: disabled ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.85)',
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {children}
      </select>
      <ChevronDown
        size={13}
        style={{
          position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
          color: disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.35)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      {children}
    </div>
  );
}

function FieldGroup({ children }) { return <div style={fieldGroupStyle}>{children}</div>; }
function Divider() { return <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', margin: '0 16px' }} />; }
function GroupLabel({ children, style }) { return <p style={{ ...groupLabelStyle, ...style }}>{children}</p>; }

/* ── Styles ── */

const backdropStyle = {
  position: 'fixed', inset: 0, zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
};

const modalStyle = {
  width: 'min(720px, 94vw)',
  height: 'min(580px, 84vh)',
  background: 'rgba(18, 18, 26, 0.96)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.09)',
  boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
  display: 'flex',
  overflow: 'hidden',
};

const navStyle = {
  width: 190,
  background: 'rgba(255,255,255,0.03)',
  borderRight: '1px solid rgba(255,255,255,0.06)',
  padding: '14px 10px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
};

const backBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '6px 8px',
  border: 'none', background: 'transparent',
  fontSize: 13, color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
  borderRadius: 7, width: '100%', textAlign: 'left',
  marginBottom: 4,
};

const navBtnStyle = {
  display: 'flex', alignItems: 'center', gap: 9,
  padding: '7px 10px',
  border: 'none', cursor: 'pointer',
  fontSize: 13, textAlign: 'left',
  borderRadius: 7, width: '100%',
  transition: 'background 0.1s, color 0.1s',
};

const contentStyle = {
  flex: 1, overflow: 'auto',
  padding: '32px 36px',
};

const pageTitleStyle = {
  margin: '0 0 28px',
  fontSize: 22, fontWeight: 700,
  color: 'rgba(255,255,255,0.92)',
  letterSpacing: '-0.02em',
};

const groupLabelStyle = {
  margin: '0 0 8px',
  fontSize: 13, fontWeight: 600,
  color: 'rgba(255,255,255,0.55)',
};

const descStyle = {
  margin: '-4px 0 12px',
  fontSize: 12.5,
  color: 'rgba(255,255,255,0.3)',
  lineHeight: 1.55,
};

const fieldGroupStyle = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 10,
  overflow: 'hidden',
};

const rowStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '11px 16px', minHeight: 44,
};

const rowLabelStyle = {
  fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: 400,
};

const baseInputStyle = {
  width: 200, padding: '6px 10px',
  borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)',
  fontSize: 12.5, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', background: 'rgba(255,255,255,0.07)',
  color: 'rgba(255,255,255,0.85)',
};

const selectStyle = {
  ...baseInputStyle,
  appearance: 'none',
  paddingRight: 26,
  cursor: 'pointer',
};

const textareaStyle = {
  width: '100%', minHeight: 160,
  padding: '12px 14px', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.1)',
  fontSize: 13, lineHeight: 1.6,
  color: 'rgba(255,255,255,0.85)',
  background: 'rgba(255,255,255,0.06)',
  resize: 'vertical', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
};

const saveBtnStyle = {
  padding: '7px 18px',
  border: 'none', borderRadius: 7,
  background: 'rgba(99,102,241,0.85)',
  color: '#fff', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
  transition: 'background 0.15s',
};

const refreshBtnStyle = {
  padding: '5px 9px',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 7,
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.55)',
  fontSize: 14, cursor: 'pointer',
  fontFamily: 'inherit', lineHeight: 1,
  flexShrink: 0,
};
