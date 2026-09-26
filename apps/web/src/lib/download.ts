export function clickDownload(href: string, filename: string, newTab = false) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  if (newTab) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadRemoteImage(url: string, filename: string) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(String(res.status));
    const href = URL.createObjectURL(await res.blob());
    clickDownload(href, filename);
    URL.revokeObjectURL(href);
  } catch {
    clickDownload(url, filename, true);
  }
}

export type SvgToPngOptions = {
  background: string;
  scale?: number;
  caption?: string;
  legend?: ReadonlyArray<{ label: string; color: string }>;
};

const CAPTION_BAND = 26;
const LEGEND_BAND = 24;

export async function svgToPngBlob(
  svg: SVGSVGElement,
  { background, scale = 2, caption, legend = [] }: SvgToPngOptions,
): Promise<Blob> {
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not rasterise the chart'));
      image.src = url;
    });

    const top = caption ? CAPTION_BAND : 0;
    const bottom = legend.length ? LEGEND_BAND : 0;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round((height + top + bottom) * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');
    ctx.scale(scale, scale);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, top, width, height);

    if (caption) {
      ctx.fillStyle = '#e8a04a';
      ctx.font = '600 14px Segoe UI, Tahoma, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(caption, 12, top / 2);
    }

    if (legend.length) {
      const y = top + height + LEGEND_BAND / 2;
      ctx.font = '500 12px Segoe UI, Tahoma, sans-serif';
      ctx.textBaseline = 'middle';
      let x = 12;
      for (const item of legend) {
        ctx.fillStyle = item.color;
        ctx.fillRect(x, y - 4, 10, 8);
        x += 15;
        ctx.fillStyle = '#c8ced4';
        ctx.fillText(item.label, x, y);
        x += ctx.measureText(item.label).width + 18;
      }
    }

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG'))),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
