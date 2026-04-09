import AuthForm from '@/components/auth/AuthForm'

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden dot-pattern">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-green-600/10 rounded-full blur-[120px]" />
      </div>
      <div className="z-10 w-full max-w-md">
        <AuthForm type="register" />
      </div>
    </main>
  )
}
