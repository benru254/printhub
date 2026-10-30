// Turns what the customer picked into one PDF the tools can use.
//   - one PDF                -> used as it is
//   - one or more pictures   -> one page per picture (2 pictures = front + back)

import { imagesToPdf, readImageDpi, readJpegOrientation, sniffFormat } from '@engine';

const MAX_MB = 80; // phones run out of memory on bigger files
const MAX_IMAGES = 20;

export async function loadFiles(fileList) {
  const files = [...fileList];
  if (!files.length) throw new Error('No file chosen.');

  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_MB * 1048576) {
    throw new Error(`These files are ${Math.round(total / 1048576)} MB. Over ${MAX_MB} MB can crash phones. Try a smaller export.`);
  }

  const read = await Promise.all(
    files.map(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { file, bytes, format: sniffFormat(bytes) };
    })
  );

  const pdfs = read.filter((r) => r.format === 'pdf');
  const pictures = read.filter((r) => r.format !== 'pdf');

  if (pdfs.length && (pdfs.length > 1 || pictures.length)) {
    throw new Error('Choose one PDF, or one or more pictures (JPG, PNG). Not a mix.');
  }

  if (pdfs.length) {
    return { name: baseName(pdfs[0].file.name), sourceType: 'pdf', fileSize: total, fileCount: 1, bytes: pdfs[0].bytes, imageInfo: null };
  }

  if (pictures.length > MAX_IMAGES) throw new Error(`Choose up to ${MAX_IMAGES} pictures at a time.`);

  const items = [];
  for (const r of pictures) items.push(await preparePicture(r));
  const { bytes, info } = await imagesToPdf(items);

  const name = baseName(pictures[0].file.name) + (pictures.length > 1 ? ` + ${pictures.length - 1} more` : '');
  return { name, sourceType: 'images', fileSize: total, fileCount: pictures.length, bytes, imageInfo: info };
}

async function preparePicture({ file, bytes, format }) {
  const name = file.name;
  if (format === 'heic') {
    throw new Error(`"${name}" is an iPhone HEIC photo. Send it as JPG instead (iPhone: Settings → Camera → Formats → Most Compatible).`);
  }
  if (format === 'unknown') throw new Error(`"${name}" is not a PDF or a picture we can read.`);
  if (format === 'png') return { bytes, format: 'png', name };
  if (format === 'jpg' && readJpegOrientation(bytes) === 1) return { bytes, format: 'jpg', name };

  // Sideways phone photo, WebP, GIF or BMP: redraw it upright as JPG/PNG.
  const dpi = format === 'jpg' ? readImageDpi(bytes, 'jpg') : null;
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`"${name}" could not be opened. Try saving it again as JPG or PNG.`);
  }
  const asJpg = format === 'jpg';
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (asJpg) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  if (bitmap.close) bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, asJpg ? 'image/jpeg' : 'image/png', 0.95));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), format: asJpg ? 'jpg' : 'png', name, dpi };
}

function baseName(name) {
  return name.replace(/\.[a-z0-9]+$/i, '');
}

export function fileSizeText(bytes) {
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
