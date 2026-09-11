export type HomeStackParamList = {
  HomeList: undefined;
  GroupBuyDetail: { groupBuyId: string };
  GroupBuyCreate: undefined;
  Notifications: undefined;
};

export type CreateStackParamList = {
  GroupBuyCreate: undefined;
};

export type ChatStackParamList = {
  ChatList: undefined;
  ChatRoom: { roomId: string };
};

export type SubscriptionStackParamList = {
  SubscriptionList: undefined;
  SubscriptionDetail: { groupId: string };
};

export type MyPageStackParamList = {
  MyPageHome: undefined;
  MyParticipations: undefined;
  BuildingManage: undefined;
  PaymentMethods: undefined;
  Settlement: undefined;
  Notifications: undefined;
  Admin: undefined;
  SubscriptionAdmin: undefined;
  OrderQueue: undefined;
};

export type MainTabParamList = {
  홈: undefined;
  만들기: undefined;
  채팅: undefined;
  구독: undefined;
  내정보: undefined;
};
