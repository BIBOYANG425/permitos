# Hacker Resources

Updated: 2026-05-30
Home repo: https://github.com/a1gmm/Autoresearch-Systems-Hackathon-Antler
Audience: hackathon teammates
Status: team-shareable resource artifact

## Credits

- Modal credits: redeem at https://modal.com/credits with the event-provided code. Keep the actual code in team chat or the event portal, not in the public repo.
- OpenAI credits: claim with the hackathon-provided link. The URL was not included in the pasted notes, so keep the team-chat or event-portal link handy.

## Sponsor Docs We Should Use

| Resource | Why It Matters For Our Build |
|---|---|
| https://modal.com/blog/autoscaling-autoresearch | Reference story for agent-driven dynamic compute: scale out for exploration, scale down for debugging, scale to zero when done. |
| https://modal.com/blog/building-with-modal-and-the-openai-agent-sdk | Closest architectural match: custom OpenAI Agents SDK harness plus Modal sandboxes/subagents for parallel work. |
| https://www.raindrop.ai/docs/workshop/overview/ | Local trace debugger and replay workflow for agent failures. |
| https://www.howtoeval.com/ | Evaluation philosophy: read traces/logs, reproduce failures, add high-signal golden cases, and keep evals tied to real failure modes. |

## How These Map To Our Demo

- Modal: show dynamic worker fan-out for `ResearchTask[]`, plus repair worker launch after verifier failure.
- OpenAI Agents SDK: show a code-first, typed agent loop with orchestrator, workers, verifier, synthesis, and guardrails.
- Raindrop: use during build to inspect failures and replay the quote-mismatch run; optionally show as a behind-the-scenes debug reveal.
- HowToEval: justify our golden eval cases and scorecard. Our test plan should stay small, high-signal, and failure-driven.

## Team Setup Notes

- Redeem credits before building the Modal path so nobody blocks on billing.
- Keep the demo runnable from cached fixtures even if live source fetching or sponsor tooling is flaky.
- Do not put sponsor credit codes, API keys, customer data, or private source-cache credentials in the repo.
- Make sure the OpenAI credits link is captured from the event portal or organizer message before the team splits up.
