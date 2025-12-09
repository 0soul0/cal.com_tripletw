import type { NextApiRequest } from "next";

import dayjs from "@calcom/dayjs";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import handleNewBooking from "@calcom/features/bookings/lib/handleNewBooking";
import { handleWebhookTrigger } from "@calcom/features/bookings/lib/handleWebhookTrigger";
import { BotDetectionService } from "@calcom/features/bot-detection";
import { FeaturesRepository } from "@calcom/features/flags/features.repository";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
// module "C:/Users/bill.liu/Desktop/Project/SideProject/cal.com/packages/features/bookings/lib/handleSeats/types"
import { ErrorCode } from "@calcom/lib/errorCodes";
import getIP from "@calcom/lib/getIP";``
//import type { SeatedBooking } from "@calcom/lib/handleSeats/types";
import { HttpError } from "@calcom/lib/http-error";
import { piiHasher } from "@calcom/lib/server/PiiHasher";
import { checkCfTurnstileToken } from "@calcom/lib/server/checkCfTurnstileToken";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { EventTypeRepository } from "@calcom/lib/server/repository/eventTypeRepository";
import prisma from "@calcom/prisma";
import { CreationSource } from "@calcom/prisma/enums";
import { BookingStatus, MembershipRole } from "@calcom/prisma/enums";
import { Prisma } from "@calcom/prisma/client";

type SlotTime = {
  time: string; // e.g., '2025-11-20T10:30:00.000Z'
  calculatedBookingLimit: number; // e.g., 2
  [key: string]: any; // 如果物件可能包含其他屬性
};

type SeatedBooking = Prisma.BookingGetPayload<{
  select: {
    uid: true;
    id: true;
    attendees: { include: { bookingSeat: true } };
    userId: true;
    references: true;
    startTime: true;
    user: true;
    status: true;
    smsReminderNumber: true;
    endTime: true;
  };
}>;

// type AttendeeType = {
//   id: number;
//   name: string;
//   email: string;
//   timeZone: string;
//   locale: string | null;
//   phoneNumber: string | null;
//   bookingId: number | null;
//   noShow: boolean | null;
// };

