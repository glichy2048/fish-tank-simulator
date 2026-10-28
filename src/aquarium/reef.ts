import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { WORLD, ROCKS, reefGroundHeight } from './tankLayout.ts'

// Procedural reef scenery. Everything visible here is built from the same
// data the simulation steers around: rock meshes use the ROCKS collision
// envelopes, coral clusters sit on the ground the creatures walk on, and
// the floor mesh is displaced by reefGroundHeight. Nothing the fish avoid
// is invisible, and nothing visible is unaccounted for in steering.

function mulberry32(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value + 0x6d2b79f5) >>> 0
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function paint(geometry: THREE.BufferGeometry, color: THREE.Color) {
  const count = geometry.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function paintJitter(geometry: THREE.BufferGeometry, base: THREE.Color, amount: number, rng: () => number) {
  const count = geometry.attributes.position.count
  const colors = new Float32Array(count * 3)
  const color = new THREE.Color()
  for (let i = 0; i < count; i++) {
    color.copy(base).offsetHSL(0, (rng() - 0.5) * amount, (rng() - 0.5) * amount)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

function displace(geometry: THREE.BufferGeometry, seed: number, amp: number) {
  const rng = mulberry32(seed)
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  const vector = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    vector.fromBufferAttribute(normal, i)
    const noise = Math.sin(i * 12.9898 + seed) * 43758.5453
    const n = noise - Math.floor(noise)
    const push = (n - 0.5) * 2 * amp + (rng() - 0.5) * amp * 0.5
    position.setXYZ(i, position.getX(i) + vector.x * push, position.getY(i) + vector.y * push, position.getZ(i) + vector.z * push)
  }
  geometry.computeVertexNormals()
  return geometry
}

function mergeParts(parts: THREE.BufferGeometry[], kind: string, material: THREE.Material) {
  if (parts.length === 0) throw new Error(`reef: no geometry for ${kind}`)
  const merged = mergeGeometries(parts, false)
  parts.forEach(part => part.dispose())
  const mesh = new THREE.Mesh(merged, material)
  mesh.userData.kind = kind
  return mesh
}

const rockMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })
const coralMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true })
const weedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })
const sandMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })

function buildRocks() {
  const parts: THREE.BufferGeometry[] = []
  const tint = new THREE.Color()
  for (const rock of ROCKS) {
    const geometry = new THREE.IcosahedronGeometry(1, 2)
    displace(geometry, rock.seed, 0.13)
    geometry.scale(rock.radius[0], rock.radius[1], rock.radius[2])
    geometry.translate(rock.center[0], rock.center[1], rock.center[2])
    tint.setHSL(0.08, 0.12, 0.38 + (rock.seed % 5) * 0.03)
    paint(geometry, tint)
    parts.push(geometry)
  }
  return mergeParts(parts, 'rock', rockMaterial)
}

function branchParts(parts: THREE.BufferGeometry[], start: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number, rng: () => number, color: THREE.Color) {
  const end = start.clone().addScaledVector(dir, len)
  const geo = new THREE.CylinderGeometry(r * 0.55, r, len, 5, 1)
  geo.translate(0, len / 2, 0)
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()))
  geo.translate(start.x, start.y, start.z)
  paint(geo, color)
  parts.push(geo)
  if (depth <= 0) {
    const tip = new THREE.SphereGeometry(r * 0.75, 6, 5)
    tip.translate(end.x, end.y, end.z)
    paint(tip, color.clone().offsetHSL(0, 0, 0.08))
    parts.push(tip)
    return
  }
  for (let i = 0; i < 2; i++) {
    const nd = dir.clone()
    nd.x += (rng() - 0.5) * 1.1
    nd.y += rng() * 0.5
    nd.z += (rng() - 0.5) * 1.1
    nd.normalize()
    branchParts(parts, end, nd, len * 0.72, r * 0.62, depth - 1, rng, color)
  }
}

