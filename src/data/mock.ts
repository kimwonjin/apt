// Supabase 연동 전, 화면 레이아웃 확인용 목업 데이터.
// 실제 데이터 연결 시 이 파일의 배열을 supabase.from(...).select(...) 호출로 교체.
import {
  ChatMessage,
  ChatRoomSummary,
  CommunityPost,
  GroupBuy,
  LeaderStats,
  Product,
} from '../types/domain';

const leaderKim = {
  id: 'leader-1',
  name: '김민지',
  apartmentLabel: '203동 이웃',
  rating: 4.9,
  groupBuyCount: 27,
};

const leaderPark = {
  id: 'leader-2',
  name: '박서준',
  apartmentLabel: '105동 이웃',
  rating: 4.7,
  groupBuyCount: 12,
};

export const mockGroupBuys: GroupBuy[] = [
  {
    id: 'gb-1',
    type: 'delivery',
    category: '식품',
    title: '해남 절임배추 20kg (김장철 특가)',
    groupPrice: 32900,
    marketPrice: 41000,
    participantCount: 23,
    targetCount: 30,
    deadline: '2026-11-01',
    urgent: true,
    status: 'open',
    leader: leaderKim,
    description: '농가 직송 절임배추, 공구대장이 직접 검수 후 동별 수령 안내드립니다.',
    pickupPlace: '203동 지하 주차장 입구',
    pickupTime: '11/2(월) 19:00~21:00',
  },
  {
    id: 'gb-2',
    type: 'install',
    category: '커튼·샤시',
    title: '전동 커튼 시공 (34평형 표준)',
    groupPrice: 289000,
    marketPrice: 350000,
    participantCount: 8,
    targetCount: 15,
    deadline: '2026-08-05',
    urgent: false,
    status: 'open',
    leader: leaderPark,
    description: '34평형 표준 견적, 실측 후 최종 견적 확정됩니다.',
    installDates: ['2026-08-10', '2026-08-11', '2026-08-17'],
  },
  {
    id: 'gb-3',
    type: 'delivery',
    category: '가전',
    title: '스팀 청소기 공동구매',
    groupPrice: 89000,
    marketPrice: 129000,
    participantCount: 30,
    targetCount: 30,
    deadline: '2026-07-20',
    urgent: true,
    status: 'success',
    leader: leaderKim,
    pickupPlace: '관리사무소 앞',
    pickupTime: '7/21(화) 저녁',
  },
];

export const mockProducts: Product[] = [
  {
    id: 'p-1',
    sellerId: 'seller-1',
    type: 'delivery',
    category: '식품',
    photos: [],
    title: '제주 감귤 10kg 박스',
    priceTiers: [
      { minQty: 10, unitPrice: 15900 },
      { minQty: 30, unitPrice: 13900 },
    ],
    sellerName: '(주)제주청과',
    sellerRating: 4.8,
  },
  {
    id: 'p-2',
    sellerId: 'seller-2',
    type: 'install',
    category: '커튼·샤시',
    photos: [],
    title: '거실 블라인드 시공',
    priceTiers: [{ minQty: 1, unitPrice: 180000 }],
    sellerName: '한샘 블라인드',
    sellerRating: 4.6,
  },
];

export const mockChatRooms: ChatRoomSummary[] = [
  {
    id: 'room-1',
    peerName: '(주)제주청과',
    peerRoleLabel: '판매자',
    lastMessage: '30박스 이상 시 13,900원까지 가능합니다.',
    updatedAt: '오후 2:14',
    unreadCount: 2,
    groupBuyTitle: '제주 감귤 10kg 박스',
  },
  {
    id: 'room-2',
    peerName: '공구 참여자 단체방',
    peerRoleLabel: '구매자',
    lastMessage: '수령 시간 변경 안내드립니다.',
    updatedAt: '오전 9:02',
    unreadCount: 0,
    groupBuyTitle: '해남 절임배추 20kg',
  },
];

export const mockMessages: ChatMessage[] = [
  { id: 'm-1', roomId: 'room-1', authorId: 'seller', isMine: false, body: '안녕하세요, 공구대장님!', createdAt: '오후 2:10', type: 'text' },
  { id: 'm-2', roomId: 'room-1', authorId: 'me', isMine: true, body: '30박스 기준 단가 문의드립니다.', createdAt: '오후 2:12', type: 'text' },
  { id: 'm-3', roomId: 'room-1', authorId: 'seller', isMine: false, body: '30박스 이상 시 13,900원까지 가능합니다.', createdAt: '오후 2:14', type: 'text' },
];

export const mockCommunityPosts: CommunityPost[] = [
  {
    id: 'post-1',
    category: '공구요청',
    author: '이하늘',
    createdAt: '3시간 전',
    title: '에어프라이어 공구 여실 분 계신가요?',
    preview: '10명 이상 모이면 좋을 것 같아요. 관심 있으신 분들 댓글 부탁드려요.',
    likeCount: 12,
    commentCount: 5,
  },
  {
    id: 'post-2',
    category: '동네소식',
    author: '관리사무소',
    createdAt: '어제',
    title: '단지 내 택배보관함 이용 안내',
    preview: '7월부터 신규 택배보관함이 운영됩니다.',
    likeCount: 8,
    commentCount: 1,
  },
];

export const mockLeaderStats: LeaderStats = {
  totalGroupBuys: 27,
  avgRating: 4.9,
  reviewCount: 41,
};
