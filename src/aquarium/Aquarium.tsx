import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createFishModel, createCreatureModel, type AnimalModel } from './animalModels'
import { createSchool, createBottomLife, stepSchool, stepBottomLife, SPECIES, type Swimmer } from './simulation'
import { BOTTOM_SIZES, FOOT_HEIGHTS, substrateAt } from './bottomLife'
import { AXES, WORLD, worldPosition } from './tankLayout'
import { vertexShader } from './shaders'
import { createReefScene, type ReefScene } from './reef'

export type Mood = 'day' | 'dusk' | 'night'
export interface AquariumOptions { paused: boolean; mood: Mood; current: number; population: number; light: number }
interface Props { options: AquariumOptions; onReady: () => void }
const assets = `${import.meta.env.BASE_URL}assets/`

class Reef {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30)
  options: AquariumOptions
  swimmers: Swimmer[] = createSchool(SPECIES.length)
  bottomLife = createBottomLife()
  fish: AnimalModel[] = []
  creatures: AnimalModel[] = []
  contactShadows: THREE.Mesh[] = []
  environment: THREE.WebGLRenderTarget | null = null
  keyLight = new THREE.DirectionalLight(0xe5f1ff, 2.1)
  fillLight = new THREE.DirectionalLight(0x8ccce4, 0.85)
  rimLight = new THREE.DirectionalLight(0xa5e3ec, 1.6)
  ambient = new THREE.HemisphereLight(0xe3eff0, 0x35302a, 1.1)
  heading = new THREE.Vector3()
  side = new THREE.Vector3()
  up = new THREE.Vector3()
  basis = new THREE.Matrix4()
  targetRotation = new THREE.Quaternion()
  surfaceNormal = new THREE.Vector3()
  shadowNormal = new THREE.Vector3(0, 0, 1)
  reefScene: ReefScene | null = null
  aspect = 1
  time = 0
  mood = 0
  fogDay = new THREE.Color(0x0b5a86)
  fogDusk = new THREE.Color(0x3a4a6b)
  fogNight = new THREE.Color(0x030d1a)
  fogColor = new THREE.Color()
  frame = 0
  previous = 0
  disposed = false
  observer: ResizeObserver
  onError: () => void

  constructor(private container: HTMLDivElement, options: AquariumOptions, onError: () => void) {
    this.options = { ...options }
    this.onError = onError
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.setClearColor(0x0a4a6e)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.96
    this.scene.fog = new THREE.Fog(0x0b5a86, 6, 16)
    this.renderer.domElement.setAttribute('aria-label', 'A sunlit coral reef with twelve swimming species including a lionfish, betta, and cuttlefish, a shrimp, snail and hermit crab on the sand, and a starfish resting near the coral')
    this.renderer.domElement.setAttribute('role', 'img')
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost)
    container.appendChild(this.renderer.domElement)
    this.camera.position.z = 5.5
    this.keyLight.position.set(-1.4, 4.0, 3.0)
    this.fillLight.position.set(3.0, 0.8, 4.0)
    this.rimLight.position.set(1.0, 2.5, -2.0)
    this.scene.add(this.keyLight, this.fillLight, this.rimLight, this.ambient)
    const environment = new RoomEnvironment()
    const generator = new THREE.PMREMGenerator(this.renderer)
    this.environment = generator.fromScene(environment, 0.05)
    this.scene.environment = this.environment.texture
    environment.dispose(); generator.dispose()
    this.observer = new ResizeObserver(this.resize)
    this.observer.observe(container)
    document.addEventListener('visibilitychange', this.visibility)
    this.resize()
  }

  async load() {
    if (this.disposed) return
    // The reef is procedural now: rock, coral, sand, and seaweed meshes built
    // from the same envelopes the fish steer around. Real 3D occlusion
    // replaces the old masked photograph, so distant fish hide behind coral
    // instead of behind a flat cutout. The photograph remains only as the
    // static fallback behind the canvas if WebGL fails to start.
    this.reefScene = createReefScene()
    this.scene.add(this.reefScene.group)

    this.swimmers.forEach(swimmer => {
      const model = createFishModel(swimmer.species)
      model.root.rotation.y = swimmer.vx > 0 ? -0.28 : Math.PI + 0.28
      this.fish.push(model)
      this.scene.add(model.root)
    })

    for (let i = 0; i < 4; i++) {
      const model = createCreatureModel(i)
      this.creatures.push(model)
      this.scene.add(model.root)
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: 'varying vec2 vUv; void main() { float r = length((vUv - 0.5) * 2.0); gl_FragColor = vec4(0.06, 0.045, 0.03, (1.0 - smoothstep(0.05, 1.0, r)) * 0.24); }',
        transparent: true, depthWrite: false,
      }))
      this.contactShadows.push(shadow)
      this.scene.add(shadow)
    }
    this.animate(performance.now())
  }

  resize = () => {
    const { width, height } = this.container.getBoundingClientRect()
    this.aspect = Math.max(width, 1) / Math.max(height, 1)
    this.camera.aspect = this.aspect
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  contextLost = (event: Event) => {
    event.preventDefault()
    this.onError()
    this.dispose()
  }

  visibility = () => {
    cancelAnimationFrame(this.frame)
    if (!document.hidden && !this.disposed) {
      this.previous = 0
      this.frame = requestAnimationFrame(this.animate)
    }
  }

  animate = (now: number) => {
    if (this.disposed) return
    const dt = this.previous ? Math.min((now - this.previous) / 1000, 0.05) : 0
    this.previous = now
    const { paused, current, population, light } = this.options
    const desiredMood = this.options.mood === 'day' ? 0 : this.options.mood === 'dusk' ? 1 : 2
    this.mood = THREE.MathUtils.damp(this.mood, desiredMood, 2.5, dt)
    const activeFish = this.swimmers.slice(0, population)
    if (!paused) {
      this.time += dt * current
      stepSchool(activeFish, dt, this.time, current)
      stepBottomLife(this.bottomLife, dt, current)
    }
    if (this.reefScene) this.reefScene.update(this.time, this.mood, light)
    const night = Math.max(0, this.mood - 1)
    // Water color follows the mood: bright reef blue by day, warm dusk, dark night.
    this.fogColor.copy(this.fogDay).lerp(this.fogDusk, Math.min(this.mood, 1)).lerp(this.fogNight, night)
    ;(this.scene.fog as THREE.Fog).color.copy(this.fogColor)
    // Animal reflections dim with the water.
    this.scene.environmentIntensity = light * (1 - night * 0.8)
    this.keyLight.intensity = light * (2.1 - this.mood * 0.7)
    this.fillLight.intensity = light * (0.5 - night * 0.15)
    this.rimLight.intensity = light * (0.9 - night * 0.3)
    this.ambient.intensity = light * (0.6 - night * 0.2)
    this.keyLight.color.set(this.mood > 1 ? 0x8fb8e8 : this.mood > 0.4 ? 0xffd2a0 : 0xeaf7ff)
    this.fish.forEach((model, i) => {
      const mesh = model.root
      mesh.visible = i < population
      if (!mesh.visible) return
      const swimmer = this.swimmers[i]
      const point = worldPosition(swimmer.x, swimmer.y, swimmer.depth)
      mesh.position.set(point.x, point.y, point.z)
      mesh.scale.setScalar(swimmer.size * 1.28 * WORLD.halfHeight)
      // A quaternion turns the whole solid animal, including its far eye and paired fins.
      this.heading.set(swimmer.vx * AXES.x, -swimmer.vy * AXES.y, -swimmer.vz * AXES.depth)
      if (!paused && this.heading.lengthSq() > 0.000002) {
        this.heading.normalize()
        this.side.crossVectors(this.heading, THREE.Object3D.DEFAULT_UP).normalize()
        if (this.side.lengthSq() < 0.0001) this.side.set(0, 0, 1)
        this.up.crossVectors(this.side, this.heading).normalize()
        this.basis.makeBasis(this.heading, this.up, this.side)
        this.targetRotation.setFromRotationMatrix(this.basis)
        mesh.quaternion.slerp(this.targetRotation, 1 - Math.exp(-3.1 * dt))
      }
      model.animate(swimmer.finTime, swimmer.activity)
    })
    this.creatures.forEach((model, i) => {
      const animal = this.bottomLife[i]
      const size = BOTTOM_SIZES[i] * WORLD.halfHeight
      const point = worldPosition(animal.x, animal.y, animal.depth)
      const surface = substrateAt(animal.x, animal.depth)
      this.surfaceNormal.set(surface.nx, surface.ny, surface.nz)
      // Project the crawling direction onto the local surface; feet, shells and
      // the contact shadow follow the same slope and the same world coordinates.
      this.heading.set(Math.cos(animal.heading), 0, Math.sin(animal.heading))
      this.heading.addScaledVector(this.surfaceNormal, -this.heading.dot(this.surfaceNormal)).normalize()
      this.side.crossVectors(this.heading, this.surfaceNormal).normalize()
      this.basis.makeBasis(this.heading, this.surfaceNormal, this.side)
      this.targetRotation.setFromRotationMatrix(this.basis)
      if (!model.root.userData.surfacePlaced) {
        model.root.quaternion.copy(this.targetRotation)
        model.root.userData.surfacePlaced = true
      } else if (!paused) model.root.quaternion.slerp(this.targetRotation, 1 - Math.exp(-4 * dt))
      model.root.position.set(point.x, surface.y, point.z).addScaledVector(this.surfaceNormal, size * FOOT_HEIGHTS[i])
      model.root.scale.setScalar(size)
      const shadow = this.contactShadows[i]
      shadow.position.set(point.x, surface.y, point.z).addScaledVector(this.surfaceNormal, 0.001)
      shadow.quaternion.setFromUnitVectors(this.shadowNormal, this.surfaceNormal)
      shadow.scale.set(size * (i === 3 ? 0.9 : 0.75), size * (i === 3 ? 0.9 : 0.42), 1)
      model.animate(animal.localTime, animal.activity)
    })
    this.renderer.render(this.scene, this.camera)
    if (!document.hidden) this.frame = requestAnimationFrame(this.animate)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    document.removeEventListener('visibilitychange', this.visibility)
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost)
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments) {
        geometries.add(object.geometry)
        const list = Array.isArray(object.material) ? object.material : [object.material]
        list.forEach(material => materials.add(material))
      }
    })
    geometries.forEach(geometry => geometry.dispose())
    materials.forEach(material => material.dispose())
    this.environment?.dispose()
    this.scene.clear()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

export default function Aquarium({ options, onReady }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<Reef | null>(null)
  const initialOptions = useRef(options)
  const readyCallback = useRef(onReady)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let reef: Reef | undefined
    setError(false)
    try {
      reef = new Reef(container.current!, initialOptions.current, () => { if (active) setError(true) })
      instance.current = reef
      reef.load().then(() => { if (active) readyCallback.current() }).catch(() => {
        reef?.dispose()
        if (active) { setError(true); readyCallback.current() }
      })
    } catch {
      setError(true)
      readyCallback.current()
    }
    return () => { active = false; reef?.dispose(); instance.current = null }
  }, [attempt])
  useEffect(() => {
    initialOptions.current = options
    if (instance.current) instance.current.options = options
  }, [options])
  return <>
    <div className="aquarium" ref={container} style={{ backgroundImage: `url(${assets}home-tank.png)` }} />
    {error && <div className="render-error" role="alert">
      <span>The reef is still here. Live animation couldn’t start in this browser.</span>
      <button onClick={() => setAttempt(value => value + 1)}>Try again</button>
    </div>}
  </>
}
