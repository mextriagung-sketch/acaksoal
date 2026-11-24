import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import type {
  ExamVariant,
  ParsedExamData,
  ShuffleConfig,
  ShuffledQuestion,
} from '../types/exam';

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Sanitize characters outside Windows-1252/Latin-1 range for jsPDF standard Type1 fonts
function cleanPdfText(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--')
    .replace(/\u2026/g, '...')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2260/g, '!=')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u221A/g, 'sqrt')
    .replace(/\u00B2/g, '^2')
    .replace(/\u00B3/g, '^3')
    .replace(/\u2022/g, '-');
}

// ============================================================================
// PDF EXPORTER (jsPDF)
// ============================================================================

export function buildVariantPdfBlob(
  exam: ParsedExamData,
  variant: ExamVariant,
  config: ShuffleConfig
): Blob {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 16;
  const marginTop = 15;
  const footerReserved = 14;
  const maxY = pageHeight - footerReserved;
  const contentWidth = pageWidth - marginX * 2; // 178mm

  let y = marginTop;

  // --- KOP NASKAH UJIAN ---
  // Kode Paket box on top right
  const badgeW = 30;
  const badgeH = 12;
  const badgeX = pageWidth - marginX - badgeW;
  const badgeY = marginTop;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.rect(badgeX, badgeY, badgeW, badgeH);
  doc.setFont('times', 'bold');
  doc.setFontSize(8);
  doc.text('KODE NASKAH', badgeX + badgeW / 2, badgeY + 4.3, { align: 'center' });
  doc.setFontSize(11);
  doc.text(cleanPdfText(variant.label.toUpperCase()), badgeX + badgeW / 2, badgeY + 9.8, {
    align: 'center',
  });

  const headerTextWidth = contentWidth - badgeW - 6;
  const headerCenterX = marginX + headerTextWidth / 2;

  doc.setFont('times', 'bold');
  doc.setFontSize(12.5);
  const schoolLines = doc.splitTextToSize(
    cleanPdfText((exam.header.schoolName || 'SEKOLAH MENENGAH').toUpperCase()),
    headerTextWidth
  );
  doc.text(schoolLines, headerCenterX, y + 4, { align: 'center' });
  y += schoolLines.length * 5.2 + 1;

  doc.setFontSize(11);
  const titleLines = doc.splitTextToSize(
    cleanPdfText((exam.header.examTitle || 'UJIAN SEKOLAH').toUpperCase()),
    headerTextWidth
  );
  doc.text(titleLines, headerCenterX, y + 3.5, { align: 'center' });
  y += titleLines.length * 4.8 + 1;

  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  const metaParts = [
    exam.header.subject ? `Mapel: ${exam.header.subject}` : '',
    exam.header.gradeLevel ? `Kelas: ${exam.header.gradeLevel}` : '',
    exam.header.academicYear ? `TA: ${exam.header.academicYear}` : '',
    exam.header.duration ? `Waktu: ${exam.header.duration}` : '',
  ].filter(Boolean);
  const metaLine = cleanPdfText(metaParts.join('  |  '));
  const metaWrapped = doc.splitTextToSize(metaLine, headerTextWidth);
  doc.text(metaWrapped, headerCenterX, y + 3, { align: 'center' });
  y += metaWrapped.length * 4.2 + 2;

  y = Math.max(y, badgeY + badgeH + 3);

  // Double horizontal rule
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.7);
  doc.line(marginX, y, pageWidth - marginX, y);
  doc.setLineWidth(0.25);
  doc.line(marginX, y + 1.1, pageWidth - marginX, y + 1.1);
  y += 5;

  // --- IDENTITAS PESERTA ---
  if (config.showStudentIdentityBox) {
    const boxH = 16;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.rect(marginX, y, contentWidth, boxH);
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.text('Nama Lengkap : ......................................................', marginX + 3, y + 6);
    doc.text('Kelas / Ruang : ..............................', marginX + 102, y + 6);
    doc.text('No. Peserta    : ......................................................', marginX + 3, y + 12.5);
    doc.text('Tanggal Ujian : ..............................', marginX + 102, y + 12.5);
    y += boxH + 4;
  }

  // --- PETUNJUK UMUM ---
  if (exam.header.instructions?.trim()) {
    doc.setFont('times', 'bold');
    doc.setFontSize(9.5);
    doc.text('PETUNJUK UMUM:', marginX, y + 3);
    y += 4.5;
    doc.setFont('times', 'normal');
    doc.setFontSize(9);
    const instrLines = doc.splitTextToSize(
      cleanPdfText(exam.header.instructions.trim()),
      contentWidth
    );
    doc.text(instrLines, marginX, y + 2.5);
    y += instrLines.length * 4 + 3;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 5;
  }

  // --- QUESTIONS FLOW (1 or 2 columns) ---
  const isTwoCol = config.columns === 2;
  const colGap = 8;
  const colWidth = isTwoCol ? (contentWidth - colGap) / 2 : contentWidth;
  let currentCol = 0;
  let colStartY = y;
  let colY = y;

  const drawColumnDivider = (topY: number, bottomY: number) => {
    if (!isTwoCol) return;
    const midX = marginX + colWidth + colGap / 2;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(midX, topY, midX, bottomY);
  };

  const advanceColumnOrPage = (neededHeight: number) => {
    if (colY + neededHeight <= maxY) return;
    if (isTwoCol && currentCol === 0) {
      drawColumnDivider(colStartY, maxY);
      currentCol = 1;
      colY = colStartY;
    } else {
      if (isTwoCol) {
        drawColumnDivider(colStartY, Math.min(maxY, colY));
      }
      doc.addPage();
      currentCol = 0;
      colStartY = marginTop;
      colY = marginTop;
    }
  };

  let lastSection = '';
  const lineH = 4.4;
  const numIndent = 6.5;
  const optIndent = 12;

  variant.questions.forEach((q) => {
    const sectionLabel =
      q.sectionTitle?.trim() ||
      (q.type === 'multiple_choice' ? 'Bagian I: Pilihan Ganda' : 'Bagian II: Uraian');

    // Measure question block height to prevent awkward mid-question splits
    doc.setFont('times', 'normal');
    doc.setFontSize(10);

    const showSection = sectionLabel && sectionLabel !== lastSection;
    const sectionH = showSection ? 8 : 0;

    const passageLines = q.passage?.trim()
      ? doc.splitTextToSize(cleanPdfText(q.passage.trim()), colWidth - numIndent)
      : [];
    const passageH = passageLines.length > 0 ? passageLines.length * 4.1 + 2.5 : 0;

    const stemLines = doc.splitTextToSize(cleanPdfText(q.stem), colWidth - numIndent);
    const stemH = stemLines.length * lineH + 1.5;

    const optBlockLines = q.options.map((opt) => {
      const wrapped = doc.splitTextToSize(cleanPdfText(opt.text), colWidth - optIndent);
      return { label: opt.label, lines: wrapped };
    });
    const optsH = optBlockLines.reduce((acc, o) => acc + o.lines.length * lineH + 0.8, 0);
    const essaySpaceH = q.type === 'essay' ? 6 : 0;

    const totalBlockH = sectionH + passageH + stemH + optsH + essaySpaceH + 3;

    // Only jump if block fits inside a single column/page; otherwise flow normally
    if (totalBlockH < maxY - marginTop) {
      advanceColumnOrPage(totalBlockH);
    } else {
      advanceColumnOrPage(sectionH + 16);
    }

    const colX = marginX + (isTwoCol ? currentCol * (colWidth + colGap) : 0);

    if (showSection) {
      lastSection = sectionLabel;
      doc.setFont('times', 'bold');
      doc.setFontSize(10);
      doc.setFillColor(241, 245, 249);
      doc.rect(colX, colY, colWidth, 6, 'F');
      doc.text(cleanPdfText(sectionLabel.toUpperCase()), colX + 2, colY + 4.2);
      colY += 8.2;
    }

    if (passageLines.length > 0) {
      doc.setFont('times', 'italic');
      doc.setFontSize(9.2);
      doc.text(passageLines, colX + numIndent, colY + 3.2);
      colY += passageLines.length * 4.1 + 2;
    }

    // Question number + stem
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text(`${q.displayNumber}.`, colX, colY + 3.5);

    doc.setFont('times', 'normal');
    stemLines.forEach((line: string, idx: number) => {
      if (colY + lineH > maxY) {
        advanceColumnOrPage(lineH + 4);
      }
      const drawX = marginX + (isTwoCol ? currentCol * (colWidth + colGap) : 0);
      doc.text(line, drawX + numIndent, colY + 3.5);
      colY += lineH;
      if (idx === stemLines.length - 1) {
        colY += 1.2;
      }
    });

    // Options
    if (q.type === 'multiple_choice' && optBlockLines.length > 0) {
      optBlockLines.forEach((opt) => {
        if (colY + opt.lines.length * lineH > maxY) {
          advanceColumnOrPage(opt.lines.length * lineH + 2);
        }
        const drawX = marginX + (isTwoCol ? currentCol * (colWidth + colGap) : 0);
        doc.setFont('times', 'bold');
        doc.setFontSize(9.8);
        doc.text(`${opt.label}.`, drawX + numIndent, colY + 3.4);

        doc.setFont('times', 'normal');
        opt.lines.forEach((oLine: string) => {
          doc.text(oLine, drawX + optIndent, colY + 3.4);
          colY += lineH;
        });
        colY += 0.6;
      });
    } else if (q.type === 'essay') {
      colY += 4;
    }

    colY += 2.8;
  });

  if (isTwoCol && currentCol === 1) {
    drawColumnDivider(colStartY, Math.min(maxY, colY));
  }

  // --- OPTIONAL ANSWER KEY PAGE ---
  if (config.includeAnswerKeyPage) {
    doc.addPage();
    let ky = marginTop;

    doc.setFont('times', 'bold');
    doc.setFontSize(12);
    doc.text(
      cleanPdfText(`KUNCI JAWABAN & PEMETAAN SOAL — ${variant.label.toUpperCase()}`),
      marginX,
      ky + 4
    );
    ky += 7;
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.text(
      cleanPdfText(
        `${exam.header.examTitle || 'Ujian Sekolah'} | ${exam.header.subject || ''} | Kelas ${exam.header.gradeLevel || '-'}`
      ),
      marginX,
      ky + 3
    );
    ky += 7;

    // Table header
    const cols = [22, 24, 38, contentWidth - 84];
    const drawKeyRow = (
      cells: string[],
      isHeader = false,
      rowHeight = 7
    ) => {
      if (ky + rowHeight > maxY) {
        doc.addPage();
        ky = marginTop;
      }
      let cx = marginX;
      cells.forEach((text, i) => {
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.25);
        if (isHeader) {
          doc.setFillColor(241, 245, 249);
          doc.rect(cx, ky, cols[i], rowHeight, 'FD');
          doc.setFont('times', 'bold');
        } else {
          doc.rect(cx, ky, cols[i], rowHeight, 'D');
          doc.setFont('times', i === 3 ? 'bold' : 'normal');
        }
        doc.setFontSize(9.2);
        const wrapped = doc.splitTextToSize(cleanPdfText(text), cols[i] - 4);
        doc.text(wrapped[0] || '', cx + 2, ky + 4.8);
        cx += cols[i];
      });
      ky += rowHeight;
    };

    drawKeyRow(['No. Paket', 'No. Asli', 'Jenis Soal', 'Kunci Jawaban'], true, 7.5);
    variant.questions.forEach((q) => {
      const jenis = q.type === 'multiple_choice' ? 'Pilihan Ganda' : 'Uraian';
      const kunci =
        q.type === 'multiple_choice'
          ? q.remappedCorrectAnswer || '-'
          : q.correctAnswer
            ? q.correctAnswer.slice(0, 58) + (q.correctAnswer.length > 58 ? '...' : '')
            : '(Rubrik Uraian)';
      drawKeyRow([String(q.displayNumber), String(q.originalNumber), jenis, kunci], false, 6.8);
    });
  }

  // Add page numbers on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 11, pageWidth - marginX, pageHeight - 11);
    doc.setFont('times', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      cleanPdfText(`${exam.header.subject || 'Naskah Ujian'} · ${variant.label}`),
      marginX,
      pageHeight - 6.5
    );
    doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - marginX, pageHeight - 6.5, {
      align: 'right',
    });
    doc.setTextColor(0, 0, 0);
  }

  return doc.output('blob');
}

