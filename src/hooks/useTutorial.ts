import { useCallback, useEffect, useRef, useState } from 'react'
import {
  hasSeenTutorial,
  isGuideVoiceEnabled,
  rememberGuideVoice,
  rememberTutorialSeen,
  TUTORIAL_STEPS,
} from '../domain/tutorial'
import { TutorialVoice } from '../services/tutorialVoice'

export function useTutorial(speechRate = 1) {
  // La prima apertura decide da sola; le successive passano dal pulsante.
  const [isOpen, setIsOpen] = useState(() => !hasSeenTutorial())
  const [stepIndex, setStepIndex] = useState(0)
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(isGuideVoiceEnabled)
  const voiceRef = useRef<TutorialVoice | null>(null)

  const getVoice = useCallback(() => {
    voiceRef.current ??= new TutorialVoice()
    // La guida parla alla velocità scelta nelle impostazioni: chi ascolta al
    // doppio non vuole l'eccezione proprio al primo contatto con l'app.
    voiceRef.current.setRate(speechRate)
    return voiceRef.current
  }, [speechRate])

  const speakCurrent = useCallback(
    (index: number) => {
      const step = TUTORIAL_STEPS[index]
      if (!step || !isVoiceEnabled) return
      void getVoice().speak(step)
    },
    [getVoice, isVoiceEnabled],
  )

  const close = useCallback(() => {
    voiceRef.current?.stop()
    rememberTutorialSeen()
    setIsOpen(false)
  }, [])

  // Il passo avanza fuori dall'aggiornamento di stato: in StrictMode React
  // esegue due volte l'aggiornatore, e la voce partirebbe in doppio.
  const next = useCallback(() => {
    const following = stepIndex + 1
    if (following >= TUTORIAL_STEPS.length) {
      close()
      return
    }
    setStepIndex(following)
    speakCurrent(following)
  }, [close, speakCurrent, stepIndex])

  const repeat = useCallback(() => speakCurrent(stepIndex), [speakCurrent, stepIndex])

  /** Zittisce la guida: la prova non deve parlare sopra la descrizione. */
  const stopVoice = useCallback(() => voiceRef.current?.stop(), [])

  const open = useCallback(() => {
    setStepIndex(0)
    setIsOpen(true)
  }, [])

  const toggleVoice = useCallback(() => {
    const enabled = !isVoiceEnabled
    rememberGuideVoice(enabled)
    if (!enabled) voiceRef.current?.stop()
    setIsVoiceEnabled(enabled)
  }, [isVoiceEnabled])

  useEffect(() => {
    voiceRef.current?.setRate(speechRate)
  }, [speechRate])

  useEffect(() => {
    return () => voiceRef.current?.stop()
  }, [])

  return {
    isOpen,
    step: TUTORIAL_STEPS[stepIndex],
    stepIndex,
    stepCount: TUTORIAL_STEPS.length,
    isVoiceEnabled,
    open,
    close,
    next,
    repeat,
    stopVoice,
    toggleVoice,
  }
}
