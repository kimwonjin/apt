import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MyPageStackParamList } from './types';
import { MyPageScreen } from '../screens/mypage/MyPageScreen';
import { MyParticipationsScreen } from '../screens/mypage/MyParticipationsScreen';
import { ResidencyManageScreen } from '../screens/mypage/ResidencyManageScreen';
import { PaymentMethodsScreen } from '../screens/mypage/PaymentMethodsScreen';
import { MyReviewsScreen } from '../screens/mypage/MyReviewsScreen';
import { ReviewWriteScreen } from '../screens/mypage/ReviewWriteScreen';
import { WishlistScreen } from '../screens/mypage/WishlistScreen';
import { MyGroupBuysScreen } from '../screens/mypage/MyGroupBuysScreen';
import { SettlementScreen } from '../screens/mypage/SettlementScreen';
import { CreditDetailScreen } from '../screens/mypage/CreditDetailScreen';
import { InstallScheduleScreen } from '../screens/mypage/InstallScheduleScreen';
import { SellerProductsScreen } from '../screens/mypage/SellerProductsScreen';
import { ReceivedQuotesScreen, SentQuotesScreen } from '../screens/mypage/QuotesListScreen';
import { SellerRegistrationScreen } from '../screens/mypage/SellerRegistrationScreen';
import { AdminScreen } from '../screens/mypage/AdminScreen';
import { AddressSearchScreen } from '../screens/mypage/AddressSearchScreen';
import { FollowingLeadersScreen } from '../screens/mypage/FollowingLeadersScreen';

const Stack = createNativeStackNavigator<MyPageStackParamList>();

export function MyPageStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyPageHome" component={MyPageScreen} />
      <Stack.Screen name="MyParticipations" component={MyParticipationsScreen} />
      <Stack.Screen name="ResidencyManage" component={ResidencyManageScreen} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
      <Stack.Screen name="MyReviews" component={MyReviewsScreen} />
      <Stack.Screen name="ReviewWrite" component={ReviewWriteScreen} />
      <Stack.Screen name="Wishlist" component={WishlistScreen} />
      <Stack.Screen name="FollowingLeaders" component={FollowingLeadersScreen} />
      <Stack.Screen name="MyGroupBuys" component={MyGroupBuysScreen} />
      <Stack.Screen name="Settlement" component={SettlementScreen} />
      <Stack.Screen name="CreditDetail" component={CreditDetailScreen} />
      <Stack.Screen name="InstallSchedule" component={InstallScheduleScreen} />
      <Stack.Screen name="SellerProducts" component={SellerProductsScreen} />
      <Stack.Screen name="ReceivedQuotes" component={ReceivedQuotesScreen} />
      <Stack.Screen name="SentQuotes" component={SentQuotesScreen} />
      <Stack.Screen name="SellerRegistration" component={SellerRegistrationScreen} />
      <Stack.Screen name="AddressSearchModal" component={AddressSearchScreen} />
      <Stack.Screen name="Admin" component={AdminScreen} />
    </Stack.Navigator>
  );
}
