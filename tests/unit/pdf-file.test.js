const {
  hasPdfSignature,
  isPdfName,
  sanitizeOriginalName,
} = require('../../src/utils/pdf-file');

describe('segurança compartilhada de PDF', () => {
  it('aceita somente assinatura PDF no byte zero', () => {
    expect(hasPdfSignature(Buffer.from('%PDF-1.7\n'))).toBe(true);
    expect(hasPdfSignature(Buffer.from('texto%PDF-1.7'))).toBe(false);
    expect(hasPdfSignature(Buffer.from('MZ%PDF-1.7'))).toBe(false);
    expect(hasPdfSignature(Buffer.from('<html>%PDF-1.7'))).toBe(false);
    expect(hasPdfSignature(Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.from('%PDF-1.7'),
    ]))).toBe(false);
  });

  it('valida extensão e sanitiza o nome original', () => {
    expect(isPdfName('EXAME.PDF')).toBe(true);
    expect(isPdfName('exame.pdf.exe')).toBe(false);
    expect(sanitizeOriginalName('../../\u0000exame.pdf')).toBe('exame.pdf');
  });
});
