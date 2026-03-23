import { SubtitleExtractor } from '../../src/content/subtitle-extractor.js';

describe('SubtitleExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new SubtitleExtractor();
  });

  describe('TextTrack extraction', () => {
    test('extracts cues from video TextTracks', () => {
      const mockCue = { startTime: 0, endTime: 2, text: 'Hello world' };
      const mockTrack = {
        kind: 'subtitles',
        language: 'en',
        mode: 'showing',
        cues: [mockCue],
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };
      const video = {
        textTracks: [mockTrack],
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };

      const tracks = extractor.findSubtitleTracks(video);
      expect(tracks.length).toBe(1);
      expect(tracks[0].language).toBe('en');
    });

    test('returns empty array when no tracks', () => {
      const video = {
        textTracks: [],
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      };

      const tracks = extractor.findSubtitleTracks(video);
      expect(tracks.length).toBe(0);
    });
  });

  describe('getCueAtTime', () => {
    test('returns cue matching current time', () => {
      const cues = [
        { startTime: 0, endTime: 2, text: 'First' },
        { startTime: 2, endTime: 5, text: 'Second' },
        { startTime: 5, endTime: 8, text: 'Third' },
      ];

      expect(extractor.getCueAtTime(cues, 1)).toEqual({ startTime: 0, endTime: 2, text: 'First' });
      expect(extractor.getCueAtTime(cues, 3)).toEqual({ startTime: 2, endTime: 5, text: 'Second' });
      expect(extractor.getCueAtTime(cues, 10)).toBeNull();
    });
  });

  describe('getUpcomingCues', () => {
    test('returns buffer of upcoming cues', () => {
      const cues = [
        { startTime: 0, endTime: 2, text: 'A' },
        { startTime: 2, endTime: 4, text: 'B' },
        { startTime: 4, endTime: 6, text: 'C' },
        { startTime: 6, endTime: 8, text: 'D' },
        { startTime: 8, endTime: 10, text: 'E' },
      ];

      const upcoming = extractor.getUpcomingCues(cues, 1, 3);
      expect(upcoming.length).toBe(3);
      expect(upcoming[0].text).toBe('B');
    });
  });

  describe('isYouTube', () => {
    test('detects YouTube URLs', () => {
      expect(extractor.isYouTube('https://www.youtube.com/watch?v=abc')).toBe(true);
      expect(extractor.isYouTube('https://youtube.com/watch?v=abc')).toBe(true);
      expect(extractor.isYouTube('https://vimeo.com/123')).toBe(false);
    });
  });

  describe('parseSubtitleText', () => {
    test('strips HTML tags from subtitle text', () => {
      expect(extractor.parseSubtitleText('<b>Bold</b> text')).toBe('Bold text');
      expect(extractor.parseSubtitleText('<i>Italic</i>')).toBe('Italic');
    });

    test('handles plain text', () => {
      expect(extractor.parseSubtitleText('Plain text')).toBe('Plain text');
    });
  });
});
