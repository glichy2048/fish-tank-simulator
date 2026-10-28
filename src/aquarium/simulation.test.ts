import test from 'node:test'
import assert from 'node:assert/strict'
import { createSchool, createBottomLife, seededRandom, stepSchool, stepBottomLife, SPECIES, TANK } from './simulation.ts'
import { AXES, WORLD, ROCKS, bodyClearance, rockDistance, worldPosition } from './tankLayout.ts'

test('the reef remains bounded and numerically stable through a long swim', () => {
  const fish = createSchool(36, seededRandom(17))
  for (let frame = 0; frame < 18000; frame++) stepSchool(fish, 1 / 30, frame / 30, 1.8)
  for (const swimmer of fish) {
    assert.ok(Object.values(swimmer).every(Number.isFinite))
    assert.ok(swimmer.x >= TANK.left && swimmer.x <= TANK.right)
    assert.ok(swimmer.y >= TANK.top && swimmer.y <= TANK.bottom)
    assert.ok(swimmer.depth >= TANK.front - 1e-10 && swimmer.depth <= TANK.back + 1e-10)
    assert.ok(Math.hypot(swimmer.vx * AXES.x, swimmer.vy * AXES.y, swimmer.vz * AXES.depth) / AXES.x <= 0.120001)
    assert.ok(Math.abs(swimmer.facing) <= 1)
    const point = worldPosition(swimmer.x, swimmer.y, swimmer.depth), clearance = bodyClearance(swimmer.size) - 1e-9
    assert.ok(Math.abs(point.x) + clearance <= WORLD.halfWidth)
    assert.ok(point.y - clearance >= WORLD.floor && point.y + clearance <= WORLD.surface)
    assert.ok(point.z - clearance >= WORLD.back && point.z + clearance <= WORLD.front)
  }
})

test('even an excessive population request never duplicates a species', () => {
  const fish = createSchool(200, seededRandom())
  assert.equal(fish.length, SPECIES.length)
  assert.equal(new Set(fish.map(f => f.species)).size, fish.length)
})

test('fish switch activities independently and swim at substantially different speeds', () => {
  const fish = createSchool(9, seededRandom(83))
  const activities = new Set<number>()
  let differentSpeeds = false
  for (let frame = 0; frame < 1800; frame++) {
    stepSchool(fish, 1 / 30, frame / 30, 1)
    fish.forEach(f => activities.add(f.behavior))
    const speeds = fish.map(f => Math.hypot(f.vx, f.vy))
    if (Math.max(...speeds) > Math.min(...speeds) * 4) differentSpeeds = true
  }
  assert.equal(activities.size, 4)
  assert.ok(differentSpeeds)
  assert.ok(new Set(fish.map(f => Math.round(f.decisionIn * 100))).size > 5)
})

test('bottom creatures stay on the aquascape and also respect pause', () => {
  const animals = createBottomLife(seededRandom(58))
  const initial = structuredClone(animals)
  stepBottomLife(animals, 0, 1)
  stepBottomLife(animals, 1 / 30, 0)
  assert.deepEqual(animals, initial)
  for (let frame = 0; frame < 18000; frame++) stepBottomLife(animals, 1 / 30, 1)
  for (const animal of animals) {
    assert.ok(Object.values(animal).every(Number.isFinite))
    assert.ok(animal.x >= 0.20 && animal.x <= 0.87)
    assert.ok(animal.y >= 0.48 && animal.y <= 0.79)
    assert.ok(animal.depth >= 0.12 && animal.depth <= 0.78)
  }
})

test('zero elapsed time or zero current holds every swimmer still', () => {
  const fish = createSchool(24, seededRandom())
  const initial = structuredClone(fish)
  stepSchool(fish, 0, 8, 1)
  stepSchool(fish, 1 / 60, 8, 0)
  assert.deepEqual(fish, initial)
})

test('30 and 60 fps produce nearly identical movement', () => {
  const low = createSchool(24, seededRandom(32))
  const high = structuredClone(low)
  for (let frame = 0; frame < 300; frame++) stepSchool(low, 1 / 30, frame / 30, 1)
  for (let frame = 0; frame < 600; frame++) stepSchool(high, 1 / 60, frame / 60, 1)
  low.forEach((swimmer, i) => {
    assert.ok(Math.hypot(swimmer.x - high[i].x, swimmer.y - high[i].y, swimmer.depth - high[i].depth) < 0.005)
  })
})

test('a delayed background frame cannot teleport the fish', () => {
  const fish = createSchool(24, seededRandom())
  const initial = structuredClone(fish)
  stepSchool(fish, 120, 120, 1.8)
  fish.forEach((swimmer, i) => assert.ok(Math.hypot(swimmer.x - initial[i].x, swimmer.y - initial[i].y, swimmer.depth - initial[i].depth) < 0.012))
})

test('every species explores both the front and back without crossing a rock', () => {
  const fish = createSchool(SPECIES.length, seededRandom(83))
  const depths = fish.map(f => ({ min: f.depth, max: f.depth }))
  // The open reef is wider than the old tank, so the slowest species need a
  // longer window to random-walk across it; the assertions are unchanged.
  for (let frame = 0; frame < 36000; frame++) {
    stepSchool(fish, 1 / 30, frame / 30, 1.8)
    fish.forEach((f, i) => {
      depths[i].min = Math.min(depths[i].min, f.depth)
      depths[i].max = Math.max(depths[i].max, f.depth)
      for (const rock of ROCKS) assert.ok(rockDistance(f.x, f.y, f.depth, rock, bodyClearance(f.size)) >= 0.999, `${SPECIES[i].name} entered rock ${rock.seed}`)
    })
  }
  depths.forEach((depth, i) => {
    assert.ok(depth.min < 0.25 && depth.max > 0.78, `${SPECIES[i].name} must visit both depth lanes`)
  })
})

test('initial spawns have body clearance from solid scenery', () => {
  for (let seed = 0; seed < 100; seed++) {
    for (const f of createSchool(SPECIES.length, seededRandom(seed))) {
      for (const rock of ROCKS) assert.ok(rockDistance(f.x, f.y, f.depth, rock, bodyClearance(f.size)) >= 0.999)
    }
  }
})

test('a fish can swim toward and away from the glass with no horizontal target change', () => {
  for (const direction of [-1, 1]) {
    const fish = createSchool(1, seededRandom(4))
    Object.assign(fish[0], { x: 0.5, y: 0.35, depth: 0.5, vx: 0, vy: 0, vz: 0, targetX: 0.5, targetY: 0.35, targetDepth: direction > 0 ? 0.9 : 0.1, decisionIn: 100 })
    for (let frame = 0; frame < 180; frame++) stepSchool(fish, 1 / 30, frame / 30, 1)
    assert.ok((fish[0].depth - 0.5) * direction > 0.2)
    assert.ok(fish[0].vz * direction > 0)
    assert.ok(Math.abs(fish[0].x - 0.5) < 0.001)
  }
})
