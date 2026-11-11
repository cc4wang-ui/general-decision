// 班長頭像元件。造型本體在 src/avatarSvg.ts。
import { avatarSvg, type Mood } from './avatarSvg.ts'
import type { Level } from './types.ts'

export { avatarSvg, MOODS, type Mood } from './avatarSvg.ts'

export interface AvatarProps {
  level: Level
  mood?: Mood
  onDark?: boolean
  className?: string
  onClick?: () => void
  title?: string
}

export function Avatar({ level, mood = 'idle', onDark = false, className, onClick, title }: AvatarProps) {
  return (
    <div
      className={className}
      onClick={onClick}
      title={title}
      data-avatar={`${level}-${mood}`}
      dangerouslySetInnerHTML={{ __html: avatarSvg(level, mood, onDark) }}
    />
  )
}
