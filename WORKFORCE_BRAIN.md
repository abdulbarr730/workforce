# Workforce Brain

This project now has a reusable Workforce Brain layer. It is not just one Claude prompt. It is a memory system plus a Claude-powered trainer plus normal backend APIs that other modules can reuse.

## What the brain stores

The brain stores three levels of memory:

1. Company brain
   - What the company generally does.
   - Common work categories.
   - Common apps/domains.
   - General EOD/check-in style.

2. Department brain
   - What each department usually works on.
   - Department-specific task vocabulary.
   - Department fallback knowledge for new employees.

3. Employee brain
   - Each employee's own usual tasks.
   - Their usual Todo/EOD/check-in wording.
   - Their common apps/domains.
   - Their assigned-task patterns.

When suggestions are generated, the priority order is:

`employee memory > department memory > company memory > live evidence only`

That is what makes every employee's engine different.

## Data used for training

The trainer reads:

- EOD reports
- 2-hour check-ins
- Todo items
- assigned tasks
- active-window telemetry
- employee department mapping
- department descriptions

It first creates a local statistical memory. This part is free and works even when Claude is not configured.

Then, if `ANTHROPIC_API_KEY` exists, Claude compresses that raw memory into a clean reusable operating memory.

## Required environment variables

Backend:

```env
ANTHROPIC_API_KEY=your_anthropic_key
CLAUDE_MODEL=claude-sonnet-4-5
```

`CLAUDE_MODEL` is optional. If missing, the backend defaults to `claude-sonnet-4-5`.

## API endpoints

Train/retrain the brain:

```http
POST /api/workforce-brain/train
Authorization: Bearer <admin token>
Content-Type: application/json

{
  "days": 60,
  "includeClaude": true
}
```

Train one employee:

```json
{
  "employeeId": "EMP_01_02",
  "days": 90,
  "includeClaude": true
}
```

Train one department:

```json
{
  "departmentId": "department_mongo_id",
  "days": 90,
  "includeClaude": true
}
```

Check training status:

```http
GET /api/workforce-brain/status
GET /api/workforce-brain/status?employeeId=EMP_01_02
```

Fetch reusable brain context:

```http
GET /api/workforce-brain/context?employeeId=EMP_01_02
```

Any other software can call this endpoint and use the returned `prompt` as context before asking Claude to make a decision.

## How EOD and 2-hour check-ins use it

The EOD/check-in suggestion engine now sends Claude:

- reusable Workforce Brain memory
- local employee statistical model
- Todo evidence
- assigned-task evidence
- check-in evidence
- telemetry interval summary

Claude is instructed:

- do not invent work
- employee memory beats department memory
- department memory beats company memory
- use lower confidence for new employees
- output reviewable draft rows only
- never submit automatically

## Prompt engineering rules used here

A good operational prompt has five pieces:

1. Role
   - “You are the EOD auto-fill decision brain...”

2. Evidence boundary
   - “Use only supplied operational evidence.”

3. Priority rule
   - “Employee memory > department memory > company memory.”

4. Output contract
   - “Return JSON only with these exact fields.”

5. Safety rule
   - “Do not submit automatically. Do not invent work.”

This same pattern can be reused in other software.

## How to reuse this brain in another software

Recommended flow:

1. Call this system:

```http
GET /api/workforce-brain/context?employeeId=EMP_ID
```

2. Take the returned `prompt`.

3. In your other software, send Claude:

```text
System:
You are an assistant for this company. Use the Workforce Brain memory below as operational context. Do not invent facts.

Workforce Brain:
<prompt from API>

User request:
<whatever the other software needs>
```

4. Ask Claude to return structured JSON if the other software needs automation.

## Challenges if you want this without Claude cost

You can keep the local statistical memory for free, but Claude-level reasoning always has a cost somewhere:

- API cost if using Claude.
- GPU/server cost if running local open-source models.
- Slower and weaker reasoning if using only CPU/local models.
- More maintenance if you self-host.

The best practical setup is:

- local statistical brain always on and free
- Claude as the high-quality reasoning layer
- strict JSON outputs
- cached memory so Claude is not called for every tiny operation

## When to retrain

Recommended:

- nightly for the whole company
- immediately after a major department/team change
- manually after importing many historical EODs
- manually for a new employee after their first few days

For now, training is manual through the API. A scheduler can be added later.
