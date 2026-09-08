import React from 'react';
import { Image, ScrollView, StyleSheet } from 'react-native';
import { radius, spacing } from '../theme';

export function ReviewPhotoRow({ photos }: { photos: string[] }) {
  if (photos.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
      {photos.map((url) => (
        <Image key={url} source={{ uri: url }} style={styles.thumb} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: spacing.xs, flexGrow: 0 },
  thumb: { width: 64, height: 64, borderRadius: radius.md, marginRight: spacing.xs },
});
