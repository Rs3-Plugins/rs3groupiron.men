import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { ServerTimingInterceptor } from './server-timing.interceptor';

type FakeResponse = {
  headersSent: boolean;
  headers: Record<string, string>;
  setHeader: (name: string, value: string) => void;
};

function makeResponse(headersSent = false): FakeResponse {
  const headers: Record<string, string> = {};
  return {
    headersSent,
    headers,
    setHeader(name, value) {
      headers[name] = value;
    },
  };
}

function makeContext(response: FakeResponse, type = 'http') {
  return {
    getType: () => type,
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ExecutionContext;
}

const handlerOf = (observable: ReturnType<typeof of>) =>
  ({ handle: () => observable }) as CallHandler;

describe('ServerTimingInterceptor', () => {
  let interceptor: ServerTimingInterceptor;

  beforeEach(() => {
    interceptor = new ServerTimingInterceptor();
  });

  it('sets both timing headers on success', async () => {
    const response = makeResponse();

    await lastValueFrom(
      interceptor.intercept(makeContext(response), handlerOf(of('ok'))),
    );

    expect(response.headers['X-Response-Time-Ms']).toBeDefined();
    expect(
      Number(response.headers['X-Response-Time-Ms']),
    ).toBeGreaterThanOrEqual(0);
    expect(response.headers['Server-Timing']).toMatch(/^app;dur=[\d.]+$/);
  });

  // A slow failure is as interesting as a slow success; 5xx is where tails hide.
  it('still times a failed request', async () => {
    const response = makeResponse();

    await expect(
      lastValueFrom(
        interceptor.intercept(
          makeContext(response),
          handlerOf(throwError(() => new Error('boom'))),
        ),
      ),
    ).rejects.toThrow('boom');

    expect(response.headers['X-Response-Time-Ms']).toBeDefined();
  });

  it('does not set headers once the response has been flushed', async () => {
    const response = makeResponse(true);

    await lastValueFrom(
      interceptor.intercept(makeContext(response), handlerOf(of('ok'))),
    );

    expect(response.headers).toEqual({});
  });

  it('ignores non-http contexts', async () => {
    const response = makeResponse();

    await lastValueFrom(
      interceptor.intercept(makeContext(response, 'rpc'), handlerOf(of('ok'))),
    );

    expect(response.headers).toEqual({});
  });
});
