export const PROJECT_ICONS = ['🛹', '🌐', '🛠', '🚀', '🎯', '📚', '🧠', '🎨', '⚡', '🔥']

export function keyFromName(name: string) {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return ''
  if (words.length === 1) return words[0]!.slice(0, 4)
  return words
    .map((w) => w[0])
    .join('')
    .slice(0, 10)
}

export function validateKey(key: string, existing: string[]): string | null {
  if (!key) return 'Key is required'
  if (!/^[A-Z]{2,10}$/.test(key)) return 'Use 2–10 uppercase letters'
  if (existing.includes(key)) return 'A project with this key already exists'
  return null
}
