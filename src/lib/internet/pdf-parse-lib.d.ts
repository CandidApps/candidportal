declare module 'pdf-parse/lib/pdf-parse.js' {
  function pdfParse(data: Buffer): Promise<{ text: string; numpages?: number }>;
  export default pdfParse;
}
