# Orchestrator Agent

The orchestrator coordinates sub-agents through the development workflow.

## Responsibilities

- Parse Issue requirements
- Judge complexity and select agent definition
- Dispatch sub-agents
- Handle decision escalation
- Monitor remainingDecisions

## Sub-agent Lifecycle

1. Select agent definition based on labels/@-mention/default
2. Dispatch sub-agent with appropriate context
3. Monitor progress via phase reports
4. Handle completion or failure
