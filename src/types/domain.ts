// 개발자 온보딩 리포트 7장 데이터 모델 초안을 기준으로 한 프론트엔드 타입.
// 실제 Supabase 스키마 확정 시 이 파일과 src/lib/supabase.ts의 쿼리를 맞춰 갱신할 것.

export type Role = '구매자' | '공구대장' | '판매자';

export type GroupBuyType = 'delivery' | 'install';
export type GroupBuyStatus = 'open' | 'closed' | 'success' | 'failed' | 'done';
export type GroupBuyCategory = '식품' | '가구' | '가전' | '커튼·샤시' | '시공';

export interface LeaderSummary {
  id: string;
  name: string;
  apartmentLabel: string; // 예: "205동 이웃" — 호수 비공개 원칙 (온보딩 리포트 9장)
  rating: number;
  groupBuyCount: number;
}

export interface GroupBuy {
  id: string;
  type: GroupBuyType;
  category: GroupBuyCategory;
  title: string;
  photoUrl?: string;
  groupPrice: number;
  marketPrice: number;
  participantCount: number;
  targetCount: number;
  deadline: string; // ISO date
  urgent: boolean;
  bumpedAt?: string;
  status: GroupBuyStatus;
  leader: LeaderSummary;
  description?: string;
  // delivery 전용
  pickupPlace?: string;
  pickupTime?: string;
  // install 전용
  installDates?: string[];
}

export interface PriceTier {
  minQty: number;
  unitPrice: number;
}

export interface Product {
  id: string;
  sellerId: string;
  type: GroupBuyType;
  category: GroupBuyCategory;
  title: string;
  photoUrl?: string;
  photos: string[];
  priceTiers: PriceTier[];
  sellerName: string;
  sellerRating: number;
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

export type QuoteDeliveryMethod = 'per_household' | 'bulk';
export type QuoteStatus = 'pending' | 'approved';

export interface QuotePayload {
  headcount: number; // 공동구매 목표 갯수
  discountPercent: number; // 할인율
  perPersonAmount: number; // 목표 달성 시 구매금액(원)
  deliveryMethod: QuoteDeliveryMethod;
  validUntil: string; // ISO date, 견적 유효기간
  status: QuoteStatus;
  sellerBusinessName?: string; // 판매자 상호명
  productName?: string; // 상품명
  unitPrice?: number; // 정가
}

export interface ChatMessage {
  id: string;
  roomId: string;
  authorId: string;
  senderName: string;
  isMine: boolean;
  body: string;
  createdAt: string;
  type: 'text' | 'quote';
  quote?: QuotePayload;
}

export type CommunityCategory = '동네소식' | '나눔' | '질문' | '공구요청' | '중고거래';

export interface CommunityPost {
  id: string;
  category: CommunityCategory;
  author: string;
  createdAt: string;
  title: string;
  preview: string;
  likeCount: number;
  commentCount: number;
}

export interface LeaderStats {
  totalGroupBuys: number;
  avgRating: number;
  reviewCount: number;
}
