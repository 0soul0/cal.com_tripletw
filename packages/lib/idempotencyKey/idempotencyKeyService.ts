import { v5 as uuidv5 } from "uuid";

export class IdempotencyKeyService {
  static generate({
    startTime,
    endTime,
    userId,
    reassignedById,
    eventTypeId
  }: {
    startTime: Date | string;
    endTime: Date | string;
    userId?: number;
    reassignedById?: number | null;
    eventTypeId?: number;
  }) {
    return uuidv5(
      `${startTime.valueOf()}.${endTime.valueOf()}.${userId}.${eventTypeId}${reassignedById ? `.${reassignedById}` : ""}`,
      uuidv5.URL
    );
  }
}
