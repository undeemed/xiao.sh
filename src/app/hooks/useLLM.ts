import { useState, useEffect, useRef } from 'react';
import { CreateMLCEngine, MLCEngine, InitProgressCallback } from "@mlc-ai/web-llm";

// Using Llama 3.2 3B Instruct - a good balance of speed and capability for local browser use
export const SELECTED_MODEL = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

export interface LLMState {
  isLoading: boolean;
  isModelLoaded: boolean;
  progress: string;
  error: string | null;
}

export const useLLM = () => {
  const [state, setState] = useState<LLMState>({
    isLoading: false,
    isModelLoaded: false,
    progress: '',
    error: null,
  });

  const engine = useRef<MLCEngine | null>(null);

  const initProgressCallback: InitProgressCallback = (initProgress) => {
    setState(prev => ({
      ...prev,
      progress: initProgress.text,
    }));
  };

  const loadModel = async () => {
    if (engine.current) return; // Already loaded or loading

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      engine.current = await CreateMLCEngine(
        SELECTED_MODEL,
        { initProgressCallback: initProgressCallback }
      );
      setState(prev => ({ ...prev, isLoading: false, isModelLoaded: true }));
    } catch (err: any) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: `Failed to load model: ${err.message || err}` 
      }));
    }
  };

  const chat = async (message: string, systemPrompt: string) => {
    if (!engine.current) {
        await loadModel();
    }
    
    if (!engine.current) {
        throw new Error("Engine failed to initialize");
    }

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    const reply = await engine.current.chat.completions.create({
      messages: messages as any,
    });

    return reply.choices[0].message.content;
  };

  return {
    ...state,
    loadModel,
    chat,
  };
};
