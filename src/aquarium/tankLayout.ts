// One fixed world volume, shared by scenery, steering, and perspective projection.
// Normalized x/y retain the original species habitats; depth increases away from the glass.
export const WORLD = {
  halfHeight: Math.tan(Math.PI / 12) * 5.5,
  aspect: 1672 / 941,
  front: 0.55,
  back: -1.9,
  floor: -0.77,
  surface: 0.93,
  halfWidth: 1.96,
}
export const AXES = {
  x: WORLD.halfHeight * WORLD.aspect * 2,
  y: WORLD.halfHeight * 2,
  depth: WORLD.front - WORLD.back,
}
export function worldPosition(x: number, y: number, depth: number) {
  return { x: (x - 0.5) * AXES.x, y: (0.5 - y) * AXES.y, z: WORLD.front - depth * AXES.depth }
}

export interface Rock {
  center: readonly [number, number, number]
  radius: readonly [number, number, number]
  seed: number
}
// Collision envelopes for the procedural reef islands. Like the reference
// image, coral rock frames only the outer edges of the view and the middle
// stays open sand: the crossing between the islands is about two world
// units wide, so even the slowest fish can reach a deep target before its
// next decision expires. Every envelope front edge sits behind z = -0.25,
// leaving the foreground water completely clear for the bottom creatures'
// spawn area. The visible rock meshes are built from these same envelopes,
// so what fish steer around is exactly what the viewer sees.
export const ROCKS: readonly Rock[] = [
  { center: [-2.20, -0.55, -0.95], radius: [0.50, 0.33, 0.45], seed: 11 },
  { center: [-1.70, -0.60, -0.65], radius: [0.40, 0.26, 0.40], seed: 27 },
  { center: [-2.55, -0.64, -0.55], radius: [0.30, 0.18, 0.30], seed: 34 },
  { center: [-1.85, -0.45, -1.15], radius: [0.45, 0.18, 0.42], seed: 58 },
  { center: [-1.60, -0.68, -1.40], radius: [0.28, 0.14, 0.30], seed: 62 },
  { center: [2.20, -0.55, -0.95], radius: [0.50, 0.33, 0.45], seed: 73 },
  { center: [1.70, -0.60, -0.65], radius: [0.40, 0.26, 0.40], seed: 83 },
  { center: [2.55, -0.64, -0.55], radius: [0.30, 0.18, 0.30], seed: 99 },
  { center: [1.85, -0.45, -1.15], radius: [0.45, 0.18, 0.42], seed: 101 },
  { center: [1.60, -0.68, -1.40], radius: [0.28, 0.14, 0.30], seed: 117 },
]

/** Body clearance in world units, including room for a sideways turn. */
export function bodyClearance(size: number) { return size * WORLD.halfHeight * 1.28 * 0.64 }

export function rockDistance(x: number, y: number, depth: number, rock: Rock, clearance = 0) {
  const point = worldPosition(x, y, depth)
  return Math.hypot(
    (point.x - rock.center[0]) / (rock.radius[0] + clearance),
    (point.y - rock.center[1]) / (rock.radius[1] + clearance),
    (point.z - rock.center[2]) / (rock.radius[2] + clearance),
  )
}

/**
 * Analytic sand + rock ground. The visible floor mesh is displaced by this
 * same function, and the bottom creatures' feet follow it, so nothing floats
 * or sinks. Rock islands rise smoothly out of the sand.
 */
export function reefGroundHeight(worldX: number, worldZ: number) {
  let height = WORLD.floor
  for (const rock of ROCKS) {
    const q = ((worldX - rock.center[0]) / (rock.radius[0] * 1.2)) ** 2
      + ((worldZ - rock.center[2]) / (rock.radius[2] * 1.25)) ** 2
    if (q >= 1.8) continue
    const t = 1 - q / 1.8
    const rise = (rock.center[1] + rock.radius[1] - WORLD.floor) * t * t * (3 - 2 * t)
    height = Math.max(height, WORLD.floor + rise)
  }
  return height
}
