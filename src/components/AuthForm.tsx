'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { login, signup } from '@/app/login/actions'
import { Loader2 } from 'lucide-react'

export function AuthForm() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const formData = new FormData(e.currentTarget)
    
    startTransition(async () => {
      if (isSignUp) {
        const result = await signup(formData)
        if (result?.error) setError(result.error)
        if (result?.success) setSuccess(result.success)
      } else {
        const result = await login(formData)
        if (result?.error) setError(result.error)
      }
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="w-full max-w-sm"
    >
      <div className="bg-[#171717] border border-[#262626] rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        {/* Minimal header */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-white tracking-tight">
            {isSignUp ? 'Create Account' : 'Welcome back'}
          </h2>
          <p className="text-[#a1a1aa] text-sm mt-1">
            {isSignUp ? 'Sign up to start your journey' : 'Enter your details to sign in'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-5">
            <div className="relative group" suppressHydrationWarning>
              <input
                type="email"
                name="email"
                id="email"
                placeholder="Email address"
                required
                className="w-full bg-[#111111] text-white px-4 py-3 rounded-lg text-sm transition-all focus:outline-none focus:ring-1 focus:ring-[#3f3f46] border border-transparent placeholder-[#71717a]"
              />
            </div>
            
            <div className="relative group" suppressHydrationWarning>
              <input
                type="password"
                name="password"
                id="password"
                placeholder="Password"
                required
                minLength={6}
                className="w-full bg-[#111111] text-white px-4 py-3 rounded-lg text-sm transition-all focus:outline-none focus:ring-1 focus:ring-[#3f3f46] border border-transparent placeholder-[#71717a]"
              />
            </div>
          </div>

          <div className="h-5 relative">
            <AnimatePresence mode="wait">
              {error && (
                <motion.p
                  key="error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-[#ef4444] text-xs font-medium absolute top-0 left-0"
                >
                  {error}
                </motion.p>
              )}
              {success && (
                <motion.p
                  key="success"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-[#10b981] text-xs font-medium absolute top-0 left-0"
                >
                  {success}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-white text-black font-medium py-3 rounded-lg text-sm hover:bg-[#e4e4e7] transition-colors flex items-center justify-center h-[44px]"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin text-[#52525b]" /> : isSignUp ? 'Sign up' : 'Sign in'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-xs text-[#71717a]">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError(null)
                setSuccess(null)
              }}
              className="text-white hover:underline focus:outline-none transition-all"
            >
              {isSignUp ? 'Sign in' : 'Create account'}
            </button>
          </p>
        </div>
      </div>
    </motion.div>
  )
}
