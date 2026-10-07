import { closestCorners, pointerWithin, type CollisionDetection } from '@dnd-kit/core'

/**
 * Multi-container collision: prefer the sortable item under the pointer, then the
 * container under the pointer, then the nearest corners (keyboard / fast moves).
 */
export const multiContainerCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  const items = hits.filter((h) => !!h.data?.droppableContainer?.data?.current?.sortable)
  if (items.length) return items
  if (hits.length) return hits
  return closestCorners(args)
}
