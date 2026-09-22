'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_FRAME_WIDTH = 1024

export type CameraStatus = 'idle' | 'starting' | 'live' | 'error'

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    setStatus('starting')
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera API is not available in this browser.')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: true,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setStatus('live')
      return true
    } catch (err) {
      console.log('[v0] Camera start failed:', (err as Error)?.message)
      setError(
        (err as Error)?.name === 'NotAllowedError'
          ? 'Camera/microphone permission was blocked. You can still run the demo below.'
          : 'Could not access the camera in this environment. Try the demo instead.',
      )
      setStatus('error')
      return false
    }
  }, [])

  /** Grab the current video frame as a downscaled JPEG data URL. */
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null
    const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth)
    const w = Math.round(video.videoWidth * scale)
    const h = Math.round(video.videoHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.8)
  }, [])

  /** Begin recording the live camera + mic into an in-memory buffer. */
  const startRecording = useCallback((): boolean => {
    const stream = streamRef.current
    if (!stream || typeof MediaRecorder === 'undefined') return false
    try {
      chunksRef.current = []
      const candidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ]
      const mimeType = candidates.find((c) => MediaRecorder.isTypeSupported(c))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(1000)
      recorderRef.current = recorder
      return true
    } catch (err) {
      console.log('[v0] Recording start failed:', (err as Error)?.message)
      return false
    }
  }, [])

  /** Stop recording and resolve with the captured video Blob (or null). */
  const stopRecording = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current
    if (!recorder) return Promise.resolve(null)
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || 'video/webm'
        const blob = new Blob(chunksRef.current, { type })
        chunksRef.current = []
        recorderRef.current = null
        resolve(blob.size > 0 ? blob : null)
      }
      try {
        recorder.stop()
      } catch {
        recorderRef.current = null
        resolve(null)
      }
    })
  }, [])

  useEffect(() => stop, [stop])

  return { videoRef, status, error, start, stop, captureFrame, startRecording, stopRecording }
}
