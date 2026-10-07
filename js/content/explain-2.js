// Plain-language teaching layer, lessons 10–18. Same shape as explain-1.js.
export default {
  l10: {
    plain: "A prompt is the instruction sheet you hand the model. Writing it fresh each time with string glue is like hand-writing every letter: typos slip in and nobody can review it. A template is a form letter with blanks ({{message}}). You fill the blanks, and if one is left empty, it refuses to send. You also include a few worked examples (few-shot) so the model copies the exact format you want, and cheap keyword rules handle the obvious cases without calling the model at all.",
    build: [
      ["A template is fixed text with named blanks like `{{message}}`. `render()` fills the blanks and raises an error if any blank is still unfilled.",
        "A typo turns `{{mesage}}` into a blank nobody fills. The model receives the literal text “{{mesage}}”, gives a nonsense answer, and nothing errors, so nobody notices."],
      ["Few-shot means showing the model a handful of solved examples (“Message: I was charged twice → Category: billing”) right before the real question, always in the same layout.",
        "Asked cold, the model answers “This seems like a billing-related concern!” instead of the single word `billing`, and the code that expects one word breaks."],
      ["Simple keyword rules sort messages first: “refund” → billing, “500 error” → technical. Rules are checked in order and the first match wins. If nothing matches, the answer is `general`.",
        "Every message, even “URGENT: site down”, waits for a slow, paid model call to be sorted, and the urgent one sits in the same queue as “what are your hours?”."],
      ["Before sending a prompt, estimate its size: roughly 4 characters per token. If it’s far too big, refuse before paying.",
        "A user pastes a 300-page PDF into the chat. You find out it was 90,000 tokens when the invoice arrives, or when the provider rejects it."],
    ],
    examples: [
      "The template lives in Git and gets reviewed like code. The customer’s message is just data poured into `{{message}}` per request, so editing the instructions never touches user data.",
      "`render(examples=...)` without `message=...` raises “unresolved template variables: ['message']” in your test suite, long before a customer sees a broken answer.",
      "Four examples, one per category, teach the model both the answer format (one lowercase word) and the full set of allowed answers.",
      "“URGENT: api error” contains both “urgent” and “error”. Because urgent rules come first, it’s routed as urgent, which is exactly what you want for a production outage.",
      "A 2,000-character prompt is about 500 tokens. That’s rough, but enough to block a 400,000-character paste before it costs anything.",
    ],
  },

  l11: {
    plain: "When a person fills in a paper form, a clerk checks it: is the name filled in, is the date a real date, is the box ticked correctly? Model output needs the same clerk. The model is asked to answer in JSON, but it can still return the wrong shape, invented categories, or plain chatty text. A schema is the list of rules the answer must follow. If it fails, you get a clean “no” instead of corrupted data flowing into your systems.",
    build: [
      ["A contract (schema) spells out what a valid answer looks like: an `answer` that isn’t empty, a list of `entities` with a name and a type, a `confidence` between 0 and 1, and an optional `follow_up` question.",
        "Your CRM receives `{\"answr\": \"Paris\"}` (typo) and stores an empty record, or receives a list where it expected an object and crashes."],
      ["Entity types must be one of four allowed values: person, org, location, date. Anything else is rejected, even if the JSON itself is perfectly well-formed.",
        "The model labels something `\"type\": \"alien\"` and a downstream system that only understands four types breaks or silently misfiles it."],
      ["If confidence comes back as 5.0, it’s squeezed into range (1.0) instead of throwing the whole answer away. Small, safe fixes are applied; unsafe guesses are not.",
        "Every answer with a slightly off confidence value is rejected, and most useful answers are thrown away over a cosmetic problem."],
      ["The parser always returns a result object, `ok=True` with clean data or `ok=False` with a short error. It never throws an exception at the caller.",
        "One malformed model reply raises an exception that bubbles up and returns HTTP 500 to the user, instead of a graceful “let me try that again”."],
    ],
    examples: [
      "Before writing the prompt “return JSON with answer and entities”, you write down exactly which fields exist and what values are legal. The prompt and the validator then describe the same contract.",
      "`{\"answer\":\"Hi\",\"entities\":[{\"name\":\"Zork\",\"type\":\"alien\"}],\"confidence\":0.5}` passes `json.loads` (valid syntax) but fails the allowlist (invalid meaning).",
      "Confidence 5.0 → 1.0 loses nothing important. Type “alien” → “org” would invent information, so it’s rejected instead.",
      "“Sure! Paris.” fails at decoding (“invalid JSON”). `{\"answer\": \"\"}` decodes fine but fails validation (“answer must be non-empty”). Logging them separately tells you whether the model ignored the format or got the content wrong.",
      "In the real project, `StructuredResponse.model_validate_json(raw)` does all of this in one line. Building it by hand once shows you exactly what that line protects you from.",
    ],
  },

  l12: {
    plain: "A washing machine can’t jump from “fill” to “done” without washing and rinsing first. Its controller only allows certain next steps from each step. An agent should work the same way: it is always in one named state (idle, validating, processing, calling a tool, responding, done, error), and a table lists which moves are allowed. Illegal shortcuts are refused and counted, and every move is written to a log.",
    build: [
      ["A table lists, for each state, the states you may move to next. Example: from `RESPONDING` you may go to `DONE` or `ERROR`, and nothing else.",
        "The agent’s progress is tracked with scattered flags like `is_validating = True`. A bug sets the wrong flag and the agent skips validation without anyone noticing."],
      ["`transition()` checks the table. An illegal move raises an error and changes nothing: no state change, no log entry, only a “blocked” count.",
        "A half-applied move leaves the agent marked as `DONE` while its log says it was still `PROCESSING`, and debugging is impossible."],
      ["Every allowed move adds `{from, to, reason}` to a history list, so you can replay exactly what the agent did.",
        "A customer says “the bot charged me without confirming”. With no history, you can’t prove or disprove what happened."],
      ["Three counters: how many times the agent entered `ERROR`, how many times it recovered back to `IDLE`, and how many illegal moves were blocked.",
        "Agents get stuck in error and never recover, or code keeps trying illegal shortcuts, and nothing on the dashboard shows it."],
    ],
    examples: [
      "Adding a “human approval” step means adding one entry to `TRANSITIONS` (e.g. RESPONDING → AWAITING_APPROVAL), reviewed in one place, instead of new flags sprinkled across files.",
      "Calling `transition(DONE)` from `IDLE` raises “Invalid: IDLE -> DONE”. The state is still `IDLE` afterwards, and `invalid_blocked` is now 1.",
      "The history for one ticket reads IDLE→VALIDATING→PROCESSING→TOOL_CALL→PROCESSING→RESPONDING→DONE, with a reason on each step. That’s a complete answer to “what did the agent do?”.",
      "Prompt injection is detected while VALIDATING, so the agent moves to ERROR (`error_count=1`), then back to IDLE (`recoveries=1`), ready for the next request.",
      "In production, `invalid_blocked` going from 0 to 30 after a deploy means the new code is trying to skip steps. The guard caught it, and the metric points you at the bug.",
    ],
  },

  l13: {
    plain: "If you need coffee, toast and eggs, you don’t wait for the kettle to boil before putting the bread in. You start all three and wait for the slowest. Async code does the same with tool calls: when the calls don’t depend on each other, start them all at once and the total wait is roughly the longest one, not the sum. A limit on how many run at once keeps you from overwhelming the services you’re calling.",
    build: [
      ["Two ways to run the same five tool calls: one after another (the baseline), and all at once with `asyncio.gather`. Measuring both shows exactly how much time running together saves.",
        "Without the baseline you can’t tell whether the “fast” version is actually fast, or prove it to anyone."],
      ["A semaphore is a counter that allows at most N calls in flight at once. The rest wait their turn.",
        "One request fans out 200 calls to a search API that allows 10 per second. You get rate-limited and every user’s search fails."],
      ["`return_exceptions=True` means a failing call comes back as an error value in its slot instead of cancelling everything else.",
        "One of five lookups times out, the whole gather raises, and the four answers you already have are thrown away."],
      ["Speedup = sequential time ÷ parallel time. Peak concurrency = the most calls that were actually in flight at the same moment. Together they prove that parallelism is happening.",
        "Someone accidentally puts `await` inside a loop. Speedup silently drops to 1.0 and p95 latency doubles, but every test still passes."],
    ],
    examples: [
      "“Search the docs” and “look up the customer” don’t need each other’s results, so run them together. “Look up the customer” and then “fetch their last invoice” needs the customer ID first, so it stays sequential.",
      "Tools take 80, 20, 60, 40 and 30 ms. One after another: 230 ms. All together: about 80 ms. The user feels the 80, not the 230.",
      "`asyncio.gather` shines while code waits on the network. It won’t speed up resizing 100 images in Python, because that work keeps the CPU busy rather than waiting.",
      "With `Semaphore(3)` and 8 tasks, at most 3 are ever running. The test checks `peak == 3`, which proves the cap works.",
      "The dashboard shows speedup 1.02 on a 5-tool workload. That number alone tells you the tools are taking turns, before any user complains.",
    ],
  },

  l14: {
    plain: "A model can only read so much at once; this is its context window, like a suitcase with a weight limit. Conversations and tool results keep adding items. Before every call you pack the suitcase: leave room for the answer, keep the essentials (the system instructions), and drop the least important items first, usually big tool dumps from earlier turns.",
    build: [
      ["One small function estimates how many tokens a text uses (about 4 characters per token here). Everything else calls this function, so swapping in an exact tokenizer later changes one line.",
        "Token math is copy-pasted in five places. When you switch models, two of them are missed and prompts start overflowing."],
      ["The window has a total size (`max_tokens`) and a reserved part kept free for the model’s answer. Only the rest (`available`) can be used for history. A setting with no room for the answer is rejected immediately.",
        "History fills the entire window, and the model has room for only a few words of answer, or the provider rejects the request."],
      ["When over budget, remove the lowest-priority message first; among equal priorities, remove the oldest. The system prompt has top priority, so it goes last.",
        "Trimming removes the oldest message first, which is usually the system prompt with your safety rules, so the agent forgets its instructions mid-conversation."],
      ["A second strategy: keep the system messages plus only the newest N messages, then trim further if still too big.",
        "Long chats with many small turns keep stale context from an hour ago that confuses the model about what the user wants now."],
    ],
    examples: [
      "Window 8,000 tokens with 1,000 reserved leaves 7,000 for history. The model always has room to write a 1,000-token answer.",
      "History: system prompt (priority 10), user questions (2), tool dumps (1). Over budget, the tool dumps go first, oldest first. The policy text survives.",
      "`sliding(keep=6)` on a 40-message chat keeps the system prompt plus the last 6 messages, the part the user is actually talking about.",
      "Before fitting: 9,100 tokens / 7,000 available = 130% (overloaded). After fitting it must be ≤ 100%, or the call shouldn’t be made.",
      "Moving from “chars ÷ 4” to the provider’s real tokenizer means replacing the body of `count_tokens()`. The window logic and tests stay the same.",
    ],
  },

  l15: {
    plain: "You can’t tell whether a new prompt is better by reading three answers. You need an exam: a fixed set of questions with known correct answers (a golden set) and several ways to mark them, from strict (word-for-word) to lenient (contains the answer). Run the exam on every change and compare the scores, so “I think it’s better” becomes “it went from 72% to 81%”.",
    build: [
      ["Each scoring method is a small function that takes one test case and returns a score. They’re listed by name in one dictionary, so adding a new method means adding one entry.",
        "Scoring logic is tangled into the reporting code. Adding a new metric means editing three files, and someone forgets one."],
      ["Token-F1 gives partial credit by comparing words: how many of the answer’s words are correct (precision) and how many of the expected words appear (recall), combined into one score.",
        "With only exact match, “The answer is 4” scores 0 against “4”, and a correct model looks broken."],
      ["The judge stub mimics an AI grader with fixed scores (exact = 0.98, contains = 0.92, …). It runs the same way as a real model judge, but offline, free and the same every time.",
        "Every test run calls a paid grading model, results wobble between runs, and a build fails because the grader was in a bad mood."],
      ["`evaluate()` runs every case through every scorer and returns per-case scores, the average of each metric, and the pass rate.",
        "Scores are eyeballed case by case and nobody can say whether the new version is better overall."],
    ],
    examples: [
      "Expected “4”, answer “The answer is 4.” Exact match = 0 (formatting), contains = 1 (knowledge). Seeing both tells you the model knows the answer but formats it differently.",
      "Expected “transformer architecture”, answer “a transformer architecture with attention”. 2 of 5 answer words are right (precision 0.4), 2 of 2 expected words appear (recall 1.0), so F1 ≈ 0.57.",
      "In production the judge asks a stronger model “is this answer correct?”. In CI, the stub returns 0.92 for “contains the answer”, the same interface with no API key.",
      "`METRIC_FNS[\"brevity\"] = brevity_score` adds a sixth metric. The evaluator, API and dashboard pick it up automatically.",
      "Two of the six cases are wrong on purpose (a refusal and a wrong city). If they ever start passing, your scorer is broken, which you’d never catch with an all-pass suite.",
    ],
  },

  l16: {
    plain: "When you ask a librarian a question, they first pull the most relevant books, then answer from them. RAG (retrieval-augmented generation) does the same: before the model answers, you search your own documents and put the best matches into the prompt, so the answer is grounded in real text instead of the model’s memory. This lesson builds the search part from scratch, turning text into numbers and ranking documents by how close they are to the question.",
    build: [
      ["Text is split into lowercase words, filler words (“the”, “is”) are dropped, and simple plurals are trimmed (“vectors” → “vector”), so different forms of the same word match.",
        "A question about “embeddings” doesn’t match a document that says “embedding”, and the right document is never found."],
      ["Each document becomes a set of word weights: words frequent in this document but rare across all documents get high weight (TF-IDF). That set of weights is the document’s vector.",
        "Common words like “system” dominate every match, and every query returns the same generic documents."],
      ["Cosine similarity scores how closely the question’s vector points in the same direction as each document’s. Documents are sorted by score and the top k are returned.",
        "Results come back in insertion order, or long documents always win just because they contain more words."],
      ["The index is only rebuilt when documents change, not on every search. Hit rate counts how often the best result is actually relevant (above a score threshold).",
        "Every search rebuilds everything, and searches get slower as the library grows. And without hit rate, you can’t tell when a docs migration broke retrieval."],
    ],
    examples: [
      "“Vector databases store embeddings” becomes {vector: 0.9, database: 1.2, store: 1.2, embedding: 0.9, …}. Rare, specific words carry the most weight.",
      "Two vectors with weights {embedding: 1, vector: 1} and {embedding: 3, vector: 3} point in the same direction, so cosine = 1.0, even though one document is three times longer.",
      "Adding a document marks the index stale. The next search rebuilds once; the next thousand searches reuse it.",
      "A query about giraffes scores 0.0 against every document. Returning “top 3” would show three irrelevant results. The threshold correctly reports a miss.",
      "Swap TF-IDF for a modern embedding model behind the same `search(query, k)` function. Prompts, metrics and dashboards don’t change.",
    ],
  },

  l17: {
    plain: "Fine-tuning teaches a model by example: thousands of “here’s a question, here’s the ideal answer” pairs. Feeding it broken examples is like teaching from a textbook with missing pages: you pay for the lessons and learn the wrong thing. This lesson builds the quality gate in front of training. Format each example correctly, reject broken ones, and split the data reproducibly so you can honestly measure whether training worked.",
    build: [
      ["Each training example is one line of JSON with three messages in order: system (the instructions), user (the question), assistant (the ideal answer). This is the format training services expect.",
        "Examples are in an ad-hoc CSV. The trainer misreads columns and learns to answer questions with other questions."],
      ["A validator checks every example and returns a list of problems: wrong first or last role, empty messages. An empty list means it’s valid.",
        "A spreadsheet export drops the answer column. Thousands of examples teach the model to reply with nothing, and the GPU bill is already paid."],
      ["Valid examples are shuffled with a fixed seed and split 80/20 into training data and held-back test data. The same seed always gives the same split.",
        "The split changes on every run, so a score going up might just be luck, and nobody can reproduce last week’s result."],
      ["Write the train and test files as JSONL (one JSON object per line) and report how many examples were valid out of the total.",
        "A sudden drop in data quality isn’t visible until after an expensive overnight training run."],
    ],
    examples: [
      "`{\"messages\": [{\"role\": \"system\", ...}, {\"role\": \"user\", ...}, {\"role\": \"assistant\", ...}]}`, one per line. The trainer learns to produce the assistant message given the two before it.",
      "A row with only user + assistant reports [\"first != system\"]. A row with an empty answer reports [\"empty content at 2\"]. Neither reaches training.",
      "`random.Random(42).shuffle(items)` gives the identical order on your laptop, in CI and next month, so “accuracy improved by 3%” is a real comparison.",
      "One broken row in ten means a 90% valid rate. The broken row is excluded from both files. If it sat in the test split, your accuracy number would be wrong.",
      "The valid rate drops from 98% to 60% overnight. That alert stops the training job before it burns hours of GPU time on bad data.",
    ],
  },

  l18: {
    plain: "Changing a prompt is changing your product, but it’s often done by someone tweaking text and eyeballing a few replies. This lesson treats prompt changes like a science experiment: keep the current prompt as the control (the baseline), score every new version (candidate) on the same fixed exam, and only switch if the best one clearly wins. Every experiment gets an ID, and the losers are kept on file.",
    build: [
      ["Each prompt variant is an object with an ID and a strategy name (few-shot, chain-of-thought, format-spec), not loose text in a chat thread.",
        "“Use the version Sam pasted in Slack on Tuesday” — nobody is sure which text that was, or whether it’s the one in production."],
      ["A harness scores every candidate on the same golden test set and returns its pass rate. In this lab it uses fixed scores, so results are identical every run.",
        "Each candidate is tested on different examples, so you are comparing luck, not quality."],
      ["The optimiser picks the highest-scoring candidate, but only ships it if it beats the baseline by at least a minimum margin (the gate, e.g. 3 points). Otherwise the current prompt stays.",
        "A candidate that’s 0.5% better (noise) gets shipped. Next week another noise-level change ships, and production prompts churn for no real gain."],
      ["Every run records the baseline score, the winner’s score, the improvement, which candidates lost, and a unique `run_id`.",
        "Six months later accuracy has dropped, and nobody can find which prompt change caused it or what was tried before."],
    ],
    examples: [
      "`PromptCandidate(\"p1\", \"few_shot\", ...)` can be scored, compared, archived and cited by ID. A paragraph in a chat message can’t.",
      "Baseline 72%, few-shot 81%, chain-of-thought 78%, format-spec 69%. All are measured on the same 50 cases, so the ranking is meaningful.",
      "Best candidate +9 points with a 3-point gate: ship it. Best candidate +2 points: keep the baseline and archive all three candidates.",
      "Format-spec lost this time. It stays in the archive, so next quarter nobody “discovers” and re-tests the same idea.",
      "The pull request says “72% → 81% [eval/run-0042]”. A reviewer can open that run and see exactly what was compared.",
    ],
  },
};
