'use client'

import {
  Camera,
  Folder,
  HardDrive,
  Loader2,
  Mic,
  MicOff,
  PlayCircle,
  Radio,
  Sparkles,
  Square,
  Video,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ListingDraftPanel } from '@/components/listing-draft-panel'
import { Button } from '@/components/ui/button'
import { useCamera } from '@/hooks/use-camera'
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'
import {
  DEMO_TRANSCRIPT,
  type GenerateListingResponse,
  type ListingDraft,
  sampleDraft,
} from '@/lib/listing'
import {
  downloadSessionFiles,
  fsAccessSupported,
  loadRememberedDirectory,
  pickBaseDirectory,
  rememberBaseDirectory,
  saveSessionToDirectory,
  type SessionSave,
} from '@/lib/magical-inventory'

type Phase = 'idle' | 'live'

function formatTime(total: number) {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0')
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function LiveStudio() {
  const camera = useCamera()
  const speech = useSpeechRecognition()

  const [phase, setPhase] = useState<Phase>('idle')
  const [demoMode, setDemoMode] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [frames, setFrames] = useState<string[]>([])
  const [demoFrame, setDemoFrame] = useState<string | null>(null)
  const demoVideoRef = useRef<HTMLVideoElement>(null)

  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<GenerateListingResponse | null>(null)
  const [draft, setDraft] = useState<ListingDraft | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  // Local "Magical Inventory" storage.
  const baseDirRef = useRef<Awaited<ReturnType<typeof pickBaseDirectory>>>(null)
  const sessionStartRef = useRef<Date | null>(null)
  const [baseDirName, setBaseDirName] = useState<string | null>(null)
  const [fsSupported, setFsSupported] = useState(false)
  const [recording, setRecording] = useState(false)
  const [saveStatus, setSaveStatus] = useState<{
    kind: 'idle' | 'saving' | 'saved' | 'downloaded' | 'error'
    msg?: string
  }>({ kind: 'idle' })

  const transcript = [speech.finalText, speech.interimText].filter(Boolean).join(' ').trim()

  // Preload the demo product frame as a data URL so demo mode works offline.
  useEffect(() => {
    let cancelled = false
    fetch('/demo/jacket.png')
      .then((r) => r.blob())
      .then(
        (b) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(b)
          }),
      )
      .then((url) => {
        if (!cancelled) setDemoFrame(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // If demo mode starts before the demo frame finished loading, seed it once ready.
  useEffect(() => {
    if (demoMode && demoFrame && frames.length === 0) setFrames([demoFrame])
  }, [demoMode, demoFrame, frames.length])

  // Detect File System Access support and restore any previously chosen folder.
  useEffect(() => {
    setFsSupported(fsAccessSupported())
    loadRememberedDirectory().then((handle) => {
      if (handle) {
        baseDirRef.current = handle
        setBaseDirName(handle.name)
      }
    })
  }, [])

  // Timer + auto frame capture while live.
  useEffect(() => {
    if (phase !== 'live') return
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000)
    let capture: ReturnType<typeof setInterval> | undefined
    if (!demoMode) {
      capture = setInterval(() => {
        const f = camera.captureFrame()
        if (f) setFrames((prev) => [...prev, f].slice(-6))
      }, 5000)
    }
    return () => {
      clearInterval(timer)
      if (capture) clearInterval(capture)
    }
  }, [phase, demoMode, camera])

  const resetSession = useCallback(() => {
    setResult(null)
    setDraft(null)
    setConfirmed(false)
    setFrames([])
    setElapsed(0)
  }, [])

  // Write the current session into Magical Inventory/<stream start>/ (or fall
  // back to downloading the files when folder access isn't available).
  const persistSession = useCallback(
    async (recordingBlob: Blob | null, listing: ListingDraft | null) => {
      const start = sessionStartRef.current
      if (!start) return
      const payload: SessionSave = {
        start,
        durationSec: elapsed,
        transcript,
        demo: demoMode,
        listing: listing ?? undefined,
        recording: recordingBlob,
        frames: demoMode ? [] : frames,
      }
      const base = baseDirRef.current
      if (base) {
        try {
          setSaveStatus({ kind: 'saving' })
          const res = await saveSessionToDirectory(base, payload)
          setSaveStatus({ kind: 'saved', msg: res.path })
        } catch (e) {
          console.log('[v0] folder save failed, downloading instead:', (e as Error)?.message)
          downloadSessionFiles(payload)
          setSaveStatus({ kind: 'downloaded', msg: 'folder write failed — downloaded instead' })
        }
      } else if (!fsSupported) {
        downloadSessionFiles(payload)
        setSaveStatus({ kind: 'downloaded' })
      } else {
        setSaveStatus({ kind: 'error', msg: 'Choose a save folder to store this session.' })
      }
    },
    [elapsed, transcript, demoMode, frames, fsSupported],
  )

  const chooseFolder = useCallback(async () => {
    const handle = await pickBaseDirectory()
    if (!handle) return
    baseDirRef.current = handle
    setBaseDirName(handle.name)
    rememberBaseDirectory(handle)
  }, [])

  const goLive = useCallback(async () => {
    resetSession()
    setSaveStatus({ kind: 'idle' })
    setDemoMode(false)
    const ok = await camera.start()
    if (ok) {
      sessionStartRef.current = new Date()
      speech.reset()
      speech.start()
      if (camera.startRecording()) setRecording(true)
      setPhase('live')
    }
  }, [camera, speech, resetSession])

  const startDemo = useCallback(() => {
    resetSession()
    setSaveStatus({ kind: 'idle' })
    setDemoMode(true)
    sessionStartRef.current = new Date()
    speech.setManualText(DEMO_TRANSCRIPT)
    if (demoFrame) setFrames([demoFrame])
    setPhase('live')
    // Restart the hard-coded demo stream video from the top.
    requestAnimationFrame(() => {
      const v = demoVideoRef.current
      if (v) {
        v.currentTime = 0
        v.play().catch(() => {})
      }
    })
  }, [speech, demoFrame, resetSession])

  const endStream = useCallback(async () => {
    // Capture the recording before we stop the camera tracks. In demo mode we
    // persist the hard-coded demo stream video as the session recording.
    let blob: Blob | null
    if (demoMode) {
      blob = await fetch('/demo/stream.mp4')
        .then((r) => r.blob())
        .catch(() => null)
    } else {
      blob = await camera.stopRecording()
    }
    setRecording(false)
    await persistSession(blob, draft)
    camera.stop()
    speech.stop()
    speech.reset()
    setDemoMode(false)
    setPhase('idle')
    resetSession()
  }, [camera, speech, resetSession, demoMode, persistSession, draft])

  const captureNow = useCallback(() => {
    if (demoMode) {
      if (demoFrame) setFrames((prev) => (prev.length ? prev : [demoFrame]))
      return
    }
    const f = camera.captureFrame()
    if (f) setFrames((prev) => [...prev, f].slice(-6))
  }, [demoMode, demoFrame, camera])

  const generate = useCallback(async () => {
    setGenerating(true)
    setConfirmed(false)
    let sendFrames = demoMode ? (demoFrame ? [demoFrame] : []) : frames
    if (!demoMode && sendFrames.length === 0) {
      const f = camera.captureFrame()
      if (f) {
        sendFrames = [f]
        setFrames([f])
      }
    }
    const t = transcript
    try {
      const res = await fetch('/api/generate-listing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ frames: sendFrames, transcript: t }),
      })
      const data = (await res.json()) as GenerateListingResponse & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      setResult(data)
      setDraft(data.draft)
    } catch (e) {
      console.log('[v0] generate failed client-side, using sample:', (e as Error).message)
      const fallback: GenerateListingResponse = {
        source: 'sample',
        notice:
          'The AI model could not be reached, so this is a fixed sample — it does not reflect what you said or showed.',
        draft: sampleDraft(t),
      }
      setResult(fallback)
      setDraft(fallback.draft)
    } finally {
      setGenerating(false)
    }
  }, [demoMode, demoFrame, frames, transcript, camera])

  const confirmListing = useCallback(async () => {
    setConfirmed(true)
    // Persist the confirmed listing into the same session folder.
    await persistSession(null, draft)
  }, [persistSession, draft])

  const canGenerate = phase === 'live' && (demoMode || frames.length > 0 || transcript.length > 0)
  const isLive = phase === 'live'

  return (
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[1.6fr_1fr] lg:py-8">
      {/* Stage + capture controls */}
      <div className="flex flex-col gap-3">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-black">
          {/* Dim poster behind everything (idle only) */}
          <img
            src="/demo/jacket.png"
            alt=""
            aria-hidden
            className={`absolute inset-0 size-full object-cover ${!isLive ? 'opacity-20' : 'opacity-0'}`}
          />
          {/* Hard-coded demo stream video (plays during Run demo) */}
          <video
            ref={demoVideoRef}
            src="/demo/stream.mp4"
            loop
            muted
            playsInline
            className={`absolute inset-0 size-full object-cover ${
              isLive && demoMode ? 'opacity-100' : 'opacity-0'
            }`}
          />
          {/* Live camera video */}
          <video
            ref={camera.videoRef}
            playsInline
            muted
            className={`absolute inset-0 size-full object-cover ${
              isLive && !demoMode ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Top overlays */}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
            {isLive ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-live px-2.5 py-1 text-xs font-semibold text-live-foreground">
                  <span className="live-dot size-1.5 rounded-full bg-live-foreground" />
                  {demoMode ? 'DEMO LIVE' : 'LIVE'}
                </span>
                <span className="rounded-full bg-black/50 px-2.5 py-1 font-mono text-xs text-white backdrop-blur-sm">
                  {formatTime(elapsed)}
                </span>
                {recording ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
                    <span className="live-dot size-1.5 rounded-full bg-live" /> REC
                  </span>
                ) : null}
              </div>
            ) : (
              <span />
            )}
            {isLive ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={endStream}
                className="bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
              >
                <Square className="size-3.5 fill-current" /> End stream
              </Button>
            ) : null}
          </div>

          {/* Mic status */}
          {isLive ? (
            <div className="absolute bottom-3 left-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
                {demoMode ? (
                  <>
                    <Mic className="size-3.5" /> Scripted audio
                  </>
                ) : speech.listening ? (
                  <>
                    <Mic className="size-3.5 text-primary" /> Listening
                  </>
                ) : speech.supported ? (
                  <>
                    <MicOff className="size-3.5" /> Mic idle
                  </>
                ) : (
                  <>
                    <MicOff className="size-3.5" /> Speech-to-text unsupported
                  </>
                )}
              </span>
            </div>
          ) : null}

          {/* Idle call-to-action */}
          {!isLive ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-t from-black/80 via-black/40 to-black/60 p-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/20 text-primary">
                <Video className="size-7" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-white text-balance">Start your live sale</h2>
                <p className="mx-auto max-w-sm text-sm text-white/70 text-pretty">
                  Go live with your camera and mic. As you show and describe an item, we&apos;ll draft its eBay
                  listing for you to confirm.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={goLive} className="h-11 gap-2 px-5 text-sm">
                  <Radio className="size-4" /> Go live
                </Button>
                <Button onClick={startDemo} variant="outline" className="h-11 gap-2 px-5 text-sm">
                  <PlayCircle className="size-4" /> Run demo
                </Button>
              </div>
              {camera.error ? (
                <p className="max-w-sm text-xs text-live">{camera.error}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Capture controls */}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
          <Button size="sm" variant="secondary" onClick={captureNow} disabled={!isLive}>
            <Camera className="size-4" /> Capture frame
          </Button>
          <p className="text-xs text-muted-foreground">
            {isLive && !demoMode
              ? 'Auto-capturing a frame every 5s.'
              : 'Frames feed the product recognition.'}
          </p>
          <div className="ml-auto flex items-center gap-1.5 overflow-x-auto">
            {frames.length === 0 ? (
              <span className="text-xs text-muted-foreground">No frames yet</span>
            ) : (
              frames.map((f, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={f || '/placeholder.svg'}
                  alt={`Captured frame ${i + 1}`}
                  className="size-10 shrink-0 rounded-md border border-border object-cover"
                />
              ))
            )}
          </div>
        </div>

        {/* Local "Magical Inventory" storage */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs">
          <HardDrive className="size-4 shrink-0 text-primary" />
          {baseDirName ? (
            <span className="text-foreground">
              Saving to <span className="font-medium">{baseDirName}</span>
              <span className="text-muted-foreground"> / Magical Inventory / &lt;stream start&gt;</span>
            </span>
          ) : fsSupported ? (
            <span className="text-muted-foreground">
              Choose a folder (e.g. your Desktop) to save each stream&apos;s video recording + transcript.
            </span>
          ) : (
            <span className="text-muted-foreground">
              This browser can&apos;t write to folders, so sessions will download as files instead.
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {saveStatus.kind === 'saving' ? <span className="text-muted-foreground">Saving…</span> : null}
            {saveStatus.kind === 'saved' ? (
              <span className="text-primary">Saved to {saveStatus.msg}</span>
            ) : null}
            {saveStatus.kind === 'downloaded' ? (
              <span className="text-primary">Session downloaded{saveStatus.msg ? ` (${saveStatus.msg})` : ''}</span>
            ) : null}
            {saveStatus.kind === 'error' ? <span className="text-live">{saveStatus.msg}</span> : null}
            {fsSupported ? (
              <Button size="sm" variant={baseDirName ? 'ghost' : 'secondary'} onClick={chooseFolder}>
                <Folder className="size-4" /> {baseDirName ? 'Change' : 'Choose folder'}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Right column */}
      <div className="flex min-h-[26rem] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:min-h-0">
        {draft ? (
          <ListingDraftPanel
            draft={draft}
            source={result?.source ?? 'sample'}
            notice={result?.notice}
            confirmed={confirmed}
            generating={generating}
            imageSrc={demoMode ? demoFrame : frames.at(-1) ?? null}
            videoSrc={demoMode ? '/demo/stream.mp4' : null}
            onChange={setDraft}
            onConfirm={confirmListing}
            onRegenerate={generate}
            onDiscard={() => {
              setDraft(null)
              setResult(null)
              setConfirmed(false)
            }}
          />
        ) : isLive ? (
          <>
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Mic className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Live transcript</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {transcript ? (
                <p className="text-sm leading-relaxed">
                  <span className="text-foreground/90">{speech.finalText}</span>{' '}
                  <span className="text-muted-foreground italic">{speech.interimText}</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {speech.supported
                    ? 'Start describing your item out loud — your words will appear here and feed the listing.'
                    : 'Speech-to-text is not available in this browser. You can still generate from the captured frames.'}
                </p>
              )}
            </div>
            <div className="border-t border-border p-3">
              <Button onClick={generate} disabled={!canGenerate || generating} className="h-10 w-full gap-2">
                {generating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Recognizing product…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> Generate listing
                  </>
                )}
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Uses {demoMode ? 1 : frames.length} frame{(demoMode ? 1 : frames.length) === 1 ? '' : 's'} +{' '}
                {transcript ? `${transcript.split(/\s+/).length} words of audio` : 'no audio yet'}
              </p>
            </div>
          </>
        ) : (
          <HowItWorks />
        )}
      </div>
    </div>
  )
}

function HowItWorks() {
  const steps = [
    {
      icon: Video,
      title: 'Show the product',
      body: 'Your camera streams live. We grab frames and let a vision model recognize the item.',
    },
    {
      icon: Mic,
      title: 'Talk it up',
      body: 'Speech-to-text captures what you say — brand, condition, quirks — as selling context.',
    },
    {
      icon: Sparkles,
      title: 'Confirm the draft',
      body: 'AI writes a title, category, specifics, and a price estimate. You review and confirm.',
    },
  ]
  return (
    <div className="flex flex-1 flex-col gap-1 p-5">
      <h2 className="text-sm font-semibold">How it works</h2>
      <p className="mb-3 text-xs text-muted-foreground">Three steps, no manual data entry.</p>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-border bg-background/50 p-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <s.icon className="size-5" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <span className="text-muted-foreground">{i + 1}.</span> {s.title}
              </div>
              <p className="text-xs text-muted-foreground text-pretty">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-auto rounded-lg border border-border bg-background/50 p-2.5 text-[11px] text-muted-foreground">
        This POC never creates a real eBay listing — it stops at your confirmation.
      </p>
    </div>
  )
}
