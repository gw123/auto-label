import { GoogleGenAI } from "@google/genai";
import { BBox, LabelClass, AIModel, ModelProvider, LoadedImage } from "../types";

type LogFn = (msg: string, type?: 'info' | 'success' | 'error' | 'warning') => void;

// --- Helper: Image/Blob to Base64 ---
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      // Remove data URL prefix if present (e.g. "data:image/jpeg;base64,")
      const base64 = res.split(',')[1]; 
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- GOOGLE HANDLER ---
const handleGoogleRequest = async (model: AIModel, prompt: string, base64Image: string, apiKey?: string, log?: LogFn): Promise<string> => {
  const key = model.apiKey || apiKey || process.env.API_KEY;
  if (!key) throw new Error("Missing API Key for Google Model");

  log?.(`Initializing Google GenAI client with model: ${model.modelId}`, 'info');
  const ai = new GoogleGenAI({ apiKey: key });
  
  log?.(`Sending request to Google API...`, 'info');
  const startTime = Date.now();

  const response = await ai.models.generateContent({
    model: model.modelId,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      temperature: model.config?.temperature,
      topP: model.config?.topP,
    }
  });

  const duration = Date.now() - startTime;
  log?.(`Response received in ${duration}ms`, 'success');
  
  return response.text || "[]";
};

// --- OPENAI / COMPATIBLE HANDLER (Ollama, Qwen, etc) ---
const handleOpenAIRequest = async (model: AIModel, prompt: string, base64Image: string, log?: LogFn): Promise<string> => {
  const apiKey = model.apiKey || '';
  // Default endpoints
  let endpoint = model.endpoint;
  if (!endpoint) {
    if (model.provider === ModelProvider.OLLAMA) endpoint = 'http://localhost:11434/v1/chat/completions';
    else endpoint = 'https://api.openai.com/v1/chat/completions';
  } else {
    // Ensure endpoint ends with /v1/chat/completions if user just put base url
    if (!endpoint.includes('/chat/completions')) {
        endpoint = endpoint.replace(/\/$/, '') + '/v1/chat/completions';
    }
  }

  log?.(`Endpoint resolved: ${endpoint}`, 'info');

  const payload = {
    model: model.modelId,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ],
    temperature: model.config?.temperature ?? 0.1,
    response_format: { type: "json_object" } 
  };

  const headers: any = {
    "Content-Type": "application/json"
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  log?.(`Sending POST request to provider...`, 'info');
  const startTime = Date.now();

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Provider Error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const duration = Date.now() - startTime;
  log?.(`Response received in ${duration}ms`, 'success');

  return data.choices?.[0]?.message?.content || "[]";
};


// --- UNIFIED API ---

/**
 * Test connection to a model
 */
