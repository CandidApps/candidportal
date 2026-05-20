/** Map upload/analysis failures to user-facing messages (never expose secrets). */
export function billUploadErrorMessage(err: unknown, isMerchantPdf: boolean): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : err instanceof Error
        ? err.message
        : '';

  if (code === 'PGRST204' || message.includes('schema cache')) {
    return 'Database is missing merchant analysis columns. Run the latest Supabase migration (0003_merchant_analysis) and try again.';
  }

  if (
    message.includes('Could not parse merchant statement') ||
    message.includes('Statement parsing failed') ||
    message.includes('Parse API error')
  ) {
    return 'We could not read this PDF. Try a native PDF export (not a scan/photo), or upload a different statement month.';
  }

  if (isMerchantPdf) {
    return 'Merchant statement analysis failed. Please try again in a moment.';
  }

  return 'Could not save your service. Please try again.';
}
