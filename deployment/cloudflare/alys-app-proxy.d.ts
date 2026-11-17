declare const worker: {fetch(request: Request, env: {ALYS_NETLIFY_ORIGIN?: string}): Promise<Response>};
export default worker;
