-- DropIndex
DROP INDEX "Booking_idempotencyKey_key";

-- AlterTable
ALTER TABLE "Availability" ADD COLUMN     "bookings" INTEGER;

-- CreateTable
CREATE TABLE "TimeThreshold" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "schedule" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "TimeThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimeThreshold_schedule_key" ON "TimeThreshold"("schedule");
