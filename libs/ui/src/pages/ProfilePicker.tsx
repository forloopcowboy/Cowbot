import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useApi } from '../api-context'
import logoUrl from '../assets/logo.svg'
import LanguagePicker from '../components/LanguagePicker'

type CreateMode = null | 'choice' | 'clone'

export default function ProfilePicker({ to }: { to?: string }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const api = useApi()
  const [profiles, setProfiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<CreateMode>(null)
  const [newName, setNewName] = useState('')
  const [cloneFrom, setCloneFrom] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    const list = await api.listProfiles()
    setProfiles(list)
    if (list.length && !cloneFrom) setCloneFrom(list[0])
    setLoading(false)
  }
  useEffect(() => {
    refresh()
  }, []) // eslint-disable-line

  const handleClone = async () => {
    setError(null)
    if (!cloneFrom) {
      setError(t('profilePicker.clone.errorPickSource'))
      return
    }
    try {
      await api.createProfile(newName.trim(), cloneFrom)
      setNewName('')
      setMode(null)
      await refresh()
      navigate(`/app/p/${newName.trim()}/settings`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const empty = !loading && profiles.length === 0

  return (
    <div className="min-h-full bg-canvas dark:bg-ink flex flex-col">
      <div className="titlebar h-9 shrink-0" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16 w-full">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {to ? (
            <Link to={to} className="flex items-center gap-3 group">
              <img src={logoUrl} alt="" className="h-10 w-10" />
              <div className="text-[11px] uppercase tracking-[0.22em] text-gold-500 group-hover:text-gold-400 transition-colors">
                {t('app.name')}
              </div>
            </Link>
          ) : (
            <>
              <img src={logoUrl} alt="" className="h-10 w-10" />
              <div className="text-[11px] uppercase tracking-[0.22em] text-gold-500">
                {t('app.name')}
              </div>
            </>
          )}
          <div className="ml-auto">
            <LanguagePicker variant="landing" />
          </div>
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-navy-900 dark:text-cream">
          {t('profilePicker.title')}
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">{t('profilePicker.subtitle')}</p>

        {empty && (
          <div className="card mt-10 p-6 sm:p-8 text-center">
            <div className="font-serif text-2xl text-navy-900 dark:text-cream font-semibold">
              {t('profilePicker.empty.title')}
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t('profilePicker.empty.body')}
            </p>
            <button
              onClick={() => navigate('/app/new')}
              className="btn-primary mt-5"
            >
              {t('profilePicker.empty.start')}
            </button>
          </div>
        )}

        {!empty && (
          <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {loading && <div className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</div>}
            {!loading &&
              profiles.map((p) => (
                <button
                  key={p}
                  onClick={() => navigate(`/app/p/${p}/settings`)}
                  className="card text-left p-5 hover:border-navy-700 dark:hover:border-gold-500 hover:shadow-md dark:hover:shadow-none transition-all group"
                >
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1.5">
                    {t('profilePicker.eyebrow')}
                  </div>
                  <div className="font-serif text-2xl text-navy-900 dark:text-cream font-semibold group-hover:text-navy-800 dark:group-hover:text-gold-300">
                    {p}
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-gold-600 dark:text-gold-300">
                    {t('profilePicker.open')}
                    <span className="transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </div>
                </button>
              ))}

            {!loading && !mode && (
              <button
                onClick={() => setMode('choice')}
                className="rounded-lg border-2 border-dashed border-slate-300 dark:border-navy-700 p-5 text-left hover:border-gold-500 hover:bg-white dark:hover:bg-navy-900 dark:hover:border-gold-500 transition-colors"
              >
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1.5">
                  {t('profilePicker.new')}
                </div>
                <div className="font-serif text-2xl text-slate-700 dark:text-slate-200">
                  {t('profilePicker.createProfile')}
                </div>
              </button>
            )}
          </div>
        )}

        {mode === 'choice' && (
          <div className="card mt-8 p-5 sm:p-6">
            <h2 className="font-serif text-xl text-navy-900 dark:text-cream font-semibold">
              {t('profilePicker.modal.createTitle')}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {t('profilePicker.modal.createHint')}
            </p>
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => navigate('/app/new')}
                className="rounded border border-slate-200 dark:border-navy-700 hover:border-navy-700 dark:hover:border-gold-500 p-4 text-left bg-white dark:bg-navy-900"
              >
                <div className="font-serif text-lg text-navy-900 dark:text-cream font-semibold">
                  {t('profilePicker.modal.startFresh')}
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {t('profilePicker.modal.startFreshHint')}
                </p>
              </button>
              <button
                onClick={() => setMode('clone')}
                className="rounded border border-slate-200 dark:border-navy-700 hover:border-navy-700 dark:hover:border-gold-500 p-4 text-left bg-white dark:bg-navy-900"
              >
                <div className="font-serif text-lg text-navy-900 dark:text-cream font-semibold">
                  {t('profilePicker.modal.cloneFromExisting')}
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {t('profilePicker.modal.cloneHint')}
                </p>
              </button>
            </div>
            <div className="mt-4">
              <button onClick={() => setMode(null)} className="btn-ghost">
                {t('profilePicker.modal.cancel')}
              </button>
            </div>
          </div>
        )}

        {mode === 'clone' && (
          <div className="card mt-8 p-5 sm:p-6">
            <h2 className="font-serif text-xl text-navy-900 dark:text-cream font-semibold">
              {t('profilePicker.clone.title')}
            </h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('profilePicker.clone.name')}</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('profilePicker.clone.namePlaceholder') ?? ''}
                  className="w-full"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t('profilePicker.clone.nameHint')}
                </p>
              </div>
              <div>
                <label className="label">{t('profilePicker.clone.from')}</label>
                <select
                  value={cloneFrom}
                  onChange={(e) => setCloneFrom(e.target.value)}
                  className="w-full"
                >
                  {profiles.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error && <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>}
            <div className="mt-5 flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleClone}
                disabled={!newName.trim()}
                className="btn-primary w-full sm:w-auto"
              >
                {t('profilePicker.clone.button')}
              </button>
              <button onClick={() => setMode('choice')} className="btn-secondary w-full sm:w-auto">
                {t('common.back')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