export function buildMasterKeyPdfBlob(
  exam: ParsedExamData,
  variants: ExamVariant[]
): Blob {
  const doc = new jsPDF({
    orientation: variants.length > 4 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const maxY = pageHeight - 16;
  let y = 16;

  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text('MATRIKS KUNCI JAWABAN LINTAS PAKET', marginX, y);
  y += 6;
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.text(
    cleanPdfText(
      `${exam.header.schoolName} — ${exam.header.examTitle} (${exam.header.subject} · Kelas ${exam.header.gradeLevel})`
    ),
    marginX,
    y
  );
  y += 8;

  const usableW = pageWidth - marginX * 2;
  const fixedCols = 40; // No Asli (18) + Kunci Asli (22)
  const varColW = Math.max(22, (usableW - fixedCols) / Math.max(1, variants.length));

  const drawRow = (cells: string[], header = false) => {
    const h = 7;
    if (y + h > maxY) {
      doc.addPage();
      y = 16;
    }
    let cx = marginX;
    cells.forEach((val, idx) => {
      const w = idx === 0 ? 18 : idx === 1 ? 22 : varColW;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      if (header) {
        doc.setFillColor(241, 245, 249);
        doc.rect(cx, y, w, h, 'FD');
        doc.setFont('times', 'bold');
      } else {
        doc.rect(cx, y, w, h, 'D');
        doc.setFont('times', idx === 1 ? 'bold' : 'normal');
      }
      doc.setFontSize(9);
      doc.text(cleanPdfText(val), cx + w / 2, y + 4.8, { align: 'center' });
      cx += w;
    });
    y += h;
  };

  drawRow(['Asli', 'Kunci', ...variants.map((v) => v.label)], true);

  exam.questions.forEach((origQ) => {
    const rowCells = [
      String(origQ.originalNumber),
      origQ.type === 'multiple_choice' ? origQ.correctAnswer || '-' : 'Uraian',
    ];
    variants.forEach((v) => {
      const match = v.questions.find((sq) => sq.id === origQ.id);
      if (!match) {
        rowCells.push('-');
      } else if (match.type === 'multiple_choice') {
        rowCells.push(`No.${match.displayNumber} (${match.remappedCorrectAnswer || '-'})`);
      } else {
        rowCells.push(`No.${match.displayNumber}`);
      }
    });
    drawRow(rowCells, false);
  });

  // Ringkasan kunci per paket untuk koreksi cepat
  y += 10;
  variants.forEach((v) => {
    const mcqs = v.questions.filter((q) => q.type === 'multiple_choice');
    if (mcqs.length === 0) return;
    if (y + 18 > maxY) {
      doc.addPage();
      y = 16;
    }
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    doc.text(cleanPdfText(`Rekap Kunci ${v.label}:`), marginX, y);
    y += 5;
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    const summary = mcqs
      .map((q) => `${q.displayNumber}.${q.remappedCorrectAnswer || '-'}`)
      .join('   ');
    const lines = doc.splitTextToSize(cleanPdfText(summary), usableW);
    doc.text(lines, marginX, y);
    y += lines.length * 4.5 + 4;
  });

  return doc.output('blob');
}

// ============================================================================
// WORD (.DOCX) EXPORTER (docx)
// ============================================================================

function buildQuestionParagraphs(questions: ShuffledQuestion[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let lastSection = '';

  questions.forEach((q) => {
    const sectionLabel =
      q.sectionTitle?.trim() ||
      (q.type === 'multiple_choice' ? 'Bagian I: Pilihan Ganda' : 'Bagian II: Uraian');

    if (sectionLabel && sectionLabel !== lastSection) {
      lastSection = sectionLabel;
      paragraphs.push(
        new Paragraph({
          spacing: { before: 180, after: 100 },
          shading: {
            type: ShadingType.CLEAR,
            color: 'auto',
            fill: 'F1F5F9',
          },
          keepNext: true,
          children: [
            new TextRun({
              text: sectionLabel.toUpperCase(),
              bold: true,
              font: 'Times New Roman',
              size: 21, // 10.5pt
            }),
          ],
        })
      );
    }

    if (q.passage?.trim()) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: 360 },
          keepNext: true,
          children: [
            new TextRun({
              text: q.passage.trim(),
              italics: true,
              font: 'Times New Roman',
              size: 20, // 10pt
            }),
          ],
        })
      );
    }

    paragraphs.push(
      new Paragraph({
        spacing: { before: 100, after: 40 },
        indent: { left: 360, hanging: 360 },
        keepLines: true,
        keepNext: q.options.length > 0,
        children: [
          new TextRun({
            text: `${q.displayNumber}.\t`,
            bold: true,
            font: 'Times New Roman',
            size: 22, // 11pt
          }),
          new TextRun({
            text: q.stem,
            font: 'Times New Roman',
            size: 22,
          }),
        ],
      })
    );

    if (q.type === 'multiple_choice' && q.options.length > 0) {
      q.options.forEach((opt, idx) => {
        const isLastOpt = idx === q.options.length - 1;
        paragraphs.push(
          new Paragraph({
            spacing: { before: 20, after: isLastOpt ? 100 : 20 },
            indent: { left: 720, hanging: 360 },
            keepLines: true,
            children: [
              new TextRun({
                text: `${opt.label}.\t`,
                bold: true,
                font: 'Times New Roman',
                size: 21,
              }),
              new TextRun({
                text: opt.text,
                font: 'Times New Roman',
                size: 21,
              }),
            ],
          })
        );
      });
    } else if (q.type === 'essay') {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 40, after: 140 },
          children: [new TextRun({ text: '', size: 16 })],
        })
      );
    }
  });

  return paragraphs;
}

