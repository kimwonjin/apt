import React, { useEffect, useRef, useState } from 'react';
import type { DaumAddressResult } from './addressTypes';
export type { DaumAddressResult };

interface Props {
  onSelect: (result: DaumAddressResult) => void;
  children: (open: () => void) => React.ReactNode;
}

const SCRIPT_SRC = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if ((window as any).daum?.Postcode) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('주소 검색 스크립트를 불러오지 못했어요.'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// 팝업(.open())은 브라우저 팝업 차단에 걸리기 쉬워서, 화면 위에 오버레이로 바로 그려주는
// embed 모드를 쓴다 (네이티브의 WebView embed와 같은 UX).
export function AddressSearch({ onSelect, children }: Props) {
  const [visible, setVisible] = useState(false);
  const layerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !layerRef.current) return;
      layerRef.current.innerHTML = '';
      new (window as any).daum.Postcode({
        oncomplete: (data: any) => {
          setVisible(false);
          onSelect({
            buildingName: data.buildingName,
            apartment: data.apartment,
            roadAddress: data.roadAddress,
            jibunAddress: data.jibunAddress,
            sido: data.sido,
            sigungu: data.sigungu,
            zonecode: data.zonecode,
          });
        },
        width: '100%',
        height: '100%',
      }).embed(layerRef.current);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, onSelect]);

  return (
    <>
      {children(() => setVisible(true))}
      {visible && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setVisible(false);
          }}
        >
          <div
            style={{
              width: 'min(480px, 92vw)',
              height: 'min(600px, 85vh)',
              backgroundColor: '#fff',
              borderRadius: 12,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button
                onClick={() => setVisible(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 16,
                  cursor: 'pointer',
                  padding: 8,
                }}
              >
                닫기
              </button>
            </div>
            <div ref={layerRef} style={{ flex: 1, minHeight: 0 }} />
          </div>
        </div>
      )}
    </>
  );
}
