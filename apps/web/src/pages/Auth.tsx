import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { signIn, signUp } from 'supertokens-auth-react/recipe/emailpassword'
import { AuthScreen, type AuthMode } from '@investment-plan/ui'

export default function Auth() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const [mode, setMode] = useState<AuthMode>(
    params.get('show') === 'signup' ? 'signup' : 'signin',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const next: AuthMode = params.get('show') === 'signup' ? 'signup' : 'signin'
    setMode((prev) => (prev === next ? prev : next))
  }, [params])

  function handleModeChange(next: AuthMode) {
    setError(null)
    setMode(next)
    const sp = new URLSearchParams(params)
    if (next === 'signup') sp.set('show', 'signup')
    else sp.delete('show')
    setParams(sp, { replace: true })
  }

  async function handleSubmit(email: string, password: string) {
    setLoading(true)
    setError(null)
    try {
      const fn = mode === 'signup' ? signUp : signIn
      const res = await fn({
        formFields: [
          { id: 'email', value: email },
          { id: 'password', value: password },
        ],
      })

      if (res.status === 'OK') {
        const redirectTo = params.get('redirectTo') || '/app'
        navigate(redirectTo, { replace: true })
        return
      }
      if (res.status === 'FIELD_ERROR') {
        setError(res.formFields.map((f) => f.error).join(' · '))
        return
      }
      if (res.status === 'WRONG_CREDENTIALS_ERROR') {
        setError('Wrong email or password.')
        return
      }
      if (
        res.status === 'SIGN_IN_NOT_ALLOWED' ||
        res.status === 'SIGN_UP_NOT_ALLOWED'
      ) {
        setError((res as { reason?: string }).reason ?? 'Not allowed.')
        return
      }
      setError('Something went wrong. Try again.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthScreen
      mode={mode}
      onModeChange={handleModeChange}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    />
  )
}