export async function buildVariantDocxBlob(
  exam: ParsedExamData,
  variant: ExamVariant,
  config: ShuffleConfig
): Promise<Blob> {
  const metaParts = [
    exam.header.subject ? `Mapel: ${exam.header.subject}` : '',
    exam.header.gradeLevel ? `Kelas: ${exam.header.gradeLevel}` : '',
    exam.header.academicYear ? `TA: ${exam.header.academicYear}` : '',
    exam.header.duration ? `Waktu: ${exam.header.duration}` : '',
  ]
    .filter(Boolean)
    .join('   |   ');

  const kopTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.DOUBLE, size: 8, color: '0F172A' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 80, type: WidthType.PERCENTAGE },
            margins: { bottom: 120 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: (exam.header.schoolName || 'SEKOLAH MENENGAH').toUpperCase(),
                    bold: true,
                    font: 'Times New Roman',
                    size: 26,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 40 },
                children: [
                  new TextRun({
                    text: (exam.header.examTitle || 'UJIAN SEKOLAH').toUpperCase(),
                    bold: true,
                    font: 'Times New Roman',
                    size: 23,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 40 },
                children: [
                  new TextRun({
                    text: metaParts,
                    font: 'Times New Roman',
                    size: 19,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            margins: { bottom: 120 },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 6, color: '0F172A' },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: '0F172A' },
              left: { style: BorderStyle.SINGLE, size: 6, color: '0F172A' },
              right: { style: BorderStyle.SINGLE, size: 6, color: '0F172A' },
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 60 },
                children: [
                  new TextRun({
                    text: 'KODE NASKAH',
                    bold: true,
                    font: 'Times New Roman',
                    size: 16,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 40, after: 60 },
                children: [
                  new TextRun({
                    text: variant.label.toUpperCase(),
                    bold: true,
                    font: 'Times New Roman',
                    size: 24,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const headerChildren: (Paragraph | Table)[] = [kopTable];

  if (config.showStudentIdentityBox) {
    headerChildren.push(
      new Paragraph({ spacing: { before: 120, after: 0 }, children: [] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
          left: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
          right: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 55, type: WidthType.PERCENTAGE },
                margins: { top: 80, bottom: 40, left: 120, right: 80 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'Nama Lengkap : ..................................................',
                        font: 'Times New Roman',
                        size: 20,
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 45, type: WidthType.PERCENTAGE },
                margins: { top: 80, bottom: 40, left: 80, right: 120 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'Kelas / Ruang : ..............................',
                        font: 'Times New Roman',
                        size: 20,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                width: { size: 55, type: WidthType.PERCENTAGE },
                margins: { top: 40, bottom: 80, left: 120, right: 80 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'No. Peserta    : ..................................................',
                        font: 'Times New Roman',
                        size: 20,
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                width: { size: 45, type: WidthType.PERCENTAGE },
                margins: { top: 40, bottom: 80, left: 80, right: 120 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'Tanggal Ujian : ..............................',
                        font: 'Times New Roman',
                        size: 20,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  }

  if (exam.header.instructions?.trim()) {
    headerChildren.push(
      new Paragraph({
        spacing: { before: 140, after: 40 },
        children: [
          new TextRun({
            text: 'PETUNJUK UMUM:',
            bold: true,
            font: 'Times New Roman',
            size: 20,
          }),
        ],
      })
    );
    exam.header.instructions
      .trim()
      .split('\n')
      .forEach((line) => {
        if (!line.trim()) return;
        headerChildren.push(
          new Paragraph({
            spacing: { before: 20, after: 20 },
            children: [
              new TextRun({
                text: line.trim(),
                font: 'Times New Roman',
                size: 19,
              }),
            ],
          })
        );
      });
  }

  const sharedFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: `${exam.header.subject || 'Naskah Ujian'} · ${variant.label}   |   Halaman `,
            font: 'Times New Roman',
            size: 17,
            color: '64748B',
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: 'Times New Roman',
            size: 17,
            color: '64748B',
          }),
          new TextRun({
            text: ' dari ',
            font: 'Times New Roman',
            size: 17,
            color: '64748B',
          }),
          new TextRun({
            children: [PageNumber.TOTAL_PAGES],
            font: 'Times New Roman',
            size: 17,
            color: '64748B',
          }),
        ],
      }),
    ],
  });

  const pageMargins = { top: 850, bottom: 850, left: 950, right: 950 };
  const pageSize = { width: 11906, height: 16838 }; // A4

  const sections: any[] = [
    {
      properties: {
        page: { size: pageSize, margin: pageMargins },
      },
      footers: { default: sharedFooter },
      children: headerChildren,
    },
    {
      properties: {
        type: SectionType.CONTINUOUS,
        page: { size: pageSize, margin: pageMargins },
        column:
          config.columns === 2
            ? { count: 2, space: 480, separate: true }
            : { count: 1, space: 0, separate: false },
      },
      footers: { default: sharedFooter },
      children: buildQuestionParagraphs(variant.questions),
    },
  ];

  if (config.includeAnswerKeyPage) {
    const keyRows = [
      new TableRow({
        tableHeader: true,
        children: ['No. Paket', 'No. Asli', 'Jenis Soal', 'Kunci Jawaban'].map(
          (title) =>
            new TableCell({
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F5F9' },
              margins: { top: 80, bottom: 80, left: 100, right: 100 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: title,
                      bold: true,
                      font: 'Times New Roman',
                      size: 20,
                    }),
                  ],
                }),
              ],
            })
        ),
      }),
      ...variant.questions.map(
        (q) =>
          new TableRow({
            children: [
              String(q.displayNumber),
              String(q.originalNumber),
              q.type === 'multiple_choice' ? 'Pilihan Ganda' : 'Uraian',
              q.type === 'multiple_choice'
                ? q.remappedCorrectAnswer || '-'
                : q.correctAnswer || '(Rubrik Uraian)',
            ].map(
              (val, idx) =>
                new TableCell({
                  margins: { top: 60, bottom: 60, left: 100, right: 100 },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: val,
                          bold: idx === 3,
                          font: 'Times New Roman',
                          size: 19,
                        }),
                      ],
                    }),
                  ],
                })
            ),
          })
      ),
    ];

    sections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pageSize, margin: pageMargins },
      },
      footers: { default: sharedFooter },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: `KUNCI JAWABAN & PEMETAAN SOAL — ${variant.label.toUpperCase()}`,
              bold: true,
              font: 'Times New Roman',
              size: 24,
            }),
          ],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: keyRows,
        }),
      ],
    });
  }

  const doc = new Document({ sections });
  return Packer.toBlob(doc);
}

