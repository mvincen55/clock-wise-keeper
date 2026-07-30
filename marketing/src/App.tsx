import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { DoctorPage } from "@/pages/Doctor";
import { OfficeManagerPage } from "@/pages/OfficeManager";
import { YourDataPage } from "@/pages/YourData";
import { DevBanner } from "@/components/DevBanner";

/** Land at the top on route change, but leave in-page anchors alone. */
function ScrollReset() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollReset />
      <Routes>
        <Route path="/" element={<DoctorPage />} />
        <Route path="/office-manager" element={<OfficeManagerPage />} />
        <Route path="/your-data" element={<YourDataPage />} />
        {/* Anything else goes to the owner's page rather than a dead end —
            ad traffic with a stray query or a mistyped path still lands. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DevBanner />
    </BrowserRouter>
  );
}
