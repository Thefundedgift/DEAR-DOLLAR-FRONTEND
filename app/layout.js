import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'DEAR DOLLAR — Buy & Sell $Dollar',
  description: 'DEAR DOLLAR customer app — Powered by INTERNET ZONE. Add money via UPI, buy and sell $Dollar securely.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0a0a1a',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="bg-[#070812] text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