export async function buildMasterKeyDocxBlob(
  exam: ParsedExamData,
  variants: ExamVariant[]
): Promise<Blob> {
  const headerTitles = ['No. Asli', 'Kunci Asli', ...variants.map((v) => v.label)];
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: headerTitles.map(
        (t) =>
          new TableCell({
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F1F5F9' },
            margins: { top: 80, bottom: 80, left: 80, right: 80 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: t,
                    bold: true,
                    font: 'Times New Roman',
                    size: 19,
                  }),
                ],
              }),
            ],
          })
      ),
    }),
    ...exam.questions.map((origQ) => {
      const cells = [
        String(origQ.originalNumber),
        origQ.type === 'multiple_choice' ? origQ.correctAnswer || '-' : 'Uraian',
        ...variants.map((v) => {
          const match = v.questions.find((sq) => sq.id === origQ.id);
          if (!match) return '-';
          return match.type === 'multiple_choice'
            ? `No.${match.displayNumber} (${match.remappedCorrectAnswer || '-'})`
            : `No.${match.displayNumber}`;
        }),
      ];
      return new TableRow({
        children: cells.map(
          (val, idx) =>
            new TableCell({
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: val,
                      bold: idx === 1,
                      font: 'Times New Roman',
                      size: 19,
                    }),
                  ],
                }),
              ],
            })
        ),
      });
    }),
  ];

  const summaryParagraphs: Paragraph[] = [];
  variants.forEach((v) => {
    const mcqs = v.questions.filter((q) => q.type === 'multiple_choice');
    if (mcqs.length === 0) return;
    summaryParagraphs.push(
      new Paragraph({
        spacing: { before: 180, after: 40 },
        children: [
          new TextRun({
            text: `Rekap Kunci ${v.label}:`,
            bold: true,
            font: 'Times New Roman',
            size: 21,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: mcqs.map((q) => `${q.displayNumber}.${q.remappedCorrectAnswer || '-'}`).join('   '),
            font: 'Times New Roman',
            size: 20,
          }),
        ],
      })
    );
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 850, bottom: 850, left: 950, right: 950 },
          },
        },
        children: [
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: 'MATRIKS KUNCI JAWABAN LINTAS PAKET',
                bold: true,
                font: 'Times New Roman',
                size: 26,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 180 },
            children: [
              new TextRun({
                text: `${exam.header.schoolName} — ${exam.header.examTitle} (${exam.header.subject} · Kelas ${exam.header.gradeLevel})`,
                font: 'Times New Roman',
                size: 20,
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }),
          new Paragraph({ children: [new PageBreak()] }),
          ...summaryParagraphs,
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

// ============================================================================
// BULK ZIP EXPORTER
// ============================================================================

export async function exportAllVariantsZip(
  exam: ParsedExamData,
  variants: ExamVariant[],
  config: ShuffleConfig,
  format: 'pdf' | 'docx' | 'both'
): Promise<void> {
  const zip = new JSZip();
  const baseName = sanitizeFileName(exam.header.subject || exam.header.examTitle || 'Naskah_Ujian');

  for (const variant of variants) {
    const vSlug = sanitizeFileName(variant.label);
    if (format === 'pdf' || format === 'both') {
      const pdfBlob = buildVariantPdfBlob(exam, variant, config);
      zip.file(`${baseName}_${vSlug}.pdf`, pdfBlob);
    }
    if (format === 'docx' || format === 'both') {
      const docxBlob = await buildVariantDocxBlob(exam, variant, config);
      zip.file(`${baseName}_${vSlug}.docx`, docxBlob);
    }
  }

  if (format === 'pdf' || format === 'both') {
    zip.file(`${baseName}_Kunci_Jawaban_Master.pdf`, buildMasterKeyPdfBlob(exam, variants));
  }
  if (format === 'docx' || format === 'both') {
    zip.file(
      `${baseName}_Kunci_Jawaban_Master.docx`,
      await buildMasterKeyDocxBlob(exam, variants)
    );
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const suffix = format === 'both' ? 'PDF_dan_Word' : format.toUpperCase();
  triggerBlobDownload(zipBlob, `${baseName}_Semua_Paket_${suffix}.zip`);
}
