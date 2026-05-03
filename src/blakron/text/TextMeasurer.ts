let sharedCanvas: HTMLCanvasElement | undefined;
let sharedContext: CanvasRenderingContext2D | undefined;

function getContext(): CanvasRenderingContext2D {
	if (!sharedContext) {
		sharedCanvas = document.createElement('canvas');
		sharedCanvas.width = 1;
		sharedCanvas.height = 1;
		sharedContext = sharedCanvas.getContext('2d')!;
	}
	return sharedContext;
}

function buildFontString(fontSize: number, fontFamily: string, bold: boolean, italic: boolean): string {
	let font = '';
	if (italic) font += 'italic ';
	if (bold) font += 'bold ';
	font += fontSize + 'px ';
	font += fontFamily;
	return font;
}

/**
 * Measures the width of a text string using Canvas 2D.
 */
export function measureText(
	text: string,
	fontFamily: string,
	fontSize: number,
	bold: boolean,
	italic: boolean,
): number {
	const ctx = getContext();
	ctx.font = buildFontString(fontSize, fontFamily, bold, italic);
	return ctx.measureText(text).width;
}

/**
 * Builds a CSS font string from the given parameters.
 */
export function getFontString(fontSize: number, fontFamily: string, bold: boolean, italic: boolean): string {
	return buildFontString(fontSize, fontFamily, bold, italic);
}

/**
 * Measures the vertical centering correction needed for `textBaseline='top'` rendering.
 *
 * When `textBaseline='top'`, the y coordinate is the top of the font's em-square.
 * The em-square center (`fontSize/2`) is NOT the same as the visual center of the
 * actual glyphs, because most fonts reserve more space for ascenders than descenders.
 *
 * This function returns a correction offset (in pixels) that, when added to the
 * drawing y-position, shifts the text down so that the *glyphs* are visually centered
 * instead of the em-square.
 *
 * @param text    A representative text sample (ideally with both ascenders and descenders).
 *                Falls back to 'Mg' if empty.
 * @param fontFamily Font family string.
 * @param fontSize   Font size in pixels.
 * @param bold       Bold flag.
 * @param italic     Italic flag.
 * @returns Correction in pixels (typically 0.5–2.0 for common fonts).
 */
export function measureVerticalCorrection(
	text: string,
	fontFamily: string,
	fontSize: number,
	bold: boolean,
	italic: boolean,
): number {
	const ctx = getContext();
	ctx.font = buildFontString(fontSize, fontFamily, bold, italic);
	const metrics = ctx.measureText(text || 'Mg');
	const fbbAscent = metrics.fontBoundingBoxAscent;
	const fbbDescent = metrics.fontBoundingBoxDescent;
	const abbAscent = metrics.actualBoundingBoxAscent;
	const abbDescent = metrics.actualBoundingBoxDescent;
	// Glyph visual center from top of em-square (with textBaseline='top'):
	//   fbbAscent is the distance from baseline to em-square top.
	//   Actual glyph spans from (fbbAscent - abbAscent) to (fbbAscent + abbDescent).
	//   Glyph visual center = fbbAscent - abbAscent/2 + abbDescent/2
	// Em-square center from top:
	//   fontSize / 2
	// Correction = glyphVisualCenter - emSquareCenter (positive → shift text down)
	return fbbAscent - abbAscent / 2 + abbDescent / 2 - fontSize / 2;
}
