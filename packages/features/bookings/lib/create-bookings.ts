import { post } from "@calcom/lib/fetch-wrapper";

import type { BookingCreateBody, BookingResponse } from "../types";

export const createBookings = async (data: BookingCreateBody) => {

  const response = await post<
    BookingCreateBody,
    // fetch response can't have a Date type, it must be a string
    Omit<BookingResponse, "startTime" | "endTime"> & {
      startTime: string;
      endTime: string;
    }
  >("/api/book/events", data);
  return response;
};
