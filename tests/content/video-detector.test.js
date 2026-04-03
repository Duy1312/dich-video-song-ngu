import { VideoDetector } from '../../src/content/video-detector.js';

describe('VideoDetector', () => {
  let detector;
  let onVideoFound;
  let onVideoRemoved;

  beforeEach(() => {
    onVideoFound = jest.fn();
    onVideoRemoved = jest.fn();
    detector = new VideoDetector({ onVideoFound, onVideoRemoved });
  });

  afterEach(() => {
    detector.destroy();
  });

  test('scan finds existing videos', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    detector.scan();
    expect(onVideoFound).toHaveBeenCalledWith(video);

    document.body.removeChild(video);
  });

  test('scan does not duplicate already-tracked videos', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    detector.scan();
    detector.scan();
    expect(onVideoFound).toHaveBeenCalledTimes(1);

    document.body.removeChild(video);
  });

  test('getActiveVideos returns tracked videos', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    detector.scan();
    expect(detector.getActiveVideos()).toContain(video);

    document.body.removeChild(video);
  });

  test('destroy cleans up observer and tracked videos', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);

    detector.scan();
    detector.destroy();
    expect(detector.getActiveVideos().length).toBe(0);

    document.body.removeChild(video);
  });

  test('observe detects dynamically added videos', async () => {
    detector.observe();

    const video = document.createElement('video');
    document.body.appendChild(video);

    // MutationObserver fires async
    await new Promise(r => setTimeout(r, 10));
    expect(onVideoFound).toHaveBeenCalledWith(video);

    document.body.removeChild(video);
  });
});
