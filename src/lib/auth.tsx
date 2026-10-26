import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { importLocalData, setStorageUser } from './storage'
import { supabase } from './supabase'

interface AuthState {
  /** undefined = wird noch geprüft */
  session: Session | null | undefined
  /** Meldung nach dem Anmelden, z. B. wie viele Bücher übernommen wurden */
  notice: string | null
  clearNotice: () => void
  sendLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let current: string | null | undefined
    const apply = async (s: Session | null) => {
      const id = s?.user.id ?? null
      if (id === current) {
        setSession(s)
        return
      }
      current = id
      setStorageUser(id)
      if (id) {
        try {
          const n = await importLocalData()
          if (n > 0) setNotice(`${n} ${n === 1 ? 'Buch' : 'Bücher'} aus diesem Browser in dein Konto übernommen.`)
        } catch (e) {
          setNotice(`Bücher aus diesem Browser konnten nicht übernommen werden: ${e instanceof Error ? e.message : e}`)
        }
      }
      setSession(s)
    }
    // Nacheinander abarbeiten, damit die Seiten erst nach dem Übernehmen der Bücher laden
    let queue = Promise.resolve()
    const enqueue = (s: Session | null) => {
      queue = queue.then(() => apply(s))
    }
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      // Supabase empfiehlt, im Callback nicht direkt weitere Supabase-Aufrufe abzuwarten
      setTimeout(() => enqueue(s), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const sendLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    })
    if (error) throw new Error(error.message)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, notice, clearNotice: () => setNotice(null), sendLink, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth außerhalb von AuthProvider')
  return ctx
}
