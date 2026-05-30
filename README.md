# Autoresearch Systems Hackathon - Antler

Home repo: https://github.com/a1gmm/Autoresearch-Systems-Hackathon-Antler

This repo is the team home for the EHS Permit-Navigator hackathon project.

## Project

We are building an AI-native EHS research swarm that turns a facility or project change into a defensible regulatory applicability matrix.

The demo target:

> Given a Southern California manufacturing change, our agent swarm determines applicable EHS obligations, proves each row with current source evidence, and visibly fails closed when evidence is incomplete.

## Start Here

Read these in order:

1. [Team Share Packet](./TEAM_SHARE_PACKET.md)
2. [Two-Person Build Split](./TWO_PERSON_BUILD_SPLIT.md)
3. [Hackathon Demo Design](./HACKATHON_DEMO_DESIGN.md)
4. [Hacker Resources](./HACKER_RESOURCES.md)
5. [Tool Integration Plan](./TOOL_INTEGRATION_PLAN.md)
6. [Product and Build Plan](./ehs-permit-agent-autoplan-review.md)
7. [Agent Control Loop Contract](./ehs-agent-control-loop-ceo-review.md)
8. [Test and Eval Plan](./ehs-agent-test-plan.md)

## Tooling Story

- OpenAI Agents SDK: code-first agent loop, structured outputs, guardrails, and traces.
- Modal: dynamic research fan-out, parallel source extraction, worker isolation, timeouts, and scale-down.
- Raindrop: local trace debugging, replay, and eval creation.
- HowToEval: failure-driven eval practice and high-signal golden cases.

## Repository Hygiene

- Do not commit sponsor credit codes, private API keys, `.env` files, source-cache credentials, or customer data.
- Keep demo fixtures small, reproducible, and safe to run without live network access.
- Treat final determinations as human-review research support, not legal advice or autonomous filing.
