import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelSpeech,
  collectTranscript,
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  prefetchLiminalitySpeech,
  speakText,
} from '../voice/browserSpeech';
import { askLiminalityAssistant, spokenAssistantReply } from '../voice/assistantVoice';
import {
  COMMAND_TIMEOUT_MS,
  RESET_TO_WAITING_MS,
  hasWakeWord,
  matchLiminalityCommand,
  registerForWake,
  spokenCommandResponse,
  spokenUnknownResponse,
  stripWakeWord,
  wakeResponseFor,
  type LiminalityRegister,
} from '../voice/liminalityCommands';

export type LiminalityPhase =
  | 'off'
  | 'waiting'
  | 'listening'
  | 'processing'
  | 'executing'
  | 'speaking';

export function useLiminalityVoice({
  enabled,
  onNavigate,
}: {
  enabled: boolean;
  onNavigate: (path: string) => void;
}) {
  const supported = isSpeechRecognitionSupported();
  const [phase, setPhase] = useState<LiminalityPhase>('off');
  const [statusLabel, setStatusLabel] = useState('Microphone off');
  const [heard, setHeard] = useState('');

  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognition>>(null);
  const modeRef = useRef<'off' | 'wake' | 'command'>('off');
  const speakingRef = useRef(false);
  const registerRef = useRef<LiminalityRegister>('polite');
  const enabledRef = useRef(enabled);
  const timeoutRef = useRef<number | null>(null);
  const resetRef = useRef<number | null>(null);
  const endpointRef = useRef<number | null>(null);
  const lastHandledRef = useRef('');
  const networkFailsRef = useRef(0);
  const onNavigateRef = useRef(onNavigate);
  const handleWakeRef = useRef<(text: string) => void>(() => {});
  const handleCommandRef = useRef<(text: string) => void>(() => {});
  const assistantHistoryRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  enabledRef.current = enabled;
  onNavigateRef.current = onNavigate;

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (resetRef.current) window.clearTimeout(resetRef.current);
    if (endpointRef.current) window.clearTimeout(endpointRef.current);
    timeoutRef.current = null;
    resetRef.current = null;
    endpointRef.current = null;
  }, []);

  const commitHeard = useCallback((raw: string) => {
    const spoken = String(raw || '').trim();
    if (!spoken || speakingRef.current || !enabledRef.current) return;
    const key = spoken.toLowerCase();
    if (lastHandledRef.current === key) return;
    lastHandledRef.current = key;
    if (endpointRef.current) {
      window.clearTimeout(endpointRef.current);
      endpointRef.current = null;
    }
    if (modeRef.current === 'wake') handleWakeRef.current(spoken);
    else if (modeRef.current === 'command') handleCommandRef.current(spoken);
  }, []);

  const destroyRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null;
  }, []);

  const startRecognition = useCallback(() => {
    if (!enabledRef.current || speakingRef.current) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch {
        /* already running */
      }
      return;
    }

    const recognition = createSpeechRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      if (speakingRef.current || !enabledRef.current) return;
      networkFailsRef.current = 0;
      const { finalText, interimText } = collectTranscript(event);
      const live = finalText || interimText;
      if (live) setHeard(live);
      if (finalText) {
        commitHeard(finalText);
        return;
      }
      if (!interimText) return;
      if (endpointRef.current) window.clearTimeout(endpointRef.current);
      const mode = modeRef.current;
      const remainder = mode === 'wake' ? stripWakeWord(interimText) : '';
      const canCommit =
        mode === 'command' ||
        (mode === 'wake' && hasWakeWord(interimText) && (!remainder || matchLiminalityCommand(remainder)));
      if (!canCommit) return;
      const delay = mode === 'command' ? 380 : remainder ? 480 : 780;
      endpointRef.current = window.setTimeout(() => {
        commitHeard(interimText);
      }, delay);
    };

    recognition.onerror = (event) => {
      const error = String(event?.error || '');
      if (error === 'aborted' || error === 'no-speech') return;
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        enabledRef.current = false;
        modeRef.current = 'off';
        destroyRecognition();
        setPhase('off');
        setStatusLabel('Microphone blocked');
        return;
      }
      if (error === 'network') {
        networkFailsRef.current += 1;
        if (networkFailsRef.current >= 3) {
          setStatusLabel('Speech service busy — toggle the mic');
        }
      }
    };

    recognition.onend = () => {
      if (!enabledRef.current || speakingRef.current || modeRef.current === 'off') return;
      const delay = networkFailsRef.current > 0 ? Math.min(2000 * networkFailsRef.current, 6000) : 80;
      window.setTimeout(() => {
        if (!enabledRef.current || speakingRef.current || modeRef.current === 'off') return;
        try {
          recognition.start();
        } catch {
          /* ignore */
        }
      }, delay);
    };

    try {
      recognition.start();
    } catch {
      /* ignore */
    }
  }, [commitHeard, destroyRecognition]);

  const goWaiting = useCallback(() => {
    clearTimers();
    if (!enabledRef.current) {
      modeRef.current = 'off';
      setHeard('');
      setPhase('off');
      setStatusLabel('Microphone off');
      return;
    }
    modeRef.current = 'wake';
    lastHandledRef.current = '';
    setHeard('');
    setPhase('waiting');
    setStatusLabel('Waiting');
    startRecognition();
  }, [clearTimers, startRecognition]);

  const speakAndWait = useCallback(async (text: string) => {
    speakingRef.current = true;
    setPhase('speaking');
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    try {
      await speakText(text, { tone: registerRef.current });
    } finally {
      speakingRef.current = false;
    }
  }, []);

  useEffect(() => {
    handleCommandRef.current = (raw: string) => {
      const spoken = String(raw || '').trim();
      if (!spoken || !enabledRef.current) return;
      void (async () => {
        clearTimers();
        modeRef.current = 'off';
        setHeard(spoken);
        setPhase('processing');
        setStatusLabel('Processing');
        const command = matchLiminalityCommand(stripWakeWord(spoken) || spoken);
        if (!command) {
          setStatusLabel('Looking it up');
          try {
            const result = await askLiminalityAssistant(assistantHistoryRef.current, spoken);
            assistantHistoryRef.current = [
              ...assistantHistoryRef.current,
              { role: 'user', content: spoken },
              { role: 'assistant', content: result.reply },
            ].slice(-8);
            if (result.path) {
              setPhase('executing');
              setStatusLabel('Opening page');
              onNavigateRef.current(result.path);
            }
            if (result.reply) {
              await speakAndWait(result.reply);
            } else {
              await speakAndWait(spokenUnknownResponse(registerRef.current));
            }
          } catch (error) {
            const data = (error as { response?: { data?: { error?: string } } })?.response?.data;
            const message = spokenAssistantReply(data?.error || '') || spokenUnknownResponse(registerRef.current);
            await speakAndWait(message);
          }
          goWaiting();
          return;
        }
        setPhase('executing');
        setStatusLabel(`Opening ${command.label}`);
        onNavigateRef.current(command.route);
        await speakAndWait(spokenCommandResponse(command, registerRef.current));
        resetRef.current = window.setTimeout(() => {
          goWaiting();
        }, RESET_TO_WAITING_MS);
      })();
    };

    handleWakeRef.current = (raw: string) => {
      if (!hasWakeWord(raw) || !enabledRef.current) return;
      const remainder = stripWakeWord(raw);
      void (async () => {
        clearTimers();
        modeRef.current = 'off';
        setHeard(raw);
        setPhase('listening');
        setStatusLabel('Listening');
        registerRef.current = registerForWake(raw);
        if (remainder) {
          handleCommandRef.current(remainder);
          return;
        }
        await speakAndWait(wakeResponseFor(raw));
        if (!enabledRef.current) {
          goWaiting();
          return;
        }
        modeRef.current = 'command';
        setPhase('listening');
        setStatusLabel('Listening');
        setHeard('How can I help you?');
        startRecognition();
        timeoutRef.current = window.setTimeout(() => {
          goWaiting();
        }, COMMAND_TIMEOUT_MS);
      })();
    };
  }, [clearTimers, goWaiting, speakAndWait, startRecognition]);

  useEffect(() => {
    if (!supported) {
      setPhase('off');
      setStatusLabel('Voice not available in this browser');
      return undefined;
    }
    if (!enabled) {
      enabledRef.current = false;
      speakingRef.current = false;
      registerRef.current = 'polite';
      modeRef.current = 'off';
      networkFailsRef.current = 0;
      assistantHistoryRef.current = [];
      clearTimers();
      cancelSpeech();
      destroyRecognition();
      setHeard('');
      setPhase('off');
      setStatusLabel('Microphone off');
      return undefined;
    }
    enabledRef.current = true;
    networkFailsRef.current = 0;
    prefetchLiminalitySpeech();
    goWaiting();
    return () => {
      enabledRef.current = false;
      speakingRef.current = false;
      modeRef.current = 'off';
      clearTimers();
      cancelSpeech();
      destroyRecognition();
    };
    // Intentionally only bind to enabled/supported so a command session is not torn down mid-speech.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, supported]);

  return {
    supported,
    phase,
    statusLabel,
    heard,
  };
}
