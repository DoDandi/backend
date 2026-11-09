import { describe, expect, it } from 'vitest';
import { imagePath, toPost, validatePostInput, type PostRow } from './posts';

const jpg = { type: 'image/jpeg', size: 300_000 };

describe('validatePostInput', () => {
  it('사진·글·기기 ID가 있으면 통과', () => {
    expect(validatePostInput({ text: '분위기 최고', deviceId: 'd1', image: jpg })).toBeNull();
  });

  it('글이 비었거나 300자를 넘으면 TEXT', () => {
    expect(validatePostInput({ text: '   ', deviceId: 'd1', image: jpg })).toBe('TEXT');
    expect(validatePostInput({ text: 'a'.repeat(301), deviceId: 'd1', image: jpg })).toBe('TEXT');
    expect(validatePostInput({ text: 'a'.repeat(300), deviceId: 'd1', image: jpg })).toBeNull();
  });

  it('기기 ID가 없으면 DEVICE', () => {
    expect(validatePostInput({ text: 'hi', deviceId: '', image: jpg })).toBe('DEVICE');
    expect(validatePostInput({ text: 'hi', deviceId: undefined, image: jpg })).toBe('DEVICE');
  });

  it('사진이 없거나 이미지가 아니면 IMAGE_TYPE', () => {
    expect(validatePostInput({ text: 'hi', deviceId: 'd1', image: null })).toBe('IMAGE_TYPE');
    expect(validatePostInput({ text: 'hi', deviceId: 'd1', image: { type: 'image/gif', size: 10 } })).toBe('IMAGE_TYPE');
  });

  it('사진이 4MB를 넘으면 IMAGE_SIZE', () => {
    expect(validatePostInput({ text: 'hi', deviceId: 'd1', image: { type: 'image/jpeg', size: 5 * 1024 * 1024 } })).toBe('IMAGE_SIZE');
  });
});

describe('toPost', () => {
  it('DB 행을 화면용 모양으로 바꾼다', () => {
    const row: PostRow = {
      id: 'p1',
      place_id: 'pl1',
      nickname: '익명 사용자',
      image_path: 'pl1/1.jpg',
      text: '뜨거워요',
      created_at: '2026-11-09T06:00:00Z',
      places: { name: '교동시장', category: 'market' },
    };
    expect(toPost(row, path => `https://cdn/${path}`)).toEqual({
      id: 'p1',
      placeId: 'pl1',
      placeName: '교동시장',
      category: 'market',
      author: { nickname: '익명 사용자', avatarUrl: null },
      imageUrl: 'https://cdn/pl1/1.jpg',
      text: '뜨거워요',
      createdAt: '2026-11-09T06:00:00Z',
    });
  });
});

describe('imagePath', () => {
  it('장소 폴더 아래 시각-임의값.확장자', () => {
    expect(imagePath('pl1', 'image/png', new Date(1000), 'abcdef123456')).toBe('pl1/1000-abcdef12.png');
  });
});
