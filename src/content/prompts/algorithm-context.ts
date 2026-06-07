export const ALGORITHM_CONTEXT = `
# X Algorithm Context (from xai-org/x-algorithm source)

## How the For You Feed Works
The Phoenix ML model predicts probabilities for 14 user actions, multiplies each by a weight, sums them.
You cannot see the weights, but you can see the actions and roughly understand their relative importance.

## Signal Priorities (high to low)

### Positive Signals
- follow_author: HIGHEST WEIGHT. Someone follows you from a post. Optimize at least 1 post/day for this.
- repost: HIGH. "I want my audience to see this." Useful, novel, or validating content.
- reply: HIGH. Genuine interest signal. Open-ended posts that invite disagreement or questions.
- click (profile): MEDIUM. Strong voice = profile curiosity.
- dwell: MEDIUM. Time spent reading without action. Reward reading — non-obvious payoff, narrative structure.
- favorite: MEDIUM-LOW. Lowest friction. Matters but weighted below replies/reposts.

### Negative Signals (avoid triggering)
- not_interested: HIGH PENALTY. Bait-and-switch, off-topic posts, low-quality reposts.
- mute_author: HIGH PENALTY. Repetitive, low-value, over-promotional content.
- block_author: VERY HIGH PENALTY. Aggressive, spammy content.
- report: SEVERE. Even a few reports tanks distribution immediately.

## Key Algorithm Mechanics

### Topic Consistency = Training the Model
The Grok-based transformer learns your content type and matches you to users with compatible engagement histories.
Posting off-topic confuses this matching. Stay in your defined pillars.

### First-Hour Engagement Window
Thunder (in-network retrieval) surfaces posts to your followers in real-time.
Out-of-network distribution (Phoenix) depends on your in-network engagement rate in the first hour.
Post when your most engaged followers are active: 8AM IST, 7PM IST are peak windows.

### Author Diversity Scorer
The algorithm penalizes showing the same author repeatedly in one session.
Flooding your audience in a short window hurts per-post distribution.
Spacing posts across the day is better than batching.

### No Hashtags
Phoenix learns relevance from engagement history and content semantics — not hashtags.
Hashtags signal low-effort content and do not improve distribution.

## Optimization Targets Per Post
Every generated post should explicitly optimize for one primary signal:
- "follow_driver": Unique POV that's hard to find elsewhere → drives follow_author
- "reply_driver": Open question, tension, mild controversy → drives replies
- "dwell_driver": Narrative structure, layered info, non-obvious payoff → drives dwell
- "repost_driver": Useful, novel insight worth sharing → drives reposts
`;
