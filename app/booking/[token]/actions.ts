"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/ActionForm";
import { cancelBooking } from "@/lib/booking-service";
import { BookingError } from "@/lib/scheduling";

export async function cancelAsParent(token: string, _prev: ActionState): Promise<ActionState> {
  try {
    await cancelBooking({ by: "parent", token });
  } catch (e) {
    if (e instanceof BookingError) return { ok: false, message: e.message };
    throw e;
  }
  revalidatePath(`/booking/${token}`);
  return { ok: true, message: "Your class was cancelled." };
}
