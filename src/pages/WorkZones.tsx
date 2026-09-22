import { Navigate } from 'react-router-dom';

/** Work Zones moved into Office Settings; old links land on the card there. */
export default function WorkZones() {
  return <Navigate to="/management/office/settings#work-zones" replace />;
}