function buildCoralCluster(kind: string, x: number, z: number, scale: number, seed: number) {
  const rng = mulberry32(seed)
  const baseY = reefGroundHeight(x, z)
  const parts: THREE.BufferGeometry[] = []
  const up = new THREE.Vector3(0, 1, 0)
  if (kind === 'branch') {
    const color = new THREE.Color().setHSL(0.05 + rng() * 0.04, 0.9, 0.55)
    for (let i = 0; i < 3; i++) {
      const dir = new THREE.Vector3((rng() - 0.5) * 0.9, 1, (rng() - 0.5) * 0.9).normalize()
      branchParts(parts, new THREE.Vector3(x + (rng() - 0.5) * 0.2, baseY, z + (rng() - 0.5) * 0.2), dir, 0.42 * scale, 0.055 * scale, 2, rng, color)
    }
  } else if (kind === 'brain') {
    const geo = new THREE.IcosahedronGeometry(0.34 * scale, 3)
    displace(geo, seed, 0.05 * scale)
    geo.scale(1, 0.62, 1)
    geo.translate(x, baseY + 0.16 * scale, z)
    paintJitter(geo, new THREE.Color().setHSL(0.85 + rng() * 0.1, 0.55, 0.62), 0.12, rng)
    parts.push(geo)
  } else if (kind === 'fan') {
    const color = new THREE.Color().setHSL(0.78 + rng() * 0.06, 0.6, 0.55)
    for (let i = -3; i <= 3; i++) {
      const blade = new THREE.BoxGeometry(0.045, 0.62 * scale, 0.02)
      blade.translate(0, 0.31 * scale, 0)
      blade.rotateZ(i * 0.24)
      blade.translate(x, baseY, z)
      paint(blade, color.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.1))
      parts.push(blade)
    }
  } else if (kind === 'anemone') {
    const mound = new THREE.SphereGeometry(0.22 * scale, 8, 6)
    mound.scale(1, 0.45, 1)
    mound.translate(x, baseY + 0.05 * scale, z)
    paint(mound, new THREE.Color().setHSL(0.75, 0.4, 0.4))
    parts.push(mound)
    for (let i = 0; i < 14; i++) {
      const angle = rng() * Math.PI * 2
      const dist = rng() * 0.18 * scale
      const cone = new THREE.ConeGeometry(0.035 * scale, 0.22 * scale, 5)
      cone.translate(x + Math.cos(angle) * dist, baseY + 0.16 * scale, z + Math.sin(angle) * dist)
      cone.rotateX((rng() - 0.5) * 0.7)
      cone.rotateZ((rng() - 0.5) * 0.7)
      paint(cone, new THREE.Color().setHSL(0.82, 0.7, 0.6 + rng() * 0.15))
      parts.push(cone)
    }
  } else {
    const stem = new THREE.CylinderGeometry(0.07 * scale, 0.1 * scale, 0.3 * scale, 7)
    stem.translate(x, baseY + 0.15 * scale, z)
    paint(stem, new THREE.Color().setHSL(0.08, 0.5, 0.45))
    parts.push(stem)
    const disc = new THREE.CylinderGeometry(0.34 * scale, 0.26 * scale, 0.06 * scale, 10)
    disc.translate(x, baseY + 0.32 * scale, z)
    paint(disc, new THREE.Color().setHSL(0.1, 0.85, 0.55))
    parts.push(disc)
  }
  void up
  const mesh = mergeParts(parts, 'coral', coralMaterial)
  mesh.position.set(0, 0, 0)
  return mesh
}

function buildSeaweedCluster(x: number, z: number, height: number, seed: number) {
  const rng = mulberry32(seed)
  const baseY = reefGroundHeight(x, z)
  const parts: THREE.BufferGeometry[] = []
  const blades = 5 + Math.floor(rng() * 3)
  for (let i = 0; i < blades; i++) {
    const h = height * (0.7 + rng() * 0.5)
    const blade = new THREE.PlaneGeometry(0.07, h, 1, 4)
    blade.translate(0, h / 2, 0)
    const position = blade.attributes.position
    for (let v = 0; v < position.count; v++) {
      const y = position.getY(v)
      position.setX(v, position.getX(v) + Math.sin((y / h) * Math.PI * 0.5) * 0.14)
    }
    blade.computeVertexNormals()
    blade.rotateY(rng() * Math.PI * 2)
    blade.rotateZ((rng() - 0.5) * 0.25)
    blade.translate((rng() - 0.5) * 0.16, 0, (rng() - 0.5) * 0.16)
    paint(blade, new THREE.Color().setHSL(0.33 + rng() * 0.05, 0.6, 0.3 + rng() * 0.18))
    parts.push(blade)
  }
  const mesh = mergeParts(parts, 'seaweed', weedMaterial)
  mesh.position.set(x, baseY, z)
  mesh.userData.phase = rng() * Math.PI * 2
  return mesh
}

function buildFloor() {
  const geometry = new THREE.PlaneGeometry(30, 14, 40, 20)
  geometry.rotateX(-Math.PI / 2)
  const position = geometry.attributes.position
  const rng = mulberry32(7)
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const z = position.getZ(i)
    position.setY(i, reefGroundHeight(x, z) - 0.02)
  }
  geometry.computeVertexNormals()
  paintJitter(geometry, new THREE.Color(0xd9c49a), 0.1, rng)
  const mesh = new THREE.Mesh(geometry, sandMaterial)
  mesh.userData.kind = 'floor'
  return mesh
}

