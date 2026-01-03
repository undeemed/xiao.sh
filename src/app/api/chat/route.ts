import { NextResponse } from 'next/server';

// Free OpenRouter models - rotates through these when one fails/rate limits
const FREE_MODELS = [
  'xiaomi/mimo-v2-flash:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'allenai/olmo-3.1-32b-think:free',
  'mistralai/devstral-2512:free',
  'nex-agi/deepseek-v3.1-nex-n1:free',
  'arcee-ai/trinity-mini:free',
  'tngtech/tng-r1t-chimera:free',
  'allenai/olmo-3-32b-think:free',
  'kwaipilot/kat-coder-pro:free',
  'alibaba/tongyi-deepresearch-30b-a3b:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'openai/gpt-oss-120b:free',
  'z-ai/glm-4.5-air:free',
];

// Track which model to try next (simple rotation)
let currentModelIndex = 0;

async function tryModel(model: string, messages: any[], apiKey: string): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://xiao.sh',
        'X-Title': 'xiao.sh Terminal',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `${response.status}: ${errorText}` };
    }

    const data = await response.json();
    
    if (data.error) {
      return { success: false, error: data.error.message || data.error };
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { success: false, error: 'No content in response' };
    }

    return { success: true, content };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error' };
  }
}

export async function POST(request: Request) {
  try {
    const { messages, systemPrompt, userMessage } = await request.json();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY not configured', fallback: true },
        { status: 500 }
      );
    }

    // Build messages array
    const chatMessages = messages || [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    // Try models in rotation, starting from current index
    const maxAttempts = FREE_MODELS.length;
    let lastError = '';

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const modelIndex = (currentModelIndex + attempt) % FREE_MODELS.length;
      const model = FREE_MODELS[modelIndex];

      console.log(`[OpenRouter] Trying model: ${model}`);
      const result = await tryModel(model, chatMessages, apiKey);

      if (result.success) {
        // Success! Update the index so next request starts here
        currentModelIndex = modelIndex;
        return NextResponse.json({ 
          content: result.content,
          model,
        });
      }

      console.log(`[OpenRouter] Model ${model} failed: ${result.error}`);
      lastError = result.error || 'Unknown error';

      // If rate limited or model down, try next model
      // Move to next model for future requests
      currentModelIndex = (modelIndex + 1) % FREE_MODELS.length;
    }

    // All models failed
    return NextResponse.json(
      { error: `All models failed. Last error: ${lastError}`, fallback: true },
      { status: 503 }
    );

  } catch (error: any) {
    console.error('[OpenRouter] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal error', fallback: true },
      { status: 500 }
    );
  }
}
