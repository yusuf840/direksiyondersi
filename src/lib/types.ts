export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'rejected' | 'completed' | 'no_show'

export interface Business {
  id: string
  slug: string
  name: string
  description: string | null
  phone: string | null
  address: string | null
  timezone: string
  resource_label: string
  booking_mode: 'instant' | 'approval'
  slot_interval_min: number
  min_notice_min: number
  max_advance_days: number
  cancel_until_min: number
  max_active_per_customer: number
  weekly_limit_per_customer: number | null
  booking_note: string | null
  is_active: boolean
}

export interface HoursRange { weekday: number; start: string; end: string }
export interface Resource { id: string; business_id: string; name: string; is_active: boolean; sort: number; hours: HoursRange[] }

export interface Service {
  id: string
  business_id: string
  name: string
  description: string | null
  duration_min: number
  buffer_min: number
  slot_interval_min: number | null
  price_text: string | null
  is_active: boolean
  sort: number
  resource_ids: string[]
}

export interface ServiceResource { service_id: string; resource_id: string; business_id: string }

export interface TimeOff {
  id: string
  business_id: string
  resource_id: string | null
  starts_at: string
  ends_at: string
}

export interface Customer {
  id: string
  business_id: string
  user_id: string | null
  name: string
  phone: string | null
  note: string | null
  is_blocked: boolean
  created_at: string
}

export interface Booking {
  id: string
  business_id: string
  resource_id: string
  service_id: string | null
  service_name: string
  customer_id: string
  starts_at: string
  ends_at: string
  block_until: string
  status: BookingStatus
  source: 'customer' | 'staff'
  customer_note: string | null
  staff_note: string | null
  cancel_reason: string | null
  cancelled_by: 'customer' | 'staff' | null
  created_at: string
  customer_user_id: string | null
  customer_name: string
  customer_phone: string | null
  active: boolean
  customer?: Pick<Customer, 'id' | 'name' | 'phone' | 'is_blocked' | 'user_id'>
}

export interface MyBooking {
  id: string
  status: BookingStatus
  starts_at: string
  ends_at: string
  service_name: string
  resource_name: string
  customer_note: string | null
  cancel_reason: string | null
  business_id: string
  business_name: string
  business_slug: string
  business_phone: string | null
  business_address: string | null
  timezone: string
  cancel_until_min: number
  resource_label: string
}

export interface Member {
  uid: string
  role: 'owner' | 'staff'
  resource_id: string | null
  full_name: string | null
  phone: string | null
}

export interface Slot { resource_id: string; starts_at: string }
