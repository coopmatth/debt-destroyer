import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Debt Destroyer',
    short_name: 'DebtDestroyer',
    description: 'Live Cashflow & Automated Debt Avalanche Engine',
    start_url: '/',
    display: 'standalone',
    background_color: '#080c14',
    theme_color: '#080c14',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  }
}
