import {
  expireDrawReservations,
} from "./expire-draws.js";

import {
  processScheduledDraws,
} from "../services/scheduled-draws.js";

async function main(): Promise<void> {
  const reservationResult =
    await expireDrawReservations();

  const scheduledResult =
    await processScheduledDraws();

  console.log(
    "Addis ዕጣ scheduled draw job completed:",
    {
      reservationsExpired:
        reservationResult.reservationsExpired,
      remindersSent:
        scheduledResult.remindersSent,
      drawsExecuted:
        scheduledResult.drawsExecuted,
      executionFailures:
        scheduledResult.executionFailures,
    },
  );

  if (
    scheduledResult.executionFailures >
    0
  ) {
    /*
     * Keep the cron run successful so Render
     * continues the schedule. Individual draw
     * failures are recorded and notified above.
     */
    console.warn(
      "One or more scheduled draws failed.",
    );
  }
}

main().catch((error) => {
  console.error(
    "Addis ዕጣ scheduled draw job failed:",
    error,
  );

  process.exitCode = 1;
});
