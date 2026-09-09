import { harelickPolicyTemplate } from '@/lib/fof/payment-policy';
import type { PaymentInput } from '@/lib/fof/payment-engine';
export function fullFixture(): PaymentInput {
  const p: PaymentInput = {policy: harelickPolicyTemplate(), expectedObligationCents:817300, procedures:[],groups:[],events:[]};
  p.procedures = [
    { id: 'ct', groupId: 'w', responsibilityCents: 52000 }, { id: 'models', groupId: 'w', responsibilityCents: 25600 }, { id: 'D6190', groupId: 'w', responsibilityCents: 112000 },
    { id: 'implant', groupId: 's', responsibilityCents: 271700 }, { id: 'stage2', groupId: 's', responsibilityCents: 49200 },
    { id: 'abutment', groupId: 'r', responsibilityCents: 114100 }, { id: 'crown', groupId: 'r', responsibilityCents: 192700 }, { id: 'delivery', groupId: 'r', responsibilityCents: 0 },
  ];
  p.groups = [{ id: 'w', label: 'Work-up', classification: 'workup', events: { workup: 'w' } }, { id: 's', label: 'Implant', classification: 'implant', events: { booking: 'sb', surgery: 's' } }, { id: 'r', label: 'Restoration', classification: 'restoration', events: { booking: 'rb', prep: 'r', delivery: 'd' } }];
  p.events = ['w','sb','s','rb','r','d'].map((id, order) => ({ id, label: id, order }));
  return p;
}
