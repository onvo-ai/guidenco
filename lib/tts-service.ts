import { randomUUID } from 'crypto';
import { uploadFile, getSignedUrl } from '@/lib/storage';

export interface TTSResult {
  signedUrl: string;
  key: string;
  durationEstimate?: number;
}

/**
 * Convert text to speech using ElevenLabs API.
 * Returns a signed S3 URL pointing to the uploaded MP3.
 */
export async function textToSpeechElevenLabs(
  text: string,
  options: {
    voiceId?: string;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
  } = {}
): Promise<TTSResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured.');

  const voiceId = options.voiceId || 'JBFqnCBsd6RMkjVDRZzb'; // ElevenLabs default "George" voice
  const modelId = options.modelId || 'eleven_multilingual_v2';

  const body = {
    text,
    model_id: modelId,
    voice_settings: {
      stability: options.stability ?? 0.5,
      similarity_boost: options.similarityBoost ?? 0.75,
    },
  };

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${errText}`);
  }

  const audioBuffer = Buffer.from(await res.arrayBuffer());
  const key = `tts/${randomUUID()}.mp3`;
  await uploadFile(key, audioBuffer, 'audio/mpeg');

  const signedUrl = await getSignedUrl(key, 3600 * 24); // 24h signed URL
  return { signedUrl, key };
}
