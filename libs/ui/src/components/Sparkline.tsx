type Props = {
  points: number[]
  width?: number
  height?: number
  className?: string
}

export default function Sparkline({ points, width = 120, height = 28, className }: Props) {
  if (!points || points.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className ?? 'text-slate-300'}
        aria-hidden
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      </svg>
    )
  }
  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    if (p < min) min = p
    if (p > max) max = p
  }
  const range = max - min || 1
  const pad = 2
  const usableW = width - pad * 2
  const usableH = height - pad * 2
  const step = usableW / (points.length - 1)
  const coords = points.map((p, i) => {
    const x = pad + i * step
    const y = pad + (1 - (p - min) / range) * usableH
    return [x, y] as const
  })
  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(2)},${(height - pad).toFixed(2)} L${coords[0][0].toFixed(2)},${(height - pad).toFixed(2)} Z`
  const positive = points[points.length - 1] >= points[0]
  const stroke = positive ? 'text-emerald-600' : 'text-rose-600'
  const fill = positive ? 'text-emerald-100' : 'text-rose-100'
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className ?? stroke}
      aria-hidden
    >
      <path d={areaPath} className={fill} fill="currentColor" opacity={0.6} />
      <path
        d={linePath}
        className={stroke}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
