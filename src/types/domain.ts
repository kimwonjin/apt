// 빌딩공구배달 프론트엔드 타입. supabase 스키마(supabase/schema.sql)와 맞춰 갱신.

import type { DiscountTable, TimeSlot } from '../lib/discount';

export type { TimeSlot };

export type Role = '참여자' | '식당' | '운영자';

export type GroupBuyType = 'delivery' | 'install';
// open: 진행중 / success: 성사확정 / failed: 마감실패 / canceled: 취소됨 / done: 종료
export type GroupBuyStatus = 'open' | 'success' | 'failed' | 'canceled' | 'done';

// 카드/상세에 노출하는 개설자 배지 — 빌딩명 수준, 호수/상세주소 비공개.
export interface CreatorBadge {
  id: string;
  name: string;
  buildingLabel: string; // 예: "테헤란로 OO빌딩"
  companyName?: string;
}

export interface Restaurant {
  id: string;
  name: string;
  category?: string;
  rating: number;
}

export interface Menu {
  id: string;
  restaurantId: string;
  name: string;
  category?: string;
  photoUrl?: string;
  basePrice: number;
  minHeadcount: number;
}

export interface GroupBuy {
  id: string;
  title: string;
  photoUrl?: string;
  restaurant: Restaurant;
  menuId?: string; // 자유참여형(장바구니)은 메뉴 하나로 못박지 않아 없을 수 있음
  basePrice: number; // 정가 스냅샷(장바구니형은 0 — participation별 items로 계산)
  timeSlot: TimeSlot;
  minHeadcount: number; // 최소 성사 인원
  participantCount: number;
  discountPercent: number; // 현재 실시간 할인율
  finalDiscountPercent?: number; // 성사확정 시 스냅샷
  deadline: string; // ISO
  urgent: boolean;
  bumpedAt?: string;
  status: GroupBuyStatus;
  creator: CreatorBadge;
  pickupPlace?: string;
  pickupTime?: string;
  subscriptionGroupId?: string;
  discountTable?: DiscountTable; // 이 공구의 메뉴에 등록된 할인 매트릭스. 없으면 다음 구간 힌트 계산 시 기본표로 폴백.
  pricingMode: 'menu' | 'fixed'; // menu: 메뉴별 할인 매트릭스 / fixed: 자유참여형(만들기2) 고정 인원 구간표
}

// 자유참여형(장바구니) 참여자가 담은 메뉴별 항목(담을 당시 스냅샷).
export interface CartItem {
  menuId: string;
  name: string;
  basePrice: number;
  qty: number;
}

// 내 참여 상태
export type HoldStatus = 'held' | 'captured' | 'released' | 'failed';
export interface MyParticipation {
  qty: number;
  holdStatus: HoldStatus;
  chargedAmount?: number;
  pickedUp: boolean;
  items?: CartItem[]; // 장바구니형 참여일 때만 존재
}

export interface ChatRoomSummary {
  id: string;
  peerName: string;
  peerRoleLabel: Role;
  lastMessage: string;
  updatedAt: string;
  unreadCount: number;
  groupBuyTitle?: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  authorId: string | null; // null = 시스템 공지
  senderName: string;
  isMine: boolean;
  body: string;
  createdAt: string;
  type: 'text' | 'notice';
}

// 구독 "요일 다이어트 밥이" (탭 D)
export interface SubscriptionGroup {
  id: string;
  restaurant: Restaurant;
  menuId: string;
  menuName: string;
  weekday: number; // 0=일 .. 6=토
  timeSlot: TimeSlot;
  minHeadcount: number;
  pickupPlace?: string;
  subscribed: boolean;
}
