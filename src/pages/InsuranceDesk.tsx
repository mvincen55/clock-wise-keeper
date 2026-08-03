/**
 * Insurance Desk — the Practice Playbook's carrier reference desk.
 *
 * Built on the shared office_docs infrastructure with insurance-specific
 * parsing and reading: carrier manuals are parsed from their PDFs into
 * real sections with page provenance, browsed through a hierarchical
 * table of contents, searched with carrier-terminology synonyms, and
 * verified against the original PDF page. Ask AI is scoped to the
 * selected manual and cites section + page. Internal business references
 * — never patient records.
 */
import InsuranceManualReader from '@/components/insurance/InsuranceManualReader';

export default function InsuranceDesk() {
  return <InsuranceManualReader />;
}