export interface ReefScene {
  group: THREE.Group
  update: (time: number, mood: number, light: number) => void
}

export function createReefScene(): ReefScene {
  const group = new THREE.Group()
  const animated: THREE.ShaderMaterial[] = []
  const seaweed: THREE.Mesh[] = []

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 18),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMood: { value: 0 }, uLight: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime; uniform float uMood; uniform float uLight; varying vec2 vUv;
        void main() {
          vec3 dayTop = vec3(0.55, 0.85, 0.95), dayMid = vec3(0.10, 0.50, 0.71), dayDeep = vec3(0.02, 0.29, 0.46);
          vec3 duskTop = vec3(0.98, 0.72, 0.55), duskMid = vec3(0.45, 0.35, 0.50), duskDeep = vec3(0.10, 0.16, 0.33);
          vec3 nightTop = vec3(0.05, 0.13, 0.25), nightMid = vec3(0.02, 0.08, 0.18), nightDeep = vec3(0.01, 0.03, 0.09);
          vec3 top = mix(mix(dayTop, duskTop, clamp(uMood, 0.0, 1.0)), nightTop, clamp(uMood - 1.0, 0.0, 1.0));
          vec3 mid = mix(mix(dayMid, duskMid, clamp(uMood, 0.0, 1.0)), nightMid, clamp(uMood - 1.0, 0.0, 1.0));
          vec3 deep = mix(mix(dayDeep, duskDeep, clamp(uMood, 0.0, 1.0)), nightDeep, clamp(uMood - 1.0, 0.0, 1.0));
          vec3 color = vUv.y > 0.62 ? mix(mid, top, (vUv.y - 0.62) / 0.38) : mix(deep, mid, vUv.y / 0.62);
          color += sin(vUv.x * 40.0 + uTime * 0.4) * 0.012 * vUv.y;
          gl_FragColor = vec4(color * uLight, 1.0);
        }`,
      depthWrite: false,
    }),
  )
  backdrop.position.set(0, 1.0, -6.5)
  backdrop.renderOrder = -10
  backdrop.userData.kind = 'backdrop'
  group.add(backdrop)
  animated.push(backdrop.material as THREE.ShaderMaterial)

  const rayMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMood: { value: 0 }, uLight: { value: 1 } },
    vertexShader: 'attribute float aPhase; varying vec2 vUv; varying float vPhase; void main() { vUv = uv; vPhase = aPhase; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime; uniform float uMood; uniform float uLight; varying vec2 vUv; varying float vPhase;
      void main() {
        float edge = smoothstep(0.0, 0.28, vUv.x) * (1.0 - smoothstep(0.72, 1.0, vUv.x));
        float vertical = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float shimmer = 0.75 + 0.25 * sin(uTime * 0.6 + vPhase * 6.28);
        float strength = mix(0.14, 0.10, clamp(uMood, 0.0, 1.0));
        strength = mix(strength, 0.03, clamp(uMood - 1.0, 0.0, 1.0));
        gl_FragColor = vec4(0.85, 0.96, 1.0, edge * vertical * shimmer * strength * uLight);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const rayXs = [-2.4, -1.4, -0.4, 0.6, 1.6, 2.4]
  rayXs.forEach((x, i) => {
    const geometry = new THREE.PlaneGeometry(0.9, 8)
    const phases = new Float32Array(geometry.attributes.position.count).fill(i / rayXs.length)
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    const ray = new THREE.Mesh(geometry, rayMaterial)
    ray.position.set(x, 2.4, -1.0)
    ray.rotation.z = 0.26
    ray.renderOrder = 5
    ray.userData.kind = 'ray'
    group.add(ray)
  })
  animated.push(rayMaterial)

  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 6),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMood: { value: 0 }, uLight: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime; uniform float uMood; uniform float uLight; varying vec2 vUv;
        void main() {
          float sparkle = sin(vUv.x * 90.0 + uTime * 1.4) * sin(vUv.y * 40.0 - uTime * 1.1);
          float alpha = 0.10 + max(0.0, sparkle) * 0.10;
          alpha *= mix(1.0, 0.7, clamp(uMood, 0.0, 1.0));
          alpha = mix(alpha, 0.05, clamp(uMood - 1.0, 0.0, 1.0));
          gl_FragColor = vec4(0.85, 0.95, 1.0, alpha * uLight);
        }`,
      transparent: true,
      depthWrite: false,
    }),
  )
  surface.rotation.x = -Math.PI / 2
  surface.position.set(0, WORLD.surface, -0.5)
  surface.renderOrder = 6
  surface.userData.kind = 'surface'
  group.add(surface)
  animated.push(surface.material as THREE.ShaderMaterial)

  group.add(buildFloor())
  group.add(buildRocks())

  const coralSpecs: Array<{ kind: string; x: number; z: number; s: number; seed: number }> = [
    { kind: 'branch', x: -2.20, z: -0.95, s: 1.0, seed: 201 },
    { kind: 'brain', x: -1.70, z: -0.65, s: 0.9, seed: 202 },
    { kind: 'fan', x: -2.55, z: -0.60, s: 0.8, seed: 203 },
    { kind: 'anemone', x: -1.85, z: -1.15, s: 0.9, seed: 204 },
    { kind: 'branch', x: 2.20, z: -0.95, s: 1.0, seed: 205 },
    { kind: 'brain', x: 1.70, z: -0.65, s: 0.9, seed: 206 },
    { kind: 'fan', x: 2.55, z: -0.60, s: 0.8, seed: 207 },
    { kind: 'anemone', x: 1.85, z: -1.15, s: 0.9, seed: 208 },
    { kind: 'table', x: -1.60, z: -1.40, s: 0.7, seed: 209 },
    { kind: 'table', x: 1.60, z: -1.40, s: 0.7, seed: 210 },
  ]
  coralSpecs.forEach(spec => group.add(buildCoralCluster(spec.kind, spec.x, spec.z, spec.s, spec.seed)))

  const weedSpecs = [
    { x: -2.55, z: -0.70, h: 1.9 }, { x: -2.45, z: -1.10, h: 1.6 },
    { x: 2.55, z: -0.70, h: 2.0 }, { x: 2.45, z: -1.10, h: 1.7 },
    { x: -1.05, z: -1.55, h: 1.1 }, { x: 1.05, z: -1.55, h: 1.1 },
    { x: -0.55, z: -1.20, h: 0.8 }, { x: 0.55, z: -1.20, h: 0.8 },
    { x: -2.05, z: -1.45, h: 1.2 }, { x: 2.05, z: -1.45, h: 1.2 },
  ]
  weedSpecs.forEach((spec, i) => {
    const cluster = buildSeaweedCluster(spec.x, spec.z, spec.h, 300 + i)
    seaweed.push(cluster)
    group.add(cluster)
  })

  const moteCount = 90
  const motePositions = new Float32Array(moteCount * 3)
  const motePhase = new Float32Array(moteCount)
  const moteSize = new Float32Array(moteCount)
  const moteRng = mulberry32(99)
  for (let i = 0; i < moteCount; i++) {
    motePositions[i * 3] = -2.5 + moteRng() * 5
    motePositions[i * 3 + 1] = -0.7 + moteRng() * 1.6
    motePositions[i * 3 + 2] = -1.8 + moteRng() * 2.2
    motePhase[i] = moteRng()
    moteSize[i] = 1 + moteRng() * 2
  }
  const moteGeometry = new THREE.BufferGeometry()
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3))
  moteGeometry.setAttribute('aPhase', new THREE.BufferAttribute(motePhase, 1))
  moteGeometry.setAttribute('aSize', new THREE.BufferAttribute(moteSize, 1))
  const moteMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMood: { value: 0 }, uLight: { value: 1 }, uPixelRatio: { value: 1 } },
    vertexShader: `
      uniform float uTime; uniform float uPixelRatio; attribute float aPhase; attribute float aSize; varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * 0.03 + aPhase * 1.7, 1.7) - 0.75;
        p.x += sin(uTime * 0.3 + aPhase * 6.28) * 0.08;
        vAlpha = 0.05 + aSize * 0.02;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * uPixelRatio;
      }`,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float rim = smoothstep(0.28, 0.37, d) * (1.0 - smoothstep(0.38, 0.5, d));
        gl_FragColor = vec4(0.85, 0.93, 0.95, rim * vAlpha);
      }`,
    transparent: true,
    depthWrite: false,
  })
  const motes = new THREE.Points(moteGeometry, moteMaterial)
  motes.frustumCulled = false
  motes.renderOrder = 8
  motes.userData.kind = 'motes'
  group.add(motes)
  animated.push(moteMaterial)

  return {
    group,
    update: (time: number, mood: number, light: number) => {
      for (const material of animated) {
        material.uniforms.uTime.value = time
        material.uniforms.uMood.value = mood
        material.uniforms.uLight.value = light
      }
      for (const cluster of seaweed) {
        cluster.rotation.z = Math.sin(time * 1.1 + cluster.userData.phase) * 0.05
        cluster.rotation.x = Math.sin(time * 0.8 + cluster.userData.phase * 1.3) * 0.03
      }
    },
  }
}
