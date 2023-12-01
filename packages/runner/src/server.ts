import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import type { NangoProps } from '@nangohq/shared';
import { exec } from './exec.js';

const t = initTRPC.create();

// const logging = t.middleware(async (opts) => {
//     // TODO
//     console.log(`[Runner] Received: ${JSON.stringify(opts)}`);
//     const result = await opts.next();
//     return result;
// });

const router = t.router;
const publicProcedure = t.procedure; //.use(logging);

interface RunParams {
    nangoProps: NangoProps;
    isAction: boolean;
    code: string;
    codeParams?: object;
}

const appRouter = router({
    health: healthProcedure(),
    run: runProcedure()
});

export type AppRouter = typeof appRouter;

export const server = createHTTPServer({
    router: appRouter
});

function healthProcedure() {
    return publicProcedure.query(async () => {
        return { status: 'ok' };
    });
}

function runProcedure() {
    return publicProcedure
        .input((input) => input as RunParams)
        .mutation(async ({ input }) => {
            const { nangoProps, code, codeParams } = input;
            return await exec(nangoProps, input.isAction, code, codeParams);
        });
}
