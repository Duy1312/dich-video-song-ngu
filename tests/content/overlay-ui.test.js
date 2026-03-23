import { OverlayUI } from '../../src/content/overlay-ui.js';

describe('OverlayUI', () => {
  let overlay;
  let video;

  beforeEach(() => {
    document.body.innerHTML = '<div><video width="640" height="360"></video></div>';
    video = document.querySelector('video');
    video.getBoundingClientRect = jest.fn(() => ({
      top: 0, left: 0, width: 640, height: 360, bottom: 360, right: 640,
    }));
    overlay = new OverlayUI(video);
  });

  afterEach(() => {
    overlay.destroy();
  });

  test('creates overlay container on init', () => {
    overlay.init();
    const container = video.parentElement.querySelector('.dvsn-overlay');
    expect(container).not.toBeNull();
  });

  test('shows bilingual subtitle', () => {
    overlay.init();
    overlay.showSubtitle('Hello world', 'Xin chào thế giới');
    const original = video.parentElement.querySelector('.dvsn-original');
    const translated = video.parentElement.querySelector('.dvsn-translated');
    expect(original.textContent).toBe('Hello world');
    expect(translated.textContent).toBe('Xin chào thế giới');
  });

  test('hides subtitle', () => {
    overlay.init();
    overlay.showSubtitle('Hello', 'Xin chào');
    overlay.hide();
    const container = video.parentElement.querySelector('.dvsn-overlay');
    expect(container.style.display).toBe('none');
  });

  test('updates subtitle in place', () => {
    overlay.init();
    overlay.showSubtitle('Hello', 'Xin chào');
    overlay.showSubtitle('Goodbye', 'Tạm biệt');
    const translated = video.parentElement.querySelector('.dvsn-translated');
    expect(translated.textContent).toBe('Tạm biệt');
  });

  test('destroy removes overlay from DOM', () => {
    overlay.init();
    overlay.destroy();
    const container = video.parentElement.querySelector('.dvsn-overlay');
    expect(container).toBeNull();
  });
});
