import { AXES, WORLD, ROCKS, bodyClearance, rockDistance, worldPosition } from './tankLayout.ts'

export const SPECIES = [
  { name: 'Clownfish', size: 0.17, speed: 0.024, level: 0.48, range: 0.14 },
  { name: 'Banggai cardinalfish', size: 0.22, speed: 0.012, level: 0.40, range: 0.11 },
  { name: 'Royal gramma', size: 0.16, speed: 0.027, level: 0.51, range: 0.14 },
  { name: 'Firefish', size: 0.17, speed: 0.021, level: 0.44, range: 0.14 },
  { name: 'Six-line wrasse', size: 0.18, speed: 0.040, level: 0.50, range: 0.16 },
  { name: 'Yellow watchman goby', size: 0.18, speed: 0.009, level: 0.69, range: 0.035 },
  { name: 'Blue-green chromis', size: 0.17, speed: 0.032, level: 0.34, range: 0.09 },
  { name: 'Mandarin dragonet', size: 0.19, speed: 0.012, level: 0.66, range: 0.055 },
  { name: 'Lawnmower blenny', size: 0.18, speed: 0.014, level: 0.61, range: 0.085 },
  { name: 'Lionfish', size: 0.245, speed: 0.014, level: 0.49, range: 0.12 },
  { name: 'Betta', size: 0.205, speed: 0.018, level: 0.36, range: 0.10 },
  { name: 'Cuttlefish', size: 0.25, speed: 0.017, level: 0.55, range: 0.10 },
] as const

// Open-reef swim volume: nearly the whole view, bounded by the world box in
// resolveRocks. The old values traced the photographed tank's water region.
export const TANK = { left: 0.03, right: 0.97, top: 0.06, bottom: 0.94, front: 0.03, back: 0.97 }
export interface Swimmer {
  x: number; y: number; vx: number; vy: number; vz: number; species: number; depth: number
  size: number; phase: number; facing: number; targetX: number; targetY: number
  targetDepth: number; behavior: number; decisionIn: number; speed: number
  activity: number; finTime: number; rng: number
}

