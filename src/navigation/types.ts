export type HomeStackParamList = {
  HomeList: undefined;
  GroupBuyDetail: { groupBuyId: string };
  GroupBuyCreate: undefined;
  Notifications: undefined;
  LeaderStore: { leaderId: string };
};

export type ProductsStackParamList = {
  ProductsList: undefined;
  ProductCreate: undefined;
  ProductEdit: { productId: string };
  ProductDetail: { productId: string };
};

export type ChatStackParamList = {
  ChatList: undefined;
  ChatRoom: { roomId: string };
};

export type CommunityStackParamList = {
  CommunityFeed: undefined;
  CommunityWrite: { editPostId?: string } | undefined;
  CommunityDetail: { postId: string };
};

export type MyPageStackParamList = {
  MyPageHome: undefined;
  MyParticipations: undefined;
  ResidencyManage: undefined;
  PaymentMethods: undefined;
  MyReviews: undefined;
  ReviewWrite: { groupBuyId: string; groupBuyTitle: string };
  Wishlist: undefined;
  MyGroupBuys: undefined;
  Settlement: undefined;
  CreditDetail: undefined;
  InstallSchedule: undefined;
  SellerProducts: undefined;
  ReceivedQuotes: undefined;
  SentQuotes: undefined;
  FollowingLeaders: undefined;
  SellerRegistration: { selectedAddress?: any } | undefined;
  AddressSearchModal: undefined;
  Admin: undefined;
};

export type MainTabParamList = {
  홈: undefined;
  커뮤니티: undefined;
  채팅: undefined;
  판매상품: undefined;
  내정보: undefined;
};
