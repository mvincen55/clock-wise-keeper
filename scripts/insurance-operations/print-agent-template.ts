import { payerAgentTemplate } from '../../src/features/insurance-operations/server/agent-template';
const [origin, model] = process.argv.slice(2);
if (!origin || !model)
  throw new Error(
    'Usage: bun scripts/insurance-operations/print-agent-template.ts HTTPS_RELAY_ORIGIN APPROVED_MODEL',
  );
process.stdout.write(
  JSON.stringify(payerAgentTemplate(origin, model), null, 2) + '\n',
);
