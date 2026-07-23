import { AuthForm } from '@/components/AuthForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-4">
      {/* Subtle background glow effect can be added here if needed */}
      <AuthForm />
    </div>
  )
}
