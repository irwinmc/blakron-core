export const StageScaleMode = {
	EXACT_FIT: 'exactFit',
	SHOW_ALL: 'showAll',
	NO_SCALE: 'noScale',
	NO_BORDER: 'noBorder',
	FIXED_WIDTH: 'fixedWidth',
	FIXED_HEIGHT: 'fixedHeight',
} as const;

export type StageScaleMode = (typeof StageScaleMode)[keyof typeof StageScaleMode];
