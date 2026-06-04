import type { Metadata } from 'next'
import { DM_Serif_Display, Inter, Geist_Mono } from 'next/font/google'
import './globals.css'

const dmSerifDisplay = DM_Serif_Display({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-display',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Guidenco — Control any machine, from anywhere',
  description: 'Vision-driven remote desktop automation for Raspberry Pi. Stream HDMI, send keyboard and mouse input, all from a browser.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSerifDisplay.variable} ${inter.variable} ${geistMono.variable}`}>
      <body className="bg-black text-[#fcfdff] min-h-screen antialiased font-sans">
        {children}
      </body>
    </html>
  )
}
