import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { signedAttachmentUrl, type AttachmentRow } from '@/hooks/useMessageAttachments';

function AttachmentItem({ att }: { att: AttachmentRow }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    signedAttachmentUrl(att.storage_path).then(u => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [att.storage_path]);

  if (!url) {
    return (
      <div className="flex items-center gap-2 rounded-md border p-2 text-xs opacity-70">
        <Loader2 className="h-3 w-3 animate-spin" /> {att.file_name}
      </div>
    );
  }

  if (att.mime_type.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt={att.file_name}
          loading="lazy"
          className="max-h-56 w-auto rounded-md border object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-md border bg-background/60 p-2 text-xs text-foreground underline-offset-2 hover:underline"
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{att.file_name}</span>
      <span className="opacity-60">{Math.round(att.size_bytes / 1024)} KB</span>
    </a>
  );
}

export default function MessageAttachments({ attachments }: { attachments: AttachmentRow[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {attachments.map(a => (
        <AttachmentItem key={a.id} att={a} />
      ))}
    </div>
  );
}
