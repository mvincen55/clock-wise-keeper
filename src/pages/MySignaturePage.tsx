import MySignatureCard from '@/components/letterhead/MySignatureCard';

/**
 * My Signature — a small standalone home for the staff member's own stored
 * signature, reachable from the Letters & Notes hub without digging through
 * administrative settings. The same card is mounted on the Settings page's
 * personal section.
 */
export default function MySignaturePage() {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">My Signature</h1>
      <MySignatureCard />
    </div>
  );
}
