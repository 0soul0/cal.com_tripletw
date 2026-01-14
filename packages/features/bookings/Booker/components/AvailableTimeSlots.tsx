import { useCallback, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import dayjs from "@calcom/dayjs";
import { AvailableTimes, AvailableTimesSkeleton } from "@calcom/features/bookings";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import type { IUseBookingLoadingStates } from "@calcom/features/bookings/Booker/components/hooks/useBookings";
import type { BookerEvent } from "@calcom/features/bookings/types";
import type { Slot } from "@calcom/features/schedules/lib/use-schedule/types";
import { useNonEmptyScheduleDays } from "@calcom/features/schedules/lib/use-schedule/useNonEmptyScheduleDays";
import { useSlotsForAvailableDates } from "@calcom/features/schedules/lib/use-schedule/useSlotsForDate";
import { PUBLIC_INVALIDATE_AVAILABLE_SLOTS_ON_BOOKING_FORM } from "@calcom/lib/constants";
import { IFromUser, IToUser } from "@calcom/lib/getUserAvailability";
import { localStorage } from "@calcom/lib/webstorage";
import { BookerLayouts } from "@calcom/prisma/zod-utils";
import classNames from "@calcom/ui/classNames";

import { AvailableTimesHeader } from "../../components/AvailableTimesHeader";
import type { UseBookingFormReturnType } from "../components/hooks/useBookingForm";
import type { useScheduleForEventReturnType } from "../utils/event";
import { getQueryParam } from "../utils/query-param";

type AvailableTimeSlotsProps = {
  extraDays?: number;
  limitHeight?: boolean;
  schedule?: useScheduleForEventReturnType;
  bookingForm: UseBookingFormReturnType["bookingForm"];
  isLoading: boolean;
  seatsPerTimeSlot?: number | null;
  showAvailableSeatsCount?: boolean | null;
  event: {
    data?: Pick<BookerEvent, "length" | "bookingFields" | "price" | "currency" | "metadata"> | null;
  };
  customClassNames?: {
    availableTimeSlotsContainer?: string;
    availableTimeSlotsTitle?: string;
    availableTimeSlotsHeaderContainer?: string;
    availableTimeSlotsTimeFormatToggle?: string;
    availableTimes?: string;
  };
  confirmStepClassNames?: {
    confirmButton?: string;
  };
  loadingStates: IUseBookingLoadingStates;
  isVerificationCodeSending: boolean;
  renderConfirmNotVerifyEmailButtonCond: boolean;
  onSubmit: (timeSlot?: string) => void;
  skipConfirmStep: boolean;
  shouldRenderCaptcha?: boolean;
  watchedCfToken?: string;
  /**
   * This is the list of time slots that are unavailable to book
   */
  unavailableTimeSlots: string[];
  confirmButtonDisabled?: boolean;
  onAvailableTimeSlotSelect: (time: string) => void;
};

/**
 * Renders available time slots for a given date.
 * It will extract the date from the booker store.
 * Next to that you can also pass in the `extraDays` prop, this
 * will also fetch the next `extraDays` days and show multiple days
 * in columns next to each other.
 */

type SlotItem = {
  time: string;
  calculatedBookingLimit: number;
  [key: string]: any;
};

type ThresholdItem = {
  time: string;
  week: number;
  isOpen: boolean;
};

export const AvailableTimeSlots = ({
  extraDays,
  limitHeight,
  showAvailableSeatsCount,
  schedule,
  isLoading,
  customClassNames,
  skipConfirmStep,
  seatsPerTimeSlot,
  onSubmit,
  unavailableTimeSlots,
  confirmButtonDisabled,
  confirmStepClassNames,
  onAvailableTimeSlotSelect,
  eventQuery,
  bookingForm,
  ...props
}: AvailableTimeSlotsProps & {
  eventQuery: {
    isError: boolean;
    isPending: boolean;
    data?: Pick<
      BookerEvent,
      "price" | "currency" | "metadata" | "bookingFields" | "locations" | "schedule"
    > | null;
  };
}) => {
  const selectedDate = useBookerStoreContext((state) => state.selectedDate);

  const setSeatedEventData = useBookerStoreContext((state) => state.setSeatedEventData);
  const date = selectedDate || dayjs().format("YYYY-MM-DD");
  const [layout] = useBookerStoreContext((state) => [state.layout]);
  const isColumnView = layout === BookerLayouts.COLUMN_VIEW;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { setTentativeSelectedTimeslots, tentativeSelectedTimeslots } = useBookerStoreContext((state) => ({
    setTentativeSelectedTimeslots: state.setTentativeSelectedTimeslots,
    tentativeSelectedTimeslots: state.tentativeSelectedTimeslots,
  }));

  const [slotSelected] = useBookerStoreContext((state) => [state.slotSelected]);
  const [selectedOptionDuration] = useBookerStoreContext((state) => [state.selectedOptionDuration]);
  const [setOptionSeatPerSlotTime] = useBookerStoreContext((state) => [state.setOptionSeatPerSlotTime]);
  const [thresholdJson] = useBookerStoreContext((state) => [state.thresholdJson]);
  const duration = useBookerStoreContext((state) => state.selectedDuration);
  const onTentativeTimeSelect = ({
    time,
    attendees: _attendees,
    seatsPerTimeSlot: _seatsPerTimeSlot,
    bookingUid: _bookingUid,
  }: {
    time: string;
    attendees: number;
    seatsPerTimeSlot?: number | null;
    bookingUid?: string;
  }) => {
    // We don't intentionally invalidate schedule here because that could remove the slot itself that was clicked, causing a bad UX.
    // We could start doing that after we fix this behaviour.
    // schedule?.invalidate();
    // console.log("select")
    if (slotSelected && selectedOptionDuration && schedule?.data && duration) {
      const timeZone = eventQuery.data?.schedule?.timeZone ?? "UTC";
      const dateKey = dayjs.utc(time).tz(timeZone).format("YYYY-MM-DD");
      const dailySlots = schedule?.data.slots[dateKey];
      const count = (selectedOptionDuration ?? 0) / duration || 1;
      let selectedSlots: SlotItem[] = [];
      if (dailySlots) {
        const startIndex = dailySlots.findIndex((slot) => slot.time === time);
        if (startIndex !== -1) {
          selectedSlots = dailySlots.slice(startIndex, startIndex + count) as SlotItem[];
        }
      }
      // console.log("select",selectedSlots)
      setOptionSeatPerSlotTime(selectedSlots);
      // console.log("onTentativeTimeSelect slotSelected", slotSelected);
      // console.log("onTentativeTimeSelect selectedOptionDuration", selectedOptionDuration);
    }

    // Earlier we had multiple tentative slots, but now we can only have one tentative slot.
    setTentativeSelectedTimeslots([time]);
  };

const thresholdMap = useMemo(() => {
  try {
    const parsed = JSON.parse(thresholdJson || "{}");
    const rawArray = Array.isArray(parsed.data) ? parsed.data : [];
    const map = rawArray.reduce((acc: Record<number, ThresholdItem>, item: any) => {
      if (item && typeof item.week !== 'undefined') {
        acc[item.week] = item;
      }
      return acc;
    }, {});
    return map;
  } catch (error) {
    return {};
  }
}, [thresholdJson]);

  // 移除 map 參數，直接引用外部變數
  const getThresholdForDate = (date: string | null | undefined) => {
    if (!date) return null;
    const day = dayjs(date).day();
    const weekKey = day === 0 ? 7 : day;
    return thresholdMap[weekKey] ?? null; // 這裡直接存取外部定義的變數
  };

  // const [slotSelected] = useBookerStoreContext((state) => [state.slotSelected], shallow);
  const scheduleData = schedule?.data;

  const nonEmptyScheduleDays = useNonEmptyScheduleDays(scheduleData?.slots);
  const nonEmptyScheduleDaysFromSelectedDate = nonEmptyScheduleDays.filter(
    (slot) => dayjs(selectedDate).diff(slot, "day") <= 0
  );

  // Creates an array of dates to fetch slots for.
  // If `extraDays` is passed in, we will extend the array with the next `extraDays` days.
  const dates = useMemo(() => {
    if (!extraDays) return [date];
    if (nonEmptyScheduleDaysFromSelectedDate.length > 0) {
      return nonEmptyScheduleDaysFromSelectedDate.slice(0, extraDays);
    }
    return [];
  }, [date, extraDays, nonEmptyScheduleDaysFromSelectedDate]);

  const { slotsPerDay, toggleConfirmButton } = useSlotsForAvailableDates(dates, scheduleData?.slots);

  const newSlotsPerDay = slotsPerDay;

  const overlayCalendarToggled =
    getQueryParam("overlayCalendar") === "true" || localStorage.getItem("overlayCalendarSwitchDefault");

  const onTimeSelect = useCallback(
    (time: string, attendees: number, seatsPerTimeSlot?: number | null, bookingUid?: string) => {
      // Temporarily allow disabling it, till we are sure that it doesn't cause any significant load on the system
      if (PUBLIC_INVALIDATE_AVAILABLE_SLOTS_ON_BOOKING_FORM) {
        // Ensures that user has latest available slots when they are about to confirm the booking by filling up the details
        schedule?.invalidate();
      }
      setTentativeSelectedTimeslots([]);
      // note(Lauris): setting setSeatedEventData before setSelectedTimeslot so that in useSlots we have seated event data available
      // and only then we invoke handleReserveSlot that is triggered by the changes in setSelectedTimeslot.
      if (seatsPerTimeSlot) {
        setSeatedEventData({
          seatsPerTimeSlot,
          attendees,
          bookingUid,
          showAvailableSeatsCount,
        });
      }
      onAvailableTimeSlotSelect(time);

      const isTimeSlotAvailable = !unavailableTimeSlots.includes(time);
      if (skipConfirmStep && isTimeSlotAvailable) {
        onSubmit(time);
      }
      return;
    },
    [
      onSubmit,
      setSeatedEventData,
      skipConfirmStep,
      showAvailableSeatsCount,
      unavailableTimeSlots,
      schedule,
      setTentativeSelectedTimeslots,
      onAvailableTimeSlotSelect,
    ]
  );

  const handleSlotClick = useCallback(
    (selectedSlot: Slot, isOverlapping: boolean) => {
      if ((overlayCalendarToggled && isOverlapping) || skipConfirmStep) {
        toggleConfirmButton(selectedSlot);
      } else {
        onTimeSelect(
          selectedSlot.time,
          selectedSlot?.attendees || 0,
          seatsPerTimeSlot,
          selectedSlot.bookingUid
        );
      }
    },
    [overlayCalendarToggled, onTimeSelect, seatsPerTimeSlot, skipConfirmStep, toggleConfirmButton]
  );

  return (
    <>
      <div className={classNames(`flex`, `${customClassNames?.availableTimeSlotsContainer}`)}>
        {isLoading ? (
          <div className="mb-3 h-8" />
        ) : (
          newSlotsPerDay.length > 0 &&
          newSlotsPerDay.map((slots) => (
            <AvailableTimesHeader
              customClassNames={{
                availableTimeSlotsHeaderContainer: customClassNames?.availableTimeSlotsHeaderContainer,
                availableTimeSlotsTitle: customClassNames?.availableTimeSlotsTitle,
                availableTimeSlotsTimeFormatToggle: customClassNames?.availableTimeSlotsTimeFormatToggle,
              }}
              key={slots.date}
              date={dayjs(slots.date)}
              showTimeFormatToggle={!isColumnView}
              availableMonth={
                dayjs(selectedDate).format("MM") !== dayjs(slots.date).format("MM")
                  ? dayjs(slots.date).format("MMM")
                  : undefined
              }
            />
          ))
        )}
      </div>

      <div
        ref={containerRef}
        className={classNames(
          limitHeight && "scroll-bar flex-grow overflow-auto md:h-[400px]",
          !limitHeight && "flex h-full w-full flex-row gap-4",
          `${customClassNames?.availableTimeSlotsContainer}`
        )}>
        {isLoading && // Shows exact amount of days as skeleton.
          Array.from({ length: 1 + (extraDays ?? 0) }).map((_, i) => <AvailableTimesSkeleton key={i} />)}
        {!isLoading &&
          newSlotsPerDay.length > 0 &&
          newSlotsPerDay.map((slots) => (
            <div key={slots.date} className="scroll-bar h-full w-full overflow-y-auto overflow-x-hidden">
              <AvailableTimes
                className={customClassNames?.availableTimeSlotsContainer}
                customClassNames={customClassNames?.availableTimes}
                showTimeFormatToggle={!isColumnView}
                onTimeSelect={onTimeSelect}
                onTentativeTimeSelect={onTentativeTimeSelect}
                unavailableTimeSlots={unavailableTimeSlots}
                slots={slots.slots}
                showAvailableSeatsCount={showAvailableSeatsCount}
                skipConfirmStep={skipConfirmStep}
                seatsPerTimeSlot={seatsPerTimeSlot}
                handleSlotClick={handleSlotClick}
                confirmButtonDisabled={confirmButtonDisabled}
                confirmStepClassNames={confirmStepClassNames}
                thresholdItem={getThresholdForDate(slots.date)}
                {...props}
              />
            </div>
          ))}
      </div>
    </>
  );
};
