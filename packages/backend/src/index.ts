import { config } from "./config/env";
import { logger } from "./utils/logger";
import { assertTopology } from "./queues/topology";
import { startAPIServer } from "./api/server";
import { startBalanceWatcher } from "./services/balance-watcher";
import { startDeployWorker } from "./services/deploy-worker";
import { startSettleWorker } from "./services/settle-worker";

async function main(): Promise<void> {
  const run = {
    api: config.RUN_API,
    watcher: config.RUN_BALANCE_WATCHER,
    deploy: config.RUN_DEPLOY_WORKER,
    settle: config.RUN_SETTLE_WORKER,
  };

  // Default: run everything if no toggle enabled
  if (!run.api && !run.watcher && !run.deploy && !run.settle) {
    run.api = true;
    run.watcher = true;
    run.deploy = true;
    run.settle = true;
  }

  logger.info({ run }, "Universal Deposit backend starting");

  // RabbitMQ topology for workers (safe to assert even if API only)
  await assertTopology();

  const tasks: Promise<void>[] = [];
  if (run.api) tasks.push(startAPIServer());
  if (run.watcher) tasks.push(startBalanceWatcher());
  if (run.deploy) tasks.push(startDeployWorker());
  if (run.settle) tasks.push(startSettleWorker());

  await Promise.all(tasks);
}

main().catch((err) => {
  logger.error({ err }, "Fatal error in backend");
  process.exit(1);
});
