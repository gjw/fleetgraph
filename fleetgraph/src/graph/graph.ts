import { StateGraph, START, END } from '@langchain/langgraph';
import { GraphState } from './state.js';
import { classifyRouter } from './edges.js';
import { triggerNode } from './nodes/trigger.js';
import { contextNode } from './nodes/context.js';
import { fetchIssuesNode } from './nodes/fetch-issues.js';
import { fetchSprintsNode } from './nodes/fetch-sprints.js';
import { fetchTeamNode } from './nodes/fetch-team.js';
import { reasoningNode } from './nodes/reasoning.js';
import { classifyNode } from './nodes/classify.js';
import { notifyNode } from './nodes/notify.js';
import { actionProposeNode } from './nodes/action-propose.js';
import { humanGateNode } from './nodes/human-gate.js';
import { persistNode } from './nodes/persist.js';

export function buildGraph() {
  const graph = new StateGraph(GraphState)
    // Nodes
    .addNode('trigger', triggerNode)
    .addNode('context', contextNode)
    .addNode('fetch-issues', fetchIssuesNode)
    .addNode('fetch-sprints', fetchSprintsNode)
    .addNode('fetch-team', fetchTeamNode)
    .addNode('reasoning', reasoningNode)
    .addNode('classify', classifyNode)
    .addNode('notify', notifyNode)
    .addNode('action-propose', actionProposeNode)
    .addNode('human-gate', humanGateNode)
    .addNode('persist', persistNode)

    // Linear: START → trigger → context
    .addEdge(START, 'trigger')
    .addEdge('trigger', 'context')

    // Fan-out: context → parallel fetches (conditional edges returning all three)
    .addConditionalEdges('context', () => ['fetch-issues', 'fetch-sprints', 'fetch-team'] as const)

    // Fan-in: each fetch → reasoning
    .addEdge('fetch-issues', 'reasoning')
    .addEdge('fetch-sprints', 'reasoning')
    .addEdge('fetch-team', 'reasoning')

    // reasoning → classify
    .addEdge('reasoning', 'classify')

    // Conditional: classify → clean(END) | notify | action-propose
    .addConditionalEdges('classify', classifyRouter, {
      [END]: END,
      notify: 'notify',
      'action-propose': 'action-propose',
    })

    // Notify path: notify → persist → END
    .addEdge('notify', 'persist')

    // Action path: action-propose → human-gate → END
    // (human-gate creates finding docs with human_decision=null;
    //  the decide endpoint handles confirm/dismiss imperatively)
    .addEdge('action-propose', 'human-gate')
    .addEdge('human-gate', END)

    // persist → END
    .addEdge('persist', END);

  return graph.compile();
}
