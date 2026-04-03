import { NextResponse } from 'next/server';
import { Groq } from 'groq-sdk';

export async function POST(req) {
  try {
    const body = await req.json();
    const { description } = body;
    
    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    
    // Robust fallback if no API key is set for demo/presentation purposes
    if (!apiKey) {
      console.warn('No GROQ_API_KEY found, using local fallback simulation.');
      let priority = 'LOW';
      const d = description.toLowerCase();
      if (d.includes('injured') || d.includes('blood') || d.includes('trapped')) priority = 'HIGH';
      else if (d.includes('food') || d.includes('water') || d.includes('oxygen') || d.includes('shelter')) priority = 'MEDIUM';
      
      return NextResponse.json({ priority, model: 'Local Static Engine (No API Key)' });
    }

    const groq = new Groq({ apiKey });

    // AI Configuration specifically for structured single-token output
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an emergency triage priority classifier for a disaster response app. You must respond with EXACTLY ONE WORD: 'HIGH', 'MEDIUM', or 'LOW'. \nHIGH: Life-threatening injuries, trapped people, immediate danger to life, urgent medical needs.\nMEDIUM: Food shortages, water shortages, minor injuries, shelter needed.\nLOW: Requests for information, blankets, non-urgent supplies, general assistance.\nONLY reply with the single word, nothing else."
        },
        {
          role: "user",
          content: `Classify the priority of this emergency request: "${description}"`
        }
      ],
      model: "llama-3.3-70b-versatile", // Using an extremely fast Groq model for realtime latency
      temperature: 0.1, // Low temp for deterministic classification
      max_tokens: 5,
    });

    const responseText = completion.choices[0]?.message?.content?.trim().toUpperCase() || 'LOW';
    let priority = 'LOW';
    
    // Sanitize response to ensure UI stability
    if (responseText.includes('HIGH')) priority = 'HIGH';
    else if (responseText.includes('MEDIUM')) priority = 'MEDIUM';

    return NextResponse.json({ 
      priority, 
      model: 'Groq LLaMA-3 (Realtime)' 
    });

  } catch (error) {
    console.error('Groq Priority Classification Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
