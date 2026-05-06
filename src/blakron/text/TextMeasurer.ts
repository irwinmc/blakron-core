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
/**
 * Measures the baseline offset from a line's top needed for `textBaseline='alphabetic'` rendering
 * with vertical middle alignment.
 *
 * Using `textBaseline='alphabetic'` ensures consistent positioning across browsers and OSes,
 * because `actualBoundingBoxAscent/Descent` (from the alphabetic baseline) do NOT vary when
 * the OS substitutes a different font (e.g. iOS Safari maps "Arial" → SF Pro), unlike
 * `fontBoundingBoxAscent` which does.
 *
 * For middle alignment, the glyph visual center should land at `lineHeight / 2`:
 *   glyph center from baseline = (abbDescent - abbAscent) / 2
 *   baseline = lineTop + lineHeight/2 + (abbAscent - abbDescent) / 2
 *
 * @returns Baseline offset from line top, in pixels.
 */
export function measureBaselineOffset(
	text: string,
	fontFamily: string,
	fontSize: number,
	bold: boolean,
	italic: boolean,
): number {
	const ctx = getContext();
	ctx.font = buildFontString(fontSize, fontFamily, bold, italic);
	const metrics = ctx.measureText(text || 'Mg');
	const abbAscent = metrics.actualBoundingBoxAscent;
	const abbDescent = metrics.actualBoundingBoxDescent;

	return fontSize / 2 + (abbAscent - abbDescent) / 2;
}

/**
 * Measures the baseline offset from a line's top needed for `textBaseline='alphabetic'` rendering
 * with vertical top alignment.
 *
 * The glyph top should align with the line top:
 *   glyph top = baseline - abbAscent = lineTop
 *   baseline = lineTop + abbAscent
 *
 * @returns Baseline offset from line top (= actualBoundingBoxAscent).
 */
export function measureAscentOffset(
	text: string,
	fontFamily: string,
	fontSize: number,
	bold: boolean,
	italic: boolean,
): number {
	const ctx = getContext();
	ctx.font = buildFontString(fontSize, fontFamily, bold, italic);
	const metrics = ctx.measureText(text || 'Mg');
	return metrics.actualBoundingBoxAscent;
}
