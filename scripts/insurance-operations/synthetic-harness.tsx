import React from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { InsuranceSession } from '../../src/features/insurance-operations/InsuranceWorkspace';
import {
  demoOrg,
  demoPayer,
  syntheticSettings,
  syntheticPlan,
} from '../../src/features/insurance-operations/domain/synthetic';
import { GENERIC_BRANDING } from '../../src/hooks/useOrgBranding';
import '../../src/index.css';
const data = {
  settings: syntheticSettings,
  settingsVersion: 1,
  versions: [syntheticPlan()],
  directory: [
    {
      id: demoPayer,
      org_id: demoOrg,
      label: 'Synthetic payer',
      value: 'Training only',
    },
  ],
  providers: [],
  plans: [],
  schedules: [],
  manuals: [],
};
const router = createMemoryRouter(
  [
    {
      path: '/insurance-desk/*',
      element: (
        <InsuranceSession
          orgId={demoOrg}
          userId="synthetic-user"
          role="owner"
          data={data}
          refresh={() => {}}
          branding={{
            ...GENERIC_BRANDING,
            displayName: 'Training Dental Office',
            legalName: 'Training Dental Office',
          }}
          manuals={() => (
            <p>Existing manual reader is preserved in the production route.</p>
          )}
          getToken={async () => ''}
        />
      ),
    },
    { path: '*', element: <p>Left insurance workspace</p> },
  ],
  { initialEntries: ['/insurance-desk/benefits'] },
);
createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />,
);
