import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { VOICE_GUIDE } from './prompts/voice-guide';
import { ALGORITHM_CONTEXT } from './prompts/algorithm-context';

export type Pillar = 'build_story' | 'system_design' | 'propertygauss';

export interface Draft {
  type: 'thread' | 'single';
  signal: 'follow_driver' | 'reply_driver' | 'dwell_driver' | 'repost_driver';
  pillar: Pillar;
  content: string;
}

export interface DraftBatch {
  topic: string;
  pillar: Pillar;
  drafts: Draft[];
}

const PILLAR_ROTATION: Pillar[] = ['build_story', 'system_design', 'propertygauss'];
let pillarIndex = 0;

const PILLAR_TOPIC_SEEDS: Record<Pillar, string[]> = {
  build_story: [
    'a debugging session that took way longer than it should have',
    'a tool I reached for that turned out to be wrong for the job',
    'a script I wrote to solve a personal problem',
    'something I tried to automate that fought back',
    'a production incident or close call',
  ],
  system_design: [
    'database indexing decisions most engineers get wrong',
    'when microservices make things worse not better',
    'caching strategies that seem smart but create subtle bugs',
    'API design mistakes that come back to haunt you',
    'the system design interview question that reveals real experience',
    'rate limiting — what everyone misses about it',
    'event-driven architecture tradeoffs nobody talks about',
  ],
  propertygauss: [
    'a technical decision I made this week building PropertyGauss and the tradeoff I accepted',
    'a data problem specific to Indian real estate that surprised me',
    'why I chose [X] architecture for PropertyGauss',
    'the hardest thing about building a data product in a market with messy data',
    'what I would do differently if I started PropertyGauss today',
  ],
};

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);
  private readonly model: GenerativeModel;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('gemini.apiKey');
    const modelName = this.configService.get<string>('gemini.model');

    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY is not set — content generation will fail');
    }

    this.logger.log(`Gemini init | model: ${modelName} | key: ${apiKey ? 'SET' : 'MISSING'}`);

    const genAI = new GoogleGenerativeAI(apiKey ?? '');
    this.model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: `${VOICE_GUIDE}\n\n${ALGORITHM_CONTEXT}`,
      generationConfig: {
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });
  }

  async generateDrafts(inputTopic?: string, inputPillar?: Pillar): Promise<DraftBatch> {
    const pillar = inputPillar ?? PILLAR_ROTATION[pillarIndex % PILLAR_ROTATION.length];
    if (!inputPillar) pillarIndex++;

    const seeds = PILLAR_TOPIC_SEEDS[pillar];
    const topic = inputTopic ?? seeds[Math.floor(Math.random() * seeds.length)];

    this.logger.log(`Generating drafts | pillar=${pillar} | topic="${topic}"`);

    const userPrompt = `Generate exactly 3 X (Twitter) post drafts for Arpit Rai.

Topic: ${topic}
Pillar: ${pillar}

Requirements:
- Draft 1: Thread format (3-5 tweets). Optimize for DWELL (narrative, layered info, reward for reading).
- Draft 2: Single post. HARD LIMIT: 250 characters maximum (no exceptions). 
  Optimize for REPLIES: end with a question that has a non-obvious answer, 
  specific enough that only someone with real experience would know.
- Draft 3: Single post. HARD LIMIT: 250 characters maximum (no exceptions).
  Optimize for FOLLOWS: one sharp insight that's hard to find elsewhere.
  The insight should fit in one sentence. Everything else is setup.

Strict rules:
- No hashtags
- No "Agree or disagree?"
- No LinkedIn tone
- Short sentences. One thought per line.
- Problem-first or situation-first framing
- Each draft must sound like the same person wrote it — Arpit's voice from the style guide
- You are a solo founder building PropertyGauss alone. Always use "I", never "we" or "us"
- Never start a sentence with "Lesson:" — state the insight directly
- Single posts MUST be under 260 characters (buffer for the 280 limit). Count carefully.

Return ONLY valid JSON in this exact shape:
{
  "topic": "...",
  "pillar": "...",
  "drafts": [
    {
      "type": "thread",
      "signal": "dwell_driver",
      "pillar": "${pillar}",
      "content": "Tweet 1 text\\n---\\nTweet 2 text\\n---\\nTweet 3 text"
    },
    {
      "type": "single",
      "signal": "reply_driver",
      "pillar": "${pillar}",
      "content": "Full post text under 280 chars"
    },
    {
      "type": "single",
      "signal": "follow_driver",
      "pillar": "${pillar}",
      "content": "Full post text under 280 chars"
    }
  ]
}`;

    let rawText: string;

    try {
      const result = await this.model.generateContent(userPrompt);
      rawText = result.response.text().trim();
      this.logger.debug(`Gemini raw response (${rawText.length} chars): ${rawText.slice(0, 200)}...`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Gemini API call failed: ${msg}`, err instanceof Error ? err.stack : undefined);
      throw new Error(`Gemini API error: ${msg}`);
    }

    // Strip markdown code fences — some model versions ignore responseMimeType
    const jsonText = rawText.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();

    let batch: DraftBatch;
    try {
      batch = JSON.parse(jsonText);
    } catch (err) {
      this.logger.error(`JSON parse failed. Raw response was:\n${rawText}`);
      throw new Error(`Invalid JSON from Gemini. Raw: ${rawText.slice(0, 300)}`);
    }

    // Warn on singles that exceed X's 280-char limit
    batch.drafts
      .filter((d) => d.type === 'single')
      .forEach((d, i) => {
        if (d.content.length > 280) {
          this.logger.warn(`Single draft ${i + 1} is ${d.content.length} chars (over 280)`);
        }
      });

    this.logger.log(`Drafts ready | pillar=${batch.pillar} | topic="${batch.topic}" | drafts=${batch.drafts?.length}`);
    return batch;
  }
}
