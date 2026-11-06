import { OrderItem } from '../dishes/order-item.model';

export interface GroupGuestSummary {
  id: string;
  name: string;
  isSubmitted: boolean;
  total: number;
}

export interface GroupOrderState {
  totalGuests: number;
  orderedGuests: number;
  submittedGuests?: number;
  groupReservationId?: string;
  groupTotal?: number;
  submittedTotal?: number;
  guests?: GroupGuestSummary[];
}

export interface Order {
  orderId: string;
  reservationAddress: string;
  reservationTime: string;
  reservationId: string;
  orderItems: OrderItem[];
  status: number;
  isGroupOrder?: boolean;
  groupState?: GroupOrderState;
  tableName?: string;
  startTime?: Date | string;
}

export interface WaiterPreOrderState {
  reservationId: string;
  createdByName: string;
  createdByRole: string;
  tableName: string;
}
