import { useI18n } from '../i18n'

interface BackButtonProps {
  onClick: () => void
  label?: string
}

export function BackButton({ onClick, label: customLabel }: BackButtonProps) {
  const { m } = useI18n()
  const label = customLabel ?? m.back
  return (
    <button
      type="button"
      className="back-btn"
      onClick={onClick}
      aria-label={label}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
        <path
          d="M11.25 3.75L6 9l5.25 5.25"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{label}</span>
    </button>
  )
}
