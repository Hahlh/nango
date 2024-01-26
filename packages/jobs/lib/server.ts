import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import superjson from 'superjson';
import { z } from 'zod';
import { suspendRunner } from './runner/runner.js';
import { pauseDemoSyncs } from './background/pauseDemoSyncs.js';

export const t = initTRPC.create({
    transformer: superjson
});

const router = t.router;
const publicProcedure = t.procedure;
// TODO: add logging middleware

const appRouter = router({
    health: healthProcedure(),
    idle: idleProcedure()
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

function idleProcedure() {
    return publicProcedure.input(z.object({ runnerId: z.string().nonempty(), idleTimeMs: z.number() })).mutation(async ({ input }) => {
        const { runnerId, idleTimeMs } = input;
        console.log(`[IDLE]: runner '${runnerId}' has been idle for ${idleTimeMs}ms. Suspending...`);
        await suspendRunner(runnerId);
        return { status: 'ok' };
    });
}

// Background tasks
pauseDemoSyncs();
