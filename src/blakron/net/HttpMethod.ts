export const HttpMethod = {
	GET: 'GET',
	POST: 'POST',
} as const;

export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];
