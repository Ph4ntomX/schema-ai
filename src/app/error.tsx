'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-6 text-center text-white">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <p className="text-[#a1a1aa] mb-8 max-w-md">
        This might be due to a poor network connection. If you are trying to use the app offline, please make sure your data is fully synced.
      </p>
      <button
        onClick={() => reset()}
        className="bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-gray-200 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