async function handler(req: NextApiRequest & { userId?: number }) {
  const userIp = getIP(req);

  if (process.env.NEXT_PUBLIC_CLOUDFLARE_USE_TURNSTILE_IN_BOOKER === "1") {
    await checkCfTurnstileToken({
      token: req.body["cfToken"] as string,
      remoteIp: userIp,
    });
  }
  const DELAY_MS = 200;
  // Check for bot detection using feature flag
  const featuresRepository = new FeaturesRepository(prisma);
  const eventTypeRepository = new EventTypeRepository(prisma);
  const botDetectionService = new BotDetectionService(featuresRepository, eventTypeRepository);

  await botDetectionService.checkBotDetection({
    eventTypeId: req.body.eventTypeId,
    headers: req.headers,
  });

  await checkRateLimitAndThrowError({
    rateLimitingType: "core",
    identifier: piiHasher.hash(userIp),
  });

  const session = await getServerSession({ req });
  /* To mimic API behavior and comply with types */
  req.body = {
    ...req.body,
    creationSource: CreationSource.WEBAPP,
  };
  console.log("req.body2", req.body);
  const responses = req.body["responses"];
  const start = req.body["start"] as string;
  const end = req.body["end"] as string;
  const startRangeTime = req.body["startRangeTime"] as string;
  const endRangeTime = req.body["endRangeTime"] as string;
  const repeatTime = req.body["repeatTime"] as number;
  const duration = req.body["duration"] as number;
  const eventTypeId = req.body["eventTypeId"] as number;
  const optionSeatPerSlotTime = req.body["optionSeatPerSlotTime"] as SlotTime[];

  if (duration && repeatTime && Array.isArray(optionSeatPerSlotTime)) {
    for (let i = 0; i < repeatTime; i++) {
      const newTimeslot = dayjs
        .utc(start)
        .add(duration * i, "minute")
        .toISOString();

      const seatedBooking = await prisma.booking.findFirst({
        where: {
          OR: [
            {
              eventTypeId: eventTypeId,
              startTime: new Date(newTimeslot),
            },
          ],
          status: BookingStatus.ACCEPTED,
        },
        select: {
          uid: true,
          id: true,
          attendees: { include: { bookingSeat: true } },
          userId: true,
          references: true,
          startTime: true,
          user: true,
          status: true,
          smsReminderNumber: true,
          endTime: true,
        },
      });
      const attendeesCount = seatedBooking
        ? seatedBooking.attendees.filter((attendee: { bookingSeat: unknown }) => !!attendee.bookingSeat)
            .length // 計算有 bookingSeat 的與會者 (假設這代表一個已佔座位)
        : 0;
      console.log("limit4002", optionSeatPerSlotTime);
      if (optionSeatPerSlotTime[i] && optionSeatPerSlotTime[i].calculatedBookingLimit) {
        const limit = optionSeatPerSlotTime[i].calculatedBookingLimit;
        console.log("limit400", limit);
        if (
          seatedBooking && // 確保有找到預約
          i < optionSeatPerSlotTime.length && // 確保索引 i 在 optionSeatPerSlotTime 陣列範圍內
          attendeesCount >= limit
        ) {
          throw new HttpError({ statusCode: 409, message: ErrorCode.BookingSeatsFull });
        }
      }
    }
  }
  const bookings: any[] = [];
  const attendeesArray: any[] = [];
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  let booking;
  let sendWebhook = true;
  for (let i = 0; i < repeatTime; i++) {
    const newStart = dayjs
      .utc(start)
      .add(duration * i, "minute")
      .toISOString();
    const newEnd = dayjs
      .utc(end)
      .add(duration * i, "minute")
      .toISOString();
    const currentBookingData = {
      ...req.body,
      start: newStart,
      end: newEnd,
    };
    booking = await handleNewBooking({
      bookingData: currentBookingData,
      userId: session?.user?.id || -1,
      hostname: req.headers.host || "",
      forcedSlug: req.headers["x-cal-force-slug"] as string | undefined,
    });

    sendWebhook = sendWebhook && booking.sendWebhook2;
    bookings.push(booking);
    if (booking.attendees) {
      attendeesArray.push(...booking.attendees);
    }

    if (i < repeatTime - 1) {
      await delay(DELAY_MS);
    }
  }
  if (sendWebhook && bookings.length > 0) {
    const b = bookings[0];
    const newSubscriberOptions = b.subscriberOptions2;
    const newEeventTrigger = b.eventTrigger2;
    const newWebhookData = {
      ...b.webhookData2,
      attendeesArray: attendeesArray,
    };
    const newIsDryRun = b.isDryRun2;
    await handleWebhookTrigger({
      subscriberOptions:newSubscriberOptions,
      eventTrigger:newEeventTrigger,
      webhookData:newWebhookData,
      isDryRun:newIsDryRun,
    });
  }


  return {
    responses: responses,
    startRangeTime: startRangeTime,
    endRangeTime: endRangeTime,
    selectedOptionDuration: repeatTime * duration,
    bookings: bookings,
  };
  // return bookings;

  //  To be added in the follow-up PR
  // async function createBookingThroughFactory() {
  //   console.log("Creating booking through factory");
  //   const regularBookingService = getRegularBookingService();

  //   const booking = await regularBookingService.createBooking({
  //     bookingData: req.body,
  //     bookingMeta: {
  //       userId: session?.user?.id || -1,
  //       hostname: req.headers.host || "",
  //       forcedSlug: req.headers["x-cal-force-slug"] as string | undefined,
  //     },
  //   });
  //   return booking;
  // }
}

export default defaultResponder(handler, "/api/book/events");
