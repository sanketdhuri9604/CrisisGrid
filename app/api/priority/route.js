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
    
    // Robust fallback if no API key is set
    if (!apiKey) {
      console.warn('No GROQ_API_KEY found, using local fallback simulation.');
      let severity = 'low';
      let domain = 'other';
      const d = description.toLowerCase();
      if (d.includes('injured') || d.includes('blood') || d.includes('trapped')) { severity = 'critical'; domain = 'medical'; }
      else if (d.includes('fire') || d.includes('burn')) { severity = 'high'; domain = 'fire'; }
      else if (d.includes('food') || d.includes('water')) { severity = 'medium'; domain = 'disaster'; }
      
      return NextResponse.json({ 
        analysis: {
          summary: "Local fallback analysis",
          domain: domain,
          severity: severity,
          signals: { symptoms: [], danger_indicators: [], people_involved: 1, urgency_keywords: [] },
          suggested_specializations: ["General Support"]
        },
        priority: severity === 'critical' || severity === 'high' ? 'HIGH' : severity === 'medium' ? 'MEDIUM' : 'LOW', 
        model: 'Local Static Engine' 
      });
    }

    const groq = new Groq({ apiKey });

    const systemPrompt = `You are an emergency triage AI for a disaster response platform. 
Analyze the emergency description and return a JSON object exactly matching this schema without any markdown formatting or extra text:
{
  "summary": "Brief 1 sentence description of the incident",
  "domain": "medical" | "fire" | "crime" | "disaster" | "other",
  "severity": "low" | "medium" | "high" | "critical",
  "signals": {
    "symptoms": ["list", "of", "symptoms"],
    "danger_indicators": ["list", "of", "dangers"],
    "people_involved": 0,
    "urgency_keywords": ["urgency", "keywords", "used"]
  },
  "suggested_specializations": ["Medical", "Food", "Rescue", "Shelter", "Medicine", "Elder Support", "Child Support", "Pharmacy Needed", "Blood Required", "General Support"]
}
NOTE FOR suggested_specializations: Select 1 to 3 relevant specializations ONLY from the exact list provided above.`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Classify this emergency: "${description}"` }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '{}';
    let analysis;
    try {
      analysis = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse JSON", responseText);
      analysis = {
        summary: "Parse error fallback",
        domain: "other",
        severity: "medium",
        signals: {},
        suggested_specializations: ["General Support"]
      };
    }

    // Map severity back to priority for backward compatibility with UI colors
    let priority = 'LOW';
    if (analysis.severity === 'critical' || analysis.severity === 'high') priority = 'HIGH';
    else if (analysis.severity === 'medium') priority = 'MEDIUM';

    return NextResponse.json({ 
      analysis,
      priority, 
      model: 'Groq LLaMA-3 (Realtime JSON)' 
    });

  } catch (error) {
    console.error('Groq Priority Classification Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
