'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Minimal typings for the Web Speech API (not in lib.dom for all targets).
type SpeechRecognitionResultLike = { transcript: string }
type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{ 0: SpeechRecognitionResultLike; isFinal: boolean }>
}
type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useSpeechRecognition() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const listeningRef = useRef(false)
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [finalText, setFinalText] = useState('')
  const [interimText, setInterimText] = useState('')

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null)
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return false
    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let interim = ''
      let finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res.isFinal) finalChunk += res[0].transcript
        else interim += res[0].transcript
      }
      if (finalChunk) setFinalText((prev) => (prev ? `${prev} ${finalChunk.trim()}` : finalChunk.trim()))
      setInterimText(interim)
    }
    recognition.onerror = (e) => {
      console.log('[v0] Speech recognition error:', e.error)
    }
    recognition.onend = () => {
      // Auto-restart while the user intends to keep listening (recognition
      // stops itself after pauses).
      if (listeningRef.current) {
        try {
          recognition.start()
        } catch {
          /* already started */
        }
      } else {
        setListening(false)
      }
    }

    recognitionRef.current = recognition
    listeningRef.current = true
    try {
      recognition.start()
      setListening(true)
      return true
    } catch {
      return false
    }
  }, [])

  const stop = useCallback(() => {
    listeningRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setInterimText('')
    setListening(false)
  }, [])

  const reset = useCallback(() => {
    setFinalText('')
    setInterimText('')
  }, [])

  const setManualText = useCallback((text: string) => {
    setFinalText(text)
    setInterimText('')
  }, [])

  useEffect(() => {
    return () => {
      listeningRef.current = false
      recognitionRef.current?.stop()
    }
  }, [])

  return { supported, listening, finalText, interimText, start, stop, reset, setManualText }
}
