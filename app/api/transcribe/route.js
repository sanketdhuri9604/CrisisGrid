import { NextResponse } from 'next/server';
import { Groq } from 'groq-sdk';

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn('No GROQ_API_KEY found, returning mock transcription.');
      return NextResponse.json({ 
        transcript: "Simulated transcription: Fire reported at the main gate, 3 people trapped.",
        model: 'Local Mock Generator'
      });
    }

    const groq = new Groq({ apiKey });

    // Node.js File object works with Groq SDK directly in environments that support standard fetch/FormData objects.
    const translation = await groq.audio.transcriptions.create({
      file: file,
      model: "whisper-large-v3",
      prompt: "Emergency dispatch, prioritize technical terms for medical, fire, disaster.",  // Optional context
      response_format: "json"
    });

    return NextResponse.json({ 
      transcript: translation.text,
      model: 'Groq Whisper V3'
    });

  } catch (error) {
    console.error('Groq Whisper Transcription Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
