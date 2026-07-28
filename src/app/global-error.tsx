'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 text-center text-white font-sans">
        <h2 className="text-2xl font-bold mb-4">Critical Error</h2>
        <p className="text-[#a1a1aa] mb-8 max-w-md">
          A critical error occurred while loading the app. This is typically caused by a poor network connection or an offline cache miss.
        </p>
        <button
          onClick={() => reset()}
          className="bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-gray-200 transition-colors"
        >
          Reload Application
        </button>
      </body>
    </html>
  )
}
