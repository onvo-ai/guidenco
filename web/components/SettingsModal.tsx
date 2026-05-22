'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

interface Secret {
  id: string
  key: string
  value: string
  description: string
  updatedAt: string
}

type Tab = 'secrets' | 'mcp' | 'account'

const KEY_RE = /^[A-Z][A-Z0-9_]*$/

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('secrets')

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '90%', maxWidth: 640, maxHeight: '85vh',
          borderRadius: 14, background: 'rgb(18,18,26)',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>Settings</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <TabBtn active={tab === 'secrets'} onClick={() => setTab('secrets')}>Secrets</TabBtn>
          <TabBtn active={tab === 'mcp'}     onClick={() => setTab('mcp')}>MCP</TabBtn>
          <TabBtn active={tab === 'account'} onClick={() => setTab('account')}>Account</TabBtn>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20 }}>
          {tab === 'secrets' && <SecretsPanel />}
          {tab === 'mcp'     && <MCPPanel />}
          {tab === 'account' && <AccountPanel onSignedOut={() => router.push('/sign-in')} />}
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        padding: '8px 14px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid #fff' : '2px solid transparent',
        color: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.4)',
        fontSize: 13, fontWeight: 500,
        cursor: 'pointer',
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  )
}

// ─── Secrets ────────────────────────────────────────────────────────────────

function SecretsPanel() {
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<'new' | string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/secrets', { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSecrets(await res.json())
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm('Delete this secret? Any agent prompts that reference it will break.')) return
    await fetch(`/api/secrets/${id}`, { method: 'DELETE', credentials: 'include' })
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, margin: 0 }}>
        Reference these in agent goals or instructions using <code style={inlineCode}>{'{{KEY_NAME}}'}</code>.
        The agent will substitute the value when typing — the LLM never sees the actual value.
      </p>

      {error && <div style={errorBoxStyle}>{error}</div>}
      {loading && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>}

      {!loading && secrets.length === 0 && editing !== 'new' && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', padding: '12px 0' }}>
          No secrets yet.
        </div>
      )}

      {secrets.map(s =>
        editing === s.id ? (
          <SecretForm
            key={s.id}
            initial={s}
            onCancel={() => setEditing(null)}
            onSaved={() => { setEditing(null); load() }}
          />
        ) : (
          <div key={s.id} style={secretRowStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={keyChipStyle}>{`{{${s.key}}}`}</code>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>•••••</span>
              </div>
              {s.description && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{s.description}</div>
              )}
            </div>
            <button onClick={() => setEditing(s.id)} style={iconBtnStyle}>Edit</button>
            <button onClick={() => handleDelete(s.id)} style={{ ...iconBtnStyle, color: '#f87171' }}>Delete</button>
          </div>
        )
      )}

      {editing === 'new' ? (
        <SecretForm
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      ) : (
        <button onClick={() => setEditing('new')} style={addBtnStyle}>
          + Add secret
        </button>
      )}
    </div>
  )
}

function SecretForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: Secret
  onCancel: () => void
  onSaved: () => void
}) {
  const [key, setKey] = useState(initial?.key ?? '')
  const [value, setValue] = useState(initial?.value ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [showValue, setShowValue] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function normalizeKey(v: string): string {
    // Only allow A-Z 0-9 _; uppercase any input
    return v.toUpperCase().replace(/[^A-Z0-9_]/g, '')
  }

  const validKey = KEY_RE.test(key)
  const canSave  = validKey && value.length > 0 && !saving

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const url = initial ? `/api/secrets/${initial.id}` : '/api/secrets'
      const method = initial ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, description }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      onSaved()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    }
    setSaving(false)
  }

  return (
    <div style={{ ...secretRowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: 12 }}>
      <div style={fieldGroupStyle}>
        <label style={fieldLabelStyle}>Key</label>
        <input
          value={key}
          onChange={e => setKey(normalizeKey(e.target.value))}
          placeholder="MY_API_KEY"
          style={inputStyle}
          autoFocus={!initial}
        />
        {!validKey && key.length > 0 && (
          <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>Must start with a letter, A–Z 0–9 _ only.</div>
        )}
      </div>

      <div style={fieldGroupStyle}>
        <label style={fieldLabelStyle}>Value</label>
        <div style={{ position: 'relative' }}>
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            type={showValue ? 'text' : 'password'}
            placeholder="The actual secret value"
            style={{ ...inputStyle, paddingRight: 60 }}
          />
          <button
            type="button"
            onClick={() => setShowValue(s => !s)}
            style={{ position: 'absolute', right: 6, top: 6, bottom: 6, padding: '0 10px', fontSize: 11, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            {showValue ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div style={fieldGroupStyle}>
        <label style={fieldLabelStyle}>Description (optional)</label>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What this secret is for"
          style={inputStyle}
        />
      </div>

      {error && <div style={errorBoxStyle}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={cancelBtnStyle}>Cancel</button>
        <button onClick={save} disabled={!canSave} style={{ ...saveBtnStyle, opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'not-allowed' }}>
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Add secret'}
        </button>
      </div>
    </div>
  )
}

// ─── MCP ────────────────────────────────────────────────────────────────────

function MCPPanel() {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const configSnippet = JSON.stringify({
    mcpServers: {
      guidenco: {
        url: `${baseUrl}/api/mcp`,
        transport: 'http',
      },
    },
  }, null, 2)

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, margin: 0 }}>
        Connect Claude Desktop or Claude Code to Guidenco as an MCP server. The agent
        will be able to call your devices, send goals, and query device state via tool use.
      </p>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Endpoint
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code style={{ ...inlineCode, flex: 1, padding: '8px 12px', fontSize: 12 }}>{baseUrl}/api/mcp</code>
          <button onClick={() => copy(`${baseUrl}/api/mcp`)} style={iconBtnStyle}>Copy</button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Claude Desktop config
        </div>
        <pre style={preStyle}>{configSnippet}</pre>
        <button onClick={() => copy(configSnippet)} style={{ ...iconBtnStyle, marginTop: 6 }}>Copy JSON</button>
      </div>

      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, margin: 0 }}>
        Coming soon: API token issuance for MCP auth. For now the endpoint reuses your session cookie.
      </p>
    </div>
  )
}

// ─── Account ────────────────────────────────────────────────────────────────

function AccountPanel({ onSignedOut }: { onSignedOut: () => void }) {
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    await authClient.signOut().catch(() => {})
    onSignedOut()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>Sign out of this device.</p>
      <button onClick={signOut} disabled={signingOut} style={{
        alignSelf: 'flex-start',
        padding: '8px 16px',
        background: 'rgba(248,113,113,0.15)',
        color: '#fca5a5',
        border: '1px solid rgba(248,113,113,0.3)',
        borderRadius: 6,
        fontSize: 13, fontWeight: 500,
        cursor: signingOut ? 'wait' : 'pointer',
      }}>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const secretRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 8,
}
const keyChipStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 12, color: '#86efac',
  background: 'rgba(74,222,128,0.08)',
  padding: '3px 8px', borderRadius: 4,
}
const iconBtnStyle: React.CSSProperties = {
  padding: '5px 10px',
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.7)',
  border: 'none', borderRadius: 4,
  fontSize: 12, cursor: 'pointer',
}
const addBtnStyle: React.CSSProperties = {
  padding: '10px',
  background: 'transparent',
  color: 'rgba(255,255,255,0.55)',
  border: '1px dashed rgba(255,255,255,0.15)',
  borderRadius: 8,
  fontSize: 13, cursor: 'pointer',
}
const fieldGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  color: 'rgba(255,255,255,0.9)',
  fontSize: 13, outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
}
const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  color: 'rgba(255,255,255,0.5)',
  border: 'none',
  fontSize: 13, cursor: 'pointer',
}
const saveBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'rgba(255,255,255,0.15)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 6,
  fontSize: 13, fontWeight: 500,
}
const errorBoxStyle: React.CSSProperties = {
  padding: '8px 10px',
  background: 'rgba(248,113,113,0.1)',
  border: '1px solid rgba(248,113,113,0.25)',
  borderRadius: 6,
  fontSize: 12, color: '#fca5a5',
}
const preStyle: React.CSSProperties = {
  margin: 0,
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  fontSize: 12, color: 'rgba(255,255,255,0.85)',
  fontFamily: 'ui-monospace, monospace',
  overflowX: 'auto',
  whiteSpace: 'pre',
}
const inlineCode: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  padding: '1px 6px',
  borderRadius: 3,
  fontSize: 12,
  fontFamily: 'ui-monospace, monospace',
  color: 'rgba(255,255,255,0.85)',
}
