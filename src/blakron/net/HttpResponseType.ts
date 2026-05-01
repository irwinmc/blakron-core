export const HttpResponseType = {
	TEXT: 'text',
	ARRAY_BUFFER: 'arraybuffer',
} as const;

export type HttpResponseType = (typeof HttpResponseType)[keyof typeof HttpResponseType];
