import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProductsStackParamList } from './types';
import { ProductsScreen } from '../screens/products/ProductsScreen';
import { ProductCreateScreen } from '../screens/products/ProductCreateScreen';
import { ProductDetailScreen } from '../screens/products/ProductDetailScreen';

const Stack = createNativeStackNavigator<ProductsStackParamList>();

export function ProductsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProductsList" component={ProductsScreen} />
      <Stack.Screen name="ProductCreate" component={ProductCreateScreen} />
      <Stack.Screen name="ProductEdit" component={ProductCreateScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
    </Stack.Navigator>
  );
}
