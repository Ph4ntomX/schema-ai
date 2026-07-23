import { Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#a1a1aa] animate-spin" />
      <p className="text-[#a1a1aa] text-sm mt-4 font-medium tracking-wide">Loading schema.ai...</p>
    </div>
  )
}
