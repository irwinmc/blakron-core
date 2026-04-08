export const BlendMode = {
	NORMAL: 'normal',
	ADD: 'add',
	ERASE: 'erase',
} as const;

export type BlendMode = (typeof BlendMode)[keyof typeof BlendMode];

const blendModeList: BlendMode[] = ['normal', 'add', 'erase'];
const blendModeIndex: Record<string, number> = { normal: 0, add: 1, erase: 2 };

export function blendModeToNumber(blendMode: string): number {
	return blendModeIndex[blendMode] ?? 0;
}

export function numberToBlendMode(index: number): BlendMode {
	return blendModeList[index] ?? 'normal';
}
