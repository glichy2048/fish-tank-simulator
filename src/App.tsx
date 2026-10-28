import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioLines, Check, ChevronDown, Eye, EyeOff, Maximize, Minimize, Moon, Pause, Play, SlidersHorizontal, Sun, Sunset, Volume2, Waves, X } from 'lucide-react'
import Aquarium, { type Mood } from './aquarium/Aquarium'
import { AquariumAudio, type AudioStatus } from './aquarium/audio'
import { SPECIES } from './aquarium/simulation'

const moods: { id: Mood; name: string; caption: string; icon: typeof Sun }[] = [
  { id: 'day', name: 'Daylight', caption: 'Sunlit shallows', icon: Sun },
  { id: 'dusk', name: 'Golden hour', caption: 'The quiet between tides', icon: Sunset },
  { id: 'night', name: 'Moonlight', caption: 'A world after dark', icon: Moon },
]

const defaultSettings = { current: 0.5, light: 0.7, population: SPECIES.length }

export default function App() {
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [mood, setMood] = useState<Mood>('day')
  const [current, setCurrent] = useState(defaultSettings.current)
  const [population, setPopulation] = useState<number>(defaultSettings.population)
  const [light, setLight] = useState(defaultSettings.light)
  const [sound, setSound] = useState(true)
  const [audioStatus, setAudioStatus] = useState<AudioStatus>('waiting')
  const [hidden, setHidden] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [panel, setPanel] = useState<'light' | 'settings' | null>(null)
  const [notice, setNotice] = useState('')
  const audio = useRef<AquariumAudio | null>(null)
  const soundWanted = useRef(true)
  const toolbar = useRef<HTMLDivElement>(null)
  const activeMood = moods.find(item => item.id === mood)!
  const MoodIcon = activeMood.icon
  const onReady = useCallback(() => setReady(true), [])

  const toggleSound = useCallback(() => {
    soundWanted.current = !soundWanted.current
    setSound(soundWanted.current)
    audio.current?.setEnabled(soundWanted.current)
  }, [])

  useEffect(() => {
    const ambience = new AquariumAudio(setAudioStatus)
    audio.current = ambience
    ambience.setEnabled(soundWanted.current)
    const unlock = (event: Event) => {
      if ((event.target as HTMLElement).closest('[data-audio-toggle]')) return
      if (event instanceof KeyboardEvent && event.key.toLowerCase() === 'm') return
      ambience.unlock()
    }
    document.addEventListener('pointerdown', unlock)
    document.addEventListener('keydown', unlock)
    document.addEventListener('visibilitychange', ambience.visibility)
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
      document.removeEventListener('visibilitychange', ambience.visibility)
      ambience.dispose()
      audio.current = null
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen()
      else { setHidden(true); setNotice('Enjoy the uninterrupted view. Tap the eye to bring the controls back.') }
    } catch { setNotice('Fullscreen is unavailable here. Use the eye button for an uninterrupted view.') }
  }, [])

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches('input, textarea, select') || target.isContentEditable || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.code === 'Space' && !target.closest('button, a')) { event.preventDefault(); setPaused(value => !value) }
      if (event.key.toLowerCase() === 'm') void toggleSound()
      if (event.key.toLowerCase() === 'f') void toggleFullscreen()
      if (event.key.toLowerCase() === 'h') { setHidden(value => !value); setPanel(null) }
      if (event.key === 'Escape') { setPanel(null); setHidden(false) }
    }
    const fullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('keydown', keyboard)
    document.addEventListener('fullscreenchange', fullscreenChange)
    return () => {
      document.removeEventListener('keydown', keyboard)
      document.removeEventListener('fullscreenchange', fullscreenChange)
    }
  }, [toggleSound, toggleFullscreen])

  useEffect(() => {
    if (!panel) return
    const close = (event: PointerEvent) => {
      if (!toolbar.current?.contains(event.target as Node)) setPanel(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanel(null)
        toolbar.current?.querySelector<HTMLButtonElement>(`[data-panel="${panel}"]`)?.focus()
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [panel])

  // Automatically enter the uninterrupted aquarium view after two minutes without input.
  // Any genuine activity reveals the controls and starts a fresh inactivity window.
  useEffect(() => {
    let timeout: number | undefined
    const clearTimer = () => {
      if (timeout !== undefined) window.clearTimeout(timeout)
      timeout = undefined
    }
    const scheduleHide = () => {
      clearTimer()
      if (!document.hidden) {
        timeout = window.setTimeout(() => {
          setHidden(true)
          setPanel(null)
        }, 120_000)
      }
    }
    const onActivity = (event: Event) => {
      if (event.type === 'keydown') {
        const key = (event as KeyboardEvent).key.toLowerCase()
        // Preserve the app's H/Escape shortcut semantics instead of overriding them.
        if (key === 'h' || key === 'escape') { scheduleHide(); return }
      }
      setHidden(value => value ? false : value)
      scheduleHide()
    }
    const onVisibilityChange = () => {
      if (document.hidden) clearTimer()
      else scheduleHide()
    }
    const activityEvents: Array<keyof DocumentEventMap> = ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel']
    activityEvents.forEach(type => document.addEventListener(type, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisibilityChange)
    scheduleHide()
    return () => {
      clearTimer()
      activityEvents.forEach(type => document.removeEventListener(type, onActivity))
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 6000)
    return () => clearTimeout(timeout)
  }, [notice])

  return <main data-audio-state={audioStatus} className={`experience ${hidden ? 'is-immersed' : ''} ${ready ? 'is-ready' : ''}`}>
    <Aquarium options={{ paused, mood, current, population, light }} onReady={onReady} />
    <div className="edge-shade" aria-hidden="true" />

    {!ready && <div className="loading" role="status" aria-label="Loading aquarium"><Waves size={30} /></div>}

    <header className="header interface" inert={hidden}>
      <a className="brand" href="./" aria-label="Pelagic home">
        <span className="brand-icon"><Waves size={29} strokeWidth={1.25} /></span>
        <span>pelagic<span className="brand-period">.</span></span>
      </a>
      <span className="header-note">A LITTLE OCEAN, ALL TO YOURSELF</span>
      <div className="header-end">
        <span className={`live-status ${paused ? 'is-paused' : ''}`}><span />{paused ? 'A moment, held' : 'A living aquarium'}</span>
        <span className="header-divider" />
        <button className="icon-button" onClick={() => { setHidden(true); setPanel(null) }} aria-label="Hide controls" title="Hide controls (H)"><EyeOff size={19} strokeWidth={1.5} /></button>
      </div>
    </header>

    {hidden && <button className="reveal-button icon-button" onClick={() => setHidden(false)} aria-label="Show controls" title="Show controls (H)"><Eye size={20} strokeWidth={1.5} /></button>}

    <div className="scene-caption interface" inert={hidden}>
      <div className="scene-eyebrow"><span className="scene-line" /> THE LIVING REEF</div>
      <h1>A reef at home</h1>
      <p><span>{activeMood.caption}</span><span className="caption-dot">·</span><span>{population + 4} different species</span></p>
    </div>

    <div className="bottom-bar interface" inert={hidden}>
      <span className="breathe-note"><span className={`breathing-ring ${paused ? 'is-paused' : ''}`} />Slow down. Stay awhile.</span>
      <div className="toolbar-wrap" ref={toolbar}>
        {panel === 'light' && <section className="popover light-popover" aria-label="Aquarium lighting">
          <div className="popover-heading"><span>A different kind of blue</span><button className="close-button" onClick={() => setPanel(null)} aria-label="Close lighting"><X size={16} /></button></div>
          {moods.map(item => <button key={item.id} className={`mood-option ${mood === item.id ? 'selected' : ''}`} onClick={() => { setMood(item.id); setPanel(null) }} aria-pressed={mood === item.id}>
            <span className={`mood-swatch ${item.id}`}><item.icon size={20} strokeWidth={1.5} /></span>
            <span><strong>{item.name}</strong><small>{item.caption}</small></span>
            {mood === item.id && <Check size={16} />}
          </button>)}
        </section>}
        {panel === 'settings' && <section className="popover settings-popover" aria-label="Aquarium settings">
          <div className="popover-heading"><span>Make yourself at home</span><button className="close-button" onClick={() => setPanel(null)} aria-label="Close settings"><X size={16} /></button></div>
          <label className="slider-label" htmlFor="current">Water current <span>{current < 0.7 ? 'Gentle' : current > 1.2 ? 'Lively' : 'Easygoing'}</span></label>
          <input id="current" type="range" min="0.3" max="1.8" step="0.1" value={current} onChange={event => setCurrent(Number(event.target.value))} />
          <label className="slider-label" htmlFor="light">Ambient light <span>{Math.round(light * 100)}%</span></label>
          <input id="light" type="range" min="0.65" max="1.3" step="0.05" value={light} onChange={event => setLight(Number(event.target.value))} />
          <label className="slider-label" htmlFor="population">Swimming animals <span>{population}</span></label>
          <input id="population" type="range" min="3" max={SPECIES.length} step="1" value={population} onChange={event => setPopulation(Number(event.target.value))} />
          <div className="settings-footer"><span>One of each species.</span><button onClick={() => { setCurrent(defaultSettings.current); setLight(defaultSettings.light); setPopulation(defaultSettings.population) }}>Reset</button></div>
          <p className="sound-credit">Aquarium recording by <a href="https://freesound.org/people/DudeAwesome/sounds/386023/" target="_blank" rel="noreferrer">DudeAwesome</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a><br />Edited for a soft, continuous loop.</p>
        </section>}
        <nav className="toolbar" aria-label="Aquarium controls">
          <button className={`tool-button lighting-button ${panel === 'light' ? 'active' : ''}`} onClick={() => setPanel(value => value === 'light' ? null : 'light')} aria-expanded={panel === 'light'} aria-label={`Lighting: ${activeMood.name}`} data-panel="light">
            <MoodIcon size={19} strokeWidth={1.5} /><span>{activeMood.name}</span><ChevronDown className={panel === 'light' ? 'chevron-open' : ''} size={13} />
          </button>
          <span className="tool-divider" />
          <button data-audio-toggle className={`tool-button sound-button ${sound ? 'active' : ''}`} onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Mute aquarium sound' : 'Play aquarium sound'} title="Aquarium sound (M)">
            {sound ? <Volume2 size={19} strokeWidth={1.5} /> : <AudioLines size={19} strokeWidth={1.5} />}<span>{audioStatus === 'waiting' && sound ? 'Sound ready' : audioStatus === 'unavailable' ? 'Sound unavailable' : `Sound ${sound ? 'on' : 'off'}`}</span>
          </button>
          <span className="tool-divider" />
          <button className="tool-button square" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume aquarium' : 'Pause aquarium'} title={paused ? 'Resume (Space)' : 'Pause (Space)'}>{paused ? <Play size={18} strokeWidth={1.5} /> : <Pause size={18} strokeWidth={1.5} />}</button>
          <button className={`tool-button square ${panel === 'settings' ? 'active' : ''}`} onClick={() => setPanel(value => value === 'settings' ? null : 'settings')} aria-label="Aquarium settings" aria-expanded={panel === 'settings'} data-panel="settings" title="Adjust your aquarium"><SlidersHorizontal size={18} strokeWidth={1.5} /></button>
          <span className="tool-divider" />
          <button className="tool-button square" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title="Fullscreen (F)">{fullscreen ? <Minimize size={18} strokeWidth={1.5} /> : <Maximize size={18} strokeWidth={1.5} />}</button>
        </nav>
      </div>
      <span className="keyboard-note"><kbd>H</kbd> to hide controls</span>
    </div>
    {notice && <div className="toast" role="status">{notice}</div>}
  </main>
}
