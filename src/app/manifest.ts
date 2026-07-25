import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SPM Mastery Deck',
    short_name: 'Mastery',
    description: 'Master your SPM subjects with scientifically proven spaced repetition',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A0A0A',
    theme_color: '#3b82f6',
    icons: [
      {
        src: '/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: '/icon-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
    ],
  }
}
