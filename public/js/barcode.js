/** رسم باركود Code128 داخل عنصر SVG (مكتبة JsBarcode مضمّنة محلياً) */
export function drawBarcode(svgElement, code, options = {}) {
  if (!svgElement || !code) return;
  try {
    window.JsBarcode(svgElement, String(code), {
      format: 'CODE128B',
      width: options.width || 2.2,
      height: options.height || 70,
      displayValue: options.displayValue !== false,
      fontSize: options.fontSize || 16,
      font: 'Segoe UI, Tahoma, sans-serif',
      textMargin: 2,
      margin: options.margin ?? 6,
      background: options.background || '#ffffff',
      lineColor: options.lineColor || '#111111'
    });
  } catch (error) {
    console.error('barcode', error);
  }
}

/** يرسم كل عناصر <svg data-barcode="CODE"> الموجودة داخل حاوية */
export function renderBarcodes(root = document, options = {}) {
  root.querySelectorAll('svg[data-barcode]').forEach((svg) => {
    drawBarcode(svg, svg.dataset.barcode, { ...options, ...(svg.dataset.height ? { height: Number(svg.dataset.height) } : {}) });
  });
}
