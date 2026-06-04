'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { Check, Copy, Monitor, Cpu, Wifi, MousePointer2, ChevronRight } from 'lucide-react'

const INSTALL_CMD = 'curl -fsSL https://guidenco.app/install.sh | bash'

export default function LandingPage() {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.session) router.replace('/dashboard')
    })
    return () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current)
    }
  }, [router])

  function handleCopy() {
    navigator.clipboard.writeText(INSTALL_CMD)
    setCopied(true)
    copyTimeout.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-black text-[#fcfdff] min-h-screen overflow-x-hidden">

      {/* ── Nav ── */}
      <nav className="fixed top-0 inset-x-0 z-50 h-16 border-b border-white/[0.06] bg-black/80 backdrop-blur-sm flex items-center px-6 md:px-10">
        <div className="flex-1">
          <span className="font-display text-xl tracking-tight text-[#fcfdff]">Guidenco</span>
        </div>
        <Link
          href="/sign-in"
          className="h-9 px-4 rounded-lg bg-[#fcfdff] text-black text-sm font-medium inline-flex items-center gap-1.5 hover:bg-[#f1f7fe] transition-colors"
        >
          Sign in <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-40 pb-28 px-6 md:px-10 text-center overflow-hidden">
        {/* atmospheric glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
          style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(34,255,153,0.11) 0%, transparent 70%)' }}
        />

        <div className="relative max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#101012] border border-white/[0.14] px-3 py-1 text-xs text-[rgba(252,253,255,0.7)] mb-8">
            <span className="inline-block w-2 h-2 rounded-full bg-[#11ff99]" />
            Open beta — Raspberry Pi
          </div>

          <h1 className="font-display text-[clamp(44px,7vw,88px)] leading-[1.0] tracking-[-0.03em] text-[#fcfdff] mb-6">
            Control any machine.<br />From anywhere.
          </h1>

          <p className="text-[rgba(252,253,255,0.7)] text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-10 font-sans">
            Plug a Raspberry Pi between your HDMI device and the internet. Guidenco streams the screen to your browser and forwards keyboard &amp; mouse — no agents, no VPN, no configuration.
          </p>

          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 h-10 px-6 rounded-lg bg-[#fcfdff] text-black text-sm font-medium hover:bg-[#f1f7fe] transition-colors"
          >
            Get started free <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Install strip ── */}
      <section className="relative py-20 px-6 md:px-10 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[400px]"
          style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(0,117,255,0.18) 0%, transparent 70%)' }}
        />

        <div className="relative max-w-3xl mx-auto text-center">
          <p className="text-xs font-medium tracking-[0.08em] uppercase text-[#a1a4a5] mb-4">One-line install</p>
          <h2 className="font-display text-[clamp(28px,4vw,48px)] leading-[1.0] tracking-[-0.02em] mb-8">
            On your Pi in seconds
          </h2>

          {/* code window */}
          <div className="rounded-xl border border-white/[0.14] bg-[#06060a] p-5 text-left">
            {/* traffic lights */}
            <div className="flex items-center gap-1.5 mb-4">
              <span className="w-3 h-3 rounded-full bg-[#ff2047]" />
              <span className="w-3 h-3 rounded-full bg-[#ffc53d]" />
              <span className="w-3 h-3 rounded-full bg-[#11ff99]" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <code className="font-mono text-sm text-[rgba(252,253,255,0.86)] select-all">
                <span className="text-[#a1a4a5] mr-2">$</span>{INSTALL_CMD}
              </code>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#101012] border border-white/[0.14] text-xs text-[rgba(252,253,255,0.7)] hover:text-[#fcfdff] hover:border-white/25 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#11ff99]" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <p className="mt-4 text-sm text-[#888e90]">
            Runs on Ubuntu Server · Any Raspberry Pi model · Auto-detects capture hardware
          </p>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-24 px-6 md:px-10">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-medium tracking-[0.08em] uppercase text-[#a1a4a5] mb-4 text-center">How it works</p>
          <h2 className="font-display text-[clamp(28px,4vw,48px)] leading-[1.0] tracking-[-0.02em] text-center mb-14">
            Three parts, zero complexity
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: <Monitor className="w-5 h-5" />,
                title: 'HDMI capture',
                body: 'The Pi captures your device\'s HDMI output through a USB capture card or HDMI-to-CSI adapter. It sees exactly what\'s on screen — OS boot, BIOS, everything.',
                glow: 'rgba(255,89,0,0.12)',
              },
              {
                icon: <Wifi className="w-5 h-5" />,
                title: 'WebRTC stream',
                body: 'The Pi opens a secure WebRTC connection to the Guidenco relay. Low-latency video and a bidirectional control channel flow over a single encrypted peer connection.',
                glow: 'rgba(0,117,255,0.12)',
              },
              {
                icon: <MousePointer2 className="w-5 h-5" />,
                title: 'Browser control',
                body: 'You see the live feed in your browser. Clicks and keystrokes are forwarded to the Pi, which replays them as real USB HID events — indistinguishable from a physical keyboard and mouse.',
                glow: 'rgba(34,255,153,0.10)',
              },
            ].map(({ icon, title, body, glow }) => (
              <div
                key={title}
                className="rounded-xl border border-white/[0.14] bg-[#0a0a0c] p-8 relative overflow-hidden"
              >
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-32"
                  style={{ background: `radial-gradient(ellipse 80% 100% at 50% 0%, ${glow} 0%, transparent 80%)` }}
                />
                <div className="relative">
                  <div className="w-10 h-10 rounded-lg bg-[#101012] border border-white/[0.14] flex items-center justify-center text-[rgba(252,253,255,0.7)] mb-5">
                    {icon}
                  </div>
                  <h3 className="text-base font-medium text-[#fcfdff] mb-3">{title}</h3>
                  <p className="text-sm text-[rgba(252,253,255,0.7)] leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Supported configurations ── */}
      <section className="py-24 px-6 md:px-10 border-t border-white/[0.04]">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-medium tracking-[0.08em] uppercase text-[#a1a4a5] mb-4 text-center">Hardware</p>
          <h2 className="font-display text-[clamp(28px,4vw,48px)] leading-[1.0] tracking-[-0.02em] text-center mb-14">
            Supported configurations
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Pi models */}
            <div className="rounded-xl border border-white/[0.14] bg-[#0a0a0c] p-8">
              <div className="flex items-center gap-2 mb-5">
                <Cpu className="w-4 h-4 text-[#a1a4a5]" />
                <span className="text-xs font-medium tracking-[0.06em] uppercase text-[#a1a4a5]">Compute</span>
              </div>
              <h3 className="text-base font-medium mb-4">Raspberry Pi</h3>
              <ul className="space-y-2">
                {['Pi Zero 2 W', 'Pi 3A+ / 3B+', 'Pi 4 Model B', 'Pi 5'].map(m => (
                  <li key={m} className="flex items-center gap-2 text-sm text-[rgba(252,253,255,0.7)]">
                    <span className="w-1 h-1 rounded-full bg-[#11ff99] flex-shrink-0" />
                    {m}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-[#888e90] leading-relaxed">
                Any model running Ubuntu Server 22.04 or 24.04 (64-bit).
              </p>
            </div>

            {/* USB capture */}
            <div className="rounded-xl border border-white/[0.14] bg-[#0a0a0c] p-8">
              <div className="flex items-center gap-2 mb-5">
                <Monitor className="w-4 h-4 text-[#a1a4a5]" />
                <span className="text-xs font-medium tracking-[0.06em] uppercase text-[#a1a4a5]">USB capture</span>
              </div>
              <h3 className="text-base font-medium mb-4">USB HDMI capture cards</h3>
              <ul className="space-y-2">
                {[
                  'Macrosilicon MS2109 / MS2130',
                  'Actions Semiconductor (1de1)',
                  'em28xx family (Hauppauge etc.)',
                  'Generic USB Video Class',
                ].map(m => (
                  <li key={m} className="flex items-center gap-2 text-sm text-[rgba(252,253,255,0.7)]">
                    <span className="w-1 h-1 rounded-full bg-[#3b9eff] flex-shrink-0" />
                    {m}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-[#888e90] leading-relaxed">
                Plug in and the installer auto-detects the chipset. No configuration needed.
              </p>
            </div>

            {/* CSI adapter */}
            <div className="rounded-xl border border-white/[0.14] bg-[#0a0a0c] p-8">
              <div className="flex items-center gap-2 mb-5">
                <Wifi className="w-4 h-4 text-[#a1a4a5]" />
                <span className="text-xs font-medium tracking-[0.06em] uppercase text-[#a1a4a5]">CSI adapter</span>
              </div>
              <h3 className="text-base font-medium mb-4">HDMI-to-CSI adapters</h3>
              <ul className="space-y-2">
                {[
                  'TC358743 chipset',
                  'Geekworm HDMI to CSI-2',
                  'Auvidea B101 / B102',
                  'Waveshare HDMI to CSI',
                ].map(m => (
                  <li key={m} className="flex items-center gap-2 text-sm text-[rgba(252,253,255,0.7)]">
                    <span className="w-1 h-1 rounded-full bg-[#ff801f] flex-shrink-0" />
                    {m}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-[#888e90] leading-relaxed">
                Installer patches config.txt and loads the tc358743 kernel module automatically.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-white/[0.06] bg-[#06060a] px-6 py-4 flex items-start gap-4">
            <span className="w-2 h-2 rounded-full bg-[#11ff99] mt-1.5 flex-shrink-0" />
            <p className="text-sm text-[rgba(252,253,255,0.7)] leading-relaxed">
              <span className="text-[#fcfdff] font-medium">Target device:</span>{' '}
              anything with an HDMI output — servers, desktops, laptops, single-board computers, or game consoles. The Pi acts as a transparent passthrough.
            </p>
          </div>
        </div>
      </section>

      {/* ── Step-by-step workflow ── */}
      <section className="relative py-24 px-6 md:px-10 border-t border-white/[0.04] overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[500px]"
          style={{ background: 'radial-gradient(ellipse 55% 50% at 50% 0%, rgba(255,89,0,0.09) 0%, transparent 70%)' }}
        />

        <div className="relative max-w-3xl mx-auto">
          <p className="text-xs font-medium tracking-[0.08em] uppercase text-[#a1a4a5] mb-4 text-center">Setup guide</p>
          <h2 className="font-display text-[clamp(28px,4vw,48px)] leading-[1.0] tracking-[-0.02em] text-center mb-14">
            Up and running in 15 minutes
          </h2>

          <ol className="space-y-0">
            {[
              {
                n: '01',
                title: 'Flash your Raspberry Pi',
                body: 'Use the Raspberry Pi Imager to write Ubuntu Server 22.04 or 24.04 (64-bit) to an SD card. Enable SSH and set a username/password in the imager\'s advanced settings before flashing.',
              },
              {
                n: '02',
                title: 'Connect the capture hardware',
                body: 'Plug your USB HDMI capture card into the Pi\'s USB port, or attach an HDMI-to-CSI adapter to the CSI ribbon connector. Then connect the target device\'s HDMI output to the capture card\'s input.',
              },
              {
                n: '03',
                title: 'Connect the USB HID cable',
                body: 'Run a USB-A to USB-A (or USB-C) cable from the Pi\'s OTG port to a USB port on the target device. This allows the Pi to appear as a keyboard and mouse to the target machine.',
              },
              {
                n: '04',
                title: 'Run the install script',
                body: (
                  <>
                    SSH into the Pi and run the one-line installer. It installs dependencies, detects your capture hardware, and registers the device with Guidenco.{' '}
                    <code className="font-mono text-xs bg-[#0a0a0c] border border-white/[0.14] rounded px-1.5 py-0.5 text-[rgba(252,253,255,0.86)]">
                      curl -fsSL https://guidenco.app/install.sh | bash
                    </code>
                  </>
                ),
              },
              {
                n: '05',
                title: 'Note your pairing code',
                body: 'After the script finishes it prints a short pairing code in the terminal — something like "A1B2C3". The code is valid for 15 minutes.',
              },
              {
                n: '06',
                title: 'Sign in and add your device',
                body: 'Open guidenco.app in your browser. Sign in (or create a free account), click Add Device, and enter the pairing code. The Pi and your account are now linked.',
              },
              {
                n: '07',
                title: 'Start controlling',
                body: 'Your device appears in the dashboard. Click Connect — the live HDMI feed opens in your browser. Click anywhere on the stream to send mouse events; type to send keystrokes. That\'s it.',
              },
            ].map(({ n, title, body }, i, arr) => (
              <li key={n} className="flex gap-6 group">
                {/* step spine */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full border border-white/[0.14] bg-[#0a0a0c] flex items-center justify-center flex-shrink-0">
                    <span className="font-mono text-[10px] text-[#a1a4a5]">{n}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="w-px flex-1 bg-white/[0.06] mt-2 mb-0 min-h-[40px]" />
                  )}
                </div>

                {/* step content */}
                <div className={`pb-10 ${i === arr.length - 1 ? 'pb-0' : ''}`}>
                  <h3 className="text-sm font-medium text-[#fcfdff] mb-1.5 mt-1">{title}</h3>
                  <p className="text-sm text-[rgba(252,253,255,0.7)] leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── CTA band ── */}
      <section className="py-24 px-6 md:px-10 border-t border-white/[0.04] text-center">
        <h2 className="font-display text-[clamp(32px,5vw,64px)] leading-[1.0] tracking-[-0.02em] mb-6">
          Ready to connect?
        </h2>
        <p className="text-[rgba(252,253,255,0.7)] text-lg max-w-md mx-auto mb-8">
          Create a free account and have your first device online in minutes.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-lg bg-[#fcfdff] text-black text-sm font-medium hover:bg-[#f1f7fe] transition-colors"
          >
            Sign in to Guidenco <ChevronRight className="w-4 h-4" />
          </Link>
          <button
            onClick={handleCopy}
            className="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-lg border border-white/[0.14] bg-transparent text-[#fcfdff] text-sm font-medium hover:border-white/25 transition-colors font-mono"
          >
            {copied ? <Check className="w-4 h-4 text-[#11ff99]" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : INSTALL_CMD}
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] px-6 md:px-10 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-display text-base text-[rgba(252,253,255,0.7)]">Guidenco</span>
          <div className="flex items-center gap-6 text-sm text-[#888e90]">
            <Link href="/sign-in" className="hover:text-[#fcfdff] transition-colors">Sign in</Link>
            <Link href="/sign-up" className="hover:text-[#fcfdff] transition-colors">Sign up</Link>
          </div>
          <p className="text-xs text-[#464a4d]">© {new Date().getFullYear()} Guidenco</p>
        </div>
      </footer>
    </div>
  )
}
