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
import getIP from "@calcom/lib/getIP";
//import type { SeatedBooking } from "@calcom/lib/handleSeats/types";
import { HttpError } from "@calcom/lib/http-error";
import { piiHasher } from "@calcom/lib/server/PiiHasher";
import { checkCfTurnstileToken } from "@calcom/lib/server/checkCfTurnstileToken";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { EventTypeRepository } from "@calcom/lib/server/repository/eventTypeRepository";
import prisma from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import { CreationSource } from "@calcom/prisma/enums";
import { BookingStatus } from "@calcom/prisma/enums";

type SlotTime = {
  time: string; // e.g., '2025-11-20T10:30:00.000Z'
  calculatedBookingsLimit: number; // e.g., 2
  [key: string]: any; // 如果物件可能包含其他屬性
};

class KeyedMutex {
  // 儲存不同 key 的鎖鏈結
  private locks: Map<string, Promise<any>> = new Map();

  async lock(key: string): Promise<() => void> {
    // 取得該 key 目前的鏈結，如果沒有則建立一個已解決的 Promise
    const currentPromise = this.locks.get(key) || Promise.resolve();

    let resolver: () => void;
    const nextPromise = new Promise<void>((res) => {
      resolver = res;
    });

    // 將鏈結更新為下一個 Promise
    this.locks.set(
      key,
      currentPromise.then(() => nextPromise)
    );

    // 等待上一個鎖釋放
    await currentPromise;

    // 回傳解鎖函式
    return () => {
      resolver();
      // 如果沒有人在排隊了，就把 Map 裡的 key 刪掉節省記憶體
      if (this.locks.get(key) === nextPromise) {
        this.locks.delete(key);
      }
    };
  }
}
// 建立實例
const keyedLock = new KeyedMutex();

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

  const eventTypeId = req.body["eventTypeId"] as number;
  // 根據 eventTypeId 鎖定，不同活動類型不會互相阻塞
  const lockKey = `event-type-${eventTypeId}`;
  const unlock = await keyedLock.lock(lockKey);
  console.log("events eventTypeId", eventTypeId);
  try {
    // const responses = req.body["responses"];
    const start = req.body["start"] as string;
    const end = req.body["end"] as string;
    const startRangeTime = req.body["startRangeTime"] as string;
    const endRangeTime = req.body["endRangeTime"] as string;
    const repeatTime = req.body["repeatTime"] as number;
    const duration = req.body["duration"] as number;
    const optionSeatPerSlotTime = req.body["optionSeatPerSlotTime"] as SlotTime[];

    console.log("events optionSeatPerSlotTime", optionSeatPerSlotTime);

    if (duration) {
      for (let i = 0; i < optionSeatPerSlotTime.length; i++) {
        const newTimeslot = dayjs.utc(optionSeatPerSlotTime[i].time).toISOString();

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
          ? seatedBooking.attendees.filter((attendee: { bookingSeat: any }) => !!attendee.bookingSeat).length
          : 0;
        if (optionSeatPerSlotTime[i] && optionSeatPerSlotTime[i].calculatedBookingsLimit ) {
          const limit = optionSeatPerSlotTime[i].calculatedBookingsLimit ;
          console.log("events optionSeatPerSlotTime", limit);
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
    // let sendWebhook = true;

    //訂約
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
      const booking = await handleNewBooking({
        bookingData: currentBookingData,
        userId: session?.user?.id || -1,
        hostname: req.headers.host || "",
        forcedSlug: req.headers["x-cal-force-slug"] as string | undefined,
      });

      // sendWebhook = sendWebhook && booking.sendWebhook2;
      bookings.push(booking);
      console.log("events send webhook startRangeTime11 booking", booking, i);
      if (booking.attendees) {
        attendeesArray.push(...booking.attendees);
      }

      if (i < repeatTime - 1) {
        await delay(DELAY_MS);
      }
    }

    //發送webhook
    // if (sendWebhook && bookings.length > 0) {
    console.log("events send webhook startRangeTime", startRangeTime, endRangeTime);
    if (bookings.length > 0 && startRangeTime&& endRangeTime) {
      console.log("events send webhook startRangeTime1", startRangeTime, endRangeTime);
      const b = bookings[0];
      const newSubscriberOptions = b.subscriberOptions2;
      const newEeventTrigger = b.eventTrigger2;
      const newWebhookData = {
        ...b.webhookData2,
        attendeesArray: attendeesArray,
        startRangeTime: startRangeTime,
        endRangeTime: endRangeTime,
        selectedOptionDuration: repeatTime * duration,
      };
      console.log("events send webhook startRangeTime11", newWebhookData);
      const newIsDryRun = b.isDryRun2;
      await handleWebhookTrigger({
        subscriberOptions: newSubscriberOptions,
        eventTrigger: newEeventTrigger,
        webhookData: newWebhookData,
        isDryRun: newIsDryRun,
      });

    }

    return bookings[0];
  } finally {
    unlock();
  }
}

export default defaultResponder(handler, "/api/book/events");
