import { useNavigate, useParams } from 'react-router-dom'
import CowbotPrompt, {
  type StreamQuickAdvice,
} from '../components/CowbotPrompt'
import AdviceList from '../components/AdviceList'

export interface AskCowbotProps {
  streamQuickAdvice: StreamQuickAdvice
}

export default function AskCowbot({ streamQuickAdvice }: AskCowbotProps) {
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const fromPath = `/app/p/${name}/cowbot`
  return (
    <div className="min-h-full bg-canvas dark:bg-ink">
      <CowbotPrompt
        streamQuickAdvice={streamQuickAdvice}
        profileName={name || undefined}
        variant="card"
        quipVariant="profile"
        onDone={(id) => {
          if (id) navigate(`/advice/${id}?from=${encodeURIComponent(fromPath)}`)
        }}
      />

      {name && <AdviceList profileName={name} fromPath={fromPath} />}
    </div>
  )
}