export const testModelConnection = async (model: AIModel): Promise<boolean> => {
    try {
        // Simple text-only prompt for testing connectivity
        if (model.provider === ModelProvider.GOOGLE) {
            const key = model.apiKey || process.env.API_KEY;
            if (!key) return false;
            const ai = new GoogleGenAI({ apiKey: key });
            await ai.models.generateContent({ model: model.modelId, contents: "Hello" });
            return true;
        } else {
            // OpenAI/Ollama/Custom Text Test
            let endpoint = model.endpoint;
            if (!endpoint) {
                if (model.provider === ModelProvider.OLLAMA) endpoint = 'http://localhost:11434/v1/chat/completions';
                else endpoint = 'https://api.openai.com/v1/chat/completions';
            } else {
                 if (!endpoint.includes('/chat/completions')) {
                    endpoint = endpoint.replace(/\/$/, '') + '/v1/chat/completions';
                }
            }

            const res = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${model.apiKey || ''}`
                },
                body: JSON.stringify({
                    model: model.modelId,
                    messages: [{ role: "user", content: "Test" }],
                    max_tokens: 5
                })
            });
            return res.ok;
        }
    } catch (e) {
        console.error("Connection Test Failed", e);
        return false;
    }
};

export const autoLabelImage = async (
  image: LoadedImage,
  activeLabels: LabelClass[],
  model: AIModel,
  sysApiKey?: string, // Fallback for default google models using env
  onLog?: LogFn
): Promise<BBox[]> => {
  try {
    onLog?.(`Starting analysis for image: ${image.name}`, 'info');
    
    onLog?.(`Encoding image Blob to Base64...`, 'info');
    const base64Data = await blobToBase64(image.blob);
    onLog?.(`Image encoded. Size: ${Math.round(base64Data.length / 1024)}KB`, 'info');

    const labelsList = activeLabels.map(l => l.name).join(', ');
    onLog?.(`Target classes: [${labelsList}]`, 'info');

    // Unified Prompt
    const prompt = `
      Analyze this image and detect the following objects: ${labelsList}.
      Return a strict JSON object with a key "items" containing an array of detected objects.
      Example output: { "items": [ { "label": "cat", "box_2d": [0.1, 0.2, 0.3, 0.4] } ] }
      
      For each object:
      - "label": exact name from the list.
      - "box_2d": [ymin, xmin, ymax, xmax] normalized 0-1.
    `;

    let jsonString = "[]";

    if (model.provider === ModelProvider.GOOGLE) {
        const res = await handleGoogleRequest(model, prompt, base64Data, sysApiKey, onLog);
        jsonString = res;
    } else {
        const res = await handleOpenAIRequest(model, prompt, base64Data, onLog);
        jsonString = res;
    }

    onLog?.(`Raw response length: ${jsonString.length} chars`, 'info');
    if (jsonString.length > 100) {
        onLog?.(`Snippet: ${jsonString.substring(0, 100)}...`, 'info');
    } else {
        onLog?.(`Content: ${jsonString}`, 'info');
    }

    // Clean potential markdown ```json ... ```
    jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let parsed: any;
    try {
        parsed = JSON.parse(jsonString);
    } catch (e) {
        onLog?.("Failed to parse JSON structure.", 'error');
        console.error("Failed to parse JSON from model", jsonString);
        return [];
    }

    // Normalize result format (handle root array vs { items: [] })
    const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
    onLog?.(`Parsed ${items.length} raw items from response`, 'info');
    
    const bboxes = parseGeminiResponse(items, activeLabels);
    onLog?.(`Successfully converted to ${bboxes.length} valid bounding boxes matching schema.`, 'success');
    
    return bboxes;

  } catch (error: any) {
    onLog?.(`Critical Error: ${error.message}`, 'error');
    console.error("Auto-label error:", error);
    throw error;
  }
};

export const analyzeImageForSpecificLabel = async (
    image: LoadedImage,
    targetLabel: LabelClass,
    model: AIModel,
    sysApiKey?: string,
    onLog?: LogFn
  ): Promise<BBox[]> => {
    // Re-use autoLabel but restricted
    return autoLabelImage(image, [targetLabel], model, sysApiKey, onLog);
};

// Helper to map raw JSON to BBox
const parseGeminiResponse = (results: any, validLabels: LabelClass[]): BBox[] => {
  const newAnnotations: BBox[] = [];

  if (Array.isArray(results)) {
    results.forEach((res: any) => {
      const labelObj = validLabels.find(l => l.name.toLowerCase() === res.label?.toLowerCase());
      
      if (labelObj && res.box_2d && res.box_2d.length === 4) {
        const [ymin, xmin, ymax, xmax] = res.box_2d;
        
        const w = xmax - xmin;
        const h = ymax - ymin;
        const cx = xmin + w / 2;
        const cy = ymin + h / 2;

        if (w > 0 && h > 0 && w <= 1 && h <= 1) {
           newAnnotations.push({
            id: crypto.randomUUID(),
            labelId: labelObj.id,
            x: cx,
            y: cy,
            w: w,
            h: h
          });
        }
      }
    });
  }
  return newAnnotations;
};