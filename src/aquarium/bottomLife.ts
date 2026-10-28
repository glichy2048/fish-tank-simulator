import { AXES, reefGroundHeight, worldPosition } from './tankLayout.ts'

export const BOTTOM_SIZES = [0.215, 0.135, 0.16, 0.225] as const
export const FOOT_HEIGHTS = [0.20, 0.18, 0.31, 0.013] as const
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/** Feet follow the same analytic ground the visible reef floor is built from. */
export function substrateAt(x: number, depth: number) {
  const p = worldPosition(x, 0.5, depth), epsilon = 0.004
  const y = reefGroundHeight(p.x, p.z)
  const dx = (reefGroundHeight(p.x + epsilon, p.z) - reefGroundHeight(p.x - epsilon, p.z)) / (epsilon * 2)
  const dz = (reefGroundHeight(p.x, p.z + epsilon) - reefGroundHeight(p.x, p.z - epsilon)) / (epsilon * 2)
  const length = Math.hypot(dx, 1, dz)
  return { y, nx: -dx / length, ny: 1 / length, nz: -dz / length }
}

export interface BottomDweller {
  x: number; y: number; depth: number; vx: number; vy: number; vz: number
  targetX: number; targetDepth: number; speed: number; activity: number; heading: number
  decisionIn: number; kind: number; rng: number; localTime: number
}
function next(animal: BottomDweller) {
  animal.rng = (Math.imul(animal.rng, 1664525) + 1013904223) >>> 0
  return animal.rng / 4294967296
}
export function createBottomLife(random = Math.random): BottomDweller[] {
  return [0, 1, 2, 3].map(kind => {
    const x = [0.30, 0.60, 0.76, 0.475][kind], depth = [0.28, 0.19, 0.22, 0.30][kind]
    return {
      x, y: 0.5 - substrateAt(x, depth).y / AXES.y, depth, vx: 0, vy: 0, vz: 0,
      targetX: x, targetDepth: depth, speed: 0, activity: 0, heading: [0.18, 2.8, 2.6, -0.35][kind],
      decisionIn: 1 + random() * 5, kind, rng: Math.floor(random() * 0xffffffff), localTime: 0,
    }
  })
}

/** A few seconds of one small arm-tip curl, separated by long still intervals. */
export function starArmMotion(time: number) {
  const cycle = Math.floor(time / 38), phase = time - cycle * 38
  const start = 9 + (cycle * 7 % 13), duration = 4.5
  const amount = phase > start && phase < start + duration ? Math.sin((phase - start) / duration * Math.PI) ** 2 : 0
  return { arm: (cycle * 3 + 1) % 5, amount }
}

export function stepBottomLife(animals: BottomDweller[], elapsed: number, current: number) {
  let remaining = clamp(elapsed, 0, 0.05) * Math.max(0, current)
  if (!Number.isFinite(remaining)) return
  while (remaining > 1e-7) {
    const dt = Math.min(remaining, 1 / 120); remaining -= dt
    for (const animal of animals) {
      animal.localTime += dt
      // A settled starfish does not drift, turn, or paddle all five arms.
      if (animal.kind === 3) continue
      animal.decisionIn -= dt
      if (animal.decisionIn <= 0) {
        const moving = next(animal) > [0.25, 0.15, 0.22][animal.kind]
        animal.speed = moving ? [0.040, 0.008, 0.023][animal.kind] * (0.65 + next(animal) * 0.6) : 0
        animal.decisionIn = (animal.kind === 0 ? 12 : 25) + next(animal) * 24
        const left = [0.24, 0.44, 0.65][animal.kind], right = [0.41, 0.66, 0.81][animal.kind]
        animal.targetX = left + next(animal) * (right - left)
        animal.targetDepth = animal.depth < 0.4 ? 0.50 + next(animal) * 0.25 : 0.13 + next(animal) * 0.18
      }
      const dx = (animal.targetX - animal.x) * AXES.x, dz = -(animal.targetDepth - animal.depth) * AXES.depth
      const distance = Math.hypot(dx, dz), surface = substrateAt(animal.x, animal.depth)
      // Slow down on steep surfaces, and arrive gradually instead of snapping to a stop.
      const speed = animal.speed * Math.min(1, distance / 0.09) * Math.max(0.35, surface.ny)
      const ease = 1 - Math.exp(-2.2 * dt)
      animal.vx += ((distance > 0.001 ? dx / distance * speed / AXES.x : 0) - animal.vx) * ease
      animal.vz += ((distance > 0.001 ? -dz / distance * speed / AXES.depth : 0) - animal.vz) * ease
      animal.x = clamp(animal.x + animal.vx * dt, 0.22, 0.83)
      animal.depth = clamp(animal.depth + animal.vz * dt, 0.12, 0.78)
      const nextY = 0.5 - substrateAt(animal.x, animal.depth).y / AXES.y
      animal.vy = (nextY - animal.y) / dt; animal.y = nextY
      const movingSpeed = Math.hypot(animal.vx * AXES.x, animal.vz * AXES.depth)
      if (movingSpeed > 0.0001) {
        const direction = Math.atan2(-animal.vz * AXES.depth, animal.vx * AXES.x)
        const turn = Math.atan2(Math.sin(direction - animal.heading), Math.cos(direction - animal.heading))
        animal.heading += turn * (1 - Math.exp(-1.5 * dt))
      }
      animal.activity += (Math.min(1, movingSpeed / [0.040, 0.008, 0.023][animal.kind]) - animal.activity) * ease
    }
  }
}
