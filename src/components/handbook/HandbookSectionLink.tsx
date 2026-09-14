import { Link } from 'react-router-dom';
import { handbookSectionLink } from '@/lib/handbook-section-links';

export default function HandbookSectionLink({ title }: { title: string }) {
  const link = handbookSectionLink(title);
  return link ? <p className="handbook-section-link"><Link to={link.to}>{link.label} <span aria-hidden="true">→</span></Link></p> : null;
}
