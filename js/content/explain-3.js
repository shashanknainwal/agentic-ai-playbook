// Plain-language teaching layer, lessons 19–26. Same shape as explain-1.js.
export default {
  l19: {
    plain: "Important decisions get a second opinion: a doctor checks a drug combination with a colleague, a lawyer has a contract reviewed. Multi-agent debate does this for AI. One agent drafts an answer, several critics look for mistakes at the same time, and a final judge (the arbiter) writes the improved answer. It costs several model calls instead of one, so you only do it for questions where being wrong is expensive.",
    build: [
      ["A classifier decides per question whether debate is worth it: medical, legal, financial and security questions get debated; jokes, slogans and simple lookups don’t.",
        "Every “write me a poem” goes through five model calls, costs five times as much, takes longer, and comes back blander."],
      ["The generator writes a draft, all critics review it at the same time (in parallel), then the arbiter combines the draft and the critiques into the final answer.",
        "Critics run one after another, so five critics take five times as long, and users wait 20 seconds for an answer."],
      ["Each debated answer records how many model calls it used (1 + number of critics + 1) and how long it took, so the extra cost is visible next to the accuracy gain.",
        "Debate quietly triples the AI bill and nobody can say whether the accuracy gain was worth it."],
      ["Questions that skip debate don’t reset the accuracy-gain numbers on the dashboard. Debated and non-debated traffic are reported separately.",
        "A demo mixes three debated and two skipped questions, the last skipped one overwrites the metric with 0, and the dashboard claims debate does nothing."],
    ],
    examples: [
      "“Is it safe to take ibuprofen with an SSRI medication?” → debate. “Write a slogan for our tax app” → skip; it’s creative work, even though it mentions tax.",
      "With 3 critics taking 2 seconds each: in parallel the critique step takes ~2 s; one after another it takes ~6 s. Same independence, a third of the wait.",
      "If the arbiter is a weaker model than the generator, it can’t reliably tell when a critic is right and the draft is wrong, so it tends to rubber-stamp the draft.",
      "The report says “+15 points accuracy at 5× cost on high-stakes routes”. Product can decide that’s worth it for medical questions but not for FAQ questions.",
      "A critic times out on a drug-interaction question. The system returns “couldn’t verify, please consult a pharmacist” rather than the unreviewed draft.",
    ],
  },

  l20: {
    plain: "Search by similarity is great for “find me text like this”. But some questions are about exact connections: “Which tools did Alice use, through which agents, and what did it cost?” That’s like reading a family tree, not searching a library. A knowledge graph stores things (users, agents, tools) as dots and actions as lines between them, so these questions are answered exactly in one query.",
    build: [
      ["Every tool call is saved as connections: this user → used this agent → which called this tool, costing this much.",
        "The only record of who used what is in scattered log files. Answering “who used database_read last month?” means a slow, error-prone log search."],
      ["For one user, add up calls and cost per tool, list the agents involved, sort with the most expensive first, and return at most `limit` rows.",
        "Results come back in random order with no total, so the risky, expensive tool is buried on page 3."],
      ["Turn the top rows into one sentence (“Recent tool usage for alice: database_read (1 call, $0.20); …”) that can be added to the model’s instructions.",
        "The model re-runs an expensive search the user already paid for five minutes ago, because it doesn’t know it happened."],
      ["Tests and demos use a simple in-memory graph. Production uses Neo4j (a real graph database), and both have the same functions, so swapping them doesn’t change any calling code.",
        "Tests need a running database server, so they’re slow and flaky, and nobody runs them before pushing."],
    ],
    examples: [
      "Security asks “who triggered `database_read` in the last 30 days?”. The graph walks User → AuditEvent → Tool edges and answers exactly, with no fuzzy matching.",
      "Alice: database_read (1 call, $0.20), web_search (3 calls, $0.12), summarise (1 call, $0.01). Spend and risk are visible at a glance.",
      "Without LIMIT, a query on a super-connected node (a tool used 10 million times) tries to load everything and takes the database down.",
      "The system prompt gains “Recent tool usage for alice: web_search (3 calls)”, so the model can say “as found in your earlier search…” instead of searching again.",
      "Writing the audit edge happens in the background after the response is sent, so the user never waits for the graph. Reads go to a replica copy, so heavy reporting doesn’t slow down writes.",
    ],
  },

  l21: {
    plain: "Real users find your agent’s mistakes every day. LLMOps closes the loop: collect those real conversations (with personal data removed), turn them into test questions, score the current prompt and some new candidates on them, and only ship a new prompt if it clearly wins. Then repeat weekly, so the product gets steadily better from real evidence instead of guesswork.",
    build: [
      ["Before any user conversation is stored or reused, emails and phone numbers are replaced with `[EMAIL]` and `[PHONE]`.",
        "Real customer emails end up in your test suite, in training data and in logs that half the company can read: a privacy incident waiting to happen."],
      ["Recent user questions are turned into a test suite: personal data removed, blanks and duplicates dropped, capped at a manageable size.",
        "Tests only cover questions engineers imagined, so the real failures users hit never get tested."],
      ["One cycle: score the baseline prompt, score each candidate on the same suite, pick the best, and deploy it only if it beats the baseline by more than 3 points. Otherwise keep the current one.",
        "Prompts change whenever someone feels like it, without evidence, and quality goes up and down unpredictably."],
      ["Count cycles, test cases used, deployments, and “no change” decisions.",
        "No record shows that the last 4 cycles produced no improvement, which is a sign the candidates or the test set need rethinking."],
    ],
    examples: [
      "Yesterday a user hit a bug with refund questions. Today that exact (anonymised) question is in the test suite, so that failure can never silently come back.",
      "“Email me at jane@corp.com” becomes “Email me at [EMAIL]” before it is written anywhere. Every later copy is already clean.",
      "Baseline and candidates are scored on the identical 50 questions. If they were scored on different questions, a “win” could just mean easier questions.",
      "`IMPROVEMENT_THRESHOLD_PP = 3.0` is a named constant in code. Anyone can find it and change it in a reviewed pull request, instead of the rule living in a slide deck.",
      "Cycle 12: best candidate +1.8 points → no deploy, recorded as “no change, run 8f3a…”. That record shows the loop ran and made a deliberate decision.",
    ],
  },

  l22: {
    plain: "Kubernetes runs your app on a cluster of machines, but you have to tell it the rules in configuration files (manifests): how many copies to run, how much CPU and memory each may use, how to check it’s healthy, and how to update it without downtime. Get these wrong and you get outages or failed security audits. This lesson writes a checker that reads the manifests and fails if any production rule is broken, before anything is deployed.",
    build: [
      ["One function reads the deployment config and checks six rules, returning pass/fail for each and an overall `VALIDATED` or `FAILED`.",
        "Each engineer remembers a different subset of the rules. A config missing a health check slips through review and causes an outage."],
      ["During an update, Kubernetes must start new copies and wait until they’re ready before stopping old ones (`maxUnavailable: 0`).",
        "During a deploy, all old copies stop before the new ones are ready, and for 30 seconds every user gets an error."],
      ["Every container declares how much CPU and memory it needs (requests) and its maximum (limits), plus two health checks: “ready for traffic?” and “still alive?”.",
        "One agent with a memory leak grows until it starves every other app on the same machine. Or traffic is sent to a copy that is still starting up."],
      ["Autoscaling keeps at least 2 copies, secrets like API keys never go in plain config, and the container doesn’t run as the all-powerful root user.",
        "An API key sits in a ConfigMap that every developer can read. Or a security bug in the app gives an attacker root on the machine."],
    ],
    examples: [
      "3 copies running, update starts: new copy 4 starts, passes its health check, then old copy 1 stops, and so on. At least 3 copies are serving at every moment.",
      "Readiness (“send me traffic?”) checks `/health`, including its dependencies. Liveness (“should you restart me?”) checks `/ping`, just whether the process responds. If liveness checked the database, a slow database would restart every healthy copy in a loop.",
      "Requesting 250m CPU (a quarter of a core) and 512Mi memory tells the scheduler where the app fits. A 1Gi memory limit stops a leak from taking the whole machine.",
      "`LOG_LEVEL=info` belongs in a ConfigMap. `OPENAI_API_KEY` belongs in a Secret, which has separate access controls and can be encrypted.",
      "A `USER agent` line in the Dockerfile means that if someone breaks into the app, they are an ordinary user inside the container, not root.",
    ],
  },

  l23: {
    plain: "A restaurant adds staff when the queue at the door gets long, not when the cooks start sweating; by then customers are already waiting. AI agents are similar. Measure the queue of waiting requests and add copies of the agent when it grows. At night, when nobody is waiting, scale all the way down to zero and stop paying for idle machines. During business hours, keep a couple ready so the first morning customer isn’t kept waiting.",
    build: [
      ["Copies needed = queue length ÷ how many requests one copy handles (rounded up), never more than the maximum.",
        "Scaling waits for CPU to rise, but requests were piling up for a minute before that, so users already felt the delay."],
      ["During business hours there’s a minimum of 2 copies. Outside those hours, an empty queue means 0 copies.",
        "Either you pay for idle servers all night, or the first user every morning waits 30 seconds for a cold start."],
      ["Simulate a full day of queue sizes hour by hour, count the copy-hours used, and compare with running peak capacity all day to get the percentage saved.",
        "Nobody can say what autoscaling actually saves, so the finance conversation is guesswork."],
      ["Check the KEDA config itself: allows zero, scales on the queue metric, has the business-hours floor, has a cooldown, and has a sensible maximum.",
        "A typo in the metric name means KEDA never sees any load and never scales, and you find out during the first traffic spike."],
    ],
    examples: [
      "Queue of 25 with 10 per copy means 3 copies. Queue of 500 means 50, capped at a maximum of 10, so a traffic spike can’t create a surprise bill.",
      "A ScaledObject combines the queue trigger, the business-hours trigger, the min/max and the cooldown in one place, so they can’t contradict each other.",
      "At 3 a.m. the queue is empty, so there are 0 copies and no cost. The first request at 3:05 waits a few seconds for a copy to start. Test that this is acceptable.",
      "At 8:00 the business-hours rule keeps 2 copies warm, so the 8:01 rush doesn’t hit cold starts.",
      "Grafana and KEDA read the same `agent_request_queue_depth` metric, so the graph the team watches is exactly what drives scaling decisions.",
    ],
  },

  l24: {
    plain: "Auditors want proof that your logs of “who did what” haven’t been edited. The trick is a chain of fingerprints. Each log entry gets a fingerprint (hash) computed from its contents plus the previous entry’s fingerprint. Change one letter anywhere and its fingerprint changes, which breaks the link to the next entry, so the tampering shows. Store the entries somewhere they can’t be deleted, and you have evidence an auditor can trust.",
    build: [
      ["Each entry is turned into text in one exact, standard way (canonical JSON), and SHA-256 turns that text into a 64-character fingerprint. The same content always gives the same fingerprint.",
        "The same record serialises as `{\"a\":1,\"b\":2}` one day and `{\"b\": 2, \"a\": 1}` the next. The fingerprints differ and every check reports false tampering."],
      ["Each entry stores the previous entry’s fingerprint, linking them like a chain.",
        "Someone deletes the entry showing they exported customer data. Without links, nothing looks wrong."],
      ["Verification walks the chain from the start, recomputing each fingerprint and checking each link, and reports the first entry where something is wrong.",
        "You can tell something was changed, but not where, so the investigation starts from scratch."],
      ["The tests deliberately edit, delete and reorder entries and confirm each one is detected.",
        "The checker has a bug and has never actually caught anything, but it reports “all good” forever."],
    ],
    examples: [
      "Change `resource: \"report.pdf\"` to `\"nothing.pdf\"` in entry 3. Recomputing entry 3’s fingerprint no longer matches the stored one, so verification fails at entry 3.",
      "The attacker edits entry 3 and recomputes its fingerprint too. Entry 4 still stores the old fingerprint as its “previous”, so the link breaks and verification fails at entry 4.",
      "Checking only the links misses an edit that leaves fingerprints alone. Checking only fingerprints misses deleted or reordered entries. Checking both catches all of them.",
      "With S3 Object Lock, even an administrator can’t delete or overwrite an audit object until the retention period (e.g. 7 years) ends.",
      "Verifying 10 million entries on every request is slow, so production checks random samples per request and runs the full check overnight.",
    ],
  },

  l25: {
    plain: "In healthcare, patient details like social security numbers, medical record numbers, birth dates and diagnoses are protected by law (HIPAA). An AI agent sees this data constantly. The rules: spot it, black it out before it reaches the model or the logs, record which kinds of protected data were involved (never the values themselves), and log people out automatically after 15 minutes of inactivity, like a clinic computer locking itself when the nurse walks away.",
    build: [
      ["Patterns spot protected data (SSN, medical record number, date of birth, email, diagnosis words). `scan` lists which types are present; `redact` replaces each match with `[SSN]`, `[MRN]`, and so on.",
        "A nurse pastes notes into the chat. The patient’s SSN goes to an external AI provider and into logs, which is a reportable breach."],
      ["Each audit entry records that protected data was involved and which types (e.g. SSN, DOB), using the redacted text, never the real values.",
        "The audit log meant to prove compliance itself contains thousands of SSNs, which makes it the biggest privacy risk in the system."],
      ["Sessions end after 15 minutes without activity. The timeout is a fixed constant in code, not a setting anyone can change.",
        "Someone raises the timeout to 8 hours “temporarily” for convenience. A shared clinic computer stays logged in all day, and you are out of compliance."],
      ["A map links each HIPAA requirement (access control, audit, integrity, authentication) to the feature that satisfies it, so an auditor can check each one.",
        "Features exist, but nobody can show which requirement each one covers, and the audit drags on for weeks."],
    ],
    examples: [
      "Pattern matching catches common identifiers fast and cheaply. It won’t catch everything (like a name written in an unusual way), so it’s one layer alongside encryption, access control and contracts.",
      "“MRN: 12345678, diagnosed with diabetes” becomes “[MRN], [CLINICAL] diabetes…”. The text keeps its shape for downstream processing, minus the identifiers.",
      "If any PHI type is found, the audit entry gets `phi: true` and `phi_types: [\"MRN\", \"DOB\"]`. An auditor can find every PHI-touching event without seeing any patient data.",
      "There is no `timeout=` parameter to pass. To change the 900 seconds, someone has to edit the constant in a reviewed code change, which is exactly the friction you want.",
      "A request arrives with a session ID the server has never seen (or already expired). It’s rejected the same way, so there’s no loophole for unknown sessions.",
    ],
  },

  l26: {
    plain: "Cloud data centres occasionally go down. Disaster recovery means a second copy of your system in another region, ready to take over. Two numbers define success: how quickly you’re serving users again (RTO, recovery time) and how much recent data you can afford to lose (RPO, recovery point). The rule that matters most: a recovery plan you haven’t practised doesn’t count. So this lesson simulates the failure and measures both numbers against their budgets.",
    build: [
      ["Describe the setup: a primary region (us-east-1), a standby region (us-west-2), which one is currently active, and the health of each.",
        "The plan says “we have a backup somewhere”, but nobody has written down where, or whether it can actually serve traffic."],
      ["Simulate the primary failing: health checks notice after 3 failures 10 seconds apart (30 s), the standby takes over and warms up, and RTO = detection + warm-up.",
        "Failover has never been timed. On the real day it takes 3 hours instead of the promised 30 minutes."],
      ["Check that the standby’s copy of the database was close enough to the primary when it failed: replica lag must be under 5 minutes (the RPO).",
        "The site comes back quickly, but the standby database was 40 minutes behind, and 40 minutes of orders are gone."],
      ["Seven checks (two regions, correct health-check settings, standby promoted, RTO met, RPO met, runbook completed, standby is really a different region) must all pass for `VALIDATED`.",
        "The test is marked “passed” because DNS switched over, even though data was lost and the runbook was never followed."],
    ],
    examples: [
      "Primary fails at 10:00:00. Health checks fail at :10, :20 and :30, then the standby is promoted and warms up in 15 s. RTO = 45 s, well under the 30-minute budget.",
      "The replica was 60 seconds behind when the primary died, so at most 1 minute of writes is lost. That is under the 5-minute RPO.",
      "With 3 failures × 10 seconds, a single dropped health check doesn’t trigger a failover, but a real outage is detected in 30 seconds.",
      "Every quarter, two different engineers run the recovery script in staging, time it, and file the results. If a step only works when one specific person runs it, the plan isn’t real.",
      "RTO met but RPO missed means the test fails. Users being back online quickly doesn’t make up for losing their data.",
    ],
  },
};
