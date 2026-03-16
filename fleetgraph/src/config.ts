import 'dotenv/config';

interface FleetGraphConfig {
  openaiApiKey: string;
  langsmithApiKey: string;
  langsmithProject: string;
  langsmithTracing: boolean;
  shipApiUrl: string;
  shipApiToken: string;
  port: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): FleetGraphConfig {
  return {
    openaiApiKey: required('OPENAI_API_KEY'),
    langsmithApiKey: required('LANGSMITH_API_KEY'),
    langsmithProject: process.env['LANGSMITH_PROJECT'] ?? 'fleetgraph',
    langsmithTracing: process.env['LANGSMITH_TRACING'] !== 'false',
    shipApiUrl: process.env['SHIP_API_URL'] ?? 'http://localhost:3000',
    shipApiToken: required('SHIP_API_TOKEN'),
    port: parseInt(process.env['FLEETGRAPH_PORT'] ?? '3100', 10),
  };
}
