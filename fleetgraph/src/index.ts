import { loadConfig } from './config.js';

const config = loadConfig();

console.log(`FleetGraph starting on port ${config.port}`);
console.log(`Ship API: ${config.shipApiUrl}`);
console.log(`LangSmith project: ${config.langsmithProject}`);
console.log(`LangSmith tracing: ${config.langsmithTracing ? 'enabled' : 'disabled'}`);
