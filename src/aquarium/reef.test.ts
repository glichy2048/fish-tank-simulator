import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createReefScene } from './reef.ts'
import { ROCKS, WORLD, reefGroundHeight } from './tankLayout.ts'
import { substrateAt } from './bottomLife.ts'

function collect(scene: THREE.Group) {
  const byKind = new Map<string, THREE.Object3D[]>()
  scene.traverse(object => {
    const kind = (object as THREE.Mesh).userData?.kind as string | undefined
    if (kind) {
      const list = byKind.get(kind) ?? []
      list.push(object)
      byKind.set(kind, list)
    }
  })
  return byKind
}

test('reef scene builds every layer', () => {
  const { group } = createReefScene()
  const kinds = collect(group)
  for (const layer of ['backdrop', 'floor', 'rock', 'coral', 'seaweed', 'ray', 'surface', 'motes']) {
    assert.ok((kinds.get(layer) ?? []).length > 0, `missing ${layer}`)
  }
  assert.ok((kinds.get('coral') ?? []).length >= 8, 'coral clusters')
  assert.ok((kinds.get('seaweed') ?? []).length >= 8, 'seaweed clusters')
  assert.equal((kinds.get('ray') ?? []).length, 6)
})

test('all reef geometry is finite and bounded', () => {
  const { group } = createReefScene()
  group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      const position = object.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < position.count; i++) {
        assert.ok(Number.isFinite(position.getX(i)) && Number.isFinite(position.getY(i)) && Number.isFinite(position.getZ(i)))
      }
      object.geometry.computeBoundingBox()
      const box = object.geometry.boundingBox
      assert.ok(box !== null)
    }
    if (object instanceof THREE.Points) {
      const position = object.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < position.count; i++) assert.ok(Number.isFinite(position.getX(i)))
    }
  })
  group.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(group)
  assert.ok(box.min.x > -30 && box.max.x < 30)
  // The gradient backdrop is 18 units tall, centered just above the waterline.
  assert.ok(box.min.y > -9 && box.max.y < 12)
  assert.ok(box.min.z > -9 && box.max.z < 9)
})

test('open central lane stays clear of tall rock', () => {
  for (const rock of ROCKS) {
    if (Math.abs(rock.center[0]) < 0.6) {
      assert.ok(rock.center[1] + rock.radius[1] < -0.5, `tall rock near center: ${rock.center}`)
    }
    assert.ok(rock.center[2] + rock.radius[2] < -0.2, `rock reaches the foreground: ${rock.center}`)
  }
})

test('reef ground is finite, sandy, and gentle enough to walk on', () => {
  for (let x = -2.5; x <= 2.5; x += 0.5) {
    for (let z = -1.8; z <= 0.4; z += 0.4) {
      const height = reefGroundHeight(x, z)
      assert.ok(Number.isFinite(height) && height >= WORLD.floor - 1e-6, `ground at ${x},${z}: ${height}`)
    }
  }
  for (let x = 0.05; x <= 0.95; x += 0.1) {
    for (let depth = 0.05; depth <= 0.95; depth += 0.1) {
      const surface = substrateAt(x, depth)
      assert.ok(Number.isFinite(surface.y) && surface.ny > 0.5, `slope at ${x},${depth}: ny=${surface.ny}`)
    }
  }
})

test('reef update animates seaweed and applies mood and light', () => {
  const scene = createReefScene()
  const weeds: THREE.Mesh[] = []
  scene.group.traverse(object => {
    if ((object as THREE.Mesh).userData?.kind === 'seaweed') weeds.push(object as THREE.Mesh)
  })
  assert.ok(weeds.length > 0)
  scene.update(1.0, 0, 1)
  const before = weeds.map(weed => weed.rotation.z)
  scene.update(2.0, 2, 0.5)
  assert.ok(weeds.some((weed, i) => weed.rotation.z !== before[i]), 'seaweed sway changes with time')
  let backdropMood = -1
  scene.group.traverse(object => {
    if ((object as THREE.Mesh).userData?.kind === 'backdrop') {
      backdropMood = ((object as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uMood.value
    }
  })
  assert.equal(backdropMood, 2)
})
