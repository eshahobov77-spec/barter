import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function withPage(basePath: string, params: Record<string, string>, page: number) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== 'page' && k !== 'open') sp.set(k, v);
  }
  if (page > 1) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default function Pagination({
  basePath,
  params,
  page,
  pageSize,
  count,
}: {
  basePath: string;
  params: Record<string, string>;
  page: number;
  pageSize: number;
  count: number;
}) {
  const numPages = Math.max(1, Math.ceil(count / pageSize));
  if (numPages <= 1) return null;
  const startIndex = (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, count);

  return (
    <div className="pagination">
      <span>
        {startIndex}–{endIndex} / {count}
      </span>
      <div className="pages">
        {page > 1 && (
          <>
            <Link className="btn btn-ghost sm" href={withPage(basePath, params, 1)}>
              Birinchi
            </Link>
            <Link
              className="btn btn-ghost sm icon"
              href={withPage(basePath, params, page - 1)}
              aria-label="Oldingi"
            >
              <ChevronLeft className="lucide" />
            </Link>
          </>
        )}
        <span className="btn btn-ghost sm" aria-current="page">
          {page} / {numPages}
        </span>
        {page < numPages && (
          <>
            <Link
              className="btn btn-ghost sm icon"
              href={withPage(basePath, params, page + 1)}
              aria-label="Keyingi"
            >
              <ChevronRight className="lucide" />
            </Link>
            <Link className="btn btn-ghost sm" href={withPage(basePath, params, numPages)}>
              Oxirgi
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
