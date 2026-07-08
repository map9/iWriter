/**
 * SubagentTraceTagMiddleware — give each subagent run a distinct, filterable LangSmith identity.
 *
 * Subagents are ALREADY traced by LangSmith: deepagents' `task` tool invokes the subagent graph with
 * the parent config (so the tracer callbacks + `metadata.threadId` / `metadata.turnId` are inherited)
 * and sets `configurable.ls_agent_type = "subagent"`. So a subagent's full internal run (its own model
 * calls / tool calls) exists as a nested child under the parent's `task` node. The gap is *findability*:
 * the subagent inherits the parent run's name/tags, so it is hard to tell apart from its parent and
 * hard to filter/export on its own.
 *
 * This middleware (attached per-subagent by SubagentAssembler) stamps every model call inside the
 * subagent with `runName = "subagent:<name>"`, tags `["subagent", "subagent:<name>"]`, and
 * `metadata.subagentName = <name>`. In LangSmith you can then filter runs by tag `subagent:writer`
 * (correlating with the inherited `metadata.threadId` / `turnId`) and export the subagent's execution
 * for analysis the same way a root run is exported. Pure trace metadata — no behavioral effect.
 */
import { createMiddleware } from 'langchain'

export function createSubagentTraceTagMiddleware(subagentName: string) {
  const tags = ['subagent', `subagent:${subagentName}`]
  const runName = `subagent:${subagentName}`
  return createMiddleware({
    name: `SubagentTraceTag:${subagentName}`,
    wrapModelCall: async (request, handler) => {
      // request.model is usually a Runnable chat model (withConfig merges tags/metadata and names the
      // run for this call, so LangSmith attributes it to the subagent). It can also be a plain string
      // model id with no withConfig — then pass through untouched.
      const model = request.model as unknown
      const hasWithConfig =
        !!model && typeof model === 'object' && typeof (model as { withConfig?: unknown }).withConfig === 'function'
      if (!hasWithConfig) return handler(request)
      const tagged = (model as { withConfig: (c: Record<string, unknown>) => unknown }).withConfig({
        tags,
        runName,
        metadata: { subagentName },
      })
      return handler({ ...request, model: tagged as typeof request.model })
    },
  })
}
