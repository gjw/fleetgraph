import { END } from '@langchain/langgraph';
import type { GraphStateType } from './state.js';

export function classifyRouter(
  state: GraphStateType,
): typeof END | 'notify' | 'action-propose' {
  switch (state.classification) {
    case 'clean':
      return END;
    case 'notify':
      return 'notify';
    case 'action_propose':
      return 'action-propose';
    default:
      return END;
  }
}
