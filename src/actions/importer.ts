'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { runImport, type ImportResult } from '@/lib/importer';

export type ImportState = { result?: ImportResult; error?: string };

export async function runImportAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireAdmin();
  const file = formData.get('file') as File | null;
  const dryRun = formData.get('dryRun') === 'on';

  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) {
    return { error: 'Excel faylni tanlang.' };
  }
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    return { error: 'Faqat .xlsx formatidagi fayl qabul qilinadi.' };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { error: 'Fayl juda katta (maksimal 25 MB).' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await runImport(buffer, user, dryRun);
  if (!dryRun) revalidatePath('/', 'layout');
  return { result };
}
