import { useState, useRef } from 'react';
import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

// Local model for offline fallback
export const SELECTED_MODEL = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

export interface LLMState {
  isLoading: boolean;
  isModelLoaded: boolean;
  progress: string;
  error: string | null;
  mode: 'cloud' | 'local' | 'idle';
  currentModel: string;
}

export const useLLM = () => {
  const [state, setState] = useState<LLMState>({
    isLoading: false,
    isModelLoaded: false,
    progress: '',
    error: null,
    mode: 'idle',
    currentModel: '',
  });

  const engine = useRef<MLCEngine | null>(null);
  const localModelLoading = useRef<boolean>(false);

  const initProgressCallback: InitProgressCallback = (initProgress) => {
    setState(prev => ({
      ...prev,
      progress: initProgress.text,
    }));
  };

  const loadModel = async () => {
    if (engine.current || localModelLoading.current) return; // Already loaded or loading

    localModelLoading.current = true;
    setState(prev => ({ ...prev, isLoading: true, error: null, mode: 'local' }));

    try {
      engine.current = await CreateMLCEngine(
        SELECTED_MODEL,
        { initProgressCallback: initProgressCallback }
      );
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        isModelLoaded: true,
        currentModel: SELECTED_MODEL,
      }));
    } catch (err: any) {
      localModelLoading.current = false;
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: `Failed to load model: ${err.message || err}` 
      }));
    }
  };

  const chatLocal = async (message: string, systemPrompt: string): Promise<string> => {
    if (!engine.current) {
      await loadModel();
    }
    
    if (!engine.current) {
      throw new Error("Local engine failed to initialize");
    }

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    const reply = await engine.current.chat.completions.create({
      messages: messages as any,
    });

    return reply.choices[0].message.content || '';
  };

  const chatCloud = async (message: string, systemPrompt: string): Promise<{ content: string; model: string }> => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemPrompt,
        userMessage: message,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.fallback) {
      throw new Error(data.error || 'Cloud API failed');
    }

    return { content: data.content, model: data.model };
  };

  const chat = async (message: string, systemPrompt: string): Promise<string> => {
    // Try cloud first
    try {
      setState(prev => ({ ...prev, mode: 'cloud' }));
      const result = await chatCloud(message, systemPrompt);
      setState(prev => ({ 
        ...prev, 
        currentModel: result.model,
        mode: 'cloud',
      }));
      return result.content;
    } catch (cloudError: any) {
      console.log('[LLM] Cloud failed, falling back to local:', cloudError.message);
      
      // Fall back to local
      try {
        setState(prev => ({ ...prev, mode: 'local', progress: 'Cloud unavailable, using local model...' }));
        const localResult = await chatLocal(message, systemPrompt);
        setState(prev => ({ 
          ...prev, 
          currentModel: SELECTED_MODEL,
          mode: 'local',
        }));
        return localResult;
      } catch (localError: any) {
        throw new Error(`Both cloud and local failed. Cloud: ${cloudError.message}. Local: ${localError.message}`);
      }
    }
  };

  return {
    ...state,
    loadModel,
    chat,
  };
};