export function seededRandom(seed = 47) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0
    return (seed >>> 0) / 4294967296
  }
}
function next(fish: Swimmer) {
  fish.rng = (Math.imul(fish.rng, 1664525) + 1013904223) >>> 0
  return fish.rng / 4294967296
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** One individual per species: increasing population never creates a duplicate. */
export function createSchool(count: number, random = Math.random): Swimmer[] {
  return SPECIES.slice(0, clamp(Math.floor(count), 0, SPECIES.length)).map((species, index) => {
    const x = 0.08 + random() * 0.84
    const y = clamp(species.level + (random() - 0.5) * species.range, TANK.top, TANK.bottom)
    const direction = random() > 0.5 ? 1 : -1
    const depth = TANK.front + random() * (TANK.back - TANK.front)
    const swimmer = {
      x, y, vx: direction * species.speed * 0.5, vy: 0, vz: (depth < 0.5 ? 1 : -1) * species.speed, species: index,
      depth, size: species.size, phase: random() * Math.PI * 2,
      facing: direction, targetX: clamp(x + direction * 0.13, TANK.left, TANK.right), targetY: y,
      targetDepth: depth < 0.5 ? 0.88 : 0.12, behavior: 1, decisionIn: 6 + random() * 9,
      speed: species.speed, activity: 0.5, finTime: random() * 20,
      rng: Math.floor(random() * 0xffffffff),
    }
    resolveRocks(swimmer)
    // A spawn inside overlapping rocks can be wedged against the floor. Relocate
    // that initial position to an open lane before its first rendered frame.
    const insideRock = () => ROCKS.some(rock => rockDistance(swimmer.x, swimmer.y, swimmer.depth, rock, bodyClearance(swimmer.size)) < 1.005)
    if (insideRock()) {
      const margin = bodyClearance(swimmer.size) / AXES.depth
      swimmer.depth = depth < 0.5 ? margin : 1 - margin
      resolveRocks(swimmer)
      if (insideRock()) {
        // Tall back reefs can occupy the far lane too; the front lane sits
        // ahead of every envelope front edge, so it is clear by construction.
        swimmer.depth = margin
        resolveRocks(swimmer)
      }
    }
    return swimmer
  })
}

function chooseBehavior(fish: Swimmer) {
  const species = SPECIES[fish.species]
  const draw = next(fish)
  // Hovering, exploring, a short dart, or a close inspection; each fish has its own clock.
  fish.behavior = draw < 0.29 ? 0 : draw < 0.74 ? 1 : draw < 0.87 ? 2 : 3
  fish.decisionIn = fish.behavior === 2 ? 0.5 + next(fish) * 0.9 : fish.behavior === 1 ? 8 + next(fish) * 12 : 1.8 + next(fish) * 6.5
  const radius = fish.behavior === 0 ? 0.012 : fish.behavior === 3 ? 0.07 : 0.36
  fish.targetX = clamp(fish.x + (next(fish) - 0.5) * radius * 2, TANK.left + 0.025, TANK.right - 0.025)
  fish.targetY = clamp(species.level + (next(fish) - 0.5) * species.range * 2, TANK.top + 0.02, TANK.bottom - 0.012)
  if (fish.behavior === 0) fish.targetY = clamp(fish.y + (next(fish) - 0.5) * 0.015, TANK.top, TANK.bottom)
  fish.speed = species.speed * (fish.behavior === 0 ? 0.07 : fish.behavior === 2 ? 2.7 : fish.behavior === 3 ? 0.33 : 0.55 + next(fish) * 0.8)
  fish.targetDepth = fish.behavior === 0
    ? clamp(fish.depth + (next(fish) - 0.5) * 0.025, TANK.front, TANK.back)
    : fish.behavior === 3
      ? clamp(fish.depth + (next(fish) - 0.5) * 0.22, TANK.front, TANK.back)
      : fish.depth < 0.5 ? 0.70 + next(fish) * 0.24 : 0.06 + next(fish) * 0.24
  // Never deliberately steer into a solid rock; pick a clear front/back lane.
  if (ROCKS.some(rock => rockDistance(fish.targetX, fish.targetY, fish.targetDepth, rock, bodyClearance(fish.size)) < 1.12)) {
    fish.targetDepth = fish.depth < 0.5 ? TANK.front + 0.02 : TANK.back - 0.02
  }
}

/** Enforce collision envelopes after integration, also making initial spawns safe. */
function resolveRocks(fish: Swimmer) {
  const clearance = bodyClearance(fish.size)
  const point = worldPosition(fish.x, fish.y, fish.depth)
  // Overlapping stones may require more than one projection.
  for (let pass = 0; pass < 6; pass++) {
    let moved = false
    for (const rock of ROCKS) {
      const rx = rock.radius[0] + clearance, ry = rock.radius[1] + clearance, rz = rock.radius[2] + clearance
      let dx = (point.x - rock.center[0]) / rx, dy = (point.y - rock.center[1]) / ry, dz = (point.z - rock.center[2]) / rz
      let distance = Math.hypot(dx, dy, dz)
      if (distance >= 1.005) continue
      if (distance < 0.00001) { dz = 1; distance = 1 }
      dx /= distance; dy /= distance; dz /= distance
      point.x = rock.center[0] + dx * rx * 1.006
      point.y = rock.center[1] + dy * ry * 1.006
      point.z = rock.center[2] + dz * rz * 1.006
      // Remove only inward motion; tangential movement continues around the rock.
      const nx = dx / rx, ny = dy / ry, nz = dz / rz
      const inward = (fish.vx * AXES.x * nx - fish.vy * AXES.y * ny - fish.vz * AXES.depth * nz) / (nx * nx + ny * ny + nz * nz)
      if (inward < 0) {
        fish.vx -= inward * nx / AXES.x
        fish.vy += inward * ny / AXES.y
        fish.vz += inward * nz / AXES.depth
      }
      moved = true
    }
    const left = Math.max((TANK.left - 0.5) * AXES.x, -WORLD.halfWidth + clearance)
    const right = Math.min((TANK.right - 0.5) * AXES.x, WORLD.halfWidth - clearance)
    const bottom = Math.max((0.5 - TANK.bottom) * AXES.y, WORLD.floor + clearance)
    const top = Math.min((0.5 - TANK.top) * AXES.y, WORLD.surface - clearance)
    const back = Math.max(WORLD.front - TANK.back * AXES.depth, WORLD.back + clearance)
    const front = Math.min(WORLD.front - TANK.front * AXES.depth, WORLD.front - clearance)
    point.x = clamp(point.x, left, right)
    point.y = clamp(point.y, bottom, top)
    point.z = clamp(point.z, back, front)
    if ((point.x === left && fish.vx < 0) || (point.x === right && fish.vx > 0)) fish.vx *= -0.3
    if ((point.y === bottom && fish.vy > 0) || (point.y === top && fish.vy < 0)) fish.vy *= -0.3
    if ((point.z === back && fish.vz > 0) || (point.z === front && fish.vz < 0)) fish.vz *= -0.3
    if (!moved) break
  }
  fish.x = point.x / AXES.x + 0.5
  fish.y = 0.5 - point.y / AXES.y
  fish.depth = (WORLD.front - point.z) / AXES.depth
}

/** Small integration steps keep decisions and acceleration consistent across frame rates. */
export function stepSchool(fish: Swimmer[], elapsed: number, time: number, current: number) {
  let remaining = clamp(elapsed, 0, 0.05) * Math.max(0, current)
  if (!Number.isFinite(remaining)) return
  while (remaining > 0.0000001) {
    const dt = Math.min(remaining, 1 / 120)
    remaining -= dt
    const previous = fish.map(f => ({ x: f.x, y: f.y, depth: f.depth }))
    fish.forEach((swimmer, index) => {
      swimmer.decisionIn -= dt
      if (swimmer.decisionIn <= 0) chooseBehavior(swimmer)
      // Steering, arrival, separation, and obstacle avoidance all use world distances.
      const dx = (swimmer.targetX - swimmer.x) * AXES.x
      const dy = (swimmer.targetY - swimmer.y) * AXES.y
      const dz = (swimmer.targetDepth - swimmer.depth) * AXES.depth
      const distance = Math.hypot(dx, dy, dz)
      const arrival = Math.min(1, distance / 0.25)
      const cruise = swimmer.speed * AXES.x * arrival
      let desiredX = distance > 0.001 ? dx / distance * cruise : 0
      let desiredY = distance > 0.001 ? dy / distance * cruise : 0
      let desiredZ = distance > 0.001 ? dz / distance * cruise : 0
      previous.forEach((other, i) => {
        if (i === index) return
        const sx = (swimmer.x - other.x) * AXES.x, sy = (swimmer.y - other.y) * AXES.y, sz = (swimmer.depth - other.depth) * AXES.depth
        const d = Math.hypot(sx, sy, sz)
        if (d > 0.0001 && d < 0.30) {
          const strength = (0.30 - d) * 0.75
          desiredX += sx / d * strength
          desiredY += sy / d * strength
          desiredZ += sz / d * strength
        }
      })
      const point = worldPosition(swimmer.x, swimmer.y, swimmer.depth)
      const clearance = bodyClearance(swimmer.size) + 0.07
      for (const rock of ROCKS) {
        const rx = rock.radius[0] + clearance, ry = rock.radius[1] + clearance, rz = rock.radius[2] + clearance
        const ox = (point.x - rock.center[0]) / rx, oy = (point.y - rock.center[1]) / ry, oz = (point.z - rock.center[2]) / rz
        const d = Math.hypot(ox, oy, oz)
        if (d < 1.55 && d > 0.00001) {
          const strength = (1.55 - d) * 0.24
          desiredX += ox / d * strength
          desiredY -= oy / d * strength
          desiredZ -= oz / d * strength
        }
      }
      // Different individuals continually make tiny corrections with their pectoral fins.
      desiredY += Math.sin(time * 1.2 + swimmer.phase) * 0.002
      const acceleration = swimmer.behavior === 2 ? 3.2 : 1.1
      const ease = 1 - Math.exp(-acceleration * dt)
      swimmer.vx += (desiredX / AXES.x - swimmer.vx) * ease
      swimmer.vy += (desiredY / AXES.y - swimmer.vy) * ease
      swimmer.vz += (desiredZ / AXES.depth - swimmer.vz) * ease
      const speed = Math.hypot(swimmer.vx * AXES.x, swimmer.vy * AXES.y, swimmer.vz * AXES.depth) / AXES.x
      if (speed > 0.12) { swimmer.vx *= 0.12 / speed; swimmer.vy *= 0.12 / speed; swimmer.vz *= 0.12 / speed }
      swimmer.x = clamp(swimmer.x + swimmer.vx * dt, TANK.left, TANK.right)
      swimmer.y = clamp(swimmer.y + swimmer.vy * dt, TANK.top, TANK.bottom)
      swimmer.depth = clamp(swimmer.depth + swimmer.vz * dt, TANK.front, TANK.back)
      if ((swimmer.x === TANK.left && swimmer.vx < 0) || (swimmer.x === TANK.right && swimmer.vx > 0)) swimmer.vx *= -0.3
      if ((swimmer.y === TANK.top && swimmer.vy < 0) || (swimmer.y === TANK.bottom && swimmer.vy > 0)) swimmer.vy *= -0.3
      if ((swimmer.depth === TANK.front && swimmer.vz < 0) || (swimmer.depth === TANK.back && swimmer.vz > 0)) swimmer.vz *= -0.3
      resolveRocks(swimmer)
      if (Math.abs(swimmer.vx) > 0.0018) {
        swimmer.facing += (Math.sign(swimmer.vx) - swimmer.facing) * (1 - Math.exp(-4.1 * dt))
      }
      swimmer.activity += (clamp(speed / SPECIES[swimmer.species].speed, 0.05, 2.8) - swimmer.activity) * ease
      swimmer.finTime += dt * (1.5 + swimmer.activity * 5.2)
    })
  }
}

export { createBottomLife, stepBottomLife, type BottomDweller } from './bottomLife.ts'
